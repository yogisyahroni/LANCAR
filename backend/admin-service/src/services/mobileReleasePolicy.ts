import { PoolClient } from 'pg';
import { z } from 'zod';
import { db, readDb } from '../db';
import { localeFallbackChain } from './localizedContent';
import type { ClientCompatibility } from './clientCompatibility';

export const RELEASE_CLIENT_TYPES = ['customer', 'courier', 'merchant', 'web'] as const;
export type ReleaseClientType = (typeof RELEASE_CLIENT_TYPES)[number];
export const RELEASE_PLATFORMS = ['android', 'web'] as const;
export type ReleasePlatform = (typeof RELEASE_PLATFORMS)[number];
export const RELEASE_UPDATE_MODES = ['none', 'soft', 'hard'] as const;
export type ReleaseUpdateMode = (typeof RELEASE_UPDATE_MODES)[number];
export const RELEASE_HARD_BLOCK_REASONS = ['none', 'unsafe', 'incompatible'] as const;
export type ReleaseHardBlockReason = (typeof RELEASE_HARD_BLOCK_REASONS)[number];

const MARKET_CODE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const VERSION_NAME = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const HTTPS_URL = /^https:\/\/[^\s<>]{1,480}$/i;

const localizedMessagesSchema = z.record(z.string(), z.string().trim().min(1).max(240)).superRefine((value, context) => {
  Object.keys(value).forEach((locale) => {
    if (!LOCALE.test(locale)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [locale], message: 'locale key is invalid' });
    }
  });
});

const storeDestinationsSchema = z.record(z.string(), z.string().trim().regex(HTTPS_URL, 'store destination must use HTTPS'));

export const mobileReleasePolicyInputSchema = z.object({
  market_code: z.string().trim().toLowerCase().regex(MARKET_CODE),
  client_type: z.enum(RELEASE_CLIENT_TYPES),
  platform: z.enum(RELEASE_PLATFORMS),
  latest_version_code: z.coerce.number().int().positive(),
  latest_version_name: z.string().trim().regex(VERSION_NAME),
  min_supported_version_code: z.coerce.number().int().positive(),
  min_supported_version_name: z.string().trim().regex(VERSION_NAME),
  recommended_version_code: z.coerce.number().int().positive().nullable().optional(),
  recommended_version_name: z.string().trim().regex(VERSION_NAME).nullable().optional(),
  update_mode: z.enum(RELEASE_UPDATE_MODES),
  hard_block_reason: z.enum(RELEASE_HARD_BLOCK_REASONS).default('none'),
  localized_messages: localizedMessagesSchema.default({}),
  store_destinations: storeDestinationsSchema.default({}),
  reason: z.string().trim().min(8).max(500).default('Release policy updated'),
}).strict().superRefine((value, context) => {
  if (value.min_supported_version_code > value.latest_version_code) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['min_supported_version_code'], message: 'minimum version cannot exceed latest version' });
  }
  if (value.recommended_version_code !== null && value.recommended_version_code !== undefined) {
    if (value.recommended_version_code < value.min_supported_version_code || value.recommended_version_code > value.latest_version_code) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['recommended_version_code'], message: 'recommended version must be within the supported/latest range' });
    }
    if (!value.recommended_version_name) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['recommended_version_name'], message: 'recommended version name is required' });
    }
  } else if (value.recommended_version_name) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recommended_version_name'], message: 'recommended version code is required' });
  }
  if (value.update_mode === 'hard' && value.hard_block_reason === 'none') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['hard_block_reason'], message: 'hard update requires unsafe or incompatible reason' });
  }
  if (value.update_mode !== 'hard' && value.hard_block_reason !== 'none') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['hard_block_reason'], message: 'hard block reason is only valid for hard updates' });
  }
  if (value.platform === 'web' && value.client_type !== 'web') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['client_type'], message: 'web platform is reserved for the web client' });
  }
  if (value.platform === 'android' && value.client_type === 'web') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['platform'], message: 'web client must use the web platform' });
  }
});

export type MobileReleasePolicyInput = z.infer<typeof mobileReleasePolicyInputSchema>;

export type MobileReleasePolicyRecord = {
  id: string;
  market_code: string;
  client_type: ReleaseClientType;
  platform: ReleasePlatform;
  latest_version_code: number;
  latest_version_name: string;
  min_supported_version_code: number;
  min_supported_version_name: string;
  recommended_version_code: number | null;
  recommended_version_name: string | null;
  update_mode: ReleaseUpdateMode;
  hard_block_reason: ReleaseHardBlockReason;
  localized_messages: Record<string, string>;
  store_destinations: Record<string, string>;
  allow_active_order_access: boolean;
  allow_support_access: boolean;
  allow_new_transactions: boolean;
  remote_config_scope: 'release_metadata';
  revision: number;
  effective_from: string;
  effective_to: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export class MobileReleasePolicyError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MobileReleasePolicyError';
  }
}

type QueryResult<T = Record<string, unknown>> = { rows: T[] };
type Queryable = {
  query: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

const policySelect = `
  SELECT id, market_code, client_type, platform,
         latest_version_code, latest_version_name,
         min_supported_version_code, min_supported_version_name,
         recommended_version_code, recommended_version_name,
         update_mode, hard_block_reason, localized_messages, store_destinations,
         allow_active_order_access, allow_support_access, allow_new_transactions,
         remote_config_scope, revision, effective_from, effective_to,
         updated_by, created_at, updated_at
    FROM mobile_release_policies`;

const serialize = (value: unknown): string => JSON.stringify(value ?? {});

const withTransaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const normalizeLocaleMap = (messages: Record<string, string>): Record<string, string> => Object.entries(messages)
  .reduce<Record<string, string>>((result, [locale, message]) => {
    result[locale.trim().replace('_', '-')] = message.trim();
    return result;
  }, {});

const parseInput = (body: unknown): MobileReleasePolicyInput => {
  const parsed = mobileReleasePolicyInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new MobileReleasePolicyError(
      'INVALID_MOBILE_RELEASE_POLICY',
      400,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  return { ...parsed.data, localized_messages: normalizeLocaleMap(parsed.data.localized_messages) };
};

const rowToRecord = (row: Record<string, any>): MobileReleasePolicyRecord => ({
  id: String(row.id),
  market_code: String(row.market_code),
  client_type: row.client_type as ReleaseClientType,
  platform: row.platform as ReleasePlatform,
  latest_version_code: Number(row.latest_version_code),
  latest_version_name: String(row.latest_version_name),
  min_supported_version_code: Number(row.min_supported_version_code),
  min_supported_version_name: String(row.min_supported_version_name),
  recommended_version_code: row.recommended_version_code === null ? null : Number(row.recommended_version_code),
  recommended_version_name: row.recommended_version_name ? String(row.recommended_version_name) : null,
  update_mode: row.update_mode as ReleaseUpdateMode,
  hard_block_reason: row.hard_block_reason as ReleaseHardBlockReason,
  localized_messages: (row.localized_messages || {}) as Record<string, string>,
  store_destinations: (row.store_destinations || {}) as Record<string, string>,
  allow_active_order_access: Boolean(row.allow_active_order_access),
  allow_support_access: Boolean(row.allow_support_access),
  allow_new_transactions: Boolean(row.allow_new_transactions),
  remote_config_scope: 'release_metadata',
  revision: Number(row.revision),
  effective_from: new Date(row.effective_from).toISOString(),
  effective_to: row.effective_to ? new Date(row.effective_to).toISOString() : null,
  updated_by: row.updated_by ? String(row.updated_by) : null,
  created_at: new Date(row.created_at).toISOString(),
  updated_at: new Date(row.updated_at).toISOString(),
});

const assertMarketExists = async (client: Queryable, marketCode: string): Promise<void> => {
  const result = await client.query('SELECT market_code FROM market_configs WHERE market_code = $1 LIMIT 1', [marketCode]);
  if (!result.rows[0]) throw new MobileReleasePolicyError('MARKET_NOT_CONFIGURED', 404, `Market '${marketCode}' is not configured`);
};

const auditPolicy = async (
  client: Queryable,
  policy: MobileReleasePolicyRecord,
  action: 'updated' | 'seeded' | 'rolled_back',
  actorId: string | null,
  reason: string,
  previousPolicy: MobileReleasePolicyRecord | null,
  correlationId: string | null,
): Promise<void> => {
  await client.query(
    `INSERT INTO mobile_release_policy_audit (
       policy_id, market_code, client_type, platform, revision, action,
       actor_id, reason, previous_policy, new_policy, correlation_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)`,
    [
      policy.id, policy.market_code, policy.client_type, policy.platform, policy.revision,
      action, actorId, reason, previousPolicy ? serialize(previousPolicy) : null, serialize(policy), correlationId,
    ],
  );
};

export const parseMobileReleasePolicyInput = parseInput;

export const getMobileReleasePolicy = async (request: {
  market_code: string;
  client_type: ReleaseClientType;
  platform: ReleasePlatform;
}): Promise<MobileReleasePolicyRecord | null> => {
  const marketCode = request.market_code.trim().toLowerCase();
  if (!MARKET_CODE.test(marketCode)) throw new MobileReleasePolicyError('INVALID_MARKET_CODE', 400, 'market_code is invalid');
  const result = await readDb.query(`${policySelect}
    WHERE market_code = $1 AND client_type = $2 AND platform = $3
      AND effective_from <= NOW()
      AND (effective_to IS NULL OR effective_to > NOW())
    LIMIT 1`, [marketCode, request.client_type, request.platform]);
  return result.rows[0] ? rowToRecord(result.rows[0]) : null;
};

export const listMobileReleasePolicies = async (filters: Record<string, unknown> = {}): Promise<MobileReleasePolicyRecord[]> => {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (field: string, value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return;
    values.push(value.trim().toLowerCase());
    clauses.push(`${field} = $${values.length}`);
  };
  add('market_code', filters.market_code);
  add('client_type', filters.client_type);
  add('platform', filters.platform);
  const result = await readDb.query(
    `${policySelect}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY market_code, client_type, platform LIMIT 200`,
    values,
  );
  return result.rows.map(rowToRecord);
};

export const upsertMobileReleasePolicy = async (
  body: unknown,
  actorId: string,
  correlationId: string | null,
): Promise<MobileReleasePolicyRecord> => {
  const input = parseInput(body);
  return withTransaction(async (client) => {
    await assertMarketExists(client, input.market_code);
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${input.market_code}:${input.client_type}:${input.platform}`],
    );
    const currentResult = await client.query(
      `${policySelect} WHERE market_code = $1 AND client_type = $2 AND platform = $3 FOR UPDATE`,
      [input.market_code, input.client_type, input.platform],
    );
    const previous = currentResult.rows[0] ? rowToRecord(currentResult.rows[0]) : null;
    const revision = (previous?.revision || 0) + 1;
    const values = [
      input.market_code, input.client_type, input.platform,
      input.latest_version_code, input.latest_version_name,
      input.min_supported_version_code, input.min_supported_version_name,
      input.recommended_version_code ?? null, input.recommended_version_name ?? null,
      input.update_mode, input.hard_block_reason,
      serialize(input.localized_messages), serialize(input.store_destinations),
      input.update_mode === 'hard', input.update_mode === 'hard', input.update_mode !== 'hard',
      revision, actorId,
    ];
    const result = previous
      ? await client.query(
        `UPDATE mobile_release_policies SET
           latest_version_code = $4, latest_version_name = $5,
           min_supported_version_code = $6, min_supported_version_name = $7,
           recommended_version_code = $8, recommended_version_name = $9,
           update_mode = $10, hard_block_reason = $11,
           localized_messages = $12::jsonb, store_destinations = $13::jsonb,
           allow_active_order_access = $14, allow_support_access = $15,
           allow_new_transactions = $16, revision = $17,
           updated_by = $18, updated_at = NOW()
         WHERE market_code = $1 AND client_type = $2 AND platform = $3
         RETURNING *`, values,
      )
      : await client.query(
        `INSERT INTO mobile_release_policies (
           market_code, client_type, platform,
           latest_version_code, latest_version_name,
           min_supported_version_code, min_supported_version_name,
           recommended_version_code, recommended_version_name,
           update_mode, hard_block_reason, localized_messages, store_destinations,
           allow_active_order_access, allow_support_access, allow_new_transactions,
           revision, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18)
         RETURNING *`, values,
      );
    const policy = rowToRecord(result.rows[0]);
    await auditPolicy(client, policy, 'updated', actorId, input.reason, previous, correlationId);
    return policy;
  });
};

const resolvedMessage = (policy: MobileReleasePolicyRecord, requestedLocale: string): string => {
  const messages = policy.localized_messages || {};
  const chain = localeFallbackChain(requestedLocale || 'id-ID', 'id-ID');
  for (const locale of chain) {
    const message = messages[locale] || messages[locale.toLowerCase()];
    if (message) return message;
  }
  return policy.update_mode === 'hard'
    ? 'Pembaruan wajib diperlukan sebelum fitur transaksi baru dapat digunakan.'
    : 'Versi baru aplikasi tersedia. Perbarui saat siap.';
};

const primaryStoreUrl = (policy: MobileReleasePolicyRecord): string =>
  policy.store_destinations.primary
  || policy.store_destinations.default
  || Object.values(policy.store_destinations)[0]
  || 'https://github.com/yogisyahroni/TEMBUS/releases';

export type MobileReleaseDecision = {
  code: number;
  name: string;
  force: boolean;
  update_url: string;
  checksum_sha256?: string | null;
  min_supported_code: number;
  min_supported_name: string;
  recommended_code: number | null;
  recommended_name: string | null;
  update_mode: ReleaseUpdateMode;
  update_required: boolean;
  hard_block: boolean;
  hard_block_reason: ReleaseHardBlockReason | 'incompatible';
  message: string;
  localized_messages: Record<string, string>;
  store_destinations: Record<string, string>;
  recovery_access: {
    active_order: boolean;
    support: boolean;
    new_transactions: boolean;
  };
  market_code: string;
  client_type: ReleaseClientType;
  platform: ReleasePlatform;
  revision: number;
};

export const decideMobileRelease = (
  policy: MobileReleasePolicyRecord,
  compatibility: ClientCompatibility,
  requestedLocale: string,
): MobileReleaseDecision => {
  const currentCode = compatibility.appVersionCode;
  const versionKnown = Number.isSafeInteger(currentCode) && Number(currentCode) > 0;
  const behindLatest = versionKnown && Number(currentCode) < policy.latest_version_code;
  const belowMinimum = versionKnown && Number(currentCode) < policy.min_supported_version_code;
  const incompatible = compatibility.upgradeRequired;
  // A client below the scoped minimum is by definition incompatible with the
  // market policy, even when the policy was authored as a soft recommendation
  // for newer-but-still-supported clients. The hard mode itself additionally
  // blocks a supported client that is behind the required release.
  const belowScopedMinimum = Boolean(belowMinimum);
  const hardBlock = Boolean(incompatible || belowScopedMinimum || (policy.update_mode === 'hard' && behindLatest));
  const updateRequired = hardBlock || Boolean(policy.update_mode === 'soft' && versionKnown && (
    behindLatest || (policy.recommended_version_code !== null && Number(currentCode) < policy.recommended_version_code)
  ));
  const hardReason: ReleaseHardBlockReason | 'incompatible' = incompatible || belowScopedMinimum
    ? 'incompatible'
    : policy.hard_block_reason;
  return {
    code: policy.latest_version_code,
    name: policy.latest_version_name,
    force: hardBlock,
    update_url: primaryStoreUrl(policy),
    checksum_sha256: null,
    min_supported_code: policy.min_supported_version_code,
    min_supported_name: policy.min_supported_version_name,
    recommended_code: policy.recommended_version_code,
    recommended_name: policy.recommended_version_name,
    update_mode: hardBlock ? 'hard' : updateRequired ? 'soft' : 'none',
    update_required: updateRequired,
    hard_block: hardBlock,
    hard_block_reason: hardReason,
    message: resolvedMessage(policy, requestedLocale),
    localized_messages: policy.localized_messages,
    store_destinations: policy.store_destinations,
    recovery_access: {
      active_order: policy.allow_active_order_access,
      support: policy.allow_support_access,
      new_transactions: hardBlock ? false : policy.allow_new_transactions,
    },
    market_code: policy.market_code,
    client_type: policy.client_type,
    platform: policy.platform,
    revision: policy.revision,
  };
};

export const resolveMobileReleaseDecision = async (request: {
  market_code: string;
  client_type: ReleaseClientType;
  platform: ReleasePlatform;
  compatibility: ClientCompatibility;
  requested_locale: string;
}): Promise<MobileReleaseDecision | null> => {
  const policy = await getMobileReleasePolicy(request);
  return policy ? decideMobileRelease(policy, request.compatibility, request.requested_locale) : null;
};
