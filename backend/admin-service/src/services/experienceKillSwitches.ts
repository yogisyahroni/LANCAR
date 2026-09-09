import { z } from 'zod';
import { db, readDb } from '../db';
import { redis } from '../redis';
import { sendEmailAlert, sendSlackAlert } from '../notifications';

export const EXPERIENCE_KILL_SWITCH_TYPES = [
  'marketing_hide',
  'new_order_gate',
  'provider_gate',
  'checkout_gate',
] as const;

export type ExperienceKillSwitchType = (typeof EXPERIENCE_KILL_SWITCH_TYPES)[number];

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MARKET_CODE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

const identifier = z.string().trim().toLowerCase().regex(IDENTIFIER);
const marketCode = z.string().trim().toLowerCase().regex(MARKET_CODE);
const optionalList = (item: z.ZodTypeAny) => z.array(item).max(100).default([]);

export const experienceKillSwitchInputSchema = z.object({
  key: identifier.optional(),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(3).max(500),
  kill_switch_type: z.enum(EXPERIENCE_KILL_SWITCH_TYPES),
  service_code: identifier,
  service_category: identifier.optional(),
  market_codes: optionalList(marketCode),
  city_codes: optionalList(identifier),
  zone_codes: optionalList(identifier),
  surface: z.enum(['customer_android', 'customer_web', 'merchant_android', 'courier_android']).optional(),
  fallback_behavior: z.enum(['hide_entry', 'reject_new_orders', 'use_provider_fallback', 'reject_checkout']).optional(),
  starts_at: z.coerce.date().optional(),
  expires_at: z.coerce.date().nullable().optional(),
  review_at: z.coerce.date().nullable().optional(),
  preserve_active_orders: z.boolean().default(true),
  active: z.boolean().default(false),
  reason: z.string().trim().min(3).max(500),
  rollback_plan: z.string().trim().min(20).max(1000),
}).strict().superRefine((value, context) => {
  if (value.expires_at && value.starts_at && value.expires_at <= value.starts_at) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expires_at'], message: 'expires_at must be after starts_at' });
  }
  if (value.review_at && value.starts_at && value.review_at < value.starts_at) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['review_at'], message: 'review_at must not precede starts_at' });
  }
  const expectedFallback: Record<ExperienceKillSwitchType, string> = {
    marketing_hide: 'hide_entry',
    new_order_gate: 'reject_new_orders',
    provider_gate: 'use_provider_fallback',
    checkout_gate: 'reject_checkout',
  };
  if (value.fallback_behavior && value.fallback_behavior !== expectedFallback[value.kill_switch_type]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fallback_behavior'],
      message: `${value.kill_switch_type} requires fallback_behavior=${expectedFallback[value.kill_switch_type]}`,
    });
  }
});

export type ExperienceKillSwitchInput = z.infer<typeof experienceKillSwitchInputSchema>;

export type ExperienceKillSwitchRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  kill_switch_type: ExperienceKillSwitchType;
  service_code: string;
  service_category: string | null;
  market_codes: string[];
  city_codes: string[];
  zone_codes: string[];
  surface: string | null;
  fallback_behavior: string;
  starts_at: string | null;
  expires_at: string | null;
  review_at: string | null;
  preserve_active_orders: boolean;
  active: boolean;
  is_enabled: boolean;
  evaluation_revision: number;
  updated_by: string | null;
  updated_at: string | null;
  last_reason: string | null;
};

export class ExperienceKillSwitchError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = 'ExperienceKillSwitchError';
  }
}

const asStringList = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase())
  : [];

const controlKey = (input: ExperienceKillSwitchInput): string => {
  if (input.key) return input.key;
  const scope = input.market_codes[0] || 'global';
  const city = input.city_codes[0] || 'all';
  return `experience.${input.kill_switch_type}.${input.service_code}.${scope}.${city}`.slice(0, 100);
};

const activeNow = (config: Record<string, unknown>, isEnabled: boolean, now = Date.now()): boolean => {
  if (!isEnabled) return false;
  const startsAt = typeof config.starts_at === 'string' ? Date.parse(config.starts_at) : NaN;
  const expiresAt = typeof config.expires_at === 'string' ? Date.parse(config.expires_at) : NaN;
  if (Number.isFinite(startsAt) && startsAt > now) return false;
  if (Number.isFinite(expiresAt) && expiresAt <= now) return false;
  return true;
};

const rowToRecord = (row: Record<string, any>): ExperienceKillSwitchRecord => {
  const config = row.config && typeof row.config === 'object' && !Array.isArray(row.config)
    ? row.config as Record<string, unknown>
    : {};
  const isEnabled = row.is_enabled === true;
  return {
    id: String(row.id),
    key: String(row.key),
    name: String(row.name || row.key),
    description: String(row.description || ''),
    category: String(row.category || 'experience_kill_switch'),
    kill_switch_type: String(config.kill_switch_type) as ExperienceKillSwitchType,
    service_code: String(config.service_code || ''),
    service_category: typeof config.service_category === 'string' ? config.service_category : null,
    market_codes: asStringList(config.market_codes),
    city_codes: asStringList(config.city_codes),
    zone_codes: asStringList(config.zone_codes),
    surface: typeof config.surface === 'string' ? config.surface : null,
    fallback_behavior: String(config.fallback_behavior || ''),
    starts_at: typeof config.starts_at === 'string' ? config.starts_at : null,
    expires_at: typeof config.expires_at === 'string' ? config.expires_at : null,
    review_at: typeof config.review_at === 'string' ? config.review_at : null,
    preserve_active_orders: config.preserve_active_orders !== false,
    active: activeNow(config, isEnabled),
    is_enabled: isEnabled,
    evaluation_revision: Number(row.evaluation_revision) > 0 ? Number(row.evaluation_revision) : 1,
    updated_by: row.updated_by ? String(row.updated_by) : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    last_reason: typeof config.last_reason === 'string' ? config.last_reason : null,
  };
};

const invalidate = async (key: string): Promise<void> => {
  await Promise.all([
    redis.del(`flag:${key}`),
    redis.del('flags:public:v3:web'),
    redis.del('flags:public:v3:mobile'),
    redis.publish('flag:changed', JSON.stringify({ key, changed_at: new Date().toISOString() })),
  ]);
};

const isHighImpact = (type: ExperienceKillSwitchType): boolean => type !== 'marketing_hide';

export const listExperienceKillSwitchControls = async (filters: {
  market_code?: unknown;
  service_code?: unknown;
  kill_switch_type?: unknown;
} = {}): Promise<ExperienceKillSwitchRecord[]> => {
  const values: unknown[] = [];
  const clauses = [
    `config->>'control_plane' = 'experience'`,
    `config ? 'kill_switch_type'`,
  ];
  const market = typeof filters.market_code === 'string' ? filters.market_code.trim().toLowerCase() : '';
  const service = typeof filters.service_code === 'string' ? filters.service_code.trim().toLowerCase() : '';
  const type = typeof filters.kill_switch_type === 'string' ? filters.kill_switch_type.trim().toLowerCase() : '';
  if (market) {
    values.push(market);
    clauses.push(`(config->'market_codes' = '[]'::jsonb OR config->'market_codes' ? $${values.length})`);
  }
  if (service) { values.push(service); clauses.push(`config->>'service_code' = $${values.length}`); }
  if (type) { values.push(type); clauses.push(`config->>'kill_switch_type' = $${values.length}`); }
  const result = await readDb.query(
    `SELECT id, key, name, description, category, is_enabled, config, evaluation_revision, updated_by, updated_at
       FROM feature_flags
      WHERE ${clauses.join(' AND ')}
      ORDER BY key ASC`,
    values,
  );
  return result.rows.map(rowToRecord);
};

export const upsertExperienceKillSwitch = async (
  rawInput: unknown,
  actorId: string,
  actorRole: string | null,
): Promise<ExperienceKillSwitchRecord> => {
  const parsed = experienceKillSwitchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ExperienceKillSwitchError('INVALID_EXPERIENCE_KILL_SWITCH', 400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  const input = parsed.data;
  if (isHighImpact(input.kill_switch_type) && !['super_admin', 'ops_security'].includes(actorRole || '')) {
    throw new ExperienceKillSwitchError('EXPERIENCE_KILL_SWITCH_ELEVATED_ROLE_REQUIRED', 403, 'Provider, checkout, and new-order gates require super_admin or ops_security');
  }

  const key = controlKey(input);
  const config = {
    control_plane: 'experience',
    kill_switch_type: input.kill_switch_type,
    service_code: input.service_code,
    ...(input.service_category ? { service_category: input.service_category } : {}),
    market_codes: input.market_codes,
    city_codes: input.city_codes,
    zone_codes: input.zone_codes,
    ...(input.surface ? { surface: input.surface } : {}),
    fallback_behavior: input.fallback_behavior || ({
      marketing_hide: 'hide_entry',
      new_order_gate: 'reject_new_orders',
      provider_gate: 'use_provider_fallback',
      checkout_gate: 'reject_checkout',
    } as Record<ExperienceKillSwitchType, string>)[input.kill_switch_type],
    ...(input.starts_at ? { starts_at: input.starts_at.toISOString() } : {}),
    ...(input.expires_at ? { expires_at: input.expires_at.toISOString() } : {}),
    ...(input.review_at ? { review_at: input.review_at.toISOString() } : {}),
    preserve_active_orders: input.preserve_active_orders,
    last_reason: input.reason,
    rollback_plan: input.rollback_plan,
    high_blast_radius: isHighImpact(input.kill_switch_type),
  };
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM feature_flags WHERE key = $1 FOR UPDATE', [key]);
    if (existing.rows[0] && (existing.rows[0].category !== 'experience_kill_switch' || existing.rows[0].config?.control_plane !== 'experience')) {
      throw new ExperienceKillSwitchError('EXPERIENCE_KILL_SWITCH_KEY_CONFLICT', 409, 'The generated key already belongs to another feature flag');
    }
    const result = existing.rows[0]
      ? await client.query(
        `UPDATE feature_flags
            SET name = $1, description = $2, category = 'experience_kill_switch',
                is_enabled = $3, config = $4, require_checklist = TRUE,
                evaluation_revision = COALESCE(evaluation_revision, 1) + 1,
                updated_by = $5, updated_at = NOW()
          WHERE key = $6
          RETURNING *`,
        [input.name, input.description, input.active, JSON.stringify(config), actorId, key],
      )
      : await client.query(
        `INSERT INTO feature_flags
          (key, name, description, category, is_enabled, config, require_checklist, evaluation_revision, updated_by, updated_at)
         VALUES ($1, $2, $3, 'experience_kill_switch', $4, $5, TRUE, 1, $6, NOW())
         RETURNING *`,
        [key, input.name, input.description, input.active, JSON.stringify(config), actorId],
      );
    const row = result.rows[0];
    await client.query(
      `INSERT INTO feature_flag_logs
        (key, is_enabled, updated_by, change_reason, config, description, category, require_checklist, evaluation_revision, checklist_data)
       VALUES ($1, $2, $3, $4, $5, $6, 'experience_kill_switch', TRUE, $7, $8)`,
      [key, input.active, actorId, input.reason, JSON.stringify(config), input.description, row.evaluation_revision, JSON.stringify({ rollback_plan: input.rollback_plan, kill_switch_type: input.kill_switch_type })],
    );
    await client.query('COMMIT');
    await invalidate(key);
    sendEmailAlert(key, existing.rows[0]?.is_enabled === true, input.active, input.reason, actorId).catch(() => undefined);
    sendSlackAlert(key, existing.rows[0]?.is_enabled === true, input.active, input.reason, actorId).catch(() => undefined);
    return rowToRecord(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
