import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';
import { db, readDb } from '../db';

// ─────────────────────────────────────────────
// FOOD-BIKE-048: Admin management merchant
// List, detail (dengan dokumen), approve, reject.
// ─────────────────────────────────────────────

const LEGACY_STATUS_TO_ONBOARDING: Record<string, string> = {
  pending: 'SUBMITTED',
  approved: 'ACTIVE',
  rejected: 'REJECTED',
};
const VALID_ONBOARDING_STATUS = ['DRAFT', 'SUBMITTED', 'VERIFYING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'all'];
const VALID_LEGAL_ENTITY_TYPES = ['all', 'perorangan', 'perusahaan'];
const VALID_DOCUMENT_TYPES = ['ktp_pemilik', 'foto_tempat_usaha', 'rekening_bank', 'nib'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizedOnboardingStatus = (value: unknown) => {
  const raw = String(value ?? 'SUBMITTED').trim();
  if (raw === 'all') return raw;
  return LEGACY_STATUS_TO_ONBOARDING[raw.toLowerCase()] || raw.toUpperCase();
};

const requireAdminActor = (req: Request, res: Response): string | null => {
  const actor = getActorId(req);
  if (!actor || !UUID_RE.test(actor)) {
    res.status(401).json({ error: 'Admin actor tidak valid' });
    return null;
  }
  return actor;
};

const auditMerchantLifecycle = async (client: { query: Function }, actor: string, action: string, merchantId: string, payload: unknown) => {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload)
     VALUES ($1::uuid, $2::text, $3::uuid, $4::text)`,
    [actor, action, merchantId, JSON.stringify(payload)],
  );
};

const transitionMerchantOnboarding = async (
  client: { query: Function },
  merchantId: string,
  nextStatus: string,
  actor: string,
  reason: string | null,
  metadata: Record<string, unknown>,
) => {
  const result = await client.query(
    `SELECT merchant_id, onboarding_status, verification_status, requirements_met
       FROM transition_merchant_onboarding($1::uuid, $2::text, $3::uuid, $4::text, $5::jsonb)`,
    [merchantId, nextStatus, actor, reason, JSON.stringify(metadata)],
  );
  return result.rows[0] || null;
};

export const listAdminMerchants = async (req: Request, res: Response) => {
  const status = normalizedOnboardingStatus(req.query.status);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 20));
  const search = String(req.query.search ?? '').trim();
  const businessType = String(req.query.business_type ?? '').trim();

  if (!VALID_ONBOARDING_STATUS.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_ONBOARDING_STATUS.join(', ')}` });
    return;
  }

  try {
    const where: string[] = [];
    const params: any[] = [];
    if (status !== 'all') {
      params.push(status);
      where.push(`m.onboarding_status = $${params.length}::text`);
    }
    if (businessType) {
      params.push(businessType);
      where.push(`COALESCE(m.business_type, 'perorangan') = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(m.nama_toko ILIKE $${params.length} OR u.phone_number ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const totalRes = await readDb.query(
      `SELECT COUNT(*)::int AS total FROM merchants m LEFT JOIN users u ON u.id = m.user_id ${whereSql}`,
      params
    );
    const total = totalRes.rows[0]?.total ?? 0;

    const resData = await readDb.query(
      `SELECT m.id, m.user_id, m.nama_toko, m.alamat,
              to_char(m.jam_buka, 'HH24:MI') AS jam_buka,
              to_char(m.jam_tutup, 'HH24:MI') AS jam_tutup,
              m.is_open, m.completion_rate_pct, m.verification_status, m.onboarding_status, m.market_code,
              m.business_type, lp.legal_name, lp.registration_reference, lp.payout_account_reference,
              m.halal_cert_number, to_char(m.halal_expiry_date, 'YYYY-MM-DD') AS halal_expiry_date,
              m.spp_irt_number, to_char(m.spp_irt_expiry_date, 'YYYY-MM-DD') AS spp_irt_expiry_date,
              m.bpom_number, to_char(m.bpom_expiry_date, 'YYYY-MM-DD') AS bpom_expiry_date,
              commercial.contract_version AS commercial_contract_version,
              commercial.effective_from AS commercial_contract_effective_from,
              m.created_at, m.updated_at,
              u.phone_number, u.email, u.full_name
       FROM merchants m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN merchant_legal_profiles lp ON lp.merchant_id = m.id
       LEFT JOIN LATERAL (
         SELECT contract_version, effective_from
           FROM merchant_commission_contracts contract
          WHERE contract.merchant_id = m.id
            AND contract.market_code = m.market_code
            AND contract.status = 'approved'
          ORDER BY contract.effective_from DESC
          LIMIT 1
       ) commercial ON TRUE
       ${whereSql}
       ORDER BY m.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    res.json({ merchants: resData.rows, total, page, page_size: pageSize });
  } catch (error: any) {
    securityLog.error('admin_merchants_list_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to list merchants' });
  }
};

// ─────────────────────────────────────────────
// FOOD-BIKE-051: Dashboard performa merchant
// Completion rate, rata-rata prep time, rating, volume order food.
// ─────────────────────────────────────────────
export const listMerchantPerformance = async (req: Request, res: Response) => {
  const search = String(req.query.search ?? '').trim();
  try {
    const where: string[] = [];
    const params: any[] = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(m.nama_toko ILIKE $${params.length} OR u.phone_number ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await readDb.query(
      `SELECT
         m.id AS merchant_id,
         m.nama_toko,
         m.is_open,
         m.verification_status,
         COALESCE(m.completion_rate_pct, 0)::float AS completion_rate_pct,
         COUNT(DISTINCT o.id) AS total_orders,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('completed','delivered')) AS completed_orders,
         ROUND(AVG(o.prep_time_minutes) FILTER (WHERE o.prep_time_minutes IS NOT NULL), 1) AS avg_prep_minutes,
         COALESCE(AVG(r.stars) FILTER (WHERE r.stars IS NOT NULL), 0)::float AS avg_rating,
         COUNT(DISTINCT r.id) AS rating_count
       FROM merchants m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN orders o ON o.merchant_id = m.id AND o.service_sub_type = 'food_delivery'
       LEFT JOIN merchant_ratings r ON r.merchant_id = m.id
       ${whereSql}
       GROUP BY m.id, m.nama_toko, m.is_open, m.verification_status, m.completion_rate_pct
       ORDER BY total_orders DESC, m.nama_toko
       LIMIT 200`,
      params
    );

    res.json({ merchants: result.rows });
  } catch (error: any) {
    securityLog.error('admin_merchants_performance_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to load merchant performance' });
  }
};

export const getAdminMerchantDetail = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const merchantRes = await readDb.query(
      `SELECT m.id, m.user_id, m.nama_toko, m.alamat,
              ST_Y(m.lokasi::geometry) AS lokasi_lat, ST_X(m.lokasi::geometry) AS lokasi_lng,
              to_char(m.jam_buka, 'HH24:MI') AS jam_buka,
              to_char(m.jam_tutup, 'HH24:MI') AS jam_tutup,
              m.is_open, m.completion_rate_pct, m.verification_status, m.onboarding_status, m.market_code,
              m.business_type, lp.legal_entity_type, lp.legal_name, lp.registration_reference,
              lp.tax_identifier, lp.owner_user_id, lp.operator_user_id, lp.payout_account_reference,
              m.bank_name, m.bank_account_holder, m.bank_account_verified, m.payout_schedule, m.npwp,
              m.halal_cert_number, to_char(m.halal_expiry_date, 'YYYY-MM-DD') AS halal_expiry_date,
              m.spp_irt_number, to_char(m.spp_irt_expiry_date, 'YYYY-MM-DD') AS spp_irt_expiry_date,
              m.bpom_number, to_char(m.bpom_expiry_date, 'YYYY-MM-DD') AS bpom_expiry_date,
              commercial.contract_version AS commercial_contract_version,
              commercial.effective_from AS commercial_contract_effective_from,
              m.created_at, m.updated_at,
              u.phone_number, u.email, u.full_name
       FROM merchants m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN merchant_legal_profiles lp ON lp.merchant_id = m.id
       LEFT JOIN LATERAL (
         SELECT contract_version, effective_from
           FROM merchant_commission_contracts contract
          WHERE contract.merchant_id = m.id
            AND contract.market_code = m.market_code
            AND contract.status = 'approved'
          ORDER BY contract.effective_from DESC
          LIMIT 1
       ) commercial ON TRUE
       WHERE m.id = $1`,
      [id]
    );
    if (merchantRes.rows.length === 0) {
      res.status(404).json({ error: 'Merchant not found' });
      return;
    }

    const docsRes = await readDb.query(
      `SELECT id, doc_type, file_url, uploaded_at FROM merchant_documents WHERE merchant_id = $1 ORDER BY uploaded_at DESC`,
      [id]
    );
    const menuRes = await readDb.query(
      `SELECT id, nama, harga, kategori, prep_time_minutes, is_available, created_at
       FROM merchant_menu_items WHERE merchant_id = $1 ORDER BY kategori, nama`,
      [id]
    );

    const requirementsRes = await readDb.query(
      `SELECT requirement.id, requirement.market_code, requirement.legal_entity_type,
              requirement.document_type, requirement.is_required, requirement.policy_version,
              requirement.effective_from, requirement.effective_to, requirement.is_active,
              EXISTS (
                SELECT 1 FROM merchant_documents document
                 WHERE document.merchant_id = $1::uuid
                   AND document.doc_type = requirement.document_type
              ) AS document_present
         FROM merchant_market_verification_requirements requirement
         JOIN merchant_legal_profiles profile ON profile.merchant_id = $1::uuid
        WHERE requirement.market_code = profile.market_code
          AND requirement.legal_entity_type IN ('all', profile.legal_entity_type)
          AND requirement.is_active
          AND requirement.effective_from <= NOW()
          AND (requirement.effective_to IS NULL OR NOW() < requirement.effective_to)
        ORDER BY requirement.document_type`,
      [id],
    );
    const reviewsRes = await readDb.query(
      `SELECT id, from_status, to_status, actor_id, reason, requirement_snapshot, metadata, created_at
         FROM merchant_onboarding_reviews
        WHERE merchant_id = $1::uuid
        ORDER BY created_at DESC`,
      [id],
    );

    res.json({
      merchant: merchantRes.rows[0],
      documents: docsRes.rows,
      menu_items: menuRes.rows,
      verification_requirements: requirementsRes.rows,
      onboarding_reviews: reviewsRes.rows,
    });
  } catch (error: any) {
    securityLog.error('admin_merchant_detail_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to get merchant detail' });
  }
};

const transitionAdminMerchant = async (req: Request, res: Response, nextStatus: string, action: string) => {
  const id = String(req.params.id);
  const actor = requireAdminActor(req, res);
  if (!actor) return;
  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'Merchant id tidak valid' });
    return;
  }
  const reason = String(req.body?.reason ?? '').trim() || null;
  if (nextStatus === 'REJECTED' || nextStatus === 'SUSPENDED') {
    if (!reason) {
      res.status(400).json({ error: 'Alasan wajib diisi untuk penolakan atau suspend' });
      return;
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (nextStatus === 'ACTIVE') {
      const readiness = await client.query(
        `SELECT m.id,
                ST_Y(m.lokasi::geometry) AS lat,
                ST_X(m.lokasi::geometry) AS lng,
                merchant_onboarding_requirements_met(m.id) AS requirements_met
           FROM merchants m
          WHERE m.id = $1::uuid
          FOR UPDATE`,
        [id],
      );
      if (readiness.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Merchant tidak ditemukan' });
        return;
      }
      if (readiness.rows[0].lat == null || readiness.rows[0].lng == null) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Merchant belum mengisi lokasi toko sebelum aktivasi' });
        return;
      }
      if (!readiness.rows[0].requirements_met) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Dokumen wajib untuk market merchant belum lengkap atau kebijakan market tidak aktif' });
        return;
      }
    }

    const merchant = await transitionMerchantOnboarding(client, id, nextStatus, actor, reason, {
      source: 'admin_merchant_lifecycle',
      requested_action: action,
    });
    if (!merchant) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Merchant tidak ditemukan' });
      return;
    }
    await auditMerchantLifecycle(client, actor, action, id, { after: merchant, reason });
    await client.query('COMMIT');
    securityLog.info(action, { merchant_id: id, actor, onboarding_status: merchant.onboarding_status });
    res.json({ success: true, merchant });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    const message = String(error?.message || 'Failed to transition merchant onboarding');
    const status = message.includes('merchant not found') ? 404 : message.includes('invalid merchant onboarding transition') || message.includes('requires') ? 409 : 500;
    securityLog.error(`${action}_failed`, { error: message, actor, merchant_id: id });
    res.status(status).json({ error: message });
  } finally {
    client.release();
  }
};

export const startAdminMerchantVerification = async (req: Request, res: Response) =>
  transitionAdminMerchant(req, res, 'VERIFYING', 'admin_merchant_verification_started');

export const approveAdminMerchant = async (req: Request, res: Response) =>
  transitionAdminMerchant(req, res, 'ACTIVE', 'admin_merchant_activated');

export const rejectAdminMerchant = async (req: Request, res: Response) =>
  transitionAdminMerchant(req, res, 'REJECTED', 'admin_merchant_rejected');

export const suspendAdminMerchant = async (req: Request, res: Response) =>
  transitionAdminMerchant(req, res, 'SUSPENDED', 'admin_merchant_suspended');

export const listAdminMerchantVerificationRequirements = async (req: Request, res: Response) => {
  const marketCode = req.query.market_code ? String(req.query.market_code).trim().toUpperCase() : null;
  try {
    const result = await readDb.query(
      `SELECT id, market_code, legal_entity_type, document_type, is_required,
              policy_version, effective_from, effective_to, is_active, created_at, updated_at
         FROM merchant_market_verification_requirements
        WHERE ($1::text IS NULL OR market_code = $1::text)
        ORDER BY market_code, legal_entity_type, document_type, effective_from DESC`,
      [marketCode],
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('admin_merchant_verification_requirements_list_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ success: false, error: 'Gagal memuat requirement verifikasi merchant' });
  }
};

export const createAdminMerchantVerificationRequirement = async (req: Request, res: Response) => {
  const actor = requireAdminActor(req, res);
  if (!actor) return;
  const marketCode = String(req.body?.market_code || '').trim().toUpperCase();
  const legalEntityType = String(req.body?.legal_entity_type || 'all').trim().toLowerCase();
  const documentType = String(req.body?.document_type || '').trim().toLowerCase();
  const policyVersion = String(req.body?.policy_version || '').trim();
  const effectiveFrom = new Date(req.body?.effective_from || Date.now());
  const effectiveTo = req.body?.effective_to ? new Date(req.body.effective_to) : null;
  const isRequired = req.body?.is_required !== false;
  if (!marketCode || marketCode.length > 32 || !VALID_LEGAL_ENTITY_TYPES.includes(legalEntityType)
    || !VALID_DOCUMENT_TYPES.includes(documentType) || !policyVersion || policyVersion.length > 80
    || Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && (Number.isNaN(effectiveTo.getTime()) || effectiveTo <= effectiveFrom))) {
    res.status(400).json({ success: false, error: 'Konfigurasi requirement merchant tidak valid' });
    return;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO merchant_market_verification_requirements (
         market_code, legal_entity_type, document_type, is_required, policy_version,
         effective_from, effective_to, is_active, created_by, updated_by
       ) VALUES ($1::text, $2::text, $3::text, $4::boolean, $5::text, $6::timestamptz, $7::timestamptz, TRUE, $8::uuid, $8::uuid)
       RETURNING *`,
      [marketCode, legalEntityType, documentType, isRequired, policyVersion, effectiveFrom, effectiveTo, actor],
    );
    await auditMerchantLifecycle(client, actor, 'merchant_verification_requirement.created', result.rows[0].id, { after: result.rows[0] });
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('admin_merchant_verification_requirement_create_failed', { error: error.message, actor });
    res.status(error?.code === '23505' ? 409 : 500).json({ success: false, error: error?.message || 'Gagal membuat requirement merchant' });
  } finally {
    client.release();
  }
};

export const updateAdminMerchantVerificationRequirement = async (req: Request, res: Response) => {
  const actor = requireAdminActor(req, res);
  const id = String(req.params.id || '');
  if (!actor) return;
  if (!UUID_RE.test(id)) {
    res.status(400).json({ success: false, error: 'Requirement id tidak valid' });
    return;
  }
  const hasRequired = Object.prototype.hasOwnProperty.call(req.body || {}, 'is_required');
  const hasActive = Object.prototype.hasOwnProperty.call(req.body || {}, 'is_active');
  const effectiveTo = Object.prototype.hasOwnProperty.call(req.body || {}, 'effective_to')
    ? (req.body.effective_to ? new Date(req.body.effective_to) : null)
    : undefined;
  if (!hasRequired && !hasActive && effectiveTo === undefined) {
    res.status(400).json({ success: false, error: 'Tidak ada perubahan requirement' });
    return;
  }
  if (effectiveTo instanceof Date && Number.isNaN(effectiveTo.getTime())) {
    res.status(400).json({ success: false, error: 'effective_to tidak valid' });
    return;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(`SELECT * FROM merchant_market_verification_requirements WHERE id = $1::uuid FOR UPDATE`, [id]);
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Requirement tidak ditemukan' });
      return;
    }
    const result = await client.query(
      `UPDATE merchant_market_verification_requirements
          SET is_required = CASE WHEN $2::boolean THEN $3::boolean ELSE is_required END,
              is_active = CASE WHEN $4::boolean THEN $5::boolean ELSE is_active END,
              effective_to = CASE WHEN $6::boolean THEN $7::timestamptz ELSE effective_to END,
              updated_by = $8::uuid,
              updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING *`,
      [id, hasRequired, Boolean(req.body?.is_required), hasActive, Boolean(req.body?.is_active), effectiveTo !== undefined, effectiveTo, actor],
    );
    await auditMerchantLifecycle(client, actor, 'merchant_verification_requirement.updated', id, { before: before.rows[0], after: result.rows[0] });
    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('admin_merchant_verification_requirement_update_failed', { error: error.message, actor, id });
    res.status(500).json({ success: false, error: 'Gagal memperbarui requirement merchant' });
  } finally {
    client.release();
  }
};
