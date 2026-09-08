import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

type Queryable = { query: (text: string, values?: unknown[]) => Promise<any> };

const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const VARIANT_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const SAFE_ATTRIBUTES = new Set([
  'amount_band', 'device_reputation_band', 'gps_integrity', 'handoff_distance_band',
  'ip_reputation_band', 'market_code', 'order_age_band', 'platform', 'service_code', 'velocity_band',
]);
const FORBIDDEN_TREATMENT_KEYS = [
  'amount', 'commission', 'cost', 'currency', 'discount', 'fee', 'money', 'payment',
  'payout', 'price', 'refund', 'tax', 'total',
];

const DEFAULT_GUARDRAILS = [
  { metric: 'crash_error_rate', event_types: ['app.crash', 'app.error'], threshold: 0, direction: 'max' },
  { metric: 'cancellation_rate', event_types: ['order.cancelled'], threshold: 0, direction: 'max' },
  { metric: 'refund_rate', event_types: ['refund.created', 'payment.refunded'], threshold: 0, direction: 'max' },
  { metric: 'eta_sla', event_types: ['sla.measured'], threshold: 0, direction: 'max' },
  { metric: 'support_contact_rate', event_types: ['support.contact.created'], threshold: 0, direction: 'max' },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fail = (message: string, statusCode = 400): Error => Object.assign(new Error(message), { statusCode });

const actorId = (req: Request): string => {
  try { return getActorId(req); } catch { throw fail('Authenticated admin actor is required', 401); }
};

const sendError = (res: Response, error: any, fallback: string): void => {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : error?.code === '23505' ? 409 : 500;
  securityLog.error(fallback, { error: error?.message, code: error?.code });
  res.status(status).json({ success: false, error: status >= 500 ? fallback : error?.message || fallback });
};

const objectValue = (value: unknown, field: string): Record<string, any> => {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { throw fail(`${field} harus JSON valid`); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw fail(`${field} harus object JSON`);
  return clone(parsed as Record<string, any>);
};

const stringArray = (value: unknown, field: string, max = 100): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw fail(`${field} harus array terbatas`);
  return value.map((item) => {
    const normalized = String(item || '').trim();
    if (!normalized || normalized.length > 100) throw fail(`${field} memiliki nilai invalid`);
    return normalized;
  });
};

const validateTargeting = (raw: unknown): Record<string, any> => {
  const targeting = objectValue(raw ?? {}, 'targeting');
  const result = {
    market_codes: stringArray(targeting.market_codes, 'targeting.market_codes'),
    city_codes: stringArray(targeting.city_codes, 'targeting.city_codes'),
    app_versions: stringArray(targeting.app_versions, 'targeting.app_versions'),
    app_version_min: targeting.app_version_min ? String(targeting.app_version_min).trim() : '',
    app_version_max: targeting.app_version_max ? String(targeting.app_version_max).trim() : '',
    service_codes: stringArray(targeting.service_codes, 'targeting.service_codes'),
    user_cohorts: stringArray(targeting.user_cohorts, 'targeting.user_cohorts'),
    safe_attributes: {} as Record<string, string[]>,
  };
  if (result.app_version_min && !/^\d+(?:\.\d+){0,3}$/.test(result.app_version_min)) throw fail('targeting.app_version_min invalid');
  if (result.app_version_max && !/^\d+(?:\.\d+){0,3}$/.test(result.app_version_max)) throw fail('targeting.app_version_max invalid');
  if (targeting.safe_attributes !== undefined) {
    const attrs = objectValue(targeting.safe_attributes, 'targeting.safe_attributes');
    for (const [key, values] of Object.entries(attrs)) {
      const normalizedKey = key.toLowerCase().trim();
      if (!SAFE_ATTRIBUTES.has(normalizedKey)) throw fail(`safe attribute ${key} tidak diizinkan`);
      result.safe_attributes[normalizedKey] = stringArray(values, `targeting.safe_attributes.${normalizedKey}`, 50);
      if (result.safe_attributes[normalizedKey].length === 0) throw fail(`safe attribute ${key} kosong`);
    }
  }
  return result;
};

const validateTreatmentPayload = (payload: Record<string, any>): void => {
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value as Record<string, any>)) {
      const normalized = key.toLowerCase().trim();
      if (FORBIDDEN_TREATMENT_KEYS.some((forbidden) => normalized === forbidden || normalized.includes(forbidden))) {
        throw fail(`financial field ${key} tidak boleh ada di treatment`);
      }
      walk(item)
    }
  };
  walk(payload);
};

const validateVariants = (raw: unknown): Array<Record<string, any>> => {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 20) throw fail('variants minimal dua dan maksimal dua puluh');
  const seen = new Set<string>();
  let total = 0;
  const variants = raw.map((item) => {
    const value = objectValue(item, 'variant');
    const key = String(value.key || '').trim().toLowerCase();
    const weight = Number(value.weight_basis_points);
    if (!VARIANT_PATTERN.test(key) || !Number.isInteger(weight) || weight <= 0) throw fail('variant key/weight invalid');
    if (seen.has(key)) throw fail('variant key harus unik');
    seen.add(key);
    total += weight;
    const payload = objectValue(value.payload ?? {}, `variant.${key}.payload`);
    validateTreatmentPayload(payload);
    return { key, weight_basis_points: weight, payload };
  });
  if (total !== 10000) throw fail('variant weights harus berjumlah 10000 basis points');
  return variants;
};

const validateGuardrails = (raw: unknown): Array<Record<string, any>> => {
  const source = raw === undefined ? DEFAULT_GUARDRAILS : raw;
  if (!Array.isArray(source) || source.length < 1 || source.length > 30) throw fail('guardrails invalid');
  return source.map((item) => {
    const value = objectValue(item, 'guardrail');
    const metric = String(value.metric || '').trim();
    const eventTypes = stringArray(value.event_types, `guardrail.${metric}.event_types`, 20);
    const threshold = Number(value.threshold);
    const direction = String(value.direction || '').trim().toLowerCase();
    if (!metric || !eventTypes.length || !Number.isFinite(threshold) || threshold < 0 || !['min', 'max'].includes(direction)) {
      throw fail(`guardrail ${metric || 'unknown'} invalid`);
    }
    return { metric, event_types: eventTypes, threshold, direction };
  });
};

const normalizeExperiment = (body: Record<string, any>, existing?: Record<string, any>): Record<string, any> => {
  const source = { ...(existing || {}), ...(body || {}) };
  const key = String(source.key || '').trim().toLowerCase();
  const namespace = String(source.namespace || 'default').trim().toLowerCase();
  const name = String(source.name || '').trim();
  const status = String(source.status || 'draft').trim().toLowerCase();
  const version = Number(source.version || existing?.version || 1);
  if (!KEY_PATTERN.test(key)) throw fail('experiment key invalid');
  if (!NAMESPACE_PATTERN.test(namespace)) throw fail('experiment namespace invalid');
  if (!name || name.length > 200) throw fail('experiment name wajib diisi');
  if (!['draft', 'running', 'killed', 'archived'].includes(status)) throw fail('experiment status invalid');
  if (!Number.isInteger(version) || version < 1) throw fail('experiment version invalid');
  return {
    key, namespace, name, status, version,
    targeting: validateTargeting(source.targeting),
    variants: validateVariants(source.variants),
    guardrails: validateGuardrails(source.guardrails),
  };
};

export const listExperiments = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
    const values: unknown[] = [];
    let query = 'SELECT id, key, name, namespace, status, version, targeting, variants, guardrails, kill_reason, updated_at, created_at FROM experiments';
    if (status) { if (!['draft', 'running', 'killed', 'archived'].includes(status)) throw fail('status invalid'); query += ' WHERE status = $1'; values.push(status); }
    query += ' ORDER BY updated_at DESC, key ASC';
    const result = await readDb.query(query, values);
    res.json({ success: true, data: result.rows });
  } catch (error: any) { sendError(res, error, 'Failed to list experiments'); }
};

export const getExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const key = String(req.params.key || '').trim().toLowerCase();
    const result = await readDb.query(
      'SELECT id, key, name, namespace, status, version, targeting, variants, guardrails, kill_reason, updated_at, created_at FROM experiments WHERE key = $1', [key],
    );
    if (!result.rows[0]) { res.status(404).json({ success: false, error: 'Experiment tidak ditemukan' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) { sendError(res, error, 'Failed to get experiment'); }
};

export const createExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = actorId(req);
    const normalized = normalizeExperiment(req.body || {});
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO experiments (key, name, namespace, status, version, targeting, variants, guardrails, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $9)
         RETURNING id, key, name, namespace, status, version, targeting, variants, guardrails, kill_reason, updated_at, created_at`,
        [normalized.key, normalized.name, normalized.namespace, normalized.status, normalized.version,
          JSON.stringify(normalized.targeting), JSON.stringify(normalized.variants), JSON.stringify(normalized.guardrails), actor],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'experiment.created', $2, $3::jsonb)`,
        [actor, result.rows[0].id, JSON.stringify({ key: normalized.key, namespace: normalized.namespace, status: normalized.status })],
      );
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  } catch (error: any) { sendError(res, error, 'Failed to create experiment'); }
};

export const updateExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = actorId(req);
    const key = String(req.params.key || '').trim().toLowerCase();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query('SELECT * FROM experiments WHERE key = $1 FOR UPDATE', [key]);
      if (!currentResult.rows[0]) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'Experiment tidak ditemukan' }); return; }
      const normalized = normalizeExperiment({ ...currentResult.rows[0], ...(req.body || {}), key }, currentResult.rows[0]);
      const result = await client.query(
        `UPDATE experiments SET name = $1, namespace = $2, status = $3, version = $4, targeting = $5::jsonb,
         variants = $6::jsonb, guardrails = $7::jsonb, updated_by = $8, updated_at = NOW() WHERE key = $9
         RETURNING id, key, name, namespace, status, version, targeting, variants, guardrails, kill_reason, updated_at, created_at`,
        [normalized.name, normalized.namespace, normalized.status, normalized.version, JSON.stringify(normalized.targeting),
          JSON.stringify(normalized.variants), JSON.stringify(normalized.guardrails), actor, key],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'experiment.updated', $2, $3::jsonb)`,
        [actor, result.rows[0].id, JSON.stringify({ key, status: normalized.status, version: normalized.version })],
      );
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  } catch (error: any) { sendError(res, error, 'Failed to update experiment'); }
};

export const killExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = actorId(req);
    const key = String(req.params.key || '').trim().toLowerCase();
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3 || reason.length > 500) throw fail('reason wajib diisi (3-500 karakter)');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT id, status FROM experiments WHERE key = $1 FOR UPDATE', [key]);
      if (!current.rows[0]) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'Experiment tidak ditemukan' }); return; }
      const result = await client.query(
        `UPDATE experiments SET status = 'killed', kill_reason = $1, updated_by = $2, updated_at = NOW() WHERE key = $3
         RETURNING id, key, name, namespace, status, version, targeting, variants, guardrails, kill_reason, updated_at, created_at`,
        [reason, actor, key],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'experiment.killed', $2, $3::jsonb)`,
        [actor, result.rows[0].id, JSON.stringify({ key, reason, active_assignments_preserved: true })],
      );
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0], message: 'Experiment killed; existing assignments remain auditable' });
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  } catch (error: any) { sendError(res, error, 'Failed to kill experiment'); }
};
