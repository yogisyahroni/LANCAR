import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';
import { db, readDb } from '../db';
import crypto from 'crypto';
import { saveSecureUploadBuffer } from '../security/uploadSecurity';
import { createNotification } from '../notifications';
import {
  COURIER_ONBOARDING_POLICY_VERSION,
  COURIER_DOCUMENT_STATUSES,
  COURIER_DOCUMENT_VERIFICATION_SOURCES,
  CourierOnboardingState,
  buildCourierOnboardingChecklist,
  canTransitionCourierOnboarding,
  evaluateCourierActivation,
  isCourierChecklistPassed,
  validateCourierVehicleProfile,
} from '../services/courierOnboardingPolicy';

const supportedCourierDocuments = ['ktp', 'sim', 'stnk', 'skpd', 'vehicle_photo', 'skck', 'bank_account', 'face_enrollment', 'selfie'];
const allowedApplicationChannels = ['on_demand', 'regular'];
const channelLabels: Record<string, string> = {
  on_demand: 'On-Demand',
  regular: 'Regular'
};

const normalizePlate = (value: string) => value.trim().toUpperCase().replace(/\s+/g, ' ');
const normalizePhone = (value: string) => value.trim().replace(/[^\d+]/g, '');
const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const normalizeApplicationChannel = (value: any, fallback = 'on_demand') => {
  const channel = String(value || fallback).trim().toLowerCase();
  if (channel === 'pickup_only' || channel === 'delivery_only') {
    return 'regular';
  }
  return allowedApplicationChannels.includes(channel) ? channel : fallback;
};

const buildOnboardingChecklist = (body: any, applicationChannel = 'on_demand') => buildCourierOnboardingChecklist({
  marketCode: body.market_code,
  applicationChannel,
  serviceCategories: body.service_categories || body.service_codes,
  vehicleCategory: body.vehicle_category,
  vehicleType: body.vehicle_type,
  vehiclePlate: body.vehicle_plate,
  vehicleYear: body.vehicle_year,
  vehicleCc: body.vehicle_cc,
  engineType: body.engine_type,
  simActive: body.sim_active,
  skpdTaxActive: body.skpd_tax_active,
  documents: body.documents || {},
});

const pseudoChecksum = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const normalizeStorageKey = (fileUrl: string) => {
  const normalized = String(fileUrl || '').trim().replace(/\\/g, '/');
  return normalized.replace(/^\/uploads\//, '').replace(/^uploads\//, '') || null;
};

const readDocumentUpload = (value: unknown) => {
  if (typeof value === 'string') {
    return {
      fileUrl: value.trim(),
      storageKey: normalizeStorageKey(value),
      originalFileName: null,
      mimeType: null,
      checksumSha256: null,
    };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  const fileUrl = String(document.file_url || document.fileUrl || document.url || '').trim();
  if (!fileUrl) return null;
  return {
    fileUrl,
    storageKey: String(document.storage_key || document.storageKey || normalizeStorageKey(fileUrl) || '').trim() || null,
    originalFileName: document.original_file_name || document.originalFileName || null,
    mimeType: document.mime_type || document.mimeType || null,
    checksumSha256: document.checksum_sha256 || document.checksumSha256 || null,
  };
};

const normalizeCapabilityEvidenceKey = (value: unknown) => {
  const normalized = String(value || '').trim().replace(/\\/g, '/');
  if (!normalized || /^https?:\/\//i.test(normalized) || normalized.includes('..')) return null;
  return normalized.replace(/^\/uploads\//, '').replace(/^uploads\//, '') || null;
};

const normalizeCapabilityDate = (value: unknown, field: string) => {
  if (value === undefined) return '__KEEP__';
  if (value === null || String(value).trim() === '') return '';
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${field} must use YYYY-MM-DD format or null`);
  return normalized;
};

const vehicleProductType = (profile: any) => {
  const value = String(profile.vehicle_category || profile.vehicle_type || '').toLowerCase();
  if (value === 'towing_truck' || value === 'flatbed' || value === 'towing_derek') return 'towing_truck';
  return ['mobil', 'car', 'box'].includes(value) ? 'car' : 'motor';
};

const upsertCourierVehicleAndCapabilities = async (
  client: any,
  courierProfileId: string,
  options: { approveEligible?: boolean; approvedBy?: string | null } = {}
) => {
  const profileRes = await client.query(
    `SELECT id, vehicle_type, vehicle_plate, vehicle_cc, vehicle_brand, vehicle_model, vehicle_year,
            vehicle_category, application_channel, verification_status, onboarding_checklist
     FROM courier_profiles
     WHERE id = $1`,
    [courierProfileId]
  );
  if (profileRes.rows.length === 0) return;

  const profile = profileRes.rows[0];
  const type = vehicleProductType(profile);
  const vehicleRes = await client.query(
    `INSERT INTO courier_vehicles (
       courier_profile_id, plate_number, vehicle_type, vehicle_category, brand, model,
       production_year, engine_cc, engine_type, max_weight_kg, verification_status,
       approved_by, approved_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text, $12, CASE WHEN $11::text = 'approved' THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (courier_profile_id, plate_number) DO UPDATE SET
       vehicle_type = EXCLUDED.vehicle_type,
       vehicle_category = EXCLUDED.vehicle_category,
       brand = EXCLUDED.brand,
       model = EXCLUDED.model,
       production_year = EXCLUDED.production_year,
       engine_cc = EXCLUDED.engine_cc,
       engine_type = EXCLUDED.engine_type,
       max_weight_kg = EXCLUDED.max_weight_kg,
       verification_status = EXCLUDED.verification_status,
       approved_by = COALESCE(EXCLUDED.approved_by, courier_vehicles.approved_by),
       approved_at = COALESCE(EXCLUDED.approved_at, courier_vehicles.approved_at),
       updated_at = NOW()
     RETURNING id`,
    [
      courierProfileId,
      normalizePlate(profile.vehicle_plate || `UNKNOWN-${String(courierProfileId).slice(0, 8)}`),
      type,
      profile.vehicle_category || profile.vehicle_type || null,
      profile.vehicle_brand || null,
      profile.vehicle_model || null,
      Number(profile.vehicle_year || 0) || null,
      Number(profile.vehicle_cc || 0) || null,
      profile.onboarding_checklist?.summary?.engine_type || null,
      type === 'car' ? 200 : 20,
      options.approveEligible ? 'approved' : (profile.verification_status === 'approved' ? 'approved' : 'pending'),
      options.approvedBy || null
    ]
  );

  const vehicleId = vehicleRes.rows[0].id;
  const applicationChannel = normalizeApplicationChannel(profile.application_channel, 'on_demand');
  const serviceFilter = applicationChannel === 'on_demand'
    ? "dsp.service_category = 'on_demand'"
    : "dsp.service_category = 'regular'";

  await client.query(
    `INSERT INTO courier_service_capabilities (
       courier_profile_id, vehicle_id, service_code, application_channel, status,
       eligibility_reason, max_weight_kg, approved_by, approved_at, updated_at
     )
     SELECT
       $1,
       $2,
       dsp.code,
       $3::text,
       CASE WHEN $4::boolean THEN 'enabled' ELSE 'pending_review' END,
       CASE
         WHEN $3::text = 'on_demand' THEN 'Eligible for on-demand product based on approved vehicle profile.'
         ELSE 'Eligible for non on-demand operational product based on approved vehicle profile.'
       END,
       COALESCE(dsp.max_weight_kg, CASE WHEN $5 = 'car' THEN 200 ELSE 20 END),
       $6,
       CASE WHEN $4::boolean THEN NOW() ELSE NULL END,
       NOW()
     FROM delivery_service_products dsp
     WHERE dsp.is_enabled = TRUE
       AND ${serviceFilter}
       AND (
         COALESCE(array_length(dsp.vehicle_types, 1), 0) = 0
         OR $5 = ANY(dsp.vehicle_types)
         OR ($5 = 'motor' AND 'bike' = ANY(dsp.vehicle_types))
       )
     ON CONFLICT (courier_profile_id, service_code) DO UPDATE SET
       vehicle_id = EXCLUDED.vehicle_id,
       application_channel = EXCLUDED.application_channel,
       status = CASE
         WHEN courier_service_capabilities.status IN ('disabled', 'rejected') THEN courier_service_capabilities.status
         ELSE EXCLUDED.status
       END,
       eligibility_reason = EXCLUDED.eligibility_reason,
       max_weight_kg = EXCLUDED.max_weight_kg,
       approved_by = COALESCE(EXCLUDED.approved_by, courier_service_capabilities.approved_by),
       approved_at = COALESCE(EXCLUDED.approved_at, courier_service_capabilities.approved_at),
       updated_at = NOW()`,
    [courierProfileId, vehicleId, applicationChannel, Boolean(options.approveEligible), type, options.approvedBy || null]
  );
};

const publicLinkBase = (req: Request) => {
  const origin = req.headers.origin || process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3002';
  return `${origin}/courier-register`;
};

export const createCourierRegistrationLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const applicationChannel = normalizeApplicationChannel(req.body?.application_channel, 'regular');
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
      [tokenHash(token), applicationChannel, title, notes, maxUses, expiresAt, getActorId(req)]
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
    if (!supportedCourierDocuments.includes(docType)) {
      res.status(400).json({ error: 'Invalid courier document type' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const filename = `${docType}-${crypto.randomUUID()}${req.file.safeExtension || '.jpg'}`;
    const savedUpload = saveSecureUploadBuffer(req.file, `courier-documents/${today}`, filename);

    res.status(201).json({
      success: true,
      data: {
        doc_type: docType,
        file_url: savedUpload.fileUrl,
        storage_key: savedUpload.storageKey,
        storage_access_class: 'restricted',
        document_status: 'pending_review',
        verification_source: 'self_declared',
        original_file_name: req.file.originalname,
        mime_type: req.file.detectedMimeType,
        file_size_bytes: req.file.size,
        checksum_sha256: req.file.checksumSha256
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
    nik,
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
    engine_type,
    sim_active,
    skpd_tax_active,
    bank_code,
    bank_account_number,
    bank_account_name,
    market_code,
    service_categories,
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

    // SECURITY FIX: Prevent Account Takeover for existing active couriers
    const existingCourierRes = await client.query(
      `SELECT role, status FROM users WHERE phone_number = $1`,
      [normalizePhone(phone_number)]
    );
    if (existingCourierRes.rows.length > 0) {
      const existingAccount = existingCourierRes.rows[0];
      if (existingAccount.role !== 'courier') {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Nomor HP sudah digunakan akun lain.' });
        return;
      }
      const existingStatus = existingAccount.status;
      if (existingStatus === 'active' || existingStatus === 'suspended') {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Nomor HP ini sudah terdaftar pada akun kurir yang aktif. Silakan gunakan fitur Lupa Password jika Anda tidak bisa login.' });
        return;
      }
    }

    let registrationLinkId: string | null = null;
    if (registrationToken) {
      const validation = await validateRegistrationToken(client, registrationToken);
      if (validation.error || !validation.link) {
        await client.query('ROLLBACK');
        res.status(validation.error === 'Registration link not found' ? 404 : 410).json({ error: validation.error });
        return;
      }
      applicationChannel = normalizeApplicationChannel(validation.link.application_channel, 'regular');
      registrationLinkId = validation.link.id;
    }

    const userRes = await client.query(
      `INSERT INTO users (phone_number, email, full_name, role, status, pin_hash)
       VALUES ($1, NULLIF($2, ''), $3, 'courier', 'pending_verification', $4)
       ON CONFLICT (phone_number) DO UPDATE SET
         email = COALESCE(NULLIF(EXCLUDED.email, ''), users.email),
         full_name = EXCLUDED.full_name,
         role = 'courier',
         status = CASE WHEN users.status = 'active' THEN users.status ELSE 'pending_verification' END,
         pin_hash = EXCLUDED.pin_hash,
         updated_at = NOW()
       RETURNING id`,
      [normalizePhone(phone_number), email || null, String(full_name).trim(), String(password)]
    );
    const userId = userRes.rows[0].id;
    const requestedMarketCode = String(market_code || 'id').trim().toLowerCase();
    const existingProfileMarket = await client.query(
      `SELECT market_code FROM courier_profiles WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (existingProfileMarket.rows[0] && String(existingProfileMarket.rows[0].market_code || 'id').trim().toLowerCase() !== requestedMarketCode) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        error: 'Perubahan country/market membutuhkan pengajuan market change dan verifikasi regulasi terpisah.',
        code: 'ERR_MARKET_CHANGE_REQUEST_REQUIRED',
        current_market_code: existingProfileMarket.rows[0].market_code,
        requested_market_code: requestedMarketCode,
      });
      return;
    }
    const normalizedServiceCategories = Array.from(new Set(
      (Array.isArray(service_categories) ? service_categories : service_categories ? [service_categories] : [])
        .map((value: unknown) => String(value).trim().toLowerCase())
        .filter(Boolean)
    ));
    const checklistInput = {
      ...req.body,
      market_code: requestedMarketCode,
      service_categories: normalizedServiceCategories,
    };
    const checklist = buildOnboardingChecklist(checklistInput, applicationChannel);
    const profileRes = await client.query(
      `INSERT INTO courier_profiles (
        user_id, nik, vehicle_type, vehicle_plate, vehicle_cc, vehicle_brand, vehicle_model, vehicle_year,
        vehicle_category, engine_type, sim_active, skpd_tax_active, bank_code, bank_account_number, bank_account_name, application_channel,
        market_code, service_categories, onboarding_policy_version, onboarding_checklist, verification_status, onboarding_status, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'pending', 'SUBMITTED', 'offline')
       ON CONFLICT (user_id) DO UPDATE SET
        nik = EXCLUDED.nik,
        vehicle_type = EXCLUDED.vehicle_type,
        vehicle_plate = EXCLUDED.vehicle_plate,
        vehicle_cc = EXCLUDED.vehicle_cc,
        vehicle_brand = EXCLUDED.vehicle_brand,
        vehicle_model = EXCLUDED.vehicle_model,
        vehicle_year = EXCLUDED.vehicle_year,
        vehicle_category = EXCLUDED.vehicle_category,
        engine_type = EXCLUDED.engine_type,
        sim_active = EXCLUDED.sim_active,
        skpd_tax_active = EXCLUDED.skpd_tax_active,
        bank_code = EXCLUDED.bank_code,
        bank_account_number = EXCLUDED.bank_account_number,
        bank_account_name = EXCLUDED.bank_account_name,
        application_channel = EXCLUDED.application_channel,
        market_code = EXCLUDED.market_code,
        service_categories = EXCLUDED.service_categories,
        onboarding_policy_version = EXCLUDED.onboarding_policy_version,
        onboarding_checklist = EXCLUDED.onboarding_checklist,
        verification_status = 'pending',
        onboarding_status = CASE
          WHEN courier_profiles.onboarding_status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')
            THEN courier_profiles.onboarding_status
          ELSE 'SUBMITTED'
        END,
        is_verified = CASE
          WHEN courier_profiles.onboarding_status IN ('ACTIVE', 'SUSPENDED') THEN courier_profiles.is_verified
          ELSE FALSE
        END,
        status = CASE
          WHEN courier_profiles.onboarding_status IN ('ACTIVE', 'SUSPENDED') THEN courier_profiles.status
          ELSE 'offline'
        END,
        rejection_reason = NULL,
        updated_at = NOW()
       RETURNING id`,
      [
        userId,
        nik || null,
        vehicle_type || (vehicle_category === 'towing_truck' ? 'towing_truck' : 'matic'),
        normalizePlate(vehicle_plate),
        Number(vehicle_cc || 0),
        vehicle_brand || null,
        vehicle_model || null,
        Number(vehicle_year || 0),
        vehicle_category || null,
        engine_type || null,
        Boolean(sim_active),
        Boolean(skpd_tax_active),
        bank_code || null,
        bank_account_number || null,
        bank_account_name || null,
        applicationChannel,
        requestedMarketCode,
        normalizedServiceCategories.length > 0 ? normalizedServiceCategories : [applicationChannel],
        COURIER_ONBOARDING_POLICY_VERSION,
        JSON.stringify(checklist)
      ]
    );

    const courierId = profileRes.rows[0].id;
    await client.query(
      'DELETE FROM courier_documents WHERE courier_id = $1 AND doc_type = ANY($2::text[])',
      [courierId, supportedCourierDocuments]
    );

    for (const docType of supportedCourierDocuments) {
      const uploadedDocument = readDocumentUpload(documents[docType]);
      if (!uploadedDocument) continue;
      await client.query(
      `INSERT INTO courier_documents (
           courier_id, doc_type, file_url, document_status, verification_source,
           storage_key, storage_access_class, original_file_name, mime_type,
           checksum_sha256, retention_until
         )
         VALUES ($1, $2, $3, 'pending_review', 'self_declared', $4, 'restricted', $5, $6, $7, CURRENT_DATE + 1825)`,
        [
          courierId,
          docType,
          uploadedDocument.fileUrl,
          uploadedDocument.storageKey,
          uploadedDocument.originalFileName,
          uploadedDocument.mimeType,
          uploadedDocument.checksumSha256,
        ]
      );
    }

    const faceEnrollmentUrl = readDocumentUpload(documents.face_enrollment)?.fileUrl || null;
    if (faceEnrollmentUrl) {
      await client.query(
        `INSERT INTO courier_face_enrollments (
           courier_id,
           status,
           provider,
           image_url,
           image_checksum_sha256,
           metadata
         )
         VALUES ($1, 'pending_review', 'registration_upload', $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [
          userId,
          faceEnrollmentUrl,
          pseudoChecksum(faceEnrollmentUrl),
          JSON.stringify({
            source: 'courier_registration',
            application_channel: applicationChannel,
            captured_at: new Date().toISOString()
          })
        ]
      );

      await client.query(
        `UPDATE courier_profiles
            SET face_enrolled = TRUE,
                updated_at = NOW()
          WHERE id = $1`,
        [courierId]
      );
    }

    await upsertCourierVehicleAndCapabilities(client, courierId, { approveEligible: false });

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
        onboarding_status: 'SUBMITTED',
        checklist_passed: isCourierChecklistPassed(checklist)
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
        cp.engine_type,
        cp.sim_active,
        cp.skpd_tax_active,
        cp.nik,
        cp.bank_code,
        cp.bank_account_number,
        cp.bank_account_name,
        cp.application_channel,
        cp.market_code,
        cp.onboarding_status,
        cp.home_zone_id,
        cp.current_zone_id,
        cp.onboarding_checklist,
        cp.verification_status,
        cp.rejection_reason,
        cp.created_at,
        cp.updated_at,
        u.full_name,
        u.email,
        u.phone_number,
        (SELECT COUNT(*)::int FROM courier_documents cd WHERE cd.courier_id = cp.id AND cd.deleted_at IS NULL) AS document_count,
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', cd.id,
                'doc_type', cd.doc_type,
                'document_status', cd.document_status,
                'verification_source', cd.verification_source,
                'issued_at', cd.issued_at,
                'expires_at', cd.expires_at,
                'is_verified', cd.is_verified,
                'rejection_note', cd.rejection_note,
                'service_scope', cd.service_scope,
                'storage_access_class', cd.storage_access_class,
                'retention_until', cd.retention_until,
                'has_file', (cd.file_url IS NOT NULL AND cd.file_url <> ''),
                'created_at', cd.created_at
              )
              ORDER BY cd.created_at DESC
            )
            FROM courier_documents cd
            WHERE cd.courier_id = cp.id AND cd.deleted_at IS NULL
          ),
          '[]'::jsonb
        ) AS documents,
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', csc.id,
                'service_code', csc.service_code,
                'service_name', dsp.name,
                'service_category', dsp.service_category,
                'service_family', dsp.service_family,
                'status', csc.status,
                'certification_type', csc.certification_type,
                'certified_at', csc.certified_at,
                'effective_from', csc.effective_from,
                'expires_at', csc.expires_at,
                'market_scope', csc.market_scope,
                'effective_status', cce.effective_status,
                'availability_reason', cce.availability_reason,
                'remediation_path', cce.remediation_path,
                'is_eligible', cce.is_eligible,
                'max_weight_kg', csc.max_weight_kg,
                'eligibility_reason', csc.eligibility_reason,
                'updated_at', csc.updated_at
              )
              ORDER BY dsp.display_order ASC, dsp.name ASC
            )
            FROM courier_service_capabilities csc
            JOIN courier_capability_eligibility cce ON cce.id = csc.id
            JOIN delivery_service_products dsp ON dsp.code = csc.service_code
            WHERE csc.courier_profile_id = cp.id
          ),
          '[]'::jsonb
        ) AS service_capabilities
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
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
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
        cp.onboarding_status,
        cp.market_code,
        cp.home_zone_id,
        cp.current_zone_id,
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
          WHEN cp.onboarding_status = 'DRAFT' THEN 'Draft'
          WHEN cp.onboarding_status = 'SUBMITTED' THEN 'Submitted'
          WHEN cp.onboarding_status = 'VERIFYING' THEN 'Verifying'
          WHEN cp.onboarding_status = 'ACTIVE' THEN 'Active'
          WHEN cp.onboarding_status = 'REJECTED' THEN 'Rejected'
          WHEN cp.onboarding_status = 'NEEDS_UPDATE' THEN 'Needs Update'
          WHEN cp.onboarding_status = 'SUSPENDED' THEN 'Suspended'
          WHEN cp.onboarding_status = 'DEACTIVATED' THEN 'Deactivated'
          ELSE 'Draft'
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
        query += ` AND cp.onboarding_status IN ('DRAFT', 'SUBMITTED', 'VERIFYING', 'NEEDS_UPDATE')`;
      } else if (status === 'Active') {
        query += ` AND cp.onboarding_status = 'ACTIVE'`;
      } else if (status === 'Suspended') {
        query += ` AND cp.onboarding_status = 'SUSPENDED'`;
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
    securityLog.error('ERROR in getAllCouriers:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCourierStats = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE u.status = 'active') as active,
        COUNT(*) FILTER (WHERE cp.onboarding_status IN ('DRAFT', 'SUBMITTED', 'VERIFYING', 'NEEDS_UPDATE')) as pending,
        COUNT(*) FILTER (WHERE cp.onboarding_status = 'SUSPENDED') as suspended,
        COUNT(*) FILTER (WHERE cp.application_channel = 'on_demand') as on_demand,
        COUNT(*) FILTER (WHERE cp.application_channel = 'regular') as regular
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
        u.profile_photo_locked_at,
        cp.application_channel,
        cp.vehicle_plate as plate_number,
        CASE
          WHEN cp.onboarding_status = 'DRAFT' THEN 'Draft'
          WHEN cp.onboarding_status = 'SUBMITTED' THEN 'Submitted'
          WHEN cp.onboarding_status = 'VERIFYING' THEN 'Verifying'
          WHEN cp.onboarding_status = 'ACTIVE' THEN 'Active'
          WHEN cp.onboarding_status = 'REJECTED' THEN 'Rejected'
          WHEN cp.onboarding_status = 'NEEDS_UPDATE' THEN 'Needs Update'
          WHEN cp.onboarding_status = 'SUSPENDED' THEN 'Suspended'
          WHEN cp.onboarding_status = 'DEACTIVATED' THEN 'Deactivated'
          ELSE 'Draft'
        END as status
      FROM courier_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.id = $1
    `, [id]);

    if (courierRes.rows.length === 0) {
      res.status(404).json({ error: 'Courier not found' });
      return;
    }

    const docsRes = await readDb.query(
      `SELECT id, courier_id, doc_type, document_status, verification_source,
              document_number, issued_at, expires_at, is_verified, verified_at,
              rejection_note, revoked_at, revocation_reason, storage_access_class,
              mime_type, checksum_sha256, retention_until, created_at, updated_at,
              (file_url IS NOT NULL AND file_url <> '') AS has_file
       FROM courier_documents
       WHERE courier_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [id]
    );
    const vehicleRes = await readDb.query(
      `SELECT * FROM courier_vehicles WHERE courier_profile_id = $1 ORDER BY is_primary DESC, created_at DESC`,
      [id]
    );
    const capabilitiesRes = await readDb.query(
      `SELECT csc.*, cce.effective_status, cce.availability_reason, cce.remediation_path, cce.is_eligible,
              dsp.name AS service_name, dsp.service_category, dsp.service_family, dsp.route_model,
              dsp.batching_allowed
       FROM courier_service_capabilities csc
       JOIN courier_capability_eligibility cce ON cce.id = csc.id
       JOIN delivery_service_products dsp ON dsp.code = csc.service_code
       WHERE csc.courier_profile_id = $1
       ORDER BY dsp.display_order ASC, dsp.name ASC`,
      [id]
    );
    const trainingRes = await readDb.query(
      `SELECT training_key, title, completed_at, expires_at
       FROM courier_training_completions
       WHERE courier_profile_id = $1
       ORDER BY completed_at DESC`,
      [id]
    );
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
      vehicles: vehicleRes.rows,
      service_capabilities: capabilitiesRes.rows,
      training_completions: trainingRes.rows,
      recent_ratings: ratingsRes.rows
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

const documentStatusForUpdate = (value: unknown) => String(value || '').trim().toLowerCase();

export const getCourierDocument = async (req: Request, res: Response): Promise<void> => {
  const actorId = getActorId(req);
  const courierProfileId = String(req.params.id);
  const documentId = String(req.params.documentId);

  try {
    const result = await readDb.query(
      `SELECT cd.id, cd.courier_id, cd.doc_type, cd.file_url, cd.storage_key,
              cd.storage_provider, cd.storage_access_class, cd.document_status,
              cd.verification_source, cd.document_number, cd.issued_at, cd.expires_at,
              cd.is_verified, cd.verified_at, cd.verified_by, cd.rejection_note,
              cd.revoked_at, cd.revocation_reason, cd.mime_type, cd.checksum_sha256,
              cd.retention_until, cd.created_at, cd.updated_at
       FROM courier_documents cd
       WHERE cd.id = $1 AND cd.courier_id = $2 AND cd.deleted_at IS NULL`,
      [documentId, courierProfileId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Courier document not found' });
      return;
    }

    await db.query(
      `INSERT INTO courier_document_access_log (
         courier_document_id, courier_profile_id, actor_id, action, purpose
       ) VALUES ($1, $2, $3, 'view', $4)`,
      [documentId, courierProfileId, actorId, 'courier_document_review']
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('Failed to retrieve courier document', { error, courierProfileId, documentId, actorId });
    res.status(500).json({ success: false, error: 'Failed to retrieve courier document' });
  }
};

export const updateCourierDocumentVerification = async (req: Request, res: Response): Promise<void> => {
  const actorId = getActorId(req);
  const courierProfileId = String(req.params.id);
  const documentId = String(req.params.documentId);
  const requestedStatus = documentStatusForUpdate(req.body?.document_status || req.body?.status);
  const requestedSource = String(req.body?.verification_source || '').trim().toLowerCase();
  const hasServiceScope = Object.prototype.hasOwnProperty.call(req.body || {}, 'service_scope')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'serviceScope');
  const requestedServiceScope = hasServiceScope
    ? (req.body?.service_scope ?? req.body?.serviceScope)
    : undefined;
  if (hasServiceScope && (!Array.isArray(requestedServiceScope)
    || requestedServiceScope.length === 0
    || requestedServiceScope.some((item: unknown) => typeof item !== 'string' || !item.trim()))) {
    res.status(400).json({ success: false, error: 'service_scope must be a non-empty array of service codes' });
    return;
  }
  const allowedStatuses = COURIER_DOCUMENT_STATUSES.filter((status) =>
    status !== 'expired' && status !== 'retention_expired'
  );

  if (!(allowedStatuses as readonly string[]).includes(requestedStatus)) {
    res.status(400).json({
      success: false,
      error: 'Invalid document status',
      allowed_statuses: allowedStatuses,
    });
    return;
  }
  if (requestedSource && !(COURIER_DOCUMENT_VERIFICATION_SOURCES as readonly string[]).includes(requestedSource)) {
    res.status(400).json({
      success: false,
      error: 'Invalid document verification source',
      allowed_sources: COURIER_DOCUMENT_VERIFICATION_SOURCES,
    });
    return;
  }

  const hasExpiry = Object.prototype.hasOwnProperty.call(req.body || {}, 'expires_at');
  const expiresAt = hasExpiry && req.body.expires_at
    ? String(req.body.expires_at).trim()
    : hasExpiry ? null : undefined;
  if (expiresAt !== undefined && expiresAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    res.status(400).json({ success: false, error: 'expires_at must use YYYY-MM-DD format or null' });
    return;
  }
  const hasIssuedAt = Object.prototype.hasOwnProperty.call(req.body || {}, 'issued_at');
  const issuedAt = hasIssuedAt && req.body.issued_at
    ? String(req.body.issued_at).trim()
    : hasIssuedAt ? null : undefined;
  if (issuedAt !== undefined && issuedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) {
    res.status(400).json({ success: false, error: 'issued_at must use YYYY-MM-DD format or null' });
    return;
  }
  if (requestedStatus === 'revoked' && !String(req.body?.revocation_reason || '').trim()) {
    res.status(400).json({ success: false, error: 'revocation_reason is required when revoking a document' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.actor_id', $1, TRUE), set_config('app.actor_reason', $2, TRUE)`,
      [actorId, `Courier document ${requestedStatus}`]
    );
    const existing = await client.query(
      `SELECT id, document_status, verification_source, expires_at, service_scope
       FROM courier_documents
       WHERE id = $1 AND courier_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [documentId, courierProfileId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Courier document not found' });
      return;
    }

    const current = existing.rows[0];
    const effectiveExpiry = expiresAt === undefined ? current.expires_at : expiresAt;
    if (requestedStatus === 'verified' && effectiveExpiry && new Date(`${effectiveExpiry}T00:00:00Z`).getTime() < Date.now()) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'An expired document cannot be verified' });
      return;
    }

    const updated = await client.query(
      `UPDATE courier_documents
       SET document_status = $1::text,
           verification_source = COALESCE(NULLIF($2::text, ''), verification_source),
           document_number = COALESCE(NULLIF($3::text, ''), document_number),
           issued_at = CASE WHEN $4::text = '' THEN issued_at ELSE $4::date END,
           expires_at = CASE WHEN $5::text = '__KEEP__' THEN expires_at WHEN $5::text = '' THEN NULL ELSE $5::date END,
           is_verified = ($1::text = 'verified'),
           verified_at = CASE WHEN $1::text = 'verified' THEN NOW() ELSE NULL END,
           verified_by = CASE WHEN $1::text = 'verified' THEN $6::uuid ELSE NULL END,
           rejection_note = CASE WHEN $1::text = 'rejected' THEN NULLIF($7::text, '') ELSE NULL END,
           revoked_at = CASE WHEN $1::text = 'revoked' THEN NOW() ELSE NULL END,
           revocation_reason = CASE WHEN $1::text = 'revoked' THEN NULLIF($8::text, '') ELSE NULL END,
           service_scope = CASE WHEN $9::boolean THEN $10::text[] ELSE service_scope END,
           updated_at = NOW()
       WHERE id = $11 AND courier_id = $12 AND deleted_at IS NULL
       RETURNING id, courier_id, doc_type, document_status, verification_source,
                 document_number, issued_at, expires_at, is_verified, verified_at,
                 verified_by, rejection_note, revoked_at, revocation_reason,
                 retention_until, service_scope, updated_at`,
      [
        requestedStatus,
        requestedSource || current.verification_source || 'manual_review',
        req.body?.document_number ? String(req.body.document_number).trim() : '',
        issuedAt === undefined ? '' : (issuedAt || ''),
        expiresAt === undefined ? '__KEEP__' : (expiresAt || ''),
        actorId,
        String(req.body?.rejection_note || '').trim(),
        String(req.body?.revocation_reason || '').trim(),
        hasServiceScope,
        hasServiceScope ? requestedServiceScope.map((item: string) => item.trim().toLowerCase()) : null,
        documentId,
        courierProfileId,
      ]
    );

    const action = requestedStatus === 'verified'
      ? 'verify'
      : requestedStatus === 'rejected' ? 'reject' : requestedStatus === 'revoked' ? 'revoke' : 'view';
    await client.query(
      `INSERT INTO courier_document_access_log (
         courier_document_id, courier_profile_id, actor_id, action, purpose
       ) VALUES ($1, $2, $3, $4, $5)`,
      [documentId, courierProfileId, actorId, action, 'courier_document_review']
    );
    await client.query('COMMIT');

    res.json({ success: true, data: updated.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Update courier document verification database error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      constraint: error?.constraint,
      where: error?.where,
    });
    const isConstraintError = error?.code === '23514';
    res.status(isConstraintError ? 409 : 500).json({
      success: false,
      error: isConstraintError ? 'Document status rejected by compliance policy' : 'Failed to update courier document',
      code: isConstraintError ? 'ERR_COURIER_DOCUMENT_POLICY' : 'ERR_INTERNAL',
    });
  } finally {
    client.release();
  }
};

export const updateCourierVehicle = async (req: Request, res: Response): Promise<void> => {
  const actorId = getActorId(req);
  const courierProfileId = String(req.params.id);
  const vehicleId = String(req.params.vehicleId);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT cv.id, cv.plate_number, cv.vehicle_type, cv.vehicle_category, cv.brand, cv.model,
              production_year, engine_cc, max_weight_kg, verification_status
              , cp.vehicle_type AS legacy_vehicle_type
       FROM courier_vehicles cv
       JOIN courier_profiles cp ON cp.id = cv.courier_profile_id
       WHERE cv.id = $1 AND cv.courier_profile_id = $2
       FOR UPDATE`,
      [vehicleId, courierProfileId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Courier vehicle not found' });
      return;
    }

    const current = existing.rows[0];
    const validation = validateCourierVehicleProfile({
      plateNumber: req.body?.plate_number ?? current.plate_number,
      vehicleType: req.body?.vehicle_type ?? current.vehicle_type,
      vehicleCategory: req.body?.vehicle_category ?? current.vehicle_category,
      brand: req.body?.brand ?? current.brand,
      model: req.body?.model ?? current.model,
      productionYear: req.body?.production_year ?? current.production_year,
      engineCc: req.body?.engine_cc ?? current.engine_cc,
      maxWeightKg: req.body?.max_weight_kg ?? current.max_weight_kg,
    });
    if (!validation.valid) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'Invalid structured vehicle profile', fields: validation.errors });
      return;
    }

    const requestedStatus = String(req.body?.verification_status ?? current.verification_status).trim().toLowerCase();
    if (!['pending', 'approved', 'rejected', 'suspended'].includes(requestedStatus)) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'Invalid vehicle verification status' });
      return;
    }

    const normalized = validation.normalized;
    const legacyVehicleTypes = new Set(['bebek', 'matic', 'sport', 'sepeda']);
    const legacyVehicleType = legacyVehicleTypes.has(normalized.vehicleType)
      ? normalized.vehicleType
      : current.legacy_vehicle_type;
    const updated = await client.query(
      `UPDATE courier_vehicles
       SET plate_number = $1, vehicle_type = $2, vehicle_category = $3,
           brand = $4, model = $5, production_year = $6, engine_cc = $7,
           max_weight_kg = $8, verification_status = $9,
           approved_by = CASE WHEN $9 = 'approved' THEN $10 ELSE approved_by END,
           approved_at = CASE WHEN $9 = 'approved' THEN NOW() ELSE approved_at END,
           notes = COALESCE(NULLIF($11, ''), notes), updated_at = NOW()
       WHERE id = $12 AND courier_profile_id = $13
       RETURNING *`,
      [
        normalized.plateNumber,
        normalized.vehicleType || current.vehicle_type,
        normalized.vehicleCategory || null,
        normalized.brand,
        normalized.model,
        normalized.productionYear,
        normalized.engineCc,
        normalized.maxWeightKg,
        requestedStatus,
        actorId,
        String(req.body?.notes || '').trim(),
        vehicleId,
        courierProfileId,
      ]
    );
    await client.query(
      `UPDATE courier_profiles
       SET vehicle_type = $1, vehicle_plate = $2, vehicle_cc = $3,
           vehicle_brand = $4, vehicle_model = $5, vehicle_year = $6,
           vehicle_category = $7, updated_at = NOW()
       WHERE id = $8`,
      [
        legacyVehicleType || null,
        normalized.plateNumber,
        normalized.engineCc,
        normalized.brand,
        normalized.model,
        normalized.productionYear,
        normalized.vehicleCategory || null,
        courierProfileId,
      ]
    );
    await client.query('COMMIT');
    res.json({ success: true, data: updated.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(error?.code === '23505' ? 409 : 500).json({
      success: false,
      error: error?.code === '23505' ? 'Vehicle plate already belongs to this courier' : 'Failed to update courier vehicle',
      code: error?.code === '23505' ? 'ERR_COURIER_VEHICLE_DUPLICATE' : 'ERR_INTERNAL',
    });
  } finally {
    client.release();
  }
};

const courierStatusAliases: Record<string, CourierOnboardingState> = {
  draft: 'DRAFT',
  submitted: 'SUBMITTED',
  pending: 'SUBMITTED',
  verifying: 'VERIFYING',
  active: 'ACTIVE',
  approved: 'ACTIVE',
  rejected: 'REJECTED',
  needs_update: 'NEEDS_UPDATE',
  'needs-update': 'NEEDS_UPDATE',
  suspended: 'SUSPENDED',
  deactivated: 'DEACTIVATED',
};

const userStatusForCourierState = (state: CourierOnboardingState): string => {
  if (state === 'ACTIVE') return 'active';
  if (state === 'SUSPENDED') return 'suspended';
  if (state === 'REJECTED' || state === 'DEACTIVATED') return 'inactive';
  return 'pending_verification';
};

const verificationStatusForCourierState = (state: CourierOnboardingState): string => {
  if (state === 'ACTIVE') return 'approved';
  if (state === 'SUSPENDED') return 'suspended';
  if (state === 'REJECTED' || state === 'DEACTIVATED') return 'rejected';
  return 'pending';
};

export const updateCourierStatus = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const requestedStatus = String(req.body?.status || '').trim().toLowerCase();
  const targetState = courierStatusAliases[requestedStatus];

  if (!targetState) {
    res.status(400).json({
      error: 'Invalid status',
      allowed_statuses: Object.keys(courierStatusAliases),
    });
    return;
  }

  if (targetState === 'SUSPENDED') {
    res.status(409).json({
      error: 'Courier suspension must be created through the enforcement workflow',
      code: 'ERR_COURIER_ENFORCEMENT_REQUIRED',
      data: {
        endpoint: `/admin/couriers/${id}/enforcement-actions`,
        action_type: 'suspension',
        safe_job_policies: [
          'allow_active_job_completion',
          'reassign_unpicked_jobs',
          'immediate_safety_stop',
        ],
      },
    });
    return;
  }

  const actorId = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const profileRes = await client.query(
      `SELECT cp.id, cp.user_id, cp.onboarding_status, cp.verification_status,
              cp.onboarding_checklist, cp.is_verified,
              EXISTS (
                SELECT 1 FROM courier_vehicles cv
                WHERE cv.courier_profile_id = cp.id
              ) AS has_vehicle,
              courier_profile_documents_eligible(cp.id) AS has_verified_documents,
              u.status AS user_status
       FROM courier_profiles cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.id = $1
       FOR UPDATE OF cp, u`,
      [id]
    );

    if (profileRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Courier not found' });
      return;
    }

    const profile = profileRes.rows[0];
    const currentState = String(profile.onboarding_status || 'DRAFT').toUpperCase() as CourierOnboardingState;
    if (!canTransitionCourierOnboarding(currentState, targetState)) {
      await client.query('ROLLBACK');
      res.status(409).json({
        error: `Invalid courier onboarding transition ${currentState} -> ${targetState}`,
        code: 'ERR_INVALID_COURIER_ONBOARDING_TRANSITION',
        data: { current_state: currentState, requested_state: targetState },
      });
      return;
    }

    if (targetState === 'ACTIVE') {
      const readiness = evaluateCourierActivation({
        checklist: profile.onboarding_checklist,
        hasVehicle: Boolean(profile.has_vehicle),
        hasVerifiedDocuments: profile.has_verified_documents === undefined
          ? undefined
          : Boolean(profile.has_verified_documents),
      });
      if (!readiness.ready) {
        await client.query('ROLLBACK');
        res.status(409).json({
          error: 'Courier onboarding belum siap diaktifkan',
          code: 'ERR_COURIER_ONBOARDING_NOT_READY',
          data: {
            onboarding_status: currentState,
            missing_requirements: readiness.missing,
            remediation: readiness.remediation,
          },
        });
        return;
      }
    }

    await client.query(`SELECT set_config('app.actor_id', $1, TRUE), set_config('app.actor_reason', $2, TRUE)`, [
      actorId,
      String(req.body?.reason || `Admin transition to ${targetState}`),
    ]);
    await client.query(
      `UPDATE users
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [userStatusForCourierState(targetState), profile.user_id]
    );

    await client.query(
      `UPDATE courier_profiles
       SET onboarding_status = $1::text,
           verification_status = $2::text,
           is_verified = $3::boolean,
           status = $4::text,
           rejection_reason = CASE
             WHEN $1::text IN ('REJECTED', 'NEEDS_UPDATE') THEN COALESCE(NULLIF($5::text, ''), rejection_reason, 'Perlu perbaikan onboarding')
             WHEN $1::text = 'ACTIVE' THEN NULL
             ELSE rejection_reason
           END,
           reviewed_at = CASE WHEN $1::text IN ('ACTIVE', 'REJECTED', 'NEEDS_UPDATE', 'SUSPENDED', 'DEACTIVATED') THEN NOW() ELSE reviewed_at END,
           reviewed_by = CASE WHEN $1::text IN ('ACTIVE', 'REJECTED', 'NEEDS_UPDATE', 'SUSPENDED', 'DEACTIVATED') THEN $6::uuid ELSE reviewed_by END,
           updated_at = NOW()
       WHERE id = $7::uuid`,
      [
        targetState,
        verificationStatusForCourierState(targetState),
        targetState === 'ACTIVE',
        targetState === 'ACTIVE' ? 'active' : 'offline',
        String(req.body?.reason || ''),
        actorId,
        id,
      ]
    );

    if (targetState === 'ACTIVE') {
      await upsertCourierVehicleAndCapabilities(client, id, {
        approveEligible: true,
        approvedBy: actorId,
      });
    }

    const result = await client.query(
      `SELECT cp.*, u.status AS user_status
       FROM courier_profiles cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.id = $1`,
      [id]
    );

    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, category)
       VALUES ($1, $2, $3, $4, $5)`,
      [`courier:${id}`, targetState === 'ACTIVE', actorId, `Onboarding state updated to ${targetState}`, 'security']
    );

    await client.query('COMMIT');
    res.json({
      ...result.rows[0],
      status: result.rows[0].onboarding_status,
      onboarding_status: result.rows[0].onboarding_status,
      operational_status: result.rows[0].status,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(error?.code === '23514' ? 409 : 500).json({
      error: error?.code === '23514' ? 'Courier onboarding state rejected by policy' : error.message,
      code: error?.code === '23514' ? 'ERR_COURIER_ONBOARDING_POLICY' : 'ERR_INTERNAL',
    });
  } finally {
    client.release();
  }
};

export const getMobileCourierCapabilities = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const profileRes = await readDb.query(
      `SELECT cp.*, u.full_name, u.phone_number
       FROM courier_profiles cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.user_id = $1`,
      [req.user.id]
    );

    if (profileRes.rows.length === 0) {
      res.status(404).json({ success: false, data: null, message: 'Courier profile not found', code: 'ERR_NOT_FOUND' });
      return;
    }

    const profile = profileRes.rows[0];
    const vehicleRes = await readDb.query(
      `SELECT id, plate_number, vehicle_type, vehicle_category, brand, model, production_year, engine_cc,
              max_weight_kg::float8 AS max_weight_kg, verification_status, approved_at
       FROM courier_vehicles
       WHERE courier_profile_id = $1
       ORDER BY is_primary DESC, created_at DESC`,
      [profile.id]
    );
    const capabilitiesRes = await readDb.query(
      `SELECT csc.id, csc.service_code, dsp.name AS service_name, dsp.description, dsp.service_category,
              dsp.service_family, dsp.route_model, csc.status, csc.eligibility_reason,
              csc.certification_type, csc.certified_at, csc.effective_from, csc.expires_at, csc.market_scope,
              cce.effective_status, cce.availability_reason, cce.remediation_path, cce.is_eligible,
              dsp.batching_allowed,
              dsp.max_packages_per_order,
              dsp.max_active_orders_regular,
              dsp.max_active_orders_on_demand,
              dsp.same_customer_batching_required,
              dsp.allow_new_offer_while_pickup,
              dsp.allow_new_offer_while_delivery,
              dsp.max_pickup_detour_km::float8 AS max_pickup_detour_km,
              dsp.max_delivery_detour_km::float8 AS max_delivery_detour_km,
              dsp.max_direction_deviation_degrees,
              dsp.assignment_radius_pickup_km::float8 AS assignment_radius_pickup_km,
              dsp.assignment_radius_delivery_km::float8 AS assignment_radius_delivery_km,
              dsp.traffic_aware_assignment,
              dsp.proof_geofence_radius_m,
              dsp.proof_min_accuracy_m,
              dsp.face_verification_required,
              dsp.regular_max_reschedule_attempts,
              dsp.failed_delivery_policy,
              dsp.pod_label,
              csc.max_weight_kg::float8 AS max_weight_kg, csc.approved_at
       FROM courier_service_capabilities csc
       JOIN courier_capability_eligibility cce ON cce.id = csc.id
       JOIN delivery_service_products dsp ON dsp.code = csc.service_code
       WHERE csc.courier_profile_id = $1
       ORDER BY dsp.display_order ASC, dsp.name ASC`,
      [profile.id]
    );
    const trainingRes = await readDb.query(
      `SELECT training_key, title, completed_at, expires_at
       FROM courier_training_completions
       WHERE courier_profile_id = $1
       ORDER BY completed_at DESC`,
      [profile.id]
    );

    const checklist = profile.onboarding_checklist || {};
    const docs = checklist.documents || {};
    const rules = checklist.rules || {};
    const requiredDocuments = Array.isArray(checklist.required_documents) ? checklist.required_documents : [];
    const requiredRules = Array.isArray(checklist.required_rules) ? checklist.required_rules : [];
    const requiredDocsPassed = requiredDocuments.length > 0 && requiredDocuments.every((key: string) => Boolean(docs[key]));
    const rulesPassed = requiredRules.length > 0 && requiredRules.every((key: string) => rules[key] === true);
    const onboardingSteps = [
      { key: 'identity_documents', title: 'Dokumen identitas', status: requiredDocsPassed ? 'complete' : 'incomplete' },
      { key: 'vehicle_rules', title: 'Kelayakan kendaraan', status: rulesPassed ? 'complete' : 'incomplete' },
      { key: 'admin_review', title: 'Review admin', status: profile.onboarding_status === 'ACTIVE' ? 'complete' : profile.onboarding_status || profile.verification_status },
      { key: 'training', title: 'Training operasional', status: trainingRes.rows.length > 0 ? 'complete' : 'pending' }
    ];

    res.json({
      success: true,
      data: {
        profile: {
          id: profile.id,
          application_channel: profile.application_channel,
          verification_status: profile.verification_status,
          onboarding_status: profile.onboarding_status,
          market_code: profile.market_code,
          home_zone_id: profile.home_zone_id,
          current_zone_id: profile.current_zone_id
        },
        vehicle: vehicleRes.rows[0] || null,
        vehicles: vehicleRes.rows,
        service_capabilities: capabilitiesRes.rows,
        onboarding_steps: onboardingSteps,
        training_completions: trainingRes.rows
      },
      message: 'Courier capability profile loaded'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message, code: 'ERR_INTERNAL' });
  }
};

export const completeMobileCourierTraining = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const profileRes = await db.query('SELECT id FROM courier_profiles WHERE user_id = $1', [req.user.id]);
    if (profileRes.rows.length === 0) {
      res.status(404).json({ success: false, data: null, message: 'Courier profile not found', code: 'ERR_NOT_FOUND' });
      return;
    }

    const trainingKey = String(req.body?.training_key || 'on_demand_safety_v1');
    const title = String(req.body?.title || 'On-Demand Safety and Service Standard');
    const result = await db.query(
      `INSERT INTO courier_training_completions (courier_profile_id, training_key, title, metadata)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (courier_profile_id, training_key) DO UPDATE SET
         title = EXCLUDED.title,
         completed_at = NOW(),
         metadata = EXCLUDED.metadata
       RETURNING training_key, title, completed_at`,
      [profileRes.rows[0].id, trainingKey, title, JSON.stringify(req.body?.metadata || {})]
    );

    res.json({ success: true, data: result.rows[0], message: 'Training marked as completed' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message, code: 'ERR_INTERNAL' });
  }
};

export const requestMobileCourierCapabilityUpgrade = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const profileRes = await db.query('SELECT id FROM courier_profiles WHERE user_id = $1', [req.user.id]);
    if (profileRes.rows.length === 0) {
      res.status(404).json({ success: false, data: null, message: 'Courier profile not found', code: 'ERR_NOT_FOUND' });
      return;
    }

    const serviceCode = String(req.body?.service_code || '');
    const proofImageUrl = String(req.body?.proof_image_url || '');

    if (!serviceCode) {
      res.status(400).json({ success: false, data: null, message: 'Service code is required', code: 'ERR_BAD_REQUEST' });
      return;
    }

    // Attempt to get the primary vehicle of the courier
    const vehicleRes = await db.query(
      `SELECT id FROM courier_vehicles WHERE courier_profile_id = $1 ORDER BY is_primary DESC, created_at DESC LIMIT 1`,
      [profileRes.rows[0].id]
    );

    const vehicleId = vehicleRes.rows.length > 0 ? vehicleRes.rows[0].id : null;

    const result = await db.query(
      `INSERT INTO courier_service_capabilities (
         courier_profile_id, vehicle_id, service_code, application_channel, status,
         certification_type, evidence_storage_key, eligibility_reason, updated_at
       ) VALUES ($1, $2, $3, 'on_demand', 'pending_review', 'service_equipment_proof', $4, $5, NOW())
       ON CONFLICT (courier_profile_id, service_code) DO UPDATE SET
         status = CASE WHEN courier_service_capabilities.status = 'enabled' THEN 'enabled' ELSE 'pending_review' END,
         certification_type = EXCLUDED.certification_type,
         evidence_storage_key = COALESCE(EXCLUDED.evidence_storage_key, courier_service_capabilities.evidence_storage_key),
         eligibility_reason = EXCLUDED.eligibility_reason,
         updated_at = NOW()
       RETURNING id, service_code, status`,
      [
        profileRes.rows[0].id,
        vehicleId,
        serviceCode,
        normalizeCapabilityEvidenceKey(proofImageUrl),
        'Capability upgrade requested with certification evidence.',
      ]
    );

    res.json({ success: true, data: result.rows[0], message: 'Capability upgrade requested successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message, code: 'ERR_INTERNAL' });
  }
};


export const updateCourierServiceCapabilities = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const capabilities = Array.isArray(req.body?.capabilities) ? req.body.capabilities : [];
  const allowedStatuses = ['pending_review', 'enabled', 'disabled', 'rejected', 'paused', 'suspended'];
  const updates = capabilities.map((capability: any) => {
    const serviceCode = String(capability.service_code || capability.serviceCode || '').trim();
    const status = String(capability.status || '').trim().toLowerCase();
    const reason = String(capability.eligibility_reason || capability.reason || capability.suspension_reason || '').trim();
    const evidenceStorageKey = normalizeCapabilityEvidenceKey(capability.evidence_storage_key || capability.evidenceStorageKey);
    const checksum = String(capability.evidence_checksum_sha256 || capability.evidenceChecksumSha256 || '').trim().toLowerCase();
    const marketScope = Object.prototype.hasOwnProperty.call(capability, 'market_scope')
      ? capability.market_scope
      : capability.marketScope;
    return {
      capability,
      serviceCode,
      status,
      reason,
      evidenceStorageKey,
      checksum,
      marketScope,
    };
  });

  const invalidUpdate = updates.find((update: {
    serviceCode: string;
    status: string;
    reason: string;
    checksum: string;
    marketScope: unknown;
  }) => {
    if (!update.serviceCode || !allowedStatuses.includes(update.status)) return true;
    if ((update.status === 'paused' || update.status === 'suspended') && !update.reason) return true;
    if (update.checksum && !/^[a-f0-9]{64}$/.test(update.checksum)) return true;
    if (update.marketScope !== undefined && (!Array.isArray(update.marketScope) || update.marketScope.some((item: unknown) => typeof item !== 'string' || !String(item).trim()))) return true;
    return false;
  });
  if (invalidUpdate) {
    res.status(400).json({
      success: false,
      error: 'Invalid capability certification update',
      allowed_statuses: allowedStatuses,
      required_fields: 'service_code, status, and suspension_reason for paused/suspended states',
    });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await upsertCourierVehicleAndCapabilities(client, id, {
      approveEligible: false,
      approvedBy: getActorId(req)
    });

    for (const update of updates) {
      const { capability, serviceCode, status, reason, evidenceStorageKey, checksum, marketScope } = update;
      let effectiveFrom: string;
      let expiresAt: string;
      try {
        effectiveFrom = normalizeCapabilityDate(
          Object.prototype.hasOwnProperty.call(capability, 'effective_from') ? capability.effective_from : capability.effectiveFrom,
          'effective_from',
        );
        expiresAt = normalizeCapabilityDate(
          Object.prototype.hasOwnProperty.call(capability, 'expires_at') ? capability.expires_at : capability.expiresAt,
          'expires_at',
        );
      } catch (error: any) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      const certificationType = String(capability.certification_type || capability.certificationType || '').trim();
      const normalizedMarketScope = marketScope === undefined
        ? null
        : marketScope.map((item: string) => item.trim().toLowerCase());
      await client.query(
        `UPDATE courier_service_capabilities
         SET status = $1,
             eligibility_reason = COALESCE(NULLIF($2, ''), eligibility_reason),
             max_weight_kg = COALESCE($3, max_weight_kg),
             certification_type = COALESCE(NULLIF($4, ''), certification_type),
             evidence_storage_key = COALESCE(NULLIF($5, ''), evidence_storage_key),
             evidence_checksum_sha256 = COALESCE(NULLIF($6, ''), evidence_checksum_sha256),
             effective_from = CASE WHEN $7 = '__KEEP__' THEN effective_from WHEN $7 = '' THEN NULL ELSE $7::date END,
             expires_at = CASE WHEN $8 = '__KEEP__' THEN expires_at WHEN $8 = '' THEN NULL ELSE $8::date END,
             market_scope = COALESCE($9::text[], market_scope),
             certified_at = CASE WHEN $1 = 'enabled' THEN COALESCE(certified_at, NOW()) ELSE certified_at END,
             approved_by = CASE WHEN $1 = 'enabled' THEN $10 ELSE approved_by END,
             approved_at = CASE WHEN $1 = 'enabled' THEN NOW() ELSE approved_at END,
             suspension_reason = CASE WHEN $1 IN ('paused', 'suspended') THEN NULLIF($2, '') ELSE NULL END,
             paused_at = CASE WHEN $1 IN ('paused', 'suspended') THEN COALESCE(paused_at, NOW()) ELSE NULL END,
             paused_by = CASE WHEN $1 IN ('paused', 'suspended') THEN $10 ELSE NULL END,
             updated_at = NOW()
         WHERE courier_profile_id = $11 AND service_code = $12`,
        [
          status,
          reason,
          capability.max_weight_kg ?? null,
          certificationType,
          evidenceStorageKey || '',
          checksum,
          effectiveFrom,
          expiresAt,
          normalizedMarketScope,
          getActorId(req),
          id,
          serviceCode,
        ]
      );
    }

    await client.query('COMMIT');
    const result = await readDb.query(
      `SELECT csc.*, cce.effective_status, cce.availability_reason, cce.remediation_path, cce.is_eligible,
              dsp.name AS service_name, dsp.service_category, dsp.service_family
       FROM courier_service_capabilities csc
       JOIN courier_capability_eligibility cce ON cce.id = csc.id
       JOIN delivery_service_products dsp ON dsp.code = csc.service_code
       WHERE csc.courier_profile_id = $1
       ORDER BY dsp.display_order ASC, dsp.name ASC`,
      [id]
    );
    res.json({ success: true, data: result.rows });
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

export const updateCourierProfilePhoto = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  
  if (!req.file) {
    res.status(400).json({ error: 'No photo provided' });
    return;
  }

  const client = await db.connect();
  try {
    const { fileUrl } = saveSecureUploadBuffer(req.file, 'profiles');

    await client.query('BEGIN');

    await client.query(
      `UPDATE users u
       SET photo_url = $1,
           profile_photo_locked_at = NOW(),
           updated_at = NOW()
       FROM courier_profiles cp
       WHERE cp.user_id = u.id AND cp.id = $2`,
      [fileUrl, id]
    );

    const result = await client.query(`
      SELECT 
        cp.*,
        u.photo_url,
        u.profile_photo_locked_at,
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
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Courier not found' });
      return;
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('[COURIER PHOTO UPDATE ERROR]', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const broadcastOnboardingInvite = async (req: Request, res: Response) => {
  try {
    const { courier_ids, date, time, address } = req.body;

    if (!Array.isArray(courier_ids) || courier_ids.length === 0) {
      return res.status(400).json({ error: 'courier_ids is required and must be an array' });
    }

    if (!date || !time || !address) {
      return res.status(400).json({ error: 'date, time, and address are required' });
    }

    // Fetch courier names to replace in template
    const couriersRes = await db.query(
      `SELECT id, full_name FROM couriers WHERE id = ANY($1)`,
      [courier_ids]
    );

    const couriers = couriersRes.rows;

    if (couriers.length === 0) {
      return res.status(404).json({ error: 'No couriers found' });
    }

    const notificationsPromises = couriers.map((courier) => {
      const messageBody = `Halo ${courier.full_name}! Pendaftaran kamu sudah disetujui. Silakan datang ke basecamp untuk pengambilan atribut pada tanggal ${date} jam ${time}. Lokasi: ${address}.`;
      return createNotification({
        user_id: courier.id,
        title: 'Undangan Pengambilan Atribut',
        body: messageBody,
        type: 'basecamp_invite',
        category: 'message',
        priority: 'high',
      });
    });

    await Promise.all(notificationsPromises);

    return res.status(200).json({ success: true, message: `Broadcast sent to ${couriers.length} couriers` });
  } catch (error) {
    securityLog.error('Error broadcasting onboarding invite:', error);
    return res.status(500).json({ error: 'Failed to broadcast onboarding invite' });
  }
};
