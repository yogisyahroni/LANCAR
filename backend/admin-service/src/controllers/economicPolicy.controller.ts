import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import {
  buildExampleQuotes,
  EconomicPolicyValidationError,
  normalizeEconomicPolicyDraft,
  quoteBasisFromRow,
  type EconomicPolicyDraft,
} from '../services/economicPolicyControlPlane';

type Queryable = { query: (text: string, values?: unknown[]) => Promise<any> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const actorId = (req: Request): string => {
  try {
    return getActorId(req);
  } catch {
    throw Object.assign(new Error('Authenticated admin actor is required'), { statusCode: 401 });
  }
};

const revisionId = (value: unknown): string => {
  const normalized = String(value || '').trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw Object.assign(new EconomicPolicyValidationError('revision id harus berupa UUID valid'), { statusCode: 400 });
  }
  return normalized;
};

const errorStatus = (error: any): number => {
  if (Number.isInteger(error?.statusCode)) return error.statusCode;
  if (error?.code === '23505') return 409;
  if (error?.code === '23514' || error?.code === '23503') return 400;
  return 500;
};

const sendError = (res: Response, error: any, fallback: string): void => {
  const status = errorStatus(error);
  securityLog.error(fallback, { error: error?.message, code: error?.code });
  res.status(status).json({
    success: false,
    error: status >= 500 ? fallback : error?.message || fallback,
  });
};

const audit = async (client: Queryable, actor: string, action: string, targetId: string, payload: unknown) => {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [actor, action, targetId, JSON.stringify(payload)],
  );
};

const createRuntimeKey = (draft: EconomicPolicyDraft) => draft.runtimeConfigKey;

export const listEconomicPolicyRevisions = async (req: Request, res: Response): Promise<void> => {
  try {
    const policyType = req.query.policy_type ? String(req.query.policy_type).trim().toLowerCase() : null;
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
    const marketCode = req.query.market_code ? String(req.query.market_code).trim().toLowerCase() : null;
    const result = await readDb.query(
      `SELECT id, policy_key, policy_type, runtime_config_key, policy_version,
              market_code, zone_id, service_code, payload, previous_payload,
              status, business_reason, created_by, approved_by, approved_at,
              published_by, published_at, rolled_back_by, rolled_back_at,
              created_at, updated_at
         FROM marketplace_economic_policy_revisions
        WHERE ($1::text IS NULL OR policy_type = $1)
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR market_code = $3)
        ORDER BY created_at DESC
        LIMIT 100`,
      [policyType, status, marketCode],
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    sendError(res, error, 'Failed to list economics policy revisions');
  }
};

const getRevision = async (source: Queryable, id: string, forUpdate = false) => {
  const suffix = forUpdate ? ' FOR UPDATE' : '';
  const result = await source.query(
    `SELECT id, policy_key, policy_type, runtime_config_key, policy_version,
            market_code, zone_id, service_code, payload, previous_payload,
            status, business_reason, created_by, approved_by, approved_at,
            published_by, published_at, rolled_back_by, rolled_back_at,
            created_at, updated_at
       FROM marketplace_economic_policy_revisions
      WHERE id = $1${suffix}`,
    [id],
  );
  return result.rows[0] || null;
};

export const getEconomicPolicyRevision = async (req: Request, res: Response): Promise<void> => {
  try {
    const revision = await getRevision(readDb, revisionId(req.params.id));
    if (!revision) {
      res.status(404).json({ success: false, error: 'Economics policy revision tidak ditemukan' });
      return;
    }
    res.json({ success: true, data: revision });
  } catch (error: any) {
    sendError(res, error, 'Failed to get economics policy revision');
  }
};

export const createEconomicPolicyRevision = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = actorId(req);
    const draft = normalizeEconomicPolicyDraft((req.body || {}) as Record<string, unknown>);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO marketplace_economic_policy_revisions
           (policy_key, policy_type, runtime_config_key, policy_version,
            market_code, zone_id, service_code, payload, status,
            business_reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'draft', $9, $10)
         RETURNING *`,
        [
          draft.policyKey,
          draft.policyType,
          createRuntimeKey(draft),
          draft.policyVersion,
          draft.marketCode,
          draft.zoneId,
          draft.serviceCode,
          JSON.stringify(draft.payload),
          draft.businessReason,
          actor,
        ],
      );
      await audit(client, actor, 'economics_policy.drafted', result.rows[0].id, {
        business_reason: draft.businessReason,
        policy_type: draft.policyType,
        runtime_config_key: draft.runtimeConfigKey,
        policy_version: draft.policyVersion,
        scope: { market_code: draft.marketCode, zone_id: draft.zoneId, service_code: draft.serviceCode },
      });
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    sendError(res, error, 'Failed to create economics policy draft');
  }
};

const buildPreview = async (source: Queryable, revision: any) => {
  const [runtimeResult, productResult, legacyPricingResult, affectedOrdersResult] = await Promise.all([
    source.query('SELECT value FROM system_configs WHERE key = $1', [revision.runtime_config_key]),
    source.query(
      `SELECT code, name, base_fare_idr, included_distance_km, per_km_idr, service_multiplier
         FROM delivery_service_products
        WHERE code = $1 AND is_enabled = TRUE
        LIMIT 1`,
      [revision.service_code],
    ),
    source.query(
      `SELECT base_fee, min_distance_km, per_km_fee
         FROM pricing_configs
        WHERE model = 'p2p' AND is_active = TRUE
        ORDER BY updated_at DESC
        LIMIT 1`,
    ),
    source.query(
      `SELECT COUNT(DISTINCT o.id)::int AS active_order_count
         FROM orders o
        WHERE o.status NOT IN ('delivered', 'completed', 'cancelled', 'failed')
          AND (COALESCE(NULLIF(o.service_code, ''), NULLIF(o.service_sub_type, ''), '') = $1
            OR ($1 = 'food_delivery' AND o.service_sub_type = 'food_delivery'))
          AND ($2::uuid IS NULL OR EXISTS (
            SELECT 1 FROM order_legs ol WHERE ol.order_id = o.id AND ol.zone_id = $2::uuid
          ))`,
      [revision.service_code, revision.zone_id],
    ),
  ]);

  const productBasis = quoteBasisFromRow(productResult.rows[0], 'delivery_service_products');
  const legacyBasis = quoteBasisFromRow(legacyPricingResult.rows[0], 'pricing_configs');
  const basis = productBasis || legacyBasis;
  const currentPayload = runtimeResult.rows[0]?.value ?? null;
  const currentMultiplier = currentPayload && typeof currentPayload === 'object'
    ? Math.min(Number(currentPayload.ceiling_multiplier || 1), Number(currentPayload.protected_cap_multiplier || 1))
    : null;

  return {
    revision,
    current_runtime_payload: currentPayload,
    affected_scope: {
      market_codes: [revision.market_code],
      zone_ids: revision.zone_id ? [revision.zone_id] : [],
      service_codes: [revision.service_code],
      active_order_count: Number(affectedOrdersResult.rows[0]?.active_order_count || 0),
    },
    example_quotes: {
      authoritative: false,
      label: 'Simulasi server; quote customer tetap dihitung oleh order-service.',
      quote_basis: basis,
      current_multiplier: Number.isFinite(currentMultiplier) ? currentMultiplier : null,
      candidate_quotes: buildExampleQuotes(basis, revision.payload),
    },
    approval: {
      required: true,
      maker_id: revision.created_by,
      checker_id: revision.approved_by,
      status: revision.status,
      protected_cap_enforced_server_side: true,
    },
  };
};

export const previewEconomicPolicyRevision = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = revisionId(req.params.id);
    const revision = await getRevision(readDb, id);
    if (!revision) {
      res.status(404).json({ success: false, error: 'Economics policy revision tidak ditemukan' });
      return;
    }
    res.json({ success: true, data: await buildPreview(readDb, revision) });
  } catch (error: any) {
    sendError(res, error, 'Failed to preview economics policy revision');
  }
};

export const simulateEconomicPolicyRevision = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = revisionId(req.params.id);
    const revision = await getRevision(readDb, id);
    if (!revision) {
      res.status(404).json({ success: false, error: 'Economics policy revision tidak ditemukan' });
      return;
    }
    if (!['draft', 'approved'].includes(revision.status)) {
      res.status(409).json({ success: false, error: 'Hanya draft atau approved policy yang dapat disimulasikan' });
      return;
    }
    res.json({ success: true, simulation: true, data: await buildPreview(readDb, revision) });
  } catch (error: any) {
    sendError(res, error, 'Failed to simulate economics policy revision');
  }
};

export const approveEconomicPolicyRevision = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = actorId(req);
    const id = revisionId(req.params.id);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const revision = await getRevision(client, id, true);
      if (!revision) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: 'Economics policy revision tidak ditemukan' });
        return;
      }
      if (revision.status !== 'draft') {
        await client.query('ROLLBACK');
        res.status(409).json({ success: false, error: 'Hanya draft policy yang dapat di-approve' });
        return;
      }
      if (String(revision.created_by) === actor) {
        await client.query('ROLLBACK');
        res.status(409).json({ success: false, error: 'Maker dan checker harus merupakan actor berbeda' });
        return;
      }
      const result = await client.query(
        `UPDATE marketplace_economic_policy_revisions
            SET status = 'approved', approved_by = $1, approved_at = NOW()
          WHERE id = $2 AND status = 'draft'
          RETURNING *`,
        [actor, id],
      );
      await audit(client, actor, 'economics_policy.approved', id, {
        business_reason: revision.business_reason,
        before_status: revision.status,
        after_status: result.rows[0].status,
      });
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    sendError(res, error, 'Failed to approve economics policy revision');
  }
};

export const publishEconomicPolicyRevision = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = actorId(req);
    const id = revisionId(req.params.id);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const revision = await getRevision(client, id, true);
      if (!revision) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: 'Economics policy revision tidak ditemukan' });
        return;
      }
      if (revision.status !== 'approved') {
        await client.query('ROLLBACK');
        res.status(409).json({ success: false, error: 'Hanya approved policy yang dapat dipublish' });
        return;
      }
      const currentResult = await client.query(
        'SELECT value FROM system_configs WHERE key = $1 FOR UPDATE',
        [revision.runtime_config_key],
      );
      if (!currentResult.rows[0]) {
        await client.query('ROLLBACK');
        res.status(409).json({ success: false, error: 'Runtime pricing config belum tersedia; publish dihentikan fail-closed' });
        return;
      }
      const previousPayload = currentResult.rows[0].value;
      const result = await client.query(
        `UPDATE marketplace_economic_policy_revisions
            SET status = 'published', previous_payload = $1::jsonb,
                published_by = $2, published_at = NOW()
          WHERE id = $3 AND status = 'approved'
          RETURNING *`,
        [JSON.stringify(previousPayload), actor, id],
      );
      await client.query(
        `UPDATE system_configs
            SET value = $1::jsonb,
                description = $2,
                category = 'pricing',
                updated_by = $3,
                updated_at = NOW()
          WHERE key = $4`,
        [JSON.stringify(revision.payload), `Economics policy ${revision.policy_version} published`, actor, revision.runtime_config_key],
      );
      await audit(client, actor, 'economics_policy.published', id, {
        business_reason: revision.business_reason,
        runtime_config_key: revision.runtime_config_key,
        previous_payload: previousPayload,
        published_payload: revision.payload,
      });
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0], runtime_config_key: revision.runtime_config_key });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    sendError(res, error, 'Failed to publish economics policy revision');
  }
};

export const rollbackEconomicPolicyRevision = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = actorId(req);
    const id = revisionId(req.params.id);
    const rollbackReason = String(req.body?.business_reason ?? req.body?.reason ?? '').trim();
    if (rollbackReason.length < 3 || rollbackReason.length > 2000) {
      throw new EconomicPolicyValidationError('business_reason wajib diisi untuk rollback (3-2000 karakter)');
    }
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const revision = await getRevision(client, id, true);
      if (!revision) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: 'Economics policy revision tidak ditemukan' });
        return;
      }
      if (revision.status !== 'published' || !revision.previous_payload) {
        await client.query('ROLLBACK');
        res.status(409).json({ success: false, error: 'Hanya published policy dengan snapshot sebelumnya yang dapat di-rollback' });
        return;
      }
      await client.query(
        `UPDATE system_configs
            SET value = $1::jsonb,
                description = $2,
                category = 'pricing',
                updated_by = $3,
                updated_at = NOW()
          WHERE key = $4`,
        [JSON.stringify(revision.previous_payload), `Economics policy ${revision.policy_version} rolled back`, actor, revision.runtime_config_key],
      );
      const result = await client.query(
        `UPDATE marketplace_economic_policy_revisions
            SET status = 'rolled_back', rolled_back_by = $1, rolled_back_at = NOW(),
                business_reason = LEFT(business_reason || E'\nRollback: ' || $2, 2000)
          WHERE id = $3 AND status = 'published'
          RETURNING *`,
        [actor, rollbackReason, id],
      );
      await audit(client, actor, 'economics_policy.rolled_back', id, {
        business_reason: rollbackReason,
        original_business_reason: revision.business_reason,
        runtime_config_key: revision.runtime_config_key,
        restored_payload: revision.previous_payload,
      });
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0], runtime_config_key: revision.runtime_config_key });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    sendError(res, error, 'Failed to rollback economics policy revision');
  }
};
