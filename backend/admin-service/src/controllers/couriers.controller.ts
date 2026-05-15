import { Request, Response } from 'express';
import { db, readDb } from '../db';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const requiredOnDemandDocuments = ['ktp', 'sim', 'stnk', 'skpd', 'vehicle_photo', 'skck', 'bank_account'];
const forbiddenVehicleCategories = ['trail', 'sport', 'touring'];
const uploadRoot = path.join(process.cwd(), 'public/uploads/courier-documents');
const allowedApplicationChannels = ['on_demand', 'pickup_only', 'delivery_only'];
const channelLabels: Record<string, string> = {
  on_demand: 'On-Demand',
  pickup_only: 'Pickup Only',
  delivery_only: 'Delivery Only'
};

const normalizePlate = (value: string) => value.trim().toUpperCase().replace(/\s+/g, ' ');
const normalizePhone = (value: string) => value.trim().replace(/[^\d+]/g, '');
const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const normalizeApplicationChannel = (value: any, fallback = 'on_demand') => {
  const channel = String(value || fallback).trim().toLowerCase();
  return allowedApplicationChannels.includes(channel) ? channel : fallback;
};

const buildOnboardingChecklist = (body: any, applicationChannel = 'on_demand') => {
  const registrationYear = new Date().getFullYear();
  const vehicleYear = Number(body.vehicle_year || 0);
  const vehicleCc = Number(body.vehicle_cc || 0);
  const vehicleCategory = String(body.vehicle_category || '').trim().toLowerCase();
  const engineType = String(body.engine_type || '').trim().toLowerCase();
  const documents = body.documents || {};

  const documentChecks = requiredOnDemandDocuments.reduce((acc, docType) => ({
    ...acc,
    [docType]: Boolean(documents[docType])
  }), {} as Record<string, boolean>);

  const vehicleAge = vehicleYear > 0 ? registrationYear - vehicleYear : null;
  return {
    documents: documentChecks,
    originals_required: {
      ktp: true,
      sim: true,
      stnk: true,
      skpd: true,
      skck_original_or_legalized: true
    },
    rules: {
      vehicle_age_max_8_years: vehicleAge !== null && vehicleAge <= 8,
      vehicle_cc_max_250: vehicleCc > 0 && vehicleCc <= 250,
      four_stroke_engine: engineType === '4_tak' || engineType === '4tak' || engineType === '4 stroke',
      not_trail_sport_touring: !forbiddenVehicleCategories.includes(vehicleCategory),
      skpd_tax_active: Boolean(body.skpd_tax_active),
      sim_active: Boolean(body.sim_active)
    },
    summary: {
      application_channel: applicationChannel,
      registration_year: registrationYear,
      vehicle_age_years: vehicleAge,
      vehicle_cc: vehicleCc,
      vehicle_category: vehicleCategory,
      engine_type: engineType
    }
  };
};

const checklistPassed = (checklist: any) => {
  const docs = Object.values(checklist.documents || {});
  const rules = Object.values(checklist.rules || {});
  return [...docs, ...rules].every(Boolean);
};

const sanitizeExtension = (filename: string, mimeType?: string) => {
  const ext = path.extname(filename || '').toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext)) return ext;
  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
};

const hasAllowedFileSignature = (buffer: Buffer, mimeType: string) => {
  if (mimeType === 'application/pdf') {
    return buffer.subarray(0, 4).toString('utf8') === '%PDF';
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
  }
  if (mimeType === 'image/webp') {
    return buffer.length > 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
};

const publicLinkBase = (req: Request) => {
  const origin = req.headers.origin || process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3002';
  return `${origin}/courier-register`;
};

export const createCourierRegistrationLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const applicationChannel = normalizeApplicationChannel(req.body?.application_channel, 'pickup_only');
    const token = crypto.randomBytes(24).toString('hex');
    const title = String(req.body?.title || `${channelLabels[applicationChannel]} Courier Registration`).trim();
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;
    const maxUses = req.body?.max_uses ? Number(req.body.max_uses) : null;
    const hasExpiresInDays = Object.prototype.hasOwnProperty.call(req.body || {}, 'expires_in_days');
    const expiresInDays = hasExpiresInDays ? Number(req.body.expires_in_days) : null;
    const expiresAt = expiresInDays !== null
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : req.body?.expires_at
        ? new Date(req.body.expires_at)
        : null;

    if (applicationChannel === 'on_demand') {
      res.status(400).json({ error: 'On-demand courier registration is handled from the courier app flow' });
      return;
    }

    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      res.status(400).json({ error: 'max_uses must be a positive integer' });
      return;
    }

    if (expiresInDays !== null && (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)) {
      res.status(400).json({ error: 'expires_in_days must be an integer between 1 and 365' });
      return;
    }

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      res.status(400).json({ error: 'expires_at must be a valid date' });
      return;
    }

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      res.status(400).json({ error: 'expires_at must be in the future' });
      return;
    }

    const result = await db.query(
      `INSERT INTO courier_registration_links (
        token_hash, application_channel, title, notes, max_uses, expires_at, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, application_channel, title, notes, max_uses, use_count, expires_at, status, created_at`,
      [tokenHash(token), applicationChannel, title, notes, maxUses, expiresAt, req.user?.id || null]
    );

    res.status(201).json({
      success: true,
      data: {
        ...result.rows[0],
        registration_url: `${publicLinkBase(req)}/${token}`
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCourierRegistrationLinks = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(
      `SELECT id, application_channel, title, notes, max_uses, use_count, expires_at, status, created_at, updated_at
       FROM courier_registration_links
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getPublicCourierRegistrationLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.params.token || '');
    const result = await readDb.query(
      `SELECT id, application_channel, title, notes, max_uses, use_count, expires_at, status
       FROM courier_registration_links
       WHERE token_hash = $1`,
      [tokenHash(token)]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Registration link not found' });
      return;
    }

    const link = result.rows[0];
    const expired = link.expires_at && new Date(link.expires_at).getTime() < Date.now();
    const fullyUsed = link.max_uses && Number(link.use_count) >= Number(link.max_uses);
    if (link.status !== 'active' || expired || fullyUsed) {
      res.status(410).json({ error: 'Registration link is no longer active' });
      return;
    }

    res.json({
      success: true,
      data: {
        application_channel: link.application_channel,
        title: link.title,
        notes: link.notes
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

const validateRegistrationToken = async (client: any, token: string) => {
  const result = await client.query(
    `SELECT id, application_channel, max_uses, use_count, expires_at, status
     FROM courier_registration_links
     WHERE token_hash = $1
     FOR UPDATE`,
    [tokenHash(token)]
  );
  if (result.rows.length === 0) return { error: 'Registration link not found' };

  const link = result.rows[0];
  const expired = link.expires_at && new Date(link.expires_at).getTime() < Date.now();
  const fullyUsed = link.max_uses && Number(link.use_count) >= Number(link.max_uses);
  if (link.status !== 'active' || expired || fullyUsed) return { error: 'Registration link is no longer active' };
  return { link };
};

export const uploadCourierOnDemandDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const docType = String(req.body?.doc_type || '').trim();
    if (!requiredOnDemandDocuments.includes(docType)) {
      res.status(400).json({ error: 'Invalid courier document type' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      res.status(415).json({ error: 'Only JPG, PNG, WEBP, and PDF files are allowed' });
      return;
    }

    if (!hasAllowedFileSignature(req.file.buffer, req.file.mimetype)) {
      res.status(415).json({ error: 'File content does not match an allowed document format' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const targetDir = path.join(uploadRoot, today);
    fs.mkdirSync(targetDir, { recursive: true });

    const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const extension = sanitizeExtension(req.file.originalname, req.file.mimetype);
    const filename = `${docType}-${crypto.randomUUID()}${extension}`;
    const storageKey = `courier-documents/${today}/${filename}`;
    const uploadPath = path.join(targetDir, filename);

    fs.writeFileSync(uploadPath, req.file.buffer, { flag: 'wx' });

    res.status(201).json({
      success: true,
      data: {
        doc_type: docType,
        file_url: `/uploads/${storageKey}`,
        original_file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        file_size_bytes: req.file.size,
        checksum_sha256: checksum
      },
      message: 'Dokumen berhasil diupload'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const submitOnDemandCourierApplication = async (req: Request, res: Response): Promise<void> => {
  return submitCourierApplication(req, res, 'on_demand');
};

export const submitCourierApplicationByRegistrationLink = async (req: Request, res: Response): Promise<void> => {
  return submitCourierApplication(req, res, undefined, String(req.params.token || ''));
};

const submitCourierApplication = async (
  req: Request,
  res: Response,
  forcedChannel?: string,
  registrationToken?: string
): Promise<void> => {
  const {
    full_name,
    phone_number,
    email,
    password,
    vehicle_type,
    vehicle_plate,
    vehicle_brand,
    vehicle_model,
    vehicle_year,
    vehicle_cc,
    vehicle_category,
    bank_code,
    bank_account_number,
    bank_account_name,
    documents = {}
  } = req.body || {};

  let applicationChannel = normalizeApplicationChannel(forcedChannel || req.body?.application_channel, 'on_demand');
  if (!full_name || !phone_number || !password || !vehicle_plate) {
    res.status(400).json({ error: 'full_name, phone_number, password, and vehicle_plate are required' });
    return;
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    let registrationLinkId: string | null = null;
    if (registrationToken) {
      const validation = await validateRegistrationToken(client, registrationToken);
      if (validation.error || !validation.link) {
        await client.query('ROLLBACK');
        res.status(validation.error === 'Registration link not found' ? 404 : 410).json({ error: validation.error });
        return;
      }
      applicationChannel = normalizeApplicationChannel(validation.link.application_channel, 'pickup_only');
      registrationLinkId = validation.link.id;
    }

    const checklist = buildOnboardingChecklist(req.body, applicationChannel);

    const courierUserRes = await client.query(
      `INSERT INTO couriers (phone_number, email, full_name, role, status, pin_hash)
       VALUES ($1, NULLIF($2, ''), $3, 'courier', 'pending_verification', $4)
       ON CONFLICT (phone_number) DO UPDATE SET
         email = COALESCE(NULLIF(EXCLUDED.email, ''), couriers.email),
         full_name = EXCLUDED.full_name,
         status = CASE WHEN couriers.status = 'active' THEN couriers.status ELSE 'pending_verification' END,
         pin_hash = EXCLUDED.pin_hash,
         updated_at = NOW()
       RETURNING id`,
      [normalizePhone(phone_number), email || null, String(full_name).trim(), String(password)]
    );

    const userId = courierUserRes.rows[0].id;

    await client.query(
      `INSERT INTO users (id, phone_number, email, full_name, role, status, pin_hash)
       VALUES ($1, $2, NULLIF($3, ''), $4, 'courier', 'pending_verification', $5)
       ON CONFLICT (phone_number) DO UPDATE SET
         email = COALESCE(NULLIF(EXCLUDED.email, ''), users.email),
         full_name = EXCLUDED.full_name,
         role = 'courier',
         status = CASE WHEN users.status = 'active' THEN users.status ELSE 'pending_verification' END,
         pin_hash = EXCLUDED.pin_hash,
         updated_at = NOW()
       RETURNING id`,
      [userId, normalizePhone(phone_number), email || null, String(full_name).trim(), String(password)]
    );
    const profileRes = await client.query(
      `INSERT INTO courier_profiles (
        user_id, vehicle_type, vehicle_plate, vehicle_cc, vehicle_brand, vehicle_model, vehicle_year,
        vehicle_category, bank_code, bank_account_number, bank_account_name, application_channel,
        onboarding_checklist, verification_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
       ON CONFLICT (user_id) DO UPDATE SET
        vehicle_type = EXCLUDED.vehicle_type,
        vehicle_plate = EXCLUDED.vehicle_plate,
        vehicle_cc = EXCLUDED.vehicle_cc,
        vehicle_brand = EXCLUDED.vehicle_brand,
        vehicle_model = EXCLUDED.vehicle_model,
        vehicle_year = EXCLUDED.vehicle_year,
        vehicle_category = EXCLUDED.vehicle_category,
        bank_code = EXCLUDED.bank_code,
        bank_account_number = EXCLUDED.bank_account_number,
        bank_account_name = EXCLUDED.bank_account_name,
        application_channel = EXCLUDED.application_channel,
        onboarding_checklist = EXCLUDED.onboarding_checklist,
        verification_status = 'pending',
        rejection_reason = NULL,
        updated_at = NOW()
       RETURNING id`,
      [
        userId,
        vehicle_type || 'matic',
        normalizePlate(vehicle_plate),
        Number(vehicle_cc || 0),
        vehicle_brand || null,
        vehicle_model || null,
        Number(vehicle_year || 0),
        vehicle_category || null,
        bank_code || null,
        bank_account_number || null,
        bank_account_name || null,
        applicationChannel,
        JSON.stringify(checklist)
      ]
    );

    const courierId = profileRes.rows[0].id;
    await client.query(
      'DELETE FROM courier_documents WHERE courier_id = $1 AND doc_type = ANY($2::text[])',
      [courierId, requiredOnDemandDocuments]
    );

    for (const docType of requiredOnDemandDocuments) {
      const fileUrl = documents[docType];
      if (!fileUrl) continue;
      await client.query(
      `INSERT INTO courier_documents (courier_id, doc_type, file_url)
         VALUES ($1, $2, $3)`,
        [courierId, docType, String(fileUrl)]
      );
    }

    if (registrationLinkId) {
      await client.query(
        'UPDATE courier_registration_links SET use_count = use_count + 1, updated_at = NOW() WHERE id = $1',
        [registrationLinkId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      data: {
        courier_id: courierId,
        application_channel: applicationChannel,
        status: 'pending',
        checklist_passed: checklistPassed(checklist)
      },
      message: `Pendaftaran kurir ${channelLabels[applicationChannel]} berhasil dikirim untuk review admin`
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const getOnDemandCourierApplications = async (req: Request, res: Response) => {
  return getCourierApplications(req, res, 'on_demand');
};

export const getCourierApplicationsByChannel = async (req: Request, res: Response) => {
  return getCourierApplications(req, res, String(req.params.channel || req.query.application_channel || 'on_demand'));
};

const getCourierApplications = async (req: Request, res: Response, requestedChannel: string) => {
  try {
    const status = String(req.query.status || 'pending');
    const applicationChannel = normalizeApplicationChannel(requestedChannel, 'on_demand');
    const values: any[] = [applicationChannel];
    let statusFilter = '';

    if (status !== 'all') {
      values.push(status);
      statusFilter = `AND cp.verification_status = $${values.length}`;
    }

    const result = await readDb.query(
      `SELECT
        cp.id,
        cp.user_id,
        cp.vehicle_type,
        cp.vehicle_plate,
        cp.vehicle_cc,
        cp.vehicle_brand,
        cp.vehicle_model,
        cp.vehicle_year,
        cp.vehicle_category,
        cp.bank_code,
        cp.bank_account_number,
        cp.bank_account_name,
        cp.application_channel,
        cp.onboarding_checklist,
        cp.verification_status,
        cp.rejection_reason,
        cp.created_at,
        cp.updated_at,
        u.full_name,
        u.email,
        u.phone_number,
        (SELECT COUNT(*)::int FROM courier_documents cd WHERE cd.courier_id = cp.id) AS document_count,
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', cd.id,
                'doc_type', cd.doc_type,
                'file_url', cd.file_url,
                'is_verified', cd.is_verified,
                'rejection_note', cd.rejection_note,
                'created_at', cd.created_at
              )
              ORDER BY cd.created_at DESC
            )
            FROM courier_documents cd
            WHERE cd.courier_id = cp.id
          ),
          '[]'::jsonb
        ) AS documents
       FROM courier_profiles cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.application_channel = $1 ${statusFilter}
       ORDER BY cp.created_at DESC`,
      values
    );

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllCouriers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const applicationChannel = req.query.application_channel as string;

    let query = `
      SELECT 
        cp.id,
        cp.user_id,
        cp.vehicle_type,
        cp.vehicle_plate,
        cp.vehicle_cc,
        cp.relay_score as avg_rating,
        cp.verification_status,
        cp.application_channel,
        cp.tier,
        cp.is_online,
        cp.acceptance_rate_pct,
        cp.completion_rate_pct,
        cp.ontime_rate_pct,
        cp.created_at,
        cp.updated_at,
        u.full_name, 
        u.email, 
        u.phone_number,
        cp.vehicle_plate as plate_number,
        CASE 
          WHEN cp.verification_status = 'pending' THEN 'Pending'
          WHEN u.status = 'suspended' THEN 'Suspended'
          WHEN u.status = 'active' THEN 'Active'
          ELSE 'Inactive'
        END as status
      FROM courier_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE u.deleted_at IS NULL
    `;
    const values: any[] = [];

    if (search) {
      values.push(`%${search}%`);
      query += ` AND (u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length} OR cp.vehicle_plate ILIKE $${values.length})`;
    }

    if (status) {
      if (status === 'Pending') {
        query += ` AND cp.verification_status = 'pending'`;
      } else if (status === 'Active') {
        query += ` AND u.status = 'active' AND cp.verification_status != 'pending'`;
      } else if (status === 'Suspended') {
        query += ` AND u.status = 'suspended'`;
      }
    }

    if (applicationChannel && applicationChannel !== 'all') {
      values.push(normalizeApplicationChannel(applicationChannel, 'on_demand'));
      query += ` AND cp.application_channel = $${values.length}`;
    }

    const countQuery = `SELECT COUNT(*) FROM (${query}) as subquery`;
    const countRes = await readDb.query(countQuery, values);
    const total = parseInt(countRes.rows[0].count);

    query += ` ORDER BY cp.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await readDb.query(query, values);

    res.json({
      data: result.rows,
      total,
      page,
      limit
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCourierStats = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE u.status = 'active') as active,
        COUNT(*) FILTER (WHERE cp.verification_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE u.status = 'suspended') as suspended,
        COUNT(*) FILTER (WHERE cp.application_channel = 'on_demand') as on_demand,
        COUNT(*) FILTER (WHERE cp.application_channel = 'pickup_only') as pickup_only,
        COUNT(*) FILTER (WHERE cp.application_channel = 'delivery_only') as delivery_only
      FROM courier_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE u.deleted_at IS NULL
    `;
    const result = await readDb.query(query);
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCourierById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const courierRes = await readDb.query(`
      SELECT 
        cp.*,
        cp.relay_score as avg_rating,
        u.full_name, 
        u.email, 
        u.phone_number, 
        u.photo_url,
        cp.application_channel,
        cp.vehicle_plate as plate_number,
        CASE 
          WHEN cp.verification_status = 'pending' THEN 'Pending'
          WHEN u.status = 'suspended' THEN 'Suspended'
          WHEN u.status = 'active' THEN 'Active'
          ELSE 'Inactive'
        END as status
      FROM courier_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.id = $1
    `, [id]);

    if (courierRes.rows.length === 0) {
      res.status(404).json({ error: 'Courier not found' });
      return;
    }

    const docsRes = await readDb.query('SELECT * FROM courier_documents WHERE courier_id = $1', [id]);
    // Use recent order legs for activity history
    const ratingsRes = await readDb.query(`
      SELECT ol.created_at, ol.status, o.id as order_id, o.model
      FROM order_legs ol
      JOIN orders o ON ol.order_id = o.id
      WHERE ol.courier_id = (SELECT user_id FROM courier_profiles WHERE id = $1)
      ORDER BY ol.created_at DESC LIMIT 10
    `, [id]);

    res.json({
      ...courierRes.rows[0],
      documents: docsRes.rows,
      recent_ratings: ratingsRes.rows
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateCourierStatus = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['Active', 'Suspended', 'Pending', 'Rejected'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users u
       SET status = CASE 
         WHEN $1 = 'Active' THEN 'active'
         WHEN $1 = 'Suspended' THEN 'suspended'
         WHEN $1 = 'Rejected' THEN 'inactive'
         ELSE u.status
       END,
       updated_at = NOW()
       FROM courier_profiles cp
       WHERE cp.user_id = u.id AND cp.id = $2`,
      [status, id]
    );

    await client.query(
      `UPDATE couriers c
       SET status = CASE
         WHEN $1 = 'Active' THEN 'active'
         WHEN $1 = 'Suspended' THEN 'suspended'
         WHEN $1 = 'Rejected' THEN 'inactive'
         ELSE c.status
       END,
       updated_at = NOW()
       FROM courier_profiles cp
       WHERE cp.user_id = c.id AND cp.id = $2`,
      [status, id]
    );

    if (status === 'Active') {
      await client.query(
        'UPDATE courier_profiles SET verification_status = $1, reviewed_at = NOW(), reviewed_by = $3, updated_at = NOW() WHERE id = $2',
        ['approved', id, req.user?.id || null]
      );
    } else if (status === 'Rejected') {
      await client.query(
        'UPDATE courier_profiles SET verification_status = $1, rejection_reason = $3, reviewed_at = NOW(), reviewed_by = $4, updated_at = NOW() WHERE id = $2',
        ['rejected', id, req.body.reason || 'Tidak memenuhi persyaratan onboarding', req.user?.id || null]
      );
    } else if (status === 'Pending') {
      await client.query(
        'UPDATE courier_profiles SET verification_status = $1, reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW() WHERE id = $2',
        ['pending', id]
      );
    }

    const result = await client.query(`
      SELECT 
        cp.*,
        CASE 
          WHEN cp.verification_status = 'pending' THEN 'Pending'
          WHEN u.status = 'suspended' THEN 'Suspended'
          WHEN u.status = 'active' THEN 'Active'
          ELSE 'Inactive'
        END as status
      FROM courier_profiles cp 
      JOIN users u ON cp.user_id = u.id 
      WHERE cp.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Courier not found' });
      return;
    }

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, category) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`courier:${id}`, status === 'Active', changedBy, `Status updated to ${status}`, 'security']
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const getCourierHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await readDb.query(`
      SELECT o.*, ol.status as leg_status
      FROM orders o
      JOIN order_legs ol ON o.id = ol.order_id
      WHERE ol.courier_id = (SELECT user_id FROM courier_profiles WHERE id = $1)
      ORDER BY o.created_at DESC
    `, [id]);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const exportCouriers = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT cp.id, u.full_name, u.email, u.status as status, cp.vehicle_type, cp.created_at
      FROM courier_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE u.deleted_at IS NULL
    `);

    const csvRows = [
      ['Courier ID', 'Name', 'Email', 'Status', 'Vehicle', 'Joined Date'].join(','),
      ...result.rows.map(r => [
        r.id, `"${r.full_name}"`, r.email, r.status, r.vehicle_type, r.created_at
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=couriers_export.csv');
    res.send(csvRows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
