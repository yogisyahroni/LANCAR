import { PoolClient } from 'pg';
import { z } from 'zod';
import { db, readDb } from '../db';

const MARKET_CODE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const CITY_CODE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const SERVICE_CODE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const ISO_COUNTRY = /^[A-Z]{2}$/;
const ISO_REGION = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

const jsonObject = z.record(z.string(), z.unknown());
const publicCapabilityEntry = z.union([
  z.string().trim().min(1).max(128),
  z.object({
    code: z.string().trim().min(1).max(128),
    services: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
    route_profiles: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  }).strict(),
]);
const publicCapabilityArray = z.array(publicCapabilityEntry).max(100);

export const marketConfigInputSchema = z.object({
  market_code: z.string().trim().toLowerCase().regex(MARKET_CODE),
  country_code: z.string().trim().toUpperCase().regex(ISO_COUNTRY),
  region_code: z.string().trim().toUpperCase().regex(ISO_REGION),
  currency_code: z.string().trim().toUpperCase().regex(ISO_CURRENCY),
  currency_minor_unit: z.coerce.number().int().min(0).max(3),
  default_locale: z.string().trim().min(2).max(35),
  timezone: z.string().trim().min(1).max(64),
  measurement_system: z.enum(['metric', 'imperial']),
  phone_rules: jsonObject,
  address_rules: jsonObject,
  payment_methods: publicCapabilityArray,
  logistics_providers: publicCapabilityArray,
  map_providers: publicCapabilityArray,
  tax_policy_refs: publicCapabilityArray,
  insurance_policy_refs: publicCapabilityArray,
  service_hours: jsonObject,
  effective_from: z.coerce.date().optional(),
  // Activation is deliberately excluded from the input contract.  Approval
  // is a separate TOTP-protected operation after readiness passes.
  launch_state: z.enum(['draft', 'scheduled', 'paused', 'retired']),
});

export const marketConfigPatchSchema = marketConfigInputSchema.partial().omit({ market_code: true });

const serviceAvailabilitySchema = z.object({
  city_code: z.string().trim().toLowerCase().regex(CITY_CODE),
  service_code: z.string().trim().toLowerCase().regex(SERVICE_CODE),
  is_enabled: z.boolean(),
  service_hours: jsonObject,
  policy_refs: jsonObject,
});

const legalDocumentSchema = z.object({
  document_type: z.string().trim().toLowerCase().min(2).max(32),
  locale: z.string().trim().min(2).max(35),
  version: z.string().trim().min(1).max(64),
  document_uri: z.string().trim().min(1).max(2048),
  content_hash: z.string().trim().max(128).nullable().optional(),
  status: z.enum(['draft', 'approved', 'retired']).default('draft'),
  effective_from: z.coerce.date(),
});

export type MarketConfigInput = z.infer<typeof marketConfigInputSchema>;
export type MarketConfigPatch = z.infer<typeof marketConfigPatchSchema>;
export type ServiceAvailabilityInput = z.infer<typeof serviceAvailabilitySchema>;
export type LegalDocumentInput = z.infer<typeof legalDocumentSchema>;

export type MarketConfigRecord = Omit<MarketConfigInput, 'launch_state' | 'effective_from'> & {
  launch_state: 'draft' | 'scheduled' | 'active' | 'paused' | 'retired';
  config_version: number;
  effective_from: string;
  rollback_version: number | null;
  approval_status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  approval_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicMarketConfig = {
  market_code: string;
  country_code: string;
  region_code: string;
  currency_code: string;
  currency_minor_unit: number;
  default_locale: string;
  timezone: string;
  measurement_system: 'metric' | 'imperial';
  phone_rules: Record<string, unknown>;
  address_rules: Record<string, unknown>;
  payment_methods: unknown[];
  logistics_providers: unknown[];
  map_providers: unknown[];
  tax_policy_refs: unknown[];
  insurance_policy_refs: unknown[];
  service_hours: Record<string, unknown>;
  service_availability: Array<{
    city_code: string;
    service_code: string;
    service_hours: Record<string, unknown>;
    policy_refs: Record<string, unknown>;
  }>;
  legal_documents: Array<{
    document_type: string;
    locale: string;
    version: string;
    document_uri: string;
    effective_from: string;
  }>;
  config_version: number;
  effective_from: string;
};

export class MarketConfigError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly reasonCodes: string[] = [],
  ) {
    super(message);
    this.name = 'MarketConfigError';
  }
}

const MARKET_SELECT = `
  SELECT market_code, country_code, region_code, currency_code, currency_minor_unit,
         default_locale, timezone, measurement_system, phone_rules, address_rules,
         payment_methods, logistics_providers, map_providers, tax_policy_refs,
         insurance_policy_refs, service_hours, launch_state, config_version,
         effective_from, rollback_version, approval_status, approval_reason,
         approved_by, approved_at, created_by, updated_by, created_at, updated_at
  FROM market_configs`;

const normalizeCode = (value: unknown, pattern: RegExp, field: string): string => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!pattern.test(normalized)) {
    throw new MarketConfigError('INVALID_MARKET_CODE', 400, `${field} has an invalid format`);
  }
  return normalized;
};

const parseJsonObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const parseJsonArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const serialize = (value: unknown) => JSON.stringify(value ?? null);

const snapshot = (row: Record<string, any>): Record<string, unknown> => ({
  market_code: row.market_code,
  country_code: row.country_code,
  region_code: row.region_code,
  currency_code: row.currency_code,
  currency_minor_unit: row.currency_minor_unit,
  default_locale: row.default_locale,
  timezone: row.timezone,
  measurement_system: row.measurement_system,
  phone_rules: row.phone_rules,
  address_rules: row.address_rules,
  payment_methods: row.payment_methods,
  logistics_providers: row.logistics_providers,
  map_providers: row.map_providers,
  tax_policy_refs: row.tax_policy_refs,
  insurance_policy_refs: row.insurance_policy_refs,
  service_hours: row.service_hours,
  launch_state: row.launch_state,
  config_version: row.config_version,
  effective_from: row.effective_from,
  rollback_version: row.rollback_version,
  approval_status: row.approval_status,
});

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

const parseMarketInput = (body: unknown): MarketConfigInput => {
  const parsed = marketConfigInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new MarketConfigError('INVALID_MARKET_CONFIG', 400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  return parsed.data;
};

export const parseMarketConfigPatch = (body: unknown): MarketConfigPatch => {
  const parsed = marketConfigPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new MarketConfigError('INVALID_MARKET_CONFIG_PATCH', 400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  return parsed.data;
};

export const parseServiceAvailability = (body: unknown): ServiceAvailabilityInput => {
  const parsed = serviceAvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    throw new MarketConfigError('INVALID_SERVICE_AVAILABILITY', 400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  return parsed.data;
};

export const parseLegalDocument = (body: unknown): LegalDocumentInput => {
  const parsed = legalDocumentSchema.safeParse(body);
  if (!parsed.success) {
    throw new MarketConfigError('INVALID_LEGAL_DOCUMENT', 400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  return parsed.data;
};

export const getMarketConfig = async (marketCode: string, executor = readDb): Promise<MarketConfigRecord> => {
  const code = normalizeCode(marketCode, MARKET_CODE, 'market_code');
  const result = await executor.query(`${MARKET_SELECT} WHERE market_code = $1`, [code]);
  if (result.rows.length === 0) {
    throw new MarketConfigError('MARKET_NOT_CONFIGURED', 404, `Market '${code}' is not configured`);
  }
  return result.rows[0] as MarketConfigRecord;
};

export const listMarketConfigs = async () => {
  const result = await readDb.query(`${MARKET_SELECT} ORDER BY market_code ASC`);
  return result.rows as MarketConfigRecord[];
};

export const getMarketAvailability = async (marketCode: string, executor = readDb) => {
  const code = normalizeCode(marketCode, MARKET_CODE, 'market_code');
  const result = await executor.query(
    `SELECT city_code, service_code, is_enabled, service_hours, policy_refs,
            config_version, effective_from, rollback_version, updated_at
     FROM market_service_availability
     WHERE market_code = $1
     ORDER BY city_code ASC, service_code ASC`,
    [code],
  );
  return result.rows;
};

export const getMarketLegalDocuments = async (marketCode: string, executor = readDb) => {
  const code = normalizeCode(marketCode, MARKET_CODE, 'market_code');
  const result = await executor.query(
    `SELECT document_type, locale, version, document_uri, content_hash, status,
            effective_from, approved_by, approved_at, created_at, updated_at
     FROM market_legal_documents
     WHERE market_code = $1
     ORDER BY document_type ASC, locale ASC, version DESC`,
    [code],
  );
  return result.rows;
};

const assertMarketExists = async (client: PoolClient, marketCode: string) => {
  const result = await client.query(`${MARKET_SELECT} WHERE market_code = $1 FOR UPDATE`, [marketCode]);
  if (result.rows.length === 0) {
    throw new MarketConfigError('MARKET_NOT_CONFIGURED', 404, `Market '${marketCode}' is not configured`);
  }
  return result.rows[0] as MarketConfigRecord;
};

const insertAudit = async (
  client: PoolClient,
  marketCode: string,
  action: string,
  actorId: string | null,
  reason: string | null,
  previousVersion: number | null,
  newVersion: number | null,
  previousConfig: unknown,
  newConfig: unknown,
  correlationId: string | null,
) => {
  await client.query(
    `INSERT INTO market_config_audit (
       market_code, action, actor_id, reason, correlation_id,
       previous_version, new_version, previous_config, new_config
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
    [marketCode, action, actorId, reason, correlationId, previousVersion, newVersion, serialize(previousConfig), serialize(newConfig)],
  );
};

export const createMarketConfig = async (
  body: unknown,
  actorId: string,
  correlationId: string | null,
) => {
  const input = parseMarketInput(body);
  if (input.launch_state !== 'draft') {
    throw new MarketConfigError('MARKET_APPROVAL_REQUIRED', 400, 'A new market must start in draft state and be approved separately');
  }

  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO market_configs (
         market_code, country_code, region_code, currency_code, currency_minor_unit,
         default_locale, timezone, measurement_system, phone_rules, address_rules,
         payment_methods, logistics_providers, map_providers, tax_policy_refs,
         insurance_policy_refs, service_hours, launch_state, config_version,
         effective_from, approval_status, created_by, updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
         $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
         $16::jsonb, 'draft', 1, $17, 'draft', $18, $18
       )
       RETURNING *`,
      [
        input.market_code, input.country_code, input.region_code, input.currency_code,
        input.currency_minor_unit, input.default_locale, input.timezone, input.measurement_system,
        serialize(input.phone_rules), serialize(input.address_rules), serialize(input.payment_methods),
        serialize(input.logistics_providers), serialize(input.map_providers), serialize(input.tax_policy_refs),
        serialize(input.insurance_policy_refs), serialize(input.service_hours), input.effective_from ?? new Date(), actorId,
      ],
    );
    if (result.rows.length === 0) throw new MarketConfigError('MARKET_CREATE_FAILED', 500, 'Market configuration was not created');
    const row = result.rows[0];
    await insertAudit(client, input.market_code, 'create', actorId, 'Market configuration created', null, 1, null, snapshot(row), correlationId);
    return row as MarketConfigRecord;
  });
};

export const updateMarketConfig = async (
  marketCode: string,
  body: unknown,
  actorId: string,
  correlationId: string | null,
) => {
  const code = normalizeCode(marketCode, MARKET_CODE, 'market_code');
  const patch = parseMarketConfigPatch(body);
  if (Object.keys(patch).length === 0) {
    throw new MarketConfigError('EMPTY_MARKET_CONFIG_PATCH', 400, 'At least one market configuration field is required');
  }

  return withTransaction(async (client) => {
    const previous = await assertMarketExists(client, code);
    const next = { ...previous, ...patch } as MarketConfigInput & MarketConfigRecord;
    const nextVersion = previous.config_version + 1;
    const nextLaunchState = previous.launch_state === 'active' ? 'paused' : previous.launch_state;
    const result = await client.query(
      `UPDATE market_configs
       SET country_code = $1, region_code = $2, currency_code = $3,
           currency_minor_unit = $4, default_locale = $5, timezone = $6,
           measurement_system = $7, phone_rules = $8::jsonb, address_rules = $9::jsonb,
           payment_methods = $10::jsonb, logistics_providers = $11::jsonb,
           map_providers = $12::jsonb, tax_policy_refs = $13::jsonb,
           insurance_policy_refs = $14::jsonb, service_hours = $15::jsonb,
           effective_from = $16, launch_state = $17, config_version = $18, rollback_version = $19,
           approval_status = 'pending_approval', approval_reason = NULL,
           approved_by = NULL, approved_at = NULL, updated_by = $20, updated_at = NOW()
       WHERE market_code = $21
       RETURNING *`,
      [
        next.country_code, next.region_code, next.currency_code, next.currency_minor_unit,
        next.default_locale, next.timezone, next.measurement_system, serialize(next.phone_rules),
        serialize(next.address_rules), serialize(next.payment_methods), serialize(next.logistics_providers),
        serialize(next.map_providers), serialize(next.tax_policy_refs), serialize(next.insurance_policy_refs),
        serialize(next.service_hours), next.effective_from ?? previous.effective_from, nextLaunchState,
        nextVersion, previous.config_version, actorId, code,
      ],
    );
    const row = result.rows[0];
    await insertAudit(client, code, 'update', actorId, 'Market configuration updated; approval reset', previous.config_version, nextVersion, snapshot(previous), snapshot(row), correlationId);
    return row as MarketConfigRecord;
  });
};

export const upsertMarketAvailability = async (
  marketCode: string,
  body: unknown,
  actorId: string,
  correlationId: string | null,
) => {
  const code = normalizeCode(marketCode, MARKET_CODE, 'market_code');
  const input = parseServiceAvailability(body);
  return withTransaction(async (client) => {
    const previous = await assertMarketExists(client, code);
    const result = await client.query(
      `INSERT INTO market_service_availability (
         market_code, city_code, service_code, is_enabled, service_hours,
         policy_refs, config_version, effective_from, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 1, NOW(), $7, $7)
       ON CONFLICT (market_code, city_code, service_code) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         service_hours = EXCLUDED.service_hours,
         policy_refs = EXCLUDED.policy_refs,
         rollback_version = market_service_availability.config_version,
         config_version = market_service_availability.config_version + 1,
         effective_from = EXCLUDED.effective_from,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [code, input.city_code, input.service_code, input.is_enabled, serialize(input.service_hours), serialize(input.policy_refs), actorId],
    );
    const availability = result.rows[0];
    const nextVersion = previous.config_version + 1;
    const marketResult = await client.query(
      `UPDATE market_configs
       SET config_version = $1, rollback_version = $2,
           approval_status = 'pending_approval', approval_reason = NULL,
           approved_by = NULL, approved_at = NULL,
           launch_state = CASE WHEN launch_state = 'active' THEN 'paused' ELSE launch_state END,
           updated_by = $3, updated_at = NOW()
       WHERE market_code = $4
       RETURNING *`,
      [nextVersion, previous.config_version, actorId, code],
    );
    await insertAudit(client, code, 'availability_upsert', actorId, `Service availability ${input.city_code}/${input.service_code} updated`, previous.config_version, nextVersion, snapshot(previous), { market: snapshot(marketResult.rows[0]), availability }, correlationId);
    return { market: marketResult.rows[0] as MarketConfigRecord, availability };
  });
};

export const upsertMarketLegalDocument = async (
  marketCode: string,
  body: unknown,
  actorId: string,
  correlationId: string | null,
) => {
  const code = normalizeCode(marketCode, MARKET_CODE, 'market_code');
  const input = parseLegalDocument(body);
  return withTransaction(async (client) => {
    const previous = await assertMarketExists(client, code);
    const result = await client.query(
      `INSERT INTO market_legal_documents (
         market_code, document_type, locale, version, document_uri,
         content_hash, status, effective_from, created_by, approved_by, approved_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $7 = 'approved' THEN $9 ELSE NULL END, CASE WHEN $7 = 'approved' THEN NOW() ELSE NULL END)
       ON CONFLICT (market_code, document_type, locale, version) DO UPDATE SET
         document_uri = EXCLUDED.document_uri,
         content_hash = EXCLUDED.content_hash,
         status = EXCLUDED.status,
         effective_from = EXCLUDED.effective_from,
         approved_by = CASE WHEN EXCLUDED.status = 'approved' THEN EXCLUDED.approved_by ELSE NULL END,
         approved_at = CASE WHEN EXCLUDED.status = 'approved' THEN NOW() ELSE NULL END,
         updated_at = NOW()
       RETURNING *`,
      [code, input.document_type, input.locale, input.version, input.document_uri, input.content_hash ?? null, input.status, input.effective_from, actorId],
    );
    const document = result.rows[0];
    const nextVersion = previous.config_version + 1;
    const marketResult = await client.query(
      `UPDATE market_configs
       SET config_version = $1, rollback_version = $2,
           approval_status = 'pending_approval', approval_reason = NULL,
           approved_by = NULL, approved_at = NULL,
           launch_state = CASE WHEN launch_state = 'active' THEN 'paused' ELSE launch_state END,
           updated_by = $3, updated_at = NOW()
       WHERE market_code = $4
       RETURNING *`,
      [nextVersion, previous.config_version, actorId, code],
    );
    await insertAudit(client, code, 'legal_document_upsert', actorId, `Legal document ${input.document_type}/${input.locale}/${input.version} updated`, previous.config_version, nextVersion, snapshot(previous), { market: snapshot(marketResult.rows[0]), legal_document: document }, correlationId);
    return { market: marketResult.rows[0] as MarketConfigRecord, legalDocument: document };
  });
};

type QueryExecutor = { query: (text: string, values?: unknown[]) => Promise<any> };

const readiness = async (marketCode: string, cityCode: string | null, executor: QueryExecutor = readDb) => {
  const result = await executor.query(
    `SELECT market_code, is_ready, reason_codes
     FROM market_config_readiness($1, $2)`,
    [marketCode, cityCode],
  );
  return result.rows[0] as { market_code: string; is_ready: boolean; reason_codes: string[] } | undefined;
};

export const approveMarketConfig = async (
  marketCode: string,
  actorId: string,
  reason: string,
  correlationId: string | null,
) => {
  const code = normalizeCode(marketCode, MARKET_CODE, 'market_code');
  const approvalReason = reason.trim().slice(0, 500);
  if (!approvalReason) throw new MarketConfigError('APPROVAL_REASON_REQUIRED', 400, 'Approval reason is required');

  return withTransaction(async (client) => {
    const previous = await assertMarketExists(client, code);
    const state = await readiness(code, null, client);
    if (!state?.is_ready) {
      throw new MarketConfigError('MARKET_CONFIGURATION_INCOMPLETE', 409, 'Market configuration is incomplete and cannot be activated', state?.reason_codes || ['market_not_ready']);
    }
    const result = await client.query(
      `UPDATE market_configs
       SET launch_state = 'active', approval_status = 'approved',
           approval_reason = $1, approved_by = $2, approved_at = NOW(),
           updated_by = $2, updated_at = NOW()
       WHERE market_code = $3
       RETURNING *`,
      [approvalReason, actorId, code],
    );
    const row = result.rows[0];
    await insertAudit(client, code, 'approve', actorId, approvalReason, previous.config_version, row.config_version, snapshot(previous), snapshot(row), correlationId);
    return row as MarketConfigRecord;
  });
};

export const listMarketAudit = async (marketCode: string) => {
  const code = normalizeCode(marketCode, MARKET_CODE, 'market_code');
  const result = await readDb.query(
    `SELECT id, action, actor_id, reason, correlation_id, previous_version,
            new_version, previous_config, new_config, created_at
     FROM market_config_audit
     WHERE market_code = $1
     ORDER BY created_at DESC, id DESC`,
    [code],
  );
  return result.rows;
};

export const getPublicMarketConfig = async (marketCode: string, cityCode?: string | null): Promise<PublicMarketConfig> => {
  const code = normalizeCode(marketCode, MARKET_CODE, 'market_code');
  const city = cityCode ? normalizeCode(cityCode, CITY_CODE, 'city_code') : null;
  const state = await readiness(code, city);
  if (!state) throw new MarketConfigError('MARKET_CONFIG_UNAVAILABLE', 503, 'Market configuration is unavailable');
  if (state.reason_codes.includes('market_not_configured')) {
    throw new MarketConfigError('MARKET_NOT_CONFIGURED', 404, `Market '${code}' is not configured`, state.reason_codes);
  }
  if (!state.is_ready) {
    throw new MarketConfigError('MARKET_CONFIGURATION_UNAVAILABLE', 503, 'Market is not available for transactional use', state.reason_codes);
  }

  const config = await getMarketConfig(code);
  const [availability, legalDocuments] = await Promise.all([
    getMarketAvailability(code),
    getMarketLegalDocuments(code),
  ]);
  return {
    market_code: config.market_code,
    country_code: config.country_code,
    region_code: config.region_code,
    currency_code: config.currency_code,
    currency_minor_unit: config.currency_minor_unit,
    default_locale: config.default_locale,
    timezone: config.timezone,
    measurement_system: config.measurement_system,
    phone_rules: parseJsonObject(config.phone_rules),
    address_rules: parseJsonObject(config.address_rules),
    payment_methods: parseJsonArray(config.payment_methods),
    logistics_providers: parseJsonArray(config.logistics_providers),
    map_providers: parseJsonArray(config.map_providers),
    tax_policy_refs: parseJsonArray(config.tax_policy_refs),
    insurance_policy_refs: parseJsonArray(config.insurance_policy_refs),
    service_hours: parseJsonObject(config.service_hours),
    service_availability: availability
      .filter((row) => row.is_enabled && (!city || row.city_code === city))
      .map((row) => ({
        city_code: row.city_code,
        service_code: row.service_code,
        service_hours: parseJsonObject(row.service_hours),
        policy_refs: parseJsonObject(row.policy_refs),
      })),
    legal_documents: legalDocuments
      .filter((row) => row.status === 'approved' && new Date(row.effective_from).getTime() <= Date.now())
      .map((row) => ({
        document_type: row.document_type,
        locale: row.locale,
        version: row.version,
        document_uri: row.document_uri,
        effective_from: row.effective_from,
      })),
    config_version: config.config_version,
    effective_from: config.effective_from,
  };
};

export const getMarketReadiness = async (marketCode: string, cityCode?: string | null) => {
  const code = normalizeCode(marketCode, MARKET_CODE, 'market_code');
  const city = cityCode ? normalizeCode(cityCode, CITY_CODE, 'city_code') : null;
  return readiness(code, city);
};
