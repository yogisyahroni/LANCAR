import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { db, readDb } from '../db';

export const LOCALIZED_CONTENT_SURFACES = [
  'customer_android',
  'customer_web',
  'merchant_android',
  'courier_android',
] as const;

export type LocalizedContentSurface = (typeof LOCALIZED_CONTENT_SURFACES)[number];
export const LOCALIZED_CONTENT_KINDS = ['marketing', 'banner', 'help'] as const;
export type LocalizedContentKind = (typeof LOCALIZED_CONTENT_KINDS)[number];

export const LOCALIZED_CONTENT_MAX_LENGTHS: Record<LocalizedContentKind, number> = {
  marketing: 500,
  banner: 320,
  help: 700,
};

const MARKET_CODE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

const PROTECTED_CONTENT_TERMS = new Set([
  'amount', 'authorization', 'commission', 'consent', 'currency', 'financial',
  'legal', 'payment', 'payout', 'price', 'refund', 'settlement', 'tax', 'transaction',
]);

const normalizeLocale = (value: string): string => value.split('-').map((part, index) => {
  if (index === 0) return part.toLowerCase();
  return part.length === 2 ? part.toUpperCase() : part.toLowerCase();
}).join('-');

/**
 * One explicit fallback policy is shared by the CMS resolver and the clients'
 * contract tests: requested full locale, language, market default, language
 * default and finally the packaged Indonesian default.
 */
export const localeFallbackChain = (
  requestedLocale: string,
  marketDefaultLocale = 'id-ID',
): string[] => {
  const requested = normalizeLocale(requestedLocale.trim().replace('_', '-'));
  const marketDefault = normalizeLocale(marketDefaultLocale.trim().replace('_', '-') || 'id-ID');
  const language = (value: string) => value.split('-')[0] || value;
  return [...new Set([
    requested,
    language(requested),
    marketDefault,
    language(marketDefault),
    'id-ID',
    'id',
  ].filter(Boolean))];
};

const containsProtectedTerm = (packKey: string): boolean => packKey
  .toLowerCase()
  .split(/[._-]+/)
  .some((part) => PROTECTED_CONTENT_TERMS.has(part));

const safeCopyText = z.string().trim().min(1).max(1000).refine(
  (value) => !/[<>]|javascript:|data:text\/html/i.test(value),
  'HTML, executable URLs, and unsafe markup are not allowed',
);

/** References are accepted inside presentation sections, never emitted to a client. */
export const localizedCopyReferenceSchema = z.object({
  title: z.string().trim().toLowerCase().regex(IDENTIFIER).optional(),
  body: z.string().trim().toLowerCase().regex(IDENTIFIER).optional(),
  badge: z.string().trim().toLowerCase().regex(IDENTIFIER).optional(),
  cta_label: z.string().trim().toLowerCase().regex(IDENTIFIER).optional(),
  label: z.string().trim().toLowerCase().regex(IDENTIFIER).optional(),
}).strict().refine(
  (value) => Object.values(value).some((entry) => Boolean(entry)),
  'localized_copy must reference at least one content pack key',
).refine(
  (value) => Object.values(value).every((entry) => typeof entry !== 'string' || !containsProtectedTerm(entry)),
  'localized_copy cannot reference legal, financial, consent or transaction content',
).optional();

export const localizedContentPackInputSchema = z.object({
  market_code: z.string().trim().toLowerCase().regex(MARKET_CODE),
  surface: z.enum(LOCALIZED_CONTENT_SURFACES),
  pack_key: z.string().trim().toLowerCase().regex(IDENTIFIER),
  content_kind: z.enum(LOCALIZED_CONTENT_KINDS),
  locale: z.string().trim().regex(LOCALE),
  value: safeCopyText,
  effective_from: z.coerce.date().default(() => new Date()),
  effective_to: z.coerce.date().nullable().optional(),
}).strict().superRefine((value, context) => {
  const maxLength = LOCALIZED_CONTENT_MAX_LENGTHS[value.content_kind];
  if (value.value.length > maxLength) {
    context.addIssue({
      code: z.ZodIssueCode.too_big,
      origin: 'string',
      maximum: maxLength,
      inclusive: true,
      path: ['value'],
      message: `${value.content_kind} copy must be at most ${maxLength} characters`,
    });
  }
  if (containsProtectedTerm(value.pack_key)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pack_key'],
      message: 'Legal, financial, consent and transaction copy must use the approved versioned document/compliance path',
    });
  }
  if (value.effective_to && value.effective_to <= value.effective_from) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['effective_to'],
      message: 'effective_to must be later than effective_from',
    });
  }
});

export type LocalizedContentPackInput = z.infer<typeof localizedContentPackInputSchema>;

export type LocalizedContentPackRecord = {
  id: string;
  market_code: string;
  surface: LocalizedContentSurface;
  pack_key: string;
  content_kind: LocalizedContentKind;
  locale: string;
  value: string;
  revision: number;
  content_checksum: string;
  effective_from: string;
  effective_to: string | null;
  state: 'draft' | 'published' | 'superseded' | 'rolled_back';
  created_by: string | null;
  updated_by: string | null;
  published_by: string | null;
  published_at: string | null;
  rolled_back_by: string | null;
  rolled_back_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LocalizedContentPublicRecord = Pick<
  LocalizedContentPackRecord,
  'pack_key' | 'content_kind' | 'value' | 'revision' | 'content_checksum'
> & { requested_locale: string; resolved_locale: string };

export class LocalizedContentError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LocalizedContentError';
  }
}

type QueryResult<T = Record<string, unknown>> = { rows: T[] };
type Queryable = {
  query: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

const packSelect = `
  SELECT id, market_code, surface, pack_key, content_kind, locale, value,
         revision, content_checksum, effective_from, effective_to, state,
         created_by, updated_by, published_by, published_at,
         rolled_back_by, rolled_back_at, created_at, updated_at
    FROM localized_content_pack_revisions`;

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

const parseUuid = (value: unknown, field: string): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!UUID.test(normalized)) throw new LocalizedContentError('INVALID_LOCALIZED_CONTENT_ID', 400, `${field} must be a UUID`);
  return normalized.toLowerCase();
};

const parseInput = (body: unknown): LocalizedContentPackInput => {
  const parsed = localizedContentPackInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new LocalizedContentError(
      'INVALID_LOCALIZED_CONTENT_PACK',
      400,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  return {
    ...parsed.data,
    locale: normalizeLocale(parsed.data.locale),
    effective_to: parsed.data.effective_to ?? null,
  };
};

const rowToRecord = (row: Record<string, any>): LocalizedContentPackRecord => ({
  id: String(row.id),
  market_code: String(row.market_code),
  surface: row.surface as LocalizedContentSurface,
  pack_key: String(row.pack_key),
  content_kind: row.content_kind as LocalizedContentKind,
  locale: normalizeLocale(String(row.locale)),
  value: String(row.value),
  revision: Number(row.revision),
  content_checksum: String(row.content_checksum),
  effective_from: new Date(row.effective_from).toISOString(),
  effective_to: row.effective_to ? new Date(row.effective_to).toISOString() : null,
  state: row.state as LocalizedContentPackRecord['state'],
  created_by: row.created_by ? String(row.created_by) : null,
  updated_by: row.updated_by ? String(row.updated_by) : null,
  published_by: row.published_by ? String(row.published_by) : null,
  published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
  rolled_back_by: row.rolled_back_by ? String(row.rolled_back_by) : null,
  rolled_back_at: row.rolled_back_at ? new Date(row.rolled_back_at).toISOString() : null,
  created_at: new Date(row.created_at).toISOString(),
  updated_at: new Date(row.updated_at).toISOString(),
});

const assertMarketExists = async (client: Queryable, marketCode: string): Promise<void> => {
  const result = await client.query('SELECT market_code FROM market_configs WHERE market_code = $1 LIMIT 1', [marketCode]);
  if (!result.rows[0]) throw new LocalizedContentError('MARKET_NOT_CONFIGURED', 404, `Market '${marketCode}' is not configured`);
};

const lockPack = async (client: Queryable, input: Pick<LocalizedContentPackInput, 'market_code' | 'surface' | 'pack_key' | 'locale'>): Promise<void> => {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`${input.market_code}:${input.surface}:${input.pack_key}:${input.locale}`],
  );
};

const audit = async (
  client: Queryable,
  record: LocalizedContentPackRecord,
  action: string,
  actorId: string | null,
  reason: string | null,
  previousState: string | null,
  newState: string,
  correlationId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> => {
  await client.query(
    `INSERT INTO localized_content_pack_audit (
       revision_id, market_code, surface, pack_key, locale, revision, action,
       actor_id, reason, correlation_id, previous_state, new_state, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
    [
      record.id, record.market_code, record.surface, record.pack_key, record.locale,
      record.revision, action, actorId, reason, correlationId, previousState, newState, serialize(metadata),
    ],
  );
};

const contentChecksum = (input: LocalizedContentPackInput): string => createHash('sha256').update(JSON.stringify({
  market_code: input.market_code,
  surface: input.surface,
  pack_key: input.pack_key,
  content_kind: input.content_kind,
  locale: normalizeLocale(input.locale),
  value: input.value,
  effective_from: input.effective_from.toISOString(),
  effective_to: input.effective_to ? input.effective_to.toISOString() : null,
})).digest('hex');

export const parseLocalizedContentPackInput = parseInput;

export const createLocalizedContentPack = async (
  body: unknown,
  actorId: string,
  correlationId: string | null,
): Promise<LocalizedContentPackRecord> => {
  const input = parseInput(body);
  return withTransaction(async (client) => {
    await assertMarketExists(client, input.market_code);
    await lockPack(client, input);
    const draft = await client.query(`${packSelect} WHERE market_code = $1 AND surface = $2 AND pack_key = $3 AND locale = $4 AND state = 'draft' FOR UPDATE`, [
      input.market_code, input.surface, input.pack_key, input.locale,
    ]);
    if (draft.rows[0]) throw new LocalizedContentError('LOCALIZED_CONTENT_DRAFT_ALREADY_EXISTS', 409, 'A draft already exists for this content key and locale');
    const latest = await client.query<{ revision: number }>(
      'SELECT revision FROM localized_content_pack_revisions WHERE market_code = $1 AND surface = $2 AND pack_key = $3 AND locale = $4 ORDER BY revision DESC LIMIT 1 FOR UPDATE',
      [input.market_code, input.surface, input.pack_key, input.locale],
    );
    const revision = Number(latest.rows[0]?.revision ?? 0) + 1;
    const result = await client.query(
      `INSERT INTO localized_content_pack_revisions (
         market_code, surface, pack_key, content_kind, locale, value, revision,
         content_checksum, effective_from, effective_to, state, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, $11)
       RETURNING *`,
      [
        input.market_code, input.surface, input.pack_key, input.content_kind, input.locale,
        input.value, revision, contentChecksum(input), input.effective_from, input.effective_to, actorId,
      ],
    );
    const record = rowToRecord(result.rows[0]);
    await audit(client, record, 'draft_created', actorId, 'Localized content pack draft created', null, 'draft', correlationId);
    return record;
  });
};

export const updateLocalizedContentPackDraft = async (
  idValue: unknown,
  body: unknown,
  actorId: string,
  correlationId: string | null,
): Promise<LocalizedContentPackRecord> => {
  const id = parseUuid(idValue, 'content_pack_id');
  const input = parseInput(body);
  return withTransaction(async (client) => {
    const currentResult = await client.query(`${packSelect} WHERE id = $1 AND state = 'draft' FOR UPDATE`, [id]);
    if (!currentResult.rows[0]) throw new LocalizedContentError('LOCALIZED_CONTENT_DRAFT_NOT_FOUND', 404, 'Localized content draft was not found');
    const current = rowToRecord(currentResult.rows[0]);
    if (current.market_code !== input.market_code || current.surface !== input.surface || current.pack_key !== input.pack_key || current.locale !== input.locale) {
      throw new LocalizedContentError('LOCALIZED_CONTENT_SCOPE_IMMUTABLE', 409, 'Market, surface, pack key and locale cannot change on an existing draft');
    }
    const result = await client.query(
      `UPDATE localized_content_pack_revisions
          SET content_kind = $1, value = $2, content_checksum = $3,
              effective_from = $4, effective_to = $5, updated_by = $6, updated_at = NOW()
        WHERE id = $7 AND state = 'draft'
        RETURNING *`,
      [input.content_kind, input.value, contentChecksum(input), input.effective_from, input.effective_to, actorId, id],
    );
    const record = rowToRecord(result.rows[0]);
    await audit(client, record, 'draft_updated', actorId, 'Localized content pack draft updated', 'draft', 'draft', correlationId);
    return record;
  });
};

export const publishLocalizedContentPack = async (
  idValue: unknown,
  actorId: string,
  correlationId: string | null,
): Promise<LocalizedContentPackRecord> => {
  const id = parseUuid(idValue, 'content_pack_id');
  return withTransaction(async (client) => {
    const draftResult = await client.query(`${packSelect} WHERE id = $1 AND state = 'draft' FOR UPDATE`, [id]);
    if (!draftResult.rows[0]) throw new LocalizedContentError('LOCALIZED_CONTENT_DRAFT_NOT_FOUND', 404, 'Localized content draft was not found');
    const draft = rowToRecord(draftResult.rows[0]);
    const currentResult = await client.query(
      `${packSelect} WHERE market_code = $1 AND surface = $2 AND pack_key = $3 AND locale = $4 AND state = 'published' FOR UPDATE`,
      [draft.market_code, draft.surface, draft.pack_key, draft.locale],
    );
    const current = currentResult.rows[0] ? rowToRecord(currentResult.rows[0]) : null;
    if (current) {
      await client.query(
        `UPDATE localized_content_pack_revisions SET state = 'superseded', updated_by = $1, updated_at = NOW() WHERE id = $2 AND state = 'published'`,
        [actorId, current.id],
      );
      await audit(client, { ...current, state: 'superseded' }, 'superseded', actorId, 'Superseded by a newer localized content revision', 'published', 'superseded', correlationId, { replacement_revision: draft.revision });
    }
    const result = await client.query(
      `UPDATE localized_content_pack_revisions
          SET state = 'published', published_by = $1, published_at = NOW(), updated_by = $1, updated_at = NOW()
        WHERE id = $2 AND state = 'draft'
        RETURNING *`,
      [actorId, id],
    );
    const published = rowToRecord(result.rows[0]);
    await audit(client, published, 'published', actorId, 'Localized content pack published', 'draft', 'published', correlationId, { previous_revision: current?.revision ?? null });
    return published;
  });
};

export const listLocalizedContentPacks = async (filters: Record<string, unknown> = {}): Promise<LocalizedContentPackRecord[]> => {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (field: string, value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return;
    values.push(value.trim());
    clauses.push(`${field} = $${values.length}`);
  };
  add('market_code', filters.market_code);
  add('surface', filters.surface);
  add('pack_key', filters.pack_key);
  add('locale', typeof filters.locale === 'string' ? normalizeLocale(filters.locale) : filters.locale);
  add('state', filters.state);
  const result = await readDb.query(`${packSelect}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY market_code, surface, pack_key, locale, revision DESC LIMIT 500`, values);
  return result.rows.map(rowToRecord);
};

const selectPublishedRows = async (
  marketCode: string,
  surface: LocalizedContentSurface,
  keys: string[],
): Promise<LocalizedContentPackRecord[]> => {
  if (keys.length === 0) return [];
  const result = await readDb.query(
    `${packSelect}
       WHERE market_code = $1
         AND surface = $2
         AND pack_key = ANY($3::text[])
         AND state = 'published'
         AND effective_from <= NOW()
         AND (effective_to IS NULL OR effective_to > NOW())
       ORDER BY pack_key, revision DESC`,
    [marketCode, surface, keys],
  );
  return result.rows.map(rowToRecord);
};

const selectBestRecord = (
  rows: LocalizedContentPackRecord[],
  packKey: string,
  requestedLocale: string,
  marketDefaultLocale: string,
): LocalizedContentPackRecord | null => {
  const chain = localeFallbackChain(requestedLocale, marketDefaultLocale);
  const candidates = rows
    .filter((row) => row.pack_key === packKey)
    .sort((left, right) => right.revision - left.revision);
  for (const locale of chain) {
    const match = candidates.find((row) => normalizeLocale(row.locale) === locale);
    if (match) return match;
  }
  return null;
};

export const resolveLocalizedContentPack = async (request: {
  market_code: string;
  surface: LocalizedContentSurface;
  pack_key: string;
  requested_locale: string;
  market_default_locale?: string;
}): Promise<LocalizedContentPublicRecord | null> => {
  const marketCode = request.market_code.trim().toLowerCase();
  const packKey = request.pack_key.trim().toLowerCase();
  if (!MARKET_CODE.test(marketCode)) throw new LocalizedContentError('MARKET_CODE_REQUIRED', 400, 'market_code is invalid');
  if (!LOCALIZED_CONTENT_SURFACES.includes(request.surface)) throw new LocalizedContentError('INVALID_LOCALIZED_CONTENT_SURFACE', 400, 'surface is invalid');
  if (!IDENTIFIER.test(packKey) || containsProtectedTerm(packKey)) {
    throw new LocalizedContentError('LOCALIZED_CONTENT_KEY_NOT_ALLOWED', 400, 'This content key belongs to an approved legal/compliance path');
  }
  if (!LOCALE.test(request.requested_locale)) throw new LocalizedContentError('INVALID_LOCALIZED_CONTENT_LOCALE', 400, 'locale is invalid');
  let marketDefault = request.market_default_locale?.trim() || '';
  if (!marketDefault) {
    const marketResult = await readDb.query<{ default_locale: string }>('SELECT default_locale FROM market_configs WHERE market_code = $1 LIMIT 1', [marketCode]);
    marketDefault = marketResult.rows[0]?.default_locale || 'id-ID';
  }
  const rows = await selectPublishedRows(marketCode, request.surface, [packKey]);
  const selected = selectBestRecord(rows, packKey, request.requested_locale, marketDefault);
  if (!selected) return null;
  return {
    pack_key: selected.pack_key,
    content_kind: selected.content_kind,
    value: selected.value,
    revision: selected.revision,
    content_checksum: selected.content_checksum,
    requested_locale: normalizeLocale(request.requested_locale),
    resolved_locale: normalizeLocale(selected.locale),
  };
};

type ContentProperties = Record<string, unknown>;
type ContentSection = { id: string; component: string; properties: ContentProperties };

const collectReferences = (value: unknown, keys: Set<string>): void => {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectReferences(entry, keys));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const object = value as ContentProperties;
  const references = object.localized_copy;
  if (references && typeof references === 'object' && !Array.isArray(references)) {
    Object.values(references as ContentProperties).forEach((entry) => {
      if (typeof entry === 'string' && IDENTIFIER.test(entry)) keys.add(entry.toLowerCase());
    });
  }
  Object.entries(object).forEach(([key, entry]) => {
    if (key !== 'localized_copy') collectReferences(entry, keys);
  });
};

const applyReferences = (value: unknown, resolved: Map<string, LocalizedContentPackRecord>): unknown => {
  if (Array.isArray(value)) return value.map((entry) => applyReferences(entry, resolved));
  if (!value || typeof value !== 'object') return value;
  const object = value as ContentProperties;
  const output: ContentProperties = {};
  for (const [key, entry] of Object.entries(object)) {
    if (key === 'localized_copy') {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        for (const [field, reference] of Object.entries(entry as ContentProperties)) {
          if (typeof reference !== 'string') continue;
          const record = resolved.get(reference.toLowerCase());
          // Missing content is omitted; the original key is never emitted.
          if (record) output[field] = record.value;
        }
      }
      continue;
    }
    output[key] = applyReferences(entry, resolved);
  }
  return output;
};

export const resolveLocalizedContentReferences = async (request: {
  market_code: string;
  surface: LocalizedContentSurface;
  requested_locale: string;
  market_default_locale: string;
  sections: ContentSection[];
}): Promise<{ sections: ContentSection[]; resolved: Record<string, { locale: string; revision: number; checksum: string }> }> => {
  const keys = new Set<string>();
  collectReferences(request.sections, keys);
  if (keys.size === 0) return { sections: request.sections, resolved: {} };
  const rows = await selectPublishedRows(request.market_code, request.surface, [...keys]);
  const resolved = new Map<string, LocalizedContentPackRecord>();
  keys.forEach((key) => {
    const record = selectBestRecord(rows, key, request.requested_locale, request.market_default_locale);
    if (record) resolved.set(key, record);
  });
  const metadata = [...resolved.entries()].reduce<Record<string, { locale: string; revision: number; checksum: string }>>((result, [key, record]) => {
    result[key] = { locale: normalizeLocale(record.locale), revision: record.revision, checksum: record.content_checksum };
    return result;
  }, {});
  return {
    sections: applyReferences(request.sections, resolved) as ContentSection[],
    resolved: metadata,
  };
};
