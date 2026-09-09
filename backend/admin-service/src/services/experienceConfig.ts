import { createHash, createHmac, randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { db, readDb } from '../db';

export const EXPERIENCE_SURFACES = [
  'customer_android',
  'customer_web',
  'merchant_android',
  'courier_android',
] as const;

export type ExperienceSurface = (typeof EXPERIENCE_SURFACES)[number];
export type ExperienceManifestState = 'draft' | 'published' | 'superseded' | 'rolled_back';
export type ExperienceCachePolicy = 'no-store' | 'private' | 'public';
export type ExperienceComponent =
  | 'hero_banner'
  | 'campaign_strip'
  | 'promo_carousel'
  | 'service_grid'
  | 'info_card'
  | 'quick_actions'
  | 'notice'
  | 'spacer';

type JsonObject = Record<string, unknown>;
type QueryResult<T = Record<string, unknown>> = { rows: T[] };
type Queryable = {
  query: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

const MARKET_CODE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROTECTED_KEYS = [
  'amount', 'authorization', 'commission', 'currency', 'delivery_status',
  'eligibility', 'financial', 'order_state', 'payment', 'payout', 'price',
  'provider', 'refund', 'risk', 'settlement', 'state_machine', 'tax',
  'total', 'transaction',
];

const text = (max: number) => z.string().trim().min(1).max(max).refine(
  (value) => !/[<>]|javascript:|data:text\/html/i.test(value),
  'HTML, executable URLs, and unsafe markup are not allowed',
);

const identifier = z.string().trim().toLowerCase().regex(IDENTIFIER);
const locale = z.string().trim().regex(LOCALE);
const semver = z.string().trim().regex(SEMVER);

const safeResourceUri = z.string().trim().max(2048).refine((value) => {
  if (value.startsWith('/assets/')) return !value.includes('..') && !value.includes('//');
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}, 'Asset URI must be an HTTPS URL or a local /assets/ path');

const safeDeepLink = z.string().trim().max(512).refine((value) => {
  if (value.startsWith('lancar://')) return /^lancar:\/\/(home|food|promo|orders|support|profile)(?:[/?#].*)?$/.test(value);
  return /^\/(home|food|promo|orders|support|profile)(?:[/?#].*)?$/.test(value);
}, 'Deep link must use an allowlisted LANCAR route');

const targetingSchema = z.object({
  cohorts: z.array(identifier).max(50).default([]),
  experiment_ref: identifier.nullable().optional(),
}).strict();

const assetReferenceSchema = z.object({
  asset_id: identifier,
  uri: safeResourceUri,
  kind: z.enum(['image', 'animation', 'icon', 'video']),
  checksum: z.string().trim().regex(SHA256),
}).strict();

const ctaFields = {
  cta_label: text(80).optional(),
  deep_link: safeDeepLink.optional(),
};

const promoItemSchema = z.object({
  id: identifier,
  title: text(120),
  body: text(500).optional(),
  image_asset_id: identifier.optional(),
  ...ctaFields,
}).strict();

const quickActionSchema = z.object({
  id: identifier,
  label: text(80),
  icon_asset_id: identifier.optional(),
  deep_link: safeDeepLink,
}).strict();

const serviceGridCardSchema = z.object({
  code: identifier,
  subtitle: text(160).optional(),
  badge: text(32).optional(),
}).strict();

const componentSchemas: Record<ExperienceComponent, z.ZodTypeAny> = {
  hero_banner: z.object({
    title: text(120),
    body: text(500).optional(),
    image_asset_id: identifier.optional(),
    ...ctaFields,
  }).strict(),
  campaign_strip: z.object({
    title: text(120),
    body: text(320).optional(),
    ...ctaFields,
  }).strict(),
  promo_carousel: z.object({
    items: z.array(promoItemSchema).min(1).max(10),
  }).strict(),
  service_grid: z.object({
    title: text(120).optional(),
    service_codes: z.array(identifier).min(1).max(20).optional(),
    cards: z.array(serviceGridCardSchema).min(1).max(20).optional(),
    display_mode: z.enum(['compact', 'cards']).default('cards'),
  }).strict().refine(
    (value) => (value.service_codes?.length ?? 0) > 0 || (value.cards?.length ?? 0) > 0,
    'service_grid requires service_codes or cards',
  ),
  info_card: z.object({
    title: text(120),
    body: text(700),
    icon_asset_id: identifier.optional(),
    deep_link: safeDeepLink.optional(),
  }).strict(),
  quick_actions: z.object({
    actions: z.array(quickActionSchema).min(1).max(8),
  }).strict(),
  notice: z.object({
    title: text(120),
    body: text(500).optional(),
    ...ctaFields,
  }).strict(),
  spacer: z.object({
    size: z.enum(['small', 'medium', 'large']).default('medium'),
  }).strict(),
};

const componentValues = new Set<string>(Object.keys(componentSchemas));

export const experienceManifestInputSchema = z.object({
  schema_version: z.coerce.number().int().min(1).max(10).default(1),
  market_code: z.string().trim().toLowerCase().regex(MARKET_CODE),
  locale,
  surface: z.enum(EXPERIENCE_SURFACES),
  min_app_version: semver,
  max_app_version: semver.nullable().optional(),
  starts_at: z.coerce.date().default(() => new Date()),
  ends_at: z.coerce.date().nullable().optional(),
  ttl_seconds: z.coerce.number().int().min(0).max(86400).default(300),
  cache_policy: z.enum(['no-store', 'private', 'public']).default('private'),
  targeting: z.unknown().optional(),
  sections: z.unknown(),
  asset_references: z.unknown().optional(),
}).strict();

export type ExperienceManifestInput = z.infer<typeof experienceManifestInputSchema> & {
  targeting: z.infer<typeof targetingSchema>;
  sections: ExperienceSection[];
  asset_references: ExperienceAssetReference[];
};

export type ExperienceSection = {
  id: string;
  component: ExperienceComponent;
  properties: JsonObject;
};

export type ExperienceAssetReference = z.infer<typeof assetReferenceSchema>;

export type ExperienceManifestRecord = {
  id: string;
  manifest_id: string;
  revision: number;
  schema_version: number;
  market_code: string;
  locale: string;
  surface: ExperienceSurface;
  min_app_version: string;
  max_app_version: string | null;
  starts_at: string;
  ends_at: string | null;
  ttl_seconds: number;
  cache_policy: ExperienceCachePolicy;
  targeting: z.infer<typeof targetingSchema>;
  sections: ExperienceSection[];
  asset_references: ExperienceAssetReference[];
  checksum: string;
  signature: string | null;
  state: ExperienceManifestState;
  created_by: string | null;
  updated_by: string | null;
  published_by: string | null;
  published_at: string | null;
  rolled_back_by: string | null;
  rolled_back_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicExperienceManifest = {
  manifest_id: string;
  schema_version: number;
  revision: number;
  market_code: string;
  locale: string;
  resolved_locale: string;
  surface: ExperienceSurface;
  min_app_version: string;
  max_app_version: string | null;
  starts_at: string;
  ends_at: string | null;
  ttl_seconds: number;
  cache_policy: ExperienceCachePolicy;
  sections: ExperienceSection[];
  asset_references: ExperienceAssetReference[];
  checksum: string;
  signature: string | null;
};

export type ExperienceManifestCandidate = Pick<ExperienceManifestRecord, 'manifest_id' | 'revision' | 'schema_version' | 'market_code' | 'locale' | 'surface' | 'min_app_version' | 'max_app_version' | 'starts_at' | 'ends_at' | 'ttl_seconds' | 'cache_policy' | 'targeting' | 'sections' | 'asset_references' | 'checksum' | 'signature'> & {
  default_locale?: string;
};

export class ExperienceManifestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly reasonCodes: string[] = [],
  ) {
    super(message);
    this.name = 'ExperienceManifestError';
  }
}

const jsonObject = (value: unknown, field: string): JsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_MANIFEST', 400, `${field} must be an object`);
  }
  return value as JsonObject;
};

const rejectProtectedKeys = (value: unknown, path = 'manifest'): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectProtectedKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value as JsonObject)) {
    const normalized = key.toLowerCase().replace(/[-\s]/g, '_');
    if (PROTECTED_KEYS.some((protectedKey) => normalized === protectedKey || normalized.includes(`${protectedKey}_`))) {
      throw new ExperienceManifestError(
        'EXPERIENCE_PROTECTED_PROPERTY',
        400,
        `${path}.${key} is a protected transaction property and cannot be remotely configured`,
      );
    }
    rejectProtectedKeys(nested, `${path}.${key}`);
  }
};

const normalizeLocale = (value: string): string => value.split('-').map((part, index) => {
  if (index === 0) return part.toLowerCase();
  return part.length === 2 ? part.toUpperCase() : part.toLowerCase();
}).join('-');

const parseComponent = (value: unknown, index: number): ExperienceSection => {
  const section = jsonObject(value, `sections[${index}]`);
  const id = typeof section.id === 'string' ? section.id.trim().toLowerCase() : '';
  const component = typeof section.component === 'string' ? section.component.trim().toLowerCase() : '';
  if (!IDENTIFIER.test(id)) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_SECTION', 400, `sections[${index}].id is invalid`);
  }
  if (!componentValues.has(component)) {
    throw new ExperienceManifestError('EXPERIENCE_COMPONENT_NOT_ALLOWED', 400, `sections[${index}].component is not allowlisted`);
  }
  const properties = jsonObject(section.properties, `sections[${index}].properties`);
  const parsed = componentSchemas[component as ExperienceComponent].safeParse(properties);
  if (!parsed.success) {
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_COMPONENT_PROPERTIES',
      400,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  return { id, component: component as ExperienceComponent, properties: parsed.data as JsonObject };
};

const parseSections = (value: unknown): ExperienceSection[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_SECTIONS', 400, 'sections must contain 1 to 20 entries');
  }
  const seen = new Set<string>();
  return value.map((item, index) => {
    const section = parseComponent(item, index);
    if (seen.has(section.id)) {
      throw new ExperienceManifestError('DUPLICATE_EXPERIENCE_SECTION', 400, `section id '${section.id}' is duplicated`);
    }
    seen.add(section.id);
    return section;
  });
};

const parseTargeting = (value: unknown): z.infer<typeof targetingSchema> => {
  const parsed = targetingSchema.safeParse(value ?? {});
  if (!parsed.success) {
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_TARGETING',
      400,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  return parsed.data;
};

const parseAssets = (value: unknown): ExperienceAssetReference[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_ASSETS', 400, 'asset_references must contain at most 50 entries');
  }
  const seen = new Set<string>();
  return value.map((item, index) => {
    const parsed = assetReferenceSchema.safeParse(item);
    if (!parsed.success) {
      throw new ExperienceManifestError(
        'INVALID_EXPERIENCE_ASSET',
        400,
        parsed.error.issues.map((issue) => `asset_references[${index}].${issue.path.join('.')}: ${issue.message}`).join('; '),
      );
    }
    if (seen.has(parsed.data.asset_id)) {
      throw new ExperienceManifestError('DUPLICATE_EXPERIENCE_ASSET', 400, `asset '${parsed.data.asset_id}' is duplicated`);
    }
    seen.add(parsed.data.asset_id);
    return parsed.data;
  });
};

const parseUuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !UUID.test(value.trim())) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_MANIFEST_ID', 400, `${field} must be a UUID`);
  }
  return value.trim().toLowerCase();
};

const parseInput = (body: unknown): ExperienceManifestInput => {
  const parsed = experienceManifestInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_MANIFEST',
      400,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  const input = parsed.data;
  const normalizedLocale = normalizeLocale(input.locale);
  if (!LOCALE.test(normalizedLocale)) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_LOCALE', 400, 'locale must be a valid BCP-47-like locale');
  }
  const maxVersion = input.max_app_version ?? null;
  if (maxVersion && compareSemanticVersions(input.min_app_version, maxVersion) > 0) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_VERSION_RANGE', 400, 'max_app_version must not precede min_app_version');
  }
  const endsAt = input.ends_at ?? null;
  if (endsAt && endsAt.getTime() <= input.starts_at.getTime()) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_SCHEDULE', 400, 'ends_at must be after starts_at');
  }
  const normalized: ExperienceManifestInput = {
    ...input,
    locale: normalizedLocale,
    max_app_version: maxVersion,
    ends_at: endsAt,
    targeting: parseTargeting(input.targeting),
    sections: parseSections(input.sections),
    asset_references: parseAssets(input.asset_references),
  };
  rejectProtectedKeys({ targeting: normalized.targeting, sections: normalized.sections, asset_references: normalized.asset_references });
  validateAssetReferences(normalized.sections, normalized.asset_references);
  return normalized;
};

export const parseExperienceManifestInput = parseInput;

const validateAssetReferences = (sections: ExperienceSection[], assets: ExperienceAssetReference[]): void => {
  const assetIds = new Set(assets.map((asset) => asset.asset_id));
  const referenced = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value as JsonObject)) {
      if (key.endsWith('asset_id') && typeof nested === 'string') referenced.add(nested);
      collect(nested);
    }
  };
  sections.forEach((section) => collect(section.properties));
  const missing = Array.from(referenced).filter((id) => !assetIds.has(id));
  if (missing.length > 0) {
    throw new ExperienceManifestError('EXPERIENCE_ASSET_NOT_DECLARED', 400, `Referenced assets are missing: ${missing.join(', ')}`);
  }
};

type Version = { major: number; minor: number; patch: number; prerelease: string[] };

const parseVersion = (value: string): Version => {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) throw new ExperienceManifestError('INVALID_EXPERIENCE_APP_VERSION', 400, `Invalid app version '${value}'`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4]?.split('.') ?? [] };
};

export const compareSemanticVersions = (left: string, right: string): number => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    if (a.prerelease[index] === b.prerelease[index]) continue;
    const aNumber = /^\d+$/.test(a.prerelease[index]);
    const bNumber = /^\d+$/.test(b.prerelease[index]);
    if (aNumber && bNumber) return Number(a.prerelease[index]) > Number(b.prerelease[index]) ? 1 : -1;
    if (aNumber !== bNumber) return aNumber ? -1 : 1;
    return a.prerelease[index] > b.prerelease[index] ? 1 : -1;
  }
  return 0;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as JsonObject).sort().reduce<JsonObject>((result, key) => {
    result[key] = canonicalize((value as JsonObject)[key]);
    return result;
  }, {});
};

export const canonicalExperienceManifestPayload = (input: {
  manifest_id: string;
  revision: number;
  schema_version: number;
  market_code: string;
  locale: string;
  surface: ExperienceSurface;
  min_app_version: string;
  max_app_version: string | null;
  starts_at: Date | string;
  ends_at: Date | string | null;
  ttl_seconds: number;
  cache_policy: ExperienceCachePolicy;
  targeting: z.infer<typeof targetingSchema>;
  sections: ExperienceSection[];
  asset_references: ExperienceAssetReference[];
}): string => JSON.stringify(canonicalize({
  manifest_id: input.manifest_id,
  revision: input.revision,
  schema_version: input.schema_version,
  market_code: input.market_code,
  locale: input.locale,
  surface: input.surface,
  min_app_version: input.min_app_version,
  max_app_version: input.max_app_version,
  starts_at: new Date(input.starts_at).toISOString(),
  ends_at: input.ends_at ? new Date(input.ends_at).toISOString() : null,
  ttl_seconds: input.ttl_seconds,
  cache_policy: input.cache_policy,
  targeting: input.targeting,
  sections: input.sections,
  asset_references: input.asset_references,
}));

const checksumFor = (payload: string): string => createHash('sha256').update(payload).digest('hex');

const signatureFor = (checksum: string): string | null => {
  const secret = process.env.EXPERIENCE_MANIFEST_SIGNING_SECRET?.trim();
  if (!secret) return null;
  return createHmac('sha256', secret).update(checksum).digest('hex');
};

const assertSigningConfiguration = (): void => {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';
  if (isProduction && !process.env.EXPERIENCE_MANIFEST_SIGNING_SECRET?.trim()) {
    throw new ExperienceManifestError(
      'EXPERIENCE_SIGNING_SECRET_REQUIRED',
      503,
      'Experience manifest signing is not configured for production',
      ['experience_signing_secret_missing'],
    );
  }
};

const manifestSelect = `
  SELECT id, manifest_id, revision, schema_version, market_code, locale, surface,
         min_app_version, max_app_version, starts_at, ends_at, ttl_seconds,
         cache_policy, targeting, sections, asset_references, content_checksum,
         signature, state, created_by, updated_by, published_by, published_at,
         rolled_back_by, rolled_back_at, created_at, updated_at
    FROM experience_manifest_revisions`;

const rowToManifest = (row: Record<string, any>): ExperienceManifestRecord => ({
  id: String(row.id),
  manifest_id: String(row.manifest_id),
  revision: Number(row.revision),
  schema_version: Number(row.schema_version),
  market_code: String(row.market_code),
  locale: String(row.locale),
  surface: row.surface as ExperienceSurface,
  min_app_version: String(row.min_app_version),
  max_app_version: row.max_app_version ? String(row.max_app_version) : null,
  starts_at: new Date(row.starts_at).toISOString(),
  ends_at: row.ends_at ? new Date(row.ends_at).toISOString() : null,
  ttl_seconds: Number(row.ttl_seconds),
  cache_policy: row.cache_policy as ExperienceCachePolicy,
  targeting: parseTargeting(row.targeting),
  sections: parseSections(row.sections),
  asset_references: parseAssets(row.asset_references),
  checksum: String(row.content_checksum),
  signature: row.signature ? String(row.signature) : null,
  state: row.state as ExperienceManifestState,
  created_by: row.created_by ? String(row.created_by) : null,
  updated_by: row.updated_by ? String(row.updated_by) : null,
  published_by: row.published_by ? String(row.published_by) : null,
  published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
  rolled_back_by: row.rolled_back_by ? String(row.rolled_back_by) : null,
  rolled_back_at: row.rolled_back_at ? new Date(row.rolled_back_at).toISOString() : null,
  created_at: new Date(row.created_at).toISOString(),
  updated_at: new Date(row.updated_at).toISOString(),
});

const snapshot = (manifest: ExperienceManifestRecord | Record<string, any>): JsonObject => ({
  ...(() => {
    const raw = manifest as Record<string, any>;
    return { checksum: raw.checksum ?? raw.content_checksum };
  })(),
  manifest_id: manifest.manifest_id,
  revision: manifest.revision,
  schema_version: manifest.schema_version,
  market_code: manifest.market_code,
  locale: manifest.locale,
  surface: manifest.surface,
  min_app_version: manifest.min_app_version,
  max_app_version: manifest.max_app_version ?? null,
  starts_at: manifest.starts_at,
  ends_at: manifest.ends_at ?? null,
  ttl_seconds: manifest.ttl_seconds,
  cache_policy: manifest.cache_policy,
  targeting: manifest.targeting,
  sections: manifest.sections,
  asset_references: manifest.asset_references,
  signature: manifest.signature ?? null,
  state: manifest.state,
});

const serialize = (value: unknown): string => JSON.stringify(value ?? null);

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

const lockManifest = async (client: Queryable, manifestId: string): Promise<void> => {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [manifestId]);
};

const assertMarketExists = async (client: Queryable, marketCode: string): Promise<void> => {
  const result = await client.query('SELECT market_code FROM market_configs WHERE market_code = $1 LIMIT 1', [marketCode]);
  if (!result.rows[0]) {
    throw new ExperienceManifestError('MARKET_NOT_CONFIGURED', 404, `Market '${marketCode}' is not configured`);
  }
};

const audit = async (
  client: Queryable,
  manifest: ExperienceManifestRecord | Record<string, any>,
  action: string,
  actorId: string | null,
  reason: string | null,
  previousState: string | null,
  newState: string,
  correlationId: string | null,
  metadata: JsonObject = {},
): Promise<void> => {
  await client.query(
    `INSERT INTO experience_manifest_audit (
       revision_id, manifest_id, revision, action, actor_id, reason,
       correlation_id, previous_state, new_state, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      manifest.id, manifest.manifest_id, manifest.revision, action, actorId, reason,
      correlationId, previousState, newState, serialize(metadata),
    ],
  );
};

const contentValues = (manifestId: string, revision: number, input: ExperienceManifestInput) => {
  const payload = canonicalExperienceManifestPayload({
    manifest_id: manifestId,
    revision,
    schema_version: input.schema_version,
    market_code: input.market_code,
    locale: input.locale,
    surface: input.surface,
    min_app_version: input.min_app_version,
    max_app_version: input.max_app_version ?? null,
    starts_at: input.starts_at,
    ends_at: input.ends_at ?? null,
    ttl_seconds: input.ttl_seconds,
    cache_policy: input.cache_policy,
    targeting: input.targeting,
    sections: input.sections,
    asset_references: input.asset_references,
  });
  const checksum = checksumFor(payload);
  return { payload, checksum, signature: signatureFor(checksum) };
};

const normalizeManifestIdFromBody = (body: unknown): string => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return randomUUID();
  const value = (body as Record<string, unknown>).manifest_id;
  return value === undefined ? randomUUID() : parseUuid(value, 'manifest_id');
};

const bodyWithoutManifestId = (body: unknown): unknown => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const { manifest_id: _manifestId, ...rest } = body as Record<string, unknown>;
  return rest;
};

export const createExperienceManifest = async (
  body: unknown,
  actorId: string,
  correlationId: string | null,
): Promise<ExperienceManifestRecord> => {
  const input = parseInput(bodyWithoutManifestId(body));
  const manifestId = normalizeManifestIdFromBody(body);

  return withTransaction(async (client) => {
    await lockManifest(client, manifestId);
    await assertMarketExists(client, input.market_code);
    const existingDraft = await client.query(
      `${manifestSelect} WHERE manifest_id = $1 AND state = 'draft' FOR UPDATE`,
      [manifestId],
    );
    if (existingDraft.rows[0]) {
      throw new ExperienceManifestError('EXPERIENCE_DRAFT_ALREADY_EXISTS', 409, `Manifest '${manifestId}' already has a draft revision`);
    }
    const latest = await client.query<{ revision: number }>(
      'SELECT revision FROM experience_manifest_revisions WHERE manifest_id = $1 ORDER BY revision DESC LIMIT 1 FOR UPDATE',
      [manifestId],
    );
    const revision = Number(latest.rows[0]?.revision ?? 0) + 1;
    const content = contentValues(manifestId, revision, input);
    const result = await client.query(
      `INSERT INTO experience_manifest_revisions (
         manifest_id, revision, schema_version, market_code, locale, surface,
         min_app_version, max_app_version, starts_at, ends_at, ttl_seconds,
         cache_policy, targeting, sections, asset_references, content_checksum,
         signature, state, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 $13::jsonb, $14::jsonb, $15::jsonb, $16, $17, 'draft', $18, $18)
       RETURNING *`,
      [
        manifestId, revision, input.schema_version, input.market_code, input.locale, input.surface,
        input.min_app_version, input.max_app_version ?? null, input.starts_at, input.ends_at ?? null,
        input.ttl_seconds, input.cache_policy, serialize(input.targeting), serialize(input.sections),
        serialize(input.asset_references), content.checksum, content.signature, actorId,
      ],
    );
    const manifest = rowToManifest(result.rows[0]);
    await audit(client, manifest, 'draft_created', actorId, 'Experience manifest draft created', null, 'draft', correlationId);
    return manifest;
  });
};

export const updateExperienceManifestDraft = async (
  manifestIdValue: unknown,
  body: unknown,
  actorId: string,
  correlationId: string | null,
): Promise<ExperienceManifestRecord> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  const input = parseInput(bodyWithoutManifestId(body));

  return withTransaction(async (client) => {
    await lockManifest(client, manifestId);
    const currentResult = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'draft' FOR UPDATE`, [manifestId]);
    if (!currentResult.rows[0]) {
      throw new ExperienceManifestError('EXPERIENCE_DRAFT_NOT_FOUND', 404, `Draft manifest '${manifestId}' was not found`);
    }
    const current = rowToManifest(currentResult.rows[0]);
    if (current.market_code !== input.market_code || current.surface !== input.surface || current.locale !== input.locale) {
      // Scope changes are allowed only while a revision is still a draft, but
      // the explicit branch keeps the decision visible for audit/review.
    }
    const content = contentValues(manifestId, current.revision, input);
    const result = await client.query(
      `UPDATE experience_manifest_revisions
          SET schema_version = $1, market_code = $2, locale = $3, surface = $4,
              min_app_version = $5, max_app_version = $6, starts_at = $7, ends_at = $8,
              ttl_seconds = $9, cache_policy = $10, targeting = $11::jsonb,
              sections = $12::jsonb, asset_references = $13::jsonb,
              content_checksum = $14, signature = $15, updated_by = $16, updated_at = NOW()
        WHERE id = $17 AND state = 'draft'
        RETURNING *`,
      [
        input.schema_version, input.market_code, input.locale, input.surface, input.min_app_version,
        input.max_app_version ?? null, input.starts_at, input.ends_at ?? null, input.ttl_seconds,
        input.cache_policy, serialize(input.targeting), serialize(input.sections), serialize(input.asset_references),
        content.checksum, content.signature, actorId, current.id,
      ],
    );
    const manifest = rowToManifest(result.rows[0]);
    await audit(client, manifest, 'draft_updated', actorId, 'Experience manifest draft updated', 'draft', 'draft', correlationId);
    return manifest;
  });
};

export const previewExperienceManifest = async (
  manifestIdValue: unknown,
  actorId: string,
  correlationId: string | null,
): Promise<ExperienceManifestRecord> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  return withTransaction(async (client) => {
    const result = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'draft' FOR UPDATE`, [manifestId]);
    if (!result.rows[0]) throw new ExperienceManifestError('EXPERIENCE_DRAFT_NOT_FOUND', 404, `Draft manifest '${manifestId}' was not found`);
    const manifest = rowToManifest(result.rows[0]);
    await audit(client, manifest, 'previewed', actorId, 'Experience manifest preview requested', 'draft', 'draft', correlationId);
    return manifest;
  });
};

export const publishExperienceManifest = async (
  manifestIdValue: unknown,
  actorId: string,
  correlationId: string | null,
): Promise<ExperienceManifestRecord> => {
  assertSigningConfiguration();
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  return withTransaction(async (client) => {
    await lockManifest(client, manifestId);
    const draftResult = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'draft' FOR UPDATE`, [manifestId]);
    if (!draftResult.rows[0]) throw new ExperienceManifestError('EXPERIENCE_DRAFT_NOT_FOUND', 404, `Draft manifest '${manifestId}' was not found`);
    const draft = rowToManifest(draftResult.rows[0]);
    const currentResult = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'published' FOR UPDATE`, [manifestId]);
    const current = currentResult.rows[0] ? rowToManifest(currentResult.rows[0]) : null;
    if (current) {
      await client.query(
        `UPDATE experience_manifest_revisions SET state = 'superseded', updated_by = $1, updated_at = NOW() WHERE id = $2`,
        [actorId, current.id],
      );
      await audit(client, { ...current, state: 'superseded' }, 'superseded', actorId, 'Superseded by a newer published revision', 'published', 'superseded', correlationId, { replacement_revision: draft.revision });
    }
    const publishedResult = await client.query(
      `UPDATE experience_manifest_revisions
          SET state = 'published', published_by = $1, published_at = NOW(), updated_by = $1, updated_at = NOW()
        WHERE id = $2 AND state = 'draft'
        RETURNING *`,
      [actorId, draft.id],
    );
    const published = rowToManifest(publishedResult.rows[0]);
    await audit(client, published, 'published', actorId, 'Experience manifest published', 'draft', 'published', correlationId, { previous_revision: current?.revision ?? null });
    return published;
  });
};

export const rollbackExperienceManifest = async (
  manifestIdValue: unknown,
  targetRevisionValue: unknown,
  actorId: string,
  reason: string,
  correlationId: string | null,
): Promise<ExperienceManifestRecord> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  const targetRevision = Number(targetRevisionValue);
  if (!Number.isInteger(targetRevision) || targetRevision < 1) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_ROLLBACK_TARGET', 400, 'target_revision must be a positive integer');
  }
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    throw new ExperienceManifestError('EXPERIENCE_ROLLBACK_REASON_REQUIRED', 400, 'Rollback reason must contain 3 to 500 characters');
  }

  return withTransaction(async (client) => {
    await lockManifest(client, manifestId);
    const currentResult = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'published' FOR UPDATE`, [manifestId]);
    if (!currentResult.rows[0]) throw new ExperienceManifestError('EXPERIENCE_PUBLISHED_NOT_FOUND', 409, `Manifest '${manifestId}' has no published revision`);
    const current = rowToManifest(currentResult.rows[0]);
    if (targetRevision >= current.revision) {
      throw new ExperienceManifestError('INVALID_EXPERIENCE_ROLLBACK_TARGET', 400, 'Rollback target must be older than the current published revision');
    }
    const targetResult = await client.query(
      `${manifestSelect} WHERE manifest_id = $1 AND revision = $2 AND state IN ('superseded', 'rolled_back') FOR UPDATE`,
      [manifestId, targetRevision],
    );
    if (!targetResult.rows[0]) {
      throw new ExperienceManifestError('EXPERIENCE_ROLLBACK_TARGET_NOT_FOUND', 404, `Historical revision ${targetRevision} is not available for rollback`);
    }
    const target = rowToManifest(targetResult.rows[0]);
    await client.query(
      `UPDATE experience_manifest_revisions
          SET state = 'rolled_back', rolled_back_by = $1, rolled_back_at = NOW(), updated_by = $1, updated_at = NOW()
        WHERE id = $2`,
      [actorId, current.id],
    );
    await audit(client, { ...current, state: 'rolled_back' }, 'rolled_back', actorId, normalizedReason, 'published', 'rolled_back', correlationId, { target_revision: target.revision });
    const publishedTarget = await client.query(
      `UPDATE experience_manifest_revisions
          SET state = 'published', published_by = $1, published_at = NOW(), updated_by = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [actorId, target.id],
    );
    const published = rowToManifest(publishedTarget.rows[0]);
    await audit(client, published, 'published', actorId, `Rollback to revision ${target.revision}: ${normalizedReason}`, target.state, 'published', correlationId, { rollback_from_revision: current.revision });
    return published;
  });
};

const validateListFilter = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (field === 'market_code' && !MARKET_CODE.test(normalized)) throw new ExperienceManifestError('INVALID_EXPERIENCE_FILTER', 400, `${field} is invalid`);
  if (field === 'surface' && !EXPERIENCE_SURFACES.includes(normalized as ExperienceSurface)) throw new ExperienceManifestError('INVALID_EXPERIENCE_FILTER', 400, `${field} is invalid`);
  if (field === 'state' && !['draft', 'published', 'superseded', 'rolled_back'].includes(normalized)) throw new ExperienceManifestError('INVALID_EXPERIENCE_FILTER', 400, `${field} is invalid`);
  return normalized;
};

export const listExperienceManifestRevisions = async (filters: {
  market_code?: unknown;
  surface?: unknown;
  state?: unknown;
} = {}): Promise<ExperienceManifestRecord[]> => {
  const marketCode = validateListFilter(filters.market_code, 'market_code');
  const surface = validateListFilter(filters.surface, 'surface');
  const state = validateListFilter(filters.state, 'state');
  const values: unknown[] = [];
  const where: string[] = [];
  if (marketCode) { values.push(marketCode); where.push(`market_code = $${values.length}`); }
  if (surface) { values.push(surface); where.push(`surface = $${values.length}`); }
  if (state) { values.push(state); where.push(`state = $${values.length}`); }
  const result = await readDb.query(`${manifestSelect}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY manifest_id ASC, revision DESC LIMIT 1000`, values);
  return result.rows.map(rowToManifest);
};

export const getExperienceManifestHistory = async (manifestIdValue: unknown): Promise<ExperienceManifestRecord[]> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  const result = await readDb.query(`${manifestSelect} WHERE manifest_id = $1 ORDER BY revision DESC`, [manifestId]);
  return result.rows.map(rowToManifest);
};

const isWithinAppRange = (candidate: ExperienceManifestCandidate, appVersion: string): boolean => {
  if (compareSemanticVersions(appVersion, candidate.min_app_version) < 0) return false;
  return !candidate.max_app_version || compareSemanticVersions(appVersion, candidate.max_app_version) <= 0;
};

const targetingScore = (
  targeting: z.infer<typeof targetingSchema>,
  cohort: string | null,
  experimentRef: string | null,
): number | null => {
  if (targeting.cohorts.length > 0 && (!cohort || !targeting.cohorts.includes(cohort))) return null;
  if (targeting.experiment_ref && targeting.experiment_ref !== experimentRef) return null;
  return (targeting.cohorts.length > 0 ? 2 : 0) + (targeting.experiment_ref ? 1 : 0);
};

export const pickExperienceManifest = (
  candidates: ExperienceManifestCandidate[],
  request: {
    locale: string;
    default_locale: string;
    app_version: string;
    cohort?: string | null;
    experiment_ref?: string | null;
  },
): PublicExperienceManifest | null => {
  const requestedLocale = normalizeLocale(request.locale);
  const defaultLocale = normalizeLocale(request.default_locale);
  const ranked = candidates.flatMap((candidate) => {
    const candidateLocale = normalizeLocale(candidate.locale);
    const localeScore = candidateLocale === requestedLocale ? 2 : candidateLocale === defaultLocale ? 1 : 0;
    if (localeScore === 0 || !isWithinAppRange(candidate, request.app_version)) return [];
    const targetScore = targetingScore(candidate.targeting, request.cohort ?? null, request.experiment_ref ?? null);
    if (targetScore === null) return [];
    return [{ candidate, localeScore, targetScore }];
  });
  ranked.sort((left, right) => {
    if (right.localeScore !== left.localeScore) return right.localeScore - left.localeScore;
    if (right.targetScore !== left.targetScore) return right.targetScore - left.targetScore;
    return right.candidate.revision - left.candidate.revision;
  });
  const selected = ranked[0]?.candidate;
  if (!selected) return null;
  return {
    manifest_id: selected.manifest_id,
    schema_version: selected.schema_version,
    revision: selected.revision,
    market_code: selected.market_code,
    locale: selected.locale,
    resolved_locale: normalizeLocale(selected.locale),
    surface: selected.surface,
    min_app_version: selected.min_app_version,
    max_app_version: selected.max_app_version,
    starts_at: new Date(selected.starts_at).toISOString(),
    ends_at: selected.ends_at ? new Date(selected.ends_at).toISOString() : null,
    ttl_seconds: selected.ttl_seconds,
    cache_policy: selected.cache_policy,
    sections: selected.sections,
    asset_references: selected.asset_references,
    checksum: selected.checksum,
    signature: selected.signature,
  };
};

export const resolvePublicExperienceManifest = async (request: {
  market_code: string;
  locale: string;
  surface: ExperienceSurface;
  app_version: string;
  cohort?: string | null;
  experiment_ref?: string | null;
}): Promise<PublicExperienceManifest> => {
  const marketCode = String(request.market_code || '').trim().toLowerCase();
  if (!MARKET_CODE.test(marketCode)) throw new ExperienceManifestError('MARKET_CODE_REQUIRED', 400, 'market_code is required and must be valid');
  if (!LOCALE.test(request.locale)) throw new ExperienceManifestError('INVALID_EXPERIENCE_LOCALE', 400, 'locale is invalid');
  if (!EXPERIENCE_SURFACES.includes(request.surface)) throw new ExperienceManifestError('INVALID_EXPERIENCE_SURFACE', 400, 'surface is invalid');
  if (!SEMVER.test(request.app_version)) throw new ExperienceManifestError('INVALID_EXPERIENCE_APP_VERSION', 400, 'app_version is invalid');
  const marketResult = await readDb.query<{ default_locale: string; launch_state: string }>(
    'SELECT default_locale, launch_state FROM market_configs WHERE market_code = $1 LIMIT 1',
    [marketCode],
  );
  if (!marketResult.rows[0]) throw new ExperienceManifestError('MARKET_NOT_CONFIGURED', 404, `Market '${marketCode}' is not configured`);
  if (marketResult.rows[0].launch_state !== 'active') {
    throw new ExperienceManifestError('EXPERIENCE_MARKET_UNAVAILABLE', 503, `Market '${marketCode}' is not active`, ['market_not_active']);
  }
  const result = await readDb.query(
    `${manifestSelect}
       WHERE market_code = $1
         AND surface = $2
         AND state = 'published'
         AND starts_at <= NOW()
         AND (ends_at IS NULL OR ends_at > NOW())
       ORDER BY revision DESC
       LIMIT 500`,
    [marketCode, request.surface],
  );
  const candidates = result.rows.map((row) => rowToManifest(row));
  const selected = pickExperienceManifest(candidates, {
    locale: request.locale,
    default_locale: marketResult.rows[0].default_locale,
    app_version: request.app_version,
    cohort: request.cohort ?? null,
    experiment_ref: request.experiment_ref ?? null,
  });
  if (!selected) throw new ExperienceManifestError('EXPERIENCE_MANIFEST_NOT_AVAILABLE', 404, 'No published experience manifest matches this market, locale, surface and app version');
  return selected;
};

export const getExperienceCacheControl = (manifest: PublicExperienceManifest): string => {
  if (manifest.cache_policy === 'no-store') return 'no-store';
  const visibility = manifest.cache_policy === 'public' ? 'public' : 'private';
  return `${visibility}, max-age=${manifest.ttl_seconds}, stale-while-revalidate=300`;
};
