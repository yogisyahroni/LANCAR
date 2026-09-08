import { Request, Response } from 'express';
import { db } from '../../db';
import { securityLog } from '../../security/logRedaction';
import { getActorId } from '../../utils/authUtils';

const normalizeMarketCode = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeList = (value: unknown) => Array.isArray(value)
  ? Array.from(new Set(value.map((item) => String(item).trim().toLowerCase()).filter(Boolean)))
  : [];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const validateTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const readMarketConfigInput = (body: Record<string, any>, existing?: any) => {
  const countryCode = String(body.country_code ?? existing?.country_code ?? '').trim().toUpperCase();
  const currencyCode = String(body.currency_code ?? existing?.currency_code ?? '').trim().toUpperCase();
  const timezone = String(body.timezone ?? existing?.timezone ?? '').trim();
  const displayLocale = String(body.display_locale ?? existing?.display_locale ?? '').trim();
  const policyVersion = String(body.policy_version ?? existing?.policy_version ?? '').trim();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('country_code harus memakai ISO-3166 dua huruf.');
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error('currency_code harus memakai ISO-4217 tiga huruf.');
  if (!timezone || !validateTimezone(timezone)) throw new Error('timezone tidak valid.');
  if (!displayLocale || displayLocale.length > 32) throw new Error('display_locale wajib diisi.');
  if (!policyVersion || policyVersion.length > 80) throw new Error('policy_version wajib diisi.');
  const currencyMinorUnit = body.currency_minor_unit === undefined
    ? Number(existing?.currency_minor_unit ?? 0)
    : Number(body.currency_minor_unit);
  if (!Number.isInteger(currencyMinorUnit) || currencyMinorUnit < 0 || currencyMinorUnit > 3) {
    throw new Error('currency_minor_unit harus integer 0 sampai 3.');
  }
  const requiredTaxProfile = body.required_tax_profile === undefined
    ? (existing?.required_tax_profile || { required: false })
    : body.required_tax_profile;
  if (!isRecord(requiredTaxProfile)) throw new Error('required_tax_profile harus object.');
  return {
    countryCode,
    currencyCode,
    timezone,
    displayLocale,
    currencyMinorUnit,
    requiredVehicleTypes: body.required_vehicle_types === undefined ? null : normalizeList(body.required_vehicle_types),
    requiredDocumentTypes: body.required_document_types === undefined ? null : normalizeList(body.required_document_types),
    requiredTaxProfile,
    requiredPayoutMethods: body.required_payout_methods === undefined ? null : normalizeList(body.required_payout_methods),
    crossBorderSupported: body.cross_border_supported === undefined ? null : Boolean(body.cross_border_supported),
    policyVersion,
    isActive: body.is_active === undefined ? null : Boolean(body.is_active),
    metadata: body.metadata === undefined ? null : (isRecord(body.metadata) ? body.metadata : (() => { throw new Error('metadata harus object.'); })()),
  };
};

const recordAudit = async (client: any, req: Request, action: string, targetId: string, payload: Record<string, unknown>) => {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload, created_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())`,
    [getActorId(req), action, targetId, JSON.stringify(payload)]
  );
};

export const listAdminCourierMarketConfigs = async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT cmc.*,
              (SELECT COUNT(*)::int FROM courier_profiles cp WHERE lower(cp.market_code) = cmc.market_code) AS courier_count,
              (SELECT COUNT(*)::int FROM courier_market_verifications cmv WHERE cmv.market_code = cmc.market_code AND cmv.status = 'reverification_required') AS reverification_count
       FROM courier_market_configs cmc
       ORDER BY cmc.is_active DESC, cmc.market_code ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    securityLog.error('List courier market configs error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const listAdminCourierMarketChangeRequests = async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || '').trim().toLowerCase();
    const params: string[] = [];
    const statusFilter = ['pending', 'approved', 'rejected', 'cancelled'].includes(status)
      ? `AND cmr.status = $${params.push(status)}`
      : '';
    const result = await db.query(
      `SELECT cmr.id, cmr.courier_profile_id, cmr.from_market_code, cmr.target_market_code,
              cmr.status, cmr.reason, cmr.requested_at, cmr.reviewed_at,
              cp.user_id, u.full_name AS courier_name,
              source_cfg.country_code AS source_country_code,
              target_cfg.country_code AS target_country_code,
              target_cfg.policy_version AS target_policy_version
       FROM courier_market_change_requests cmr
       JOIN courier_profiles cp ON cp.id = cmr.courier_profile_id
       JOIN users u ON u.id = cp.user_id
       JOIN courier_market_configs source_cfg ON source_cfg.market_code = cmr.from_market_code
       JOIN courier_market_configs target_cfg ON target_cfg.market_code = cmr.target_market_code
       WHERE TRUE ${statusFilter}
       ORDER BY CASE WHEN cmr.status = 'pending' THEN 0 ELSE 1 END, cmr.requested_at DESC
       LIMIT 100`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    securityLog.error('List courier market change requests error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const createAdminCourierMarketConfig = async (req: Request, res: Response) => {
  const marketCode = normalizeMarketCode(req.body?.market_code);
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(marketCode)) {
    res.status(400).json({ success: false, data: null, message: 'market_code tidak valid.', code: 'ERR_INVALID_MARKET_CODE' });
    return;
  }
  try {
    const input = readMarketConfigInput(req.body || {});
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO courier_market_configs (
           market_code, country_code, currency_code, currency_minor_unit, timezone, display_locale,
           required_vehicle_types, required_document_types, required_tax_profile, required_payout_methods,
           cross_border_supported, policy_version, is_active, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8::text[],$9::jsonb,$10::text[],$11,$12,$13,$14::jsonb)
         RETURNING *`,
        [marketCode, input.countryCode, input.currencyCode, input.currencyMinorUnit, input.timezone, input.displayLocale,
          input.requiredVehicleTypes || [], input.requiredDocumentTypes || [], JSON.stringify(input.requiredTaxProfile),
          input.requiredPayoutMethods || [], input.crossBorderSupported ?? false, input.policyVersion,
          input.isActive ?? true, JSON.stringify(input.metadata || {})]
      );
      await recordAudit(client, req, 'courier_market_config_created', marketCode, { market_code: marketCode, policy_version: input.policyVersion });
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: result.rows[0], message: 'Market config created' });
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') {
        res.status(409).json({ success: false, data: null, message: 'Market config sudah ada.', code: 'ERR_MARKET_CONFIG_EXISTS' });
        return;
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Market config tidak valid.';
    const code = message.includes('tidak valid') || message.includes('wajib') || message.includes('harus') ? 'ERR_INVALID_MARKET_CONFIG' : 'ERR_INTERNAL_SERVER';
    res.status(code === 'ERR_INTERNAL_SERVER' ? 500 : 400).json({ success: false, data: null, message, code });
  }
};

export const updateAdminCourierMarketConfig = async (req: Request, res: Response) => {
  const marketCode = normalizeMarketCode(req.params.marketCode);
  if (!marketCode) {
    res.status(400).json({ success: false, data: null, message: 'market_code wajib diisi.', code: 'ERR_INVALID_MARKET_CODE' });
    return;
  }
  try {
    const existingResult = await db.query('SELECT * FROM courier_market_configs WHERE market_code = $1', [marketCode]);
    const existing = existingResult.rows[0];
    if (!existing) {
      res.status(404).json({ success: false, data: null, message: 'Market config tidak ditemukan.', code: 'ERR_MARKET_CONFIG_NOT_FOUND' });
      return;
    }
    const body = req.body || {};
    const requirementChanged = ['required_vehicle_types', 'required_document_types', 'required_tax_profile', 'required_payout_methods', 'currency_code', 'currency_minor_unit', 'timezone', 'display_locale'].some((key) => body[key] !== undefined);
    if (requirementChanged && !body.policy_version) {
      res.status(422).json({ success: false, data: null, message: 'Perubahan requirement market wajib memakai policy_version baru.', code: 'ERR_POLICY_VERSION_REQUIRED' });
      return;
    }
    const input = readMarketConfigInput(body, existing);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE courier_market_configs SET
           country_code = $1, currency_code = $2, currency_minor_unit = $3, timezone = $4, display_locale = $5,
           required_vehicle_types = COALESCE($6::text[], required_vehicle_types),
           required_document_types = COALESCE($7::text[], required_document_types),
           required_tax_profile = COALESCE($8::jsonb, required_tax_profile),
           required_payout_methods = COALESCE($9::text[], required_payout_methods),
           cross_border_supported = COALESCE($10, cross_border_supported), policy_version = $11,
           is_active = COALESCE($12, is_active), metadata = COALESCE($13::jsonb, metadata), updated_at = NOW()
         WHERE market_code = $14 RETURNING *`,
        [input.countryCode, input.currencyCode, input.currencyMinorUnit, input.timezone, input.displayLocale,
          input.requiredVehicleTypes, input.requiredDocumentTypes, JSON.stringify(input.requiredTaxProfile), input.requiredPayoutMethods,
          input.crossBorderSupported, input.policyVersion, input.isActive, input.metadata ? JSON.stringify(input.metadata) : null, marketCode]
      );
      if (requirementChanged) {
        await client.query(
          `UPDATE courier_market_verifications SET status = 'reverification_required', rejection_reason = 'Market policy changed; re-verification required.', updated_at = NOW()
           WHERE market_code = $1 AND status = 'approved'`,
          [marketCode]
        );
      }
      await recordAudit(client, req, 'courier_market_config_updated', marketCode, { market_code: marketCode, policy_version: input.policyVersion, requirement_changed: requirementChanged });
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0], message: 'Market config updated' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Market config update failed';
    res.status(message.includes('tidak valid') || message.includes('wajib') || message.includes('harus') ? 400 : 500)
      .json({ success: false, data: null, message, code: 'ERR_MARKET_CONFIG_UPDATE_FAILED' });
  }
};

export const reviewAdminCourierMarketChangeRequest = async (req: Request, res: Response) => {
  const requestedStatus = String(req.body?.status || '').trim().toLowerCase();
  if (!['approved', 'rejected'].includes(requestedStatus)) {
    res.status(400).json({ success: false, data: null, message: 'status harus approved atau rejected.', code: 'ERR_INVALID_MARKET_CHANGE_STATUS' });
    return;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query(
      `SELECT cmr.*, cp.user_id, cp.is_online, cp.onboarding_status, cp.verification_status,
              cmc.policy_version, cmc.required_vehicle_types, cmc.required_document_types,
              cmc.required_tax_profile, cmc.required_payout_methods
       FROM courier_market_change_requests cmr
       JOIN courier_profiles cp ON cp.id = cmr.courier_profile_id
       JOIN courier_market_configs cmc ON cmc.market_code = cmr.target_market_code
       WHERE cmr.id = $1 AND cmr.status = 'pending'
       FOR UPDATE OF cmr, cp`,
      [req.params.id]
    );
    const request = requestResult.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Market change request tidak ditemukan atau sudah direview.', code: 'ERR_MARKET_CHANGE_NOT_FOUND' });
      return;
    }
    if (requestedStatus === 'approved') {
      const activeJobs = await client.query(
        `SELECT COUNT(*)::int AS count FROM order_legs WHERE courier_id = $1 AND COALESCE(status, '') NOT IN ('delivered','completed','failed','cancelled','rejected','return_required')`,
        [request.user_id]
      );
      if (request.is_online || Number(activeJobs.rows[0]?.count || 0) > 0) {
        throw Object.assign(new Error('Courier harus offline dan tanpa pekerjaan aktif sebelum market dipindahkan.'), { statusCode: 409 });
      }
      await client.query(
        `INSERT INTO courier_market_verifications (
           courier_profile_id, market_code, status, vehicle_eligible, documents_eligible, tax_eligible, payout_eligible,
           checked_policy_version, verified_by, verified_at, evidence_metadata, updated_at
         ) SELECT $1, $2, 'approved',
           (cardinality($3::text[]) = 0 OR EXISTS (SELECT 1 FROM courier_vehicles cv WHERE cv.courier_profile_id = $1 AND cv.verification_status = 'approved' AND lower(cv.vehicle_type) = ANY (ARRAY(SELECT lower(value) FROM unnest($3::text[]) value)))),
           (cardinality($4::text[]) = 0 OR NOT EXISTS (SELECT 1 FROM unnest($4::text[]) required(doc_type) WHERE NOT EXISTS (SELECT 1 FROM courier_documents cd WHERE cd.courier_id = $1 AND cd.doc_type = required.doc_type AND cd.document_status = 'verified' AND cd.deleted_at IS NULL AND cd.revoked_at IS NULL AND (cd.expires_at IS NULL OR cd.expires_at >= CURRENT_DATE)))),
           (lower(COALESCE($5::jsonb->>'required','false')) NOT IN ('true','1','yes') OR EXISTS (SELECT 1 FROM user_tax_profiles utp WHERE utp.user_id = $6 AND (NULLIF(utp.npwp,'') IS NOT NULL OR NULLIF(utp.nik,'') IS NOT NULL))),
           (cardinality($7::text[]) = 0 OR EXISTS (SELECT 1 FROM courier_payout_accounts cpa WHERE (cpa.courier_profile_id = $1 OR cpa.courier_id = $6) AND cpa.status = 'verified' AND lower(cpa.bank_code) = ANY (ARRAY(SELECT lower(value) FROM unnest($7::text[]) value)))),
           $8, $9, NOW(), jsonb_build_object('source','admin_market_change_review'), NOW()
         ON CONFLICT (courier_profile_id, market_code) DO UPDATE SET status = EXCLUDED.status,
           vehicle_eligible = EXCLUDED.vehicle_eligible, documents_eligible = EXCLUDED.documents_eligible,
           tax_eligible = EXCLUDED.tax_eligible, payout_eligible = EXCLUDED.payout_eligible,
           checked_policy_version = EXCLUDED.checked_policy_version, verified_by = EXCLUDED.verified_by,
           verified_at = EXCLUDED.verified_at, rejection_reason = NULL, updated_at = NOW()`,
        [request.courier_profile_id, request.target_market_code, request.required_vehicle_types || [], request.required_document_types || [],
          request.required_tax_profile || { required: false }, request.user_id, request.required_payout_methods || [], request.policy_version, getActorId(req)]
      );
      const eligibility = await client.query('SELECT courier_market_is_eligible($1, $2) AS is_eligible', [request.courier_profile_id, request.target_market_code]);
      if (eligibility.rows[0]?.is_eligible !== true) {
        throw Object.assign(new Error('Regulatory verification target market belum memenuhi seluruh requirement.'), { statusCode: 422 });
      }
      await client.query(
        `UPDATE courier_market_change_requests SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), metadata = metadata || $2::jsonb WHERE id = $3`,
        [getActorId(req), JSON.stringify({ review: 'approved' }), request.id]
      );
      await client.query(
        `UPDATE courier_profiles SET market_code = $1, market_change_request_id = $2, is_online = FALSE, updated_at = NOW() WHERE id = $3`,
        [request.target_market_code, request.id, request.courier_profile_id]
      );
    } else {
      await client.query(
        `UPDATE courier_market_change_requests SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), metadata = metadata || $2::jsonb WHERE id = $3`,
        [getActorId(req), JSON.stringify({ review: 'rejected', reason: req.body?.reason || null }), request.id]
      );
    }
    await recordAudit(client, req, `courier_market_change_${requestedStatus}`, request.id, { courier_profile_id: request.courier_profile_id, from_market_code: request.from_market_code, target_market_code: request.target_market_code });
    await client.query('COMMIT');
    res.json({ success: true, data: { id: request.id, status: requestedStatus, market_code: requestedStatus === 'approved' ? request.target_market_code : request.from_market_code }, message: `Market change ${requestedStatus}` });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    res.status(error?.statusCode || 500).json({ success: false, data: null, message: error instanceof Error ? error.message : 'Market change review failed', code: error?.statusCode ? 'ERR_MARKET_CHANGE_REJECTED' : 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

const getCourierProfileId = async (userId: string) => {
  const result = await db.query(`SELECT id, market_code, is_online FROM courier_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
  return result.rows[0] || null;
};

export const getMobileCourierMarketEligibility = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }
  try {
    const profile = await getCourierProfileId(req.user.id);
    if (!profile) {
      res.status(404).json({ success: false, data: null, message: 'Courier not found', code: 'ERR_NOT_FOUND' });
      return;
    }
    const [eligibility, requests, crossBorder] = await Promise.all([
      db.query(`SELECT row_to_json(me) AS eligibility FROM courier_profiles cp CROSS JOIN LATERAL courier_market_eligibility(cp.id, cp.market_code) me WHERE cp.id = $1`, [profile.id]),
      db.query(`SELECT id, from_market_code, target_market_code, status, reason, requested_at, reviewed_at FROM courier_market_change_requests WHERE courier_profile_id = $1 ORDER BY requested_at DESC LIMIT 10`, [profile.id]),
      db.query(`SELECT origin_market_code, target_market_code, status, decision_reason, expires_at FROM courier_cross_border_working_eligibility WHERE courier_profile_id = $1 ORDER BY created_at DESC`, [profile.id]),
    ]);
    const currentEligibility = eligibility.rows[0]?.eligibility || null;
    res.json({
      success: true,
      data: {
        current_market_code: profile.market_code,
        current: currentEligibility,
        pending_market_changes: requests.rows,
        cross_border: crossBorder.rows.length > 0 ? crossBorder.rows : [{ origin_market_code: profile.market_code, status: 'not_supported', supported: false, decision_reason: 'Cross-border working requires a separate regulatory decision.' }],
      },
      message: 'Courier market eligibility loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier market eligibility error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const createMobileCourierMarketChangeRequest = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }
  const targetMarketCode = normalizeMarketCode(req.body?.target_market_code || req.body?.market_code);
  const idempotencyKey = String(req.headers['x-idempotency-key'] || req.body?.idempotency_key || '').trim();
  if (!targetMarketCode || idempotencyKey.length < 12) {
    res.status(400).json({ success: false, data: null, message: 'target_market_code dan idempotency key wajib diisi.', code: 'ERR_INVALID_MARKET_CHANGE_REQUEST' });
    return;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const profileResult = await client.query(`SELECT id, market_code FROM courier_profiles WHERE user_id = $1 FOR UPDATE`, [req.user.id]);
    const profile = profileResult.rows[0];
    if (!profile) throw Object.assign(new Error('Courier not found'), { statusCode: 404 });
    if (profile.market_code === targetMarketCode) throw Object.assign(new Error('Target market sama dengan market aktif.'), { statusCode: 409 });
    const config = await client.query(`SELECT market_code, is_active FROM courier_market_configs WHERE market_code = $1`, [targetMarketCode]);
    if (!config.rows[0]?.is_active) throw Object.assign(new Error('Target market belum tersedia atau sedang nonaktif.'), { statusCode: 422 });
    const existing = await client.query(`SELECT * FROM courier_market_change_requests WHERE courier_profile_id = $1 AND idempotency_key = $2`, [profile.id, idempotencyKey]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      res.status(200).json({ success: true, data: existing.rows[0], message: 'Market change request already recorded' });
      return;
    }
    const result = await client.query(
      `INSERT INTO courier_market_change_requests (courier_profile_id, from_market_code, target_market_code, reason, idempotency_key, requested_by, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
      [profile.id, profile.market_code, targetMarketCode, String(req.body?.reason || '').trim().slice(0, 500) || null, idempotencyKey, getActorId(req), JSON.stringify({ source: 'courier_mobile' })]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0], message: 'Market change request sent for regulatory review' });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    res.status(error?.statusCode || 500).json({ success: false, data: null, message: error instanceof Error ? error.message : 'Market change request failed', code: error?.statusCode ? 'ERR_MARKET_CHANGE_REQUEST_BLOCKED' : 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

export const createMobileCourierCrossBorderEligibility = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }
  const targetMarketCode = normalizeMarketCode(req.body?.target_market_code);
  try {
    const profile = await getCourierProfileId(req.user.id);
    if (!profile || !targetMarketCode) {
      res.status(400).json({ success: false, data: null, message: 'target_market_code wajib diisi.', code: 'ERR_INVALID_CROSS_BORDER_REQUEST' });
      return;
    }
    if (profile.market_code === targetMarketCode) {
      res.status(409).json({ success: false, data: null, message: 'Target market harus berbeda dari market asal.', code: 'ERR_CROSS_BORDER_SAME_MARKET' });
      return;
    }
    const config = await db.query(`SELECT cross_border_supported FROM courier_market_configs WHERE market_code = $1 AND is_active = TRUE`, [targetMarketCode]);
    if (!config.rows[0]?.cross_border_supported) {
      res.status(409).json({ success: false, data: { status: 'not_supported', origin_market_code: profile.market_code, target_market_code: targetMarketCode }, message: 'Cross-border working belum didukung untuk market ini.', code: 'ERR_CROSS_BORDER_NOT_SUPPORTED' });
      return;
    }
    const result = await db.query(
      `INSERT INTO courier_cross_border_working_eligibility (courier_profile_id, origin_market_code, target_market_code, status, policy_version, decision_reason)
       SELECT $1, $2, $3, 'pending', policy_version, 'Cross-border request requires separate regulatory review.' FROM courier_market_configs WHERE market_code = $3
       ON CONFLICT (courier_profile_id, origin_market_code, target_market_code) DO UPDATE SET status = CASE WHEN courier_cross_border_working_eligibility.status = 'rejected' THEN 'pending' ELSE courier_cross_border_working_eligibility.status END, updated_at = NOW()
       RETURNING *`,
      [profile.id, profile.market_code, targetMarketCode]
    );
    res.status(201).json({ success: true, data: result.rows[0], message: 'Cross-border eligibility request sent for review' });
  } catch (error) {
    securityLog.error('Create mobile courier cross-border eligibility error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};
