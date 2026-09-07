import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';
import {
  DEFAULT_PRICING_EXPERIMENT_GUARDRAILS,
  evaluatePricingExperimentGuardrails,
  type PricingExperimentGuardrails,
  type PricingExperimentOutcome,
} from '../services/pricingExperimentGuardrails';

type Queryable = { query: (text: string, values?: unknown[]) => Promise<any> };

const KEY_PATTERN = /^marketplace_pricing_experiment_[a-z0-9_]{1,80}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T/;

const configKey = (value: unknown): string => {
  const key = String(value || '').trim().toLowerCase();
  if (!KEY_PATTERN.test(key)) throw Object.assign(new Error('experiment key tidak valid'), { statusCode: 400 });
  return key;
};

const actorId = (req: Request): string => {
  try {
    return getActorId(req);
  } catch {
    throw Object.assign(new Error('Authenticated admin actor is required'), { statusCode: 401 });
  }
};

const sendError = (res: Response, error: any, fallback: string): void => {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : error?.code === '23514' ? 400 : 500;
  securityLog.error(fallback, { error: error?.message, code: error?.code });
  res.status(status).json({ success: false, error: status >= 500 ? fallback : error?.message || fallback });
};

const parseJsonObject = (value: unknown, field: string): Record<string, any> => {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { throw Object.assign(new Error(`${field} harus JSON valid`), { statusCode: 400 }); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error(`${field} harus berupa object JSON`), { statusCode: 400 });
  }
  return JSON.parse(JSON.stringify(parsed)) as Record<string, any>;
};

const numberField = (value: unknown, field: string, min = 0, max = Number.POSITIVE_INFINITY): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(`${field} harus angka antara ${min} dan ${max}`), { statusCode: 400 });
  }
  return parsed;
};

const normalizeGuardrails = (raw: unknown): Record<string, number> => {
  const source = raw === undefined ? {} : parseJsonObject(raw, 'guardrails');
  const values = {
    min_sample_size: numberField(source.min_sample_size ?? DEFAULT_PRICING_EXPERIMENT_GUARDRAILS.minSampleSize, 'guardrails.min_sample_size', 1, 1_000_000),
    max_cancellation_delta_pp: numberField(source.max_cancellation_delta_pp ?? DEFAULT_PRICING_EXPERIMENT_GUARDRAILS.maxCancellationDeltaPp, 'guardrails.max_cancellation_delta_pp', 0, 100),
    max_eta_increase_minutes: numberField(source.max_eta_increase_minutes ?? DEFAULT_PRICING_EXPERIMENT_GUARDRAILS.maxEtaIncreaseMinutes, 'guardrails.max_eta_increase_minutes', 0, 24 * 60),
    max_support_contact_delta_pp: numberField(source.max_support_contact_delta_pp ?? DEFAULT_PRICING_EXPERIMENT_GUARDRAILS.maxSupportContactDeltaPp, 'guardrails.max_support_contact_delta_pp', 0, 100),
    max_courier_earnings_drop_pct: numberField(source.max_courier_earnings_drop_pct ?? DEFAULT_PRICING_EXPERIMENT_GUARDRAILS.maxCourierEarningsDropPct, 'guardrails.max_courier_earnings_drop_pct', 0, 100),
    max_margin_drop_pct: numberField(source.max_margin_drop_pct ?? DEFAULT_PRICING_EXPERIMENT_GUARDRAILS.maxMarginDropPct, 'guardrails.max_margin_drop_pct', 0, 100),
  };
  if (!Number.isInteger(values.min_sample_size)) {
    throw Object.assign(new Error('guardrails.min_sample_size harus integer'), { statusCode: 400 });
  }
  return values;
};

const guardrailsFromConfig = (config: Record<string, any>): PricingExperimentGuardrails => {
  const normalized = normalizeGuardrails(config.guardrails);
  return {
    minSampleSize: normalized.min_sample_size,
    maxCancellationDeltaPp: normalized.max_cancellation_delta_pp,
    maxEtaIncreaseMinutes: normalized.max_eta_increase_minutes,
    maxSupportContactDeltaPp: normalized.max_support_contact_delta_pp,
    maxCourierEarningsDropPct: normalized.max_courier_earnings_drop_pct,
    maxMarginDropPct: normalized.max_margin_drop_pct,
  };
};

const readConfig = async (source: Queryable, key: string, forUpdate = false): Promise<Record<string, any> | null> => {
  const row = await source.query(`SELECT value FROM system_configs WHERE key = $1${forUpdate ? ' FOR UPDATE' : ''}`, [key]);
  if (!row.rows[0]) return null;
  return parseJsonObject(row.rows[0].value, 'experiment config');
};

const publicConfig = (config: Record<string, any>): Record<string, any> => {
  const result = JSON.parse(JSON.stringify(config)) as Record<string, any>;
  if (result.assignment_salt) result.assignment_salt = '[redacted]';
  return result;
};

const validateDate = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value).trim();
  if (!ISO_DATE_PATTERN.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw Object.assign(new Error(`${field} harus berupa timestamp ISO-8601`), { statusCode: 400 });
  }
  return new Date(raw).toISOString();
};

const buildUpdatedConfig = (current: Record<string, any>, body: Record<string, any>): Record<string, any> => {
  const next = JSON.parse(JSON.stringify(current)) as Record<string, any>;
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    throw Object.assign(new Error('enabled harus boolean'), { statusCode: 400 });
  }
  if (body.enabled !== undefined) next.enabled = body.enabled;
  if (body.traffic_percent !== undefined) next.traffic_percent = numberField(body.traffic_percent, 'traffic_percent', 0, 100);
  if (body.treatment_multiplier !== undefined) next.treatment_multiplier = numberField(body.treatment_multiplier, 'treatment_multiplier', 1, 1.4);
  if (body.control_pricing_rule_version !== undefined) next.control_pricing_rule_version = String(body.control_pricing_rule_version).trim();
  if (body.treatment_pricing_rule_version !== undefined) next.treatment_pricing_rule_version = String(body.treatment_pricing_rule_version).trim();
  if (body.starts_at !== undefined) next.starts_at = validateDate(body.starts_at, 'starts_at');
  if (body.ends_at !== undefined) next.ends_at = validateDate(body.ends_at, 'ends_at');
  if (body.guardrails !== undefined) next.guardrails = normalizeGuardrails(body.guardrails);

  if (!next.experiment_id || !next.assignment_salt) throw Object.assign(new Error('experiment_id dan assignment_salt wajib ada'), { statusCode: 400 });
  if (!VERSION_PATTERN.test(String(next.control_pricing_rule_version || '')) || !VERSION_PATTERN.test(String(next.treatment_pricing_rule_version || ''))) {
    throw Object.assign(new Error('pricing rule version tidak valid'), { statusCode: 400 });
  }
  numberField(next.traffic_percent, 'traffic_percent', 0, 100);
  numberField(next.treatment_multiplier, 'treatment_multiplier', 1, 1.4);
  if (next.starts_at && next.ends_at && Date.parse(next.ends_at) <= Date.parse(next.starts_at)) {
    throw Object.assign(new Error('ends_at harus setelah starts_at'), { statusCode: 400 });
  }
  next.service_code = 'food_delivery';
  next.market = String(next.market || 'default').trim().toLowerCase();
  next.killed = false;
  delete next.kill_reason;
  delete next.killed_at;
  delete next.killed_by;
  return next;
};

const metricsQuery = `
  WITH experiment_orders AS (
    SELECT o.id, o.status,
      COALESCE(o.pricing_snapshot->>'experiment_variant', '') AS variant,
      COALESCE((o.pricing_snapshot->>'eta_minutes')::numeric, 0) AS quoted_eta_minutes,
      CASE WHEN o.delivered_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60 - COALESCE((o.pricing_snapshot->>'eta_minutes')::numeric, 0)
        ELSE NULL END AS eta_delta_minutes,
      COALESCE((o.pricing_snapshot->'pricing_breakdown'->>'platform_amount_idr')::numeric,
               (o.pricing_snapshot->'price_components'->>'platform_amount_idr')::numeric, 0) AS margin_idr,
      EXISTS (SELECT 1 FROM disputes d WHERE d.order_id = o.id) AS has_support_contact
    FROM orders o
    WHERE o.pricing_snapshot->>'experiment_id' = $1
      AND o.created_at >= NOW() - ($2::text || ' hours')::interval
      AND COALESCE(o.service_sub_type, '') = 'food_delivery'
  ),
  courier_earnings AS (
    SELECT cel.order_id,
      SUM(CASE WHEN cel.direction = 'credit' THEN cel.amount_idr ELSE -cel.amount_idr END)::numeric AS earnings_idr
    FROM courier_earnings_ledger cel
    JOIN experiment_orders eo ON eo.id = cel.order_id
    GROUP BY cel.order_id
  )
  SELECT eo.variant,
    COUNT(*)::int AS sample_size,
    AVG(CASE WHEN eo.status = 'cancelled' THEN 100.0 ELSE 0.0 END)::float8 AS cancellation_rate_pct,
    COALESCE(AVG(eo.eta_delta_minutes), 0)::float8 AS eta_delta_minutes,
    AVG(CASE WHEN eo.has_support_contact THEN 100.0 ELSE 0.0 END)::float8 AS support_contact_rate_pct,
    COALESCE(AVG(ce.earnings_idr), 0)::float8 AS courier_earnings_avg_idr,
    AVG(eo.margin_idr)::float8 AS margin_avg_idr
  FROM experiment_orders eo
  LEFT JOIN courier_earnings ce ON ce.order_id = eo.id
  WHERE eo.variant IN ('control', 'treatment')
  GROUP BY eo.variant`;

const metricOutcome = (row: Record<string, any> | undefined): PricingExperimentOutcome => ({
  sampleSize: Number(row?.sample_size || 0),
  cancellationRatePct: Number(row?.cancellation_rate_pct || 0),
  etaDeltaMinutes: Number(row?.eta_delta_minutes || 0),
  supportContactRatePct: Number(row?.support_contact_rate_pct || 0),
  courierEarningsAvgIdr: Number(row?.courier_earnings_avg_idr || 0),
  marginAvgIdr: Number(row?.margin_avg_idr || 0),
});

export const getPricingExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const key = configKey(req.params.key);
    const config = await readConfig(readDb, key);
    if (!config) { res.status(404).json({ success: false, error: 'Pricing experiment tidak ditemukan' }); return; }
    res.json({ success: true, data: publicConfig(config) });
  } catch (error: any) { sendError(res, error, 'Failed to get pricing experiment'); }
};

export const configurePricingExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = actorId(req);
    const key = configKey(req.params.key);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const current = await readConfig(client, key, true);
      if (!current) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'Pricing experiment tidak ditemukan' }); return; }
      const next = buildUpdatedConfig(current, (req.body || {}) as Record<string, any>);
      const result = await client.query(
        `UPDATE system_configs SET value = $1::jsonb, description = $2, category = 'pricing', updated_by = $3, updated_at = NOW() WHERE key = $4 RETURNING key, value, updated_at`,
        [JSON.stringify(next), `Pricing experiment ${next.experiment_id} configured`, actor, key],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, $2, NULL, $3)`,
        [actor, 'pricing_experiment.configured', JSON.stringify({ key, before: publicConfig(current), after: publicConfig(next) })],
      );
      await client.query('COMMIT');
      res.json({ success: true, data: publicConfig(result.rows[0].value) });
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  } catch (error: any) { sendError(res, error, 'Failed to configure pricing experiment'); }
};

export const killPricingExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = actorId(req);
    const key = configKey(req.params.key);
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3 || reason.length > 500) throw Object.assign(new Error('reason wajib diisi (3-500 karakter)'), { statusCode: 400 });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const current = await readConfig(client, key, true);
      if (!current) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'Pricing experiment tidak ditemukan' }); return; }
      const next: Record<string, any> = { ...current, enabled: false, killed: true, kill_reason: reason, killed_at: new Date().toISOString(), killed_by: actor };
      const result = await client.query(
        `UPDATE system_configs SET value = $1::jsonb, description = $2, updated_by = $3, updated_at = NOW() WHERE key = $4 RETURNING key, value, updated_at`,
        [JSON.stringify(next), `Pricing experiment ${next.experiment_id} killed: ${reason}`, actor, key],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, $2, NULL, $3)`,
        [actor, 'pricing_experiment.killed', JSON.stringify({ key, reason, active_quote_contracts_unchanged: true })],
      );
      await client.query('COMMIT');
      res.json({ success: true, data: publicConfig(result.rows[0].value), message: 'Experiment killed; active quote snapshots are unchanged' });
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  } catch (error: any) { sendError(res, error, 'Failed to kill pricing experiment'); }
};

export const evaluatePricingExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const key = configKey(req.params.key);
    const windowHours = numberField(req.body?.window_hours ?? 168, 'window_hours', 1, 720);
    const config = await readConfig(readDb, key);
    if (!config) { res.status(404).json({ success: false, error: 'Pricing experiment tidak ditemukan' }); return; }
    const result = await readDb.query(metricsQuery, [config.experiment_id, Math.trunc(windowHours)]);
    const byVariant = Object.fromEntries(result.rows.map((row: Record<string, any>) => [row.variant, row]));
    const baseline = metricOutcome(byVariant.control);
    const treatment = metricOutcome(byVariant.treatment);
    const decision = evaluatePricingExperimentGuardrails(baseline, treatment, guardrailsFromConfig(config));
    res.status(decision.approved ? 200 : 409).json({ success: decision.approved, data: {
      experiment_id: config.experiment_id,
      window_hours: Math.trunc(windowHours),
      decision,
      config: publicConfig(config),
      source: 'orders.pricing_snapshot + courier_earnings_ledger + disputes',
    } });
  } catch (error: any) { sendError(res, error, 'Failed to evaluate pricing experiment'); }
};
