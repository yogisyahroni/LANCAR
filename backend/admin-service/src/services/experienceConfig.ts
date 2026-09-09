import { createHash, createHmac, randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { db, readDb } from '../db';
import {
  localizedCopyReferenceSchema,
  localeFallbackChain,
  resolveLocalizedContentReferences,
} from './localizedContent';

export const EXPERIENCE_SURFACES = [
  'customer_android',
  'customer_web',
  'merchant_android',
  'courier_android',
] as const;

export type ExperienceSurface = (typeof EXPERIENCE_SURFACES)[number];
export type ExperienceManifestState = 'draft' | 'published' | 'superseded' | 'rolled_back';
export type ExperienceApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';
export type ExperienceCachePolicy = 'no-store' | 'private' | 'public';
export type ExperienceComponent =
  | 'hero_banner'
  | 'campaign_strip'
  | 'promo_carousel'
  | 'service_grid'
  | 'info_card'
  | 'quick_actions'
  | 'notice'
  | 'spacer'
  | 'campaign_intro'
  | 'design_tokens';

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

// External CTA destinations are intentionally build/platform-owned. A
// campaign author may choose a URL on these first-party hosts, but may not
// expand the trust boundary through the remote manifest itself.
export const EXPERIENCE_EXTERNAL_HOSTS = [
  'bawain.my.id',
  'www.bawain.my.id',
  'app.bawain.my.id',
] as const;

const PROTECTED_KEYS = [
  'amount', 'authorization', 'commission', 'currency', 'delivery_status',
  'eligibility', 'financial', 'order_state', 'payment', 'payout', 'price',
  'provider', 'refund', 'risk', 'settlement', 'state_machine', 'tax',
  'total', 'transaction',
];

const MAX_EXPERIENCE_MANIFEST_BYTES = 96 * 1024;
const MAX_EXPERIENCE_COMPONENT_BYTES = 8 * 1024;

export type ExperienceValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type ExperienceAuditContext = {
  requestId?: string | null;
  actorRole?: string | null;
};

export type ExperienceExpectedVersion = {
  revision?: number | null;
  checksum?: string | null;
};

const text = (max: number) => z.string().trim().min(1).max(max).refine(
  (value) => !/[<>]|javascript:|data:text\/html/i.test(value),
  'HTML, executable URLs, and unsafe markup are not allowed',
);

const identifier = z.string().trim().toLowerCase().regex(IDENTIFIER);
const locale = z.string().trim().regex(LOCALE);
const semver = z.string().trim().regex(SEMVER);
const scheduleTimezone = z.string().trim().refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'schedule_timezone must be a valid IANA timezone');

const LOCAL_SCHEDULE_DATE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const EXPLICIT_TIMEZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

type LocalScheduleParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const timeZoneParts = (date: Date, timeZone: string): LocalScheduleParts => {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(formatted
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    millisecond: date.getUTCMilliseconds(),
  };
};

const parseLocalScheduleParts = (value: string): LocalScheduleParts | null => {
  const match = LOCAL_SCHEDULE_DATE.exec(value.trim());
  if (!match) return null;
  const parts: LocalScheduleParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
    millisecond: Number((match[7] || '').padEnd(3, '0') || 0),
  };
  const calendarValue = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  ));
  if (calendarValue.getUTCFullYear() !== parts.year
      || calendarValue.getUTCMonth() !== parts.month - 1
      || calendarValue.getUTCDate() !== parts.day
      || calendarValue.getUTCHours() !== parts.hour
      || calendarValue.getUTCMinutes() !== parts.minute
      || calendarValue.getUTCSeconds() !== parts.second
      || calendarValue.getUTCMilliseconds() !== parts.millisecond) {
    return null;
  }
  return parts;
};

const sameScheduleParts = (left: LocalScheduleParts, right: LocalScheduleParts): boolean =>
  left.year === right.year
  && left.month === right.month
  && left.day === right.day
  && left.hour === right.hour
  && left.minute === right.minute
  && left.second === right.second
  && left.millisecond === right.millisecond;

const timeZoneOffsetMillis = (date: Date, timeZone: string): number => {
  const parts = timeZoneParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond)
    - date.getTime();
};

const localScheduleToUtc = (value: string, timeZone: string): string => {
  const parts = parseLocalScheduleParts(value);
  if (!parts) throw new ExperienceManifestError('INVALID_EXPERIENCE_SCHEDULE', 400, 'Schedule timestamps must be valid ISO date-times');
  const localAsUtcMillis = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  let utcMillis = localAsUtcMillis;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    utcMillis = localAsUtcMillis - timeZoneOffsetMillis(new Date(utcMillis), timeZone);
  }
  const resolved = new Date(utcMillis);
  if (!sameScheduleParts(timeZoneParts(resolved, timeZone), parts)) {
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_SCHEDULE',
      400,
      `Schedule timestamp '${value}' does not exist in ${timeZone}`,
    );
  }
  return resolved.toISOString();
};

const normalizeScheduleInput = (body: unknown): unknown => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const raw = body as Record<string, unknown>;
  const timezone = typeof raw.schedule_timezone === 'string' ? raw.schedule_timezone.trim() : 'UTC';
  if (!scheduleTimezone.safeParse(timezone).success) return body;
  const normalized = { ...raw };
  for (const field of ['starts_at', 'ends_at'] as const) {
    const value = raw[field];
    if (typeof value === 'string' && !EXPLICIT_TIMEZONE.test(value.trim())) {
      normalized[field] = localScheduleToUtc(value, timezone);
    }
  }
  return normalized;
};

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

const safeExternalUrl = z.string().trim().max(2048).refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && EXPERIENCE_EXTERNAL_HOSTS.includes(parsed.hostname.toLowerCase() as (typeof EXPERIENCE_EXTERNAL_HOSTS)[number])
      && !parsed.username
      && !parsed.password
      && (!parsed.port || parsed.port === '443')
      && !parsed.hash
      && !parsed.pathname.includes('..')
      && !/%2e/i.test(parsed.pathname);
  } catch {
    return false;
  }
}, 'External URL must be HTTPS on an allowlisted first-party host');

const MAX_EXPERIENCE_ASSET_BYTES = 5 * 1024 * 1024;
const EXPERIENCE_ASSET_CONTENT_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
]);
const EXPERIENCE_ASSET_CACHE_POLICIES = ['no-store', 'private', 'public'] as const;
const experienceAssetVersion = z.string().trim().max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/);

const targetingSchema = z.object({
  cohorts: z.array(identifier).max(50).default([]),
  market_codes: z.array(identifier).max(50).default([]),
  city_codes: z.array(identifier).max(100).default([]),
  zone_codes: z.array(identifier).max(100).default([]),
  locales: z.array(locale).max(20).default([]),
  service_usage_cohorts: z.array(identifier).max(50).default([]),
  user_status: z.enum(['new', 'existing']).nullable().optional(),
  roles: z.array(z.enum(['customer', 'merchant', 'courier'])).max(3).default([]),
  experiment_ref: identifier.nullable().optional(),
  experiment_assignments: z.array(identifier).max(50).default([]),
}).strict();

const hasTargetingConstraints = (targeting: z.infer<typeof targetingSchema>): boolean => {
  const normalizedTargeting = targetingSchema.parse(targeting);
  return normalizedTargeting.market_codes.length > 0
    || normalizedTargeting.city_codes.length > 0
    || normalizedTargeting.zone_codes.length > 0
    || normalizedTargeting.locales.length > 0
    || normalizedTargeting.service_usage_cohorts.length > 0
    || normalizedTargeting.user_status != null
    || normalizedTargeting.roles.length > 0
    || normalizedTargeting.cohorts.length > 0
    || normalizedTargeting.experiment_ref != null
    || normalizedTargeting.experiment_assignments.length > 0;
};

const assetReferenceSchema = z.object({
  asset_id: identifier,
  uri: safeResourceUri,
  kind: z.enum(['image', 'animation', 'icon', 'video']),
  checksum: z.string().trim().regex(SHA256),
  content_type: z.string().trim().toLowerCase().optional(),
  width: z.coerce.number().int().min(1).max(4096).nullable().optional(),
  height: z.coerce.number().int().min(1).max(4096).nullable().optional(),
  aspect_ratio: z.coerce.number().finite().min(0.1).max(20).nullable().optional(),
  size_limit_bytes: z.coerce.number().int().min(1).max(MAX_EXPERIENCE_ASSET_BYTES).optional(),
  version: experienceAssetVersion.optional(),
  expires_at: z.coerce.date().nullable().optional(),
  cache_policy: z.enum(EXPERIENCE_ASSET_CACHE_POLICIES).optional(),
  retention_until: z.coerce.date().nullable().optional(),
  fallback_asset_id: identifier.nullable().optional(),
}).strict().superRefine((asset, context) => {
  if (asset.content_type && !EXPERIENCE_ASSET_CONTENT_TYPES.has(asset.content_type)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['content_type'], message: 'Asset content_type is not allowlisted' });
  }
  if (asset.content_type && ['image', 'animation', 'icon'].includes(asset.kind) && !asset.content_type.startsWith('image/')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['content_type'], message: `${asset.kind} assets must use an image content type` });
  }
  if (asset.content_type?.startsWith('image/') && asset.kind === 'video') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['content_type'], message: 'Video assets must use a video content type' });
  }
  if (asset.content_type?.startsWith('video/') && asset.kind !== 'video') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['content_type'], message: 'Video content_type requires kind=video' });
  }
  if ((asset.width == null) !== (asset.height == null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: 'width and height must be provided together' });
  }
  if (asset.width && asset.height && asset.aspect_ratio
    && Math.abs((asset.width / asset.height) - asset.aspect_ratio) > 0.02) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['aspect_ratio'], message: 'aspect_ratio must match declared dimensions' });
  }
  if (asset.retention_until && asset.expires_at && asset.retention_until.getTime() < asset.expires_at.getTime()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['retention_until'], message: 'retention_until must not precede expires_at' });
  }
});

const ctaFields = {
  cta_label: text(80).optional(),
  deep_link: safeDeepLink.optional(),
  external_url: safeExternalUrl.optional(),
};

const placementSchema = z.enum(['hero', 'header', 'carousel', 'campaign_strip']);

const promoItemSchema = z.object({
  id: identifier,
  campaign_id: identifier.optional(),
  campaign_name: text(160).optional(),
  title: text(120).optional(),
  body: text(500).optional(),
  badge: text(40).optional(),
  alt_label: text(160).optional(),
  image_asset_id: identifier.optional(),
  localized_copy: localizedCopyReferenceSchema,
  ...ctaFields,
}).strict().refine(
  (value) => Boolean(value.title || value.localized_copy?.title),
  'Promo item requires title or localized_copy.title',
).refine(
  (value) => !(value.deep_link && value.external_url),
  'Promo item must contain only one CTA target',
);

const quickActionSchema = z.object({
  id: identifier,
  label: text(80).optional(),
  icon_asset_id: identifier.optional(),
  deep_link: safeDeepLink,
  localized_copy: localizedCopyReferenceSchema,
}).strict().refine(
  (value) => Boolean(value.label || value.localized_copy?.label),
  'Quick action requires label or localized_copy.label',
);

const serviceGridCardSchema = z.object({
  code: identifier,
  subtitle: text(160).optional(),
  badge: text(32).optional(),
}).strict();

const runtimeDesignTokenPalette = {
  accent: {
    brand: { light: '#003A20', dark: '#1A7A4C', onLight: '#FFFFFF', onDark: '#F4F7F5' },
    campaign_orange: { light: '#F97316', dark: '#FB923C', onLight: '#1A0E00', onDark: '#0B120E' },
    campaign_blue: { light: '#2563EB', dark: '#60A5FA', onLight: '#FFFFFF', onDark: '#0B120E' },
  },
  background: {
    surface: { light: '#FFFFFF', dark: '#142019', onLight: '#14211A', onDark: '#F4F7F5' },
    brand_soft: { light: '#E8F5EE', dark: '#0D3322', onLight: '#14211A', onDark: '#F4F7F5' },
    accent_soft: { light: '#FFF1E6', dark: '#3D2414', onLight: '#14211A', onDark: '#F4F7F5' },
  },
} as const;

const relativeLuminance = (hex: string): number => {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
};

const contrastRatio = (foreground: string, background: string): number => {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
};

const designTokensSchema = z.object({
  accent_preset: z.enum(['brand', 'campaign_orange', 'campaign_blue']).default('brand'),
  background_preset: z.enum(['surface', 'brand_soft', 'accent_soft']).default('surface'),
  corner_preset: z.enum(['compact', 'standard', 'emphasized']).default('standard'),
  spacing_preset: z.enum(['compact', 'standard', 'relaxed']).default('standard'),
  badge_preset: z.enum(['hidden', 'label', 'pill']).default('pill'),
}).strict().superRefine((tokens, context) => {
  const accent = runtimeDesignTokenPalette.accent[tokens.accent_preset];
  const background = runtimeDesignTokenPalette.background[tokens.background_preset];
  const ratios = [
    contrastRatio(accent.onLight, accent.light),
    contrastRatio(accent.onDark, accent.dark),
    contrastRatio(background.onLight, background.light),
    contrastRatio(background.onDark, background.dark),
  ];
  if (ratios.some((ratio) => ratio < 4.5)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Design token presets must preserve WCAG AA contrast of at least 4.5:1',
    });
  }
});

const componentSchemas: Record<ExperienceComponent, z.ZodTypeAny> = {
  hero_banner: z.object({
    campaign_id: identifier.optional(),
    campaign_name: text(160).optional(),
    placement: placementSchema.optional(),
    title: text(120).optional(),
    body: text(500).optional(),
    badge: text(40).optional(),
    alt_label: text(160).optional(),
    image_asset_id: identifier.optional(),
    frequency_cap_hours: z.coerce.number().int().min(0).max(720).optional(),
    max_impressions: z.coerce.number().int().min(1).max(100).optional(),
    localized_copy: localizedCopyReferenceSchema,
    ...ctaFields,
  }).strict().refine(
    (value) => Boolean(value.title || value.localized_copy?.title),
    'Hero banner requires title or localized_copy.title',
  ).refine(
    (value) => !value.placement || value.placement === 'hero' || value.placement === 'header',
    { path: ['placement'], message: 'Hero banner placement must be hero or header' },
  ),
  campaign_strip: z.object({
    campaign_id: identifier.optional(),
    campaign_name: text(160).optional(),
    placement: placementSchema.optional(),
    title: text(120).optional(),
    body: text(320).optional(),
    badge: text(40).optional(),
    alt_label: text(160).optional(),
    image_asset_id: identifier.optional(),
    frequency_cap_hours: z.coerce.number().int().min(0).max(720).optional(),
    max_impressions: z.coerce.number().int().min(1).max(100).optional(),
    localized_copy: localizedCopyReferenceSchema,
    ...ctaFields,
  }).strict().refine(
    (value) => Boolean(value.title || value.localized_copy?.title),
    'Campaign strip requires title or localized_copy.title',
  ).refine(
    (value) => !value.placement || value.placement === 'campaign_strip',
    { path: ['placement'], message: 'Campaign strip placement must be campaign_strip' },
  ),
  promo_carousel: z.object({
    campaign_name: text(160).optional(),
    placement: placementSchema.optional(),
    frequency_cap_hours: z.coerce.number().int().min(0).max(720).optional(),
    max_impressions: z.coerce.number().int().min(1).max(100).optional(),
    items: z.array(promoItemSchema).min(1).max(10),
  }).strict().refine(
    (value) => !value.placement || value.placement === 'carousel',
    { path: ['placement'], message: 'Promo carousel placement must be carousel' },
  ),
  service_grid: z.object({
    title: text(120).optional(),
    localized_copy: localizedCopyReferenceSchema,
    service_codes: z.array(identifier).min(1).max(20).optional(),
    cards: z.array(serviceGridCardSchema).min(1).max(20).optional(),
    display_mode: z.enum(['compact', 'cards']).default('cards'),
  }).strict().refine(
    (value) => (value.service_codes?.length ?? 0) > 0 || (value.cards?.length ?? 0) > 0,
    'service_grid requires service_codes or cards',
  ),
  info_card: z.object({
    title: text(120).optional(),
    body: text(700).optional(),
    icon_asset_id: identifier.optional(),
    deep_link: safeDeepLink.optional(),
    localized_copy: localizedCopyReferenceSchema,
  }).strict().refine(
    (value) => Boolean(value.title || value.localized_copy?.title),
    'Info card requires title or localized_copy.title',
  ).refine(
    (value) => Boolean(value.body || value.localized_copy?.body),
    'Info card requires body or localized_copy.body',
  ),
  quick_actions: z.object({
    actions: z.array(quickActionSchema).min(1).max(8),
  }).strict(),
  notice: z.object({
    title: text(120).optional(),
    body: text(500).optional(),
    localized_copy: localizedCopyReferenceSchema,
    ...ctaFields,
  }).strict().refine(
    (value) => Boolean(value.title || value.localized_copy?.title),
    'Notice requires title or localized_copy.title',
  ),
  spacer: z.object({
    size: z.enum(['small', 'medium', 'large']).default('medium'),
  }).strict(),
  campaign_intro: z.object({
    enabled: z.boolean().default(true),
    campaign_id: identifier,
    title: text(120).optional(),
    body: text(500).optional(),
    media_asset_id: identifier.optional(),
    localized_copy: localizedCopyReferenceSchema,
    frequency_cap_hours: z.coerce.number().int().min(0).max(720).default(24),
    max_impressions: z.coerce.number().int().min(1).max(100).default(1),
    dismissible: z.boolean().default(true),
    skippable: z.boolean().default(true),
  }).strict().refine(
    (value) => Boolean(value.title || value.localized_copy?.title),
    'Campaign intro requires title or localized_copy.title',
  ),
  design_tokens: designTokensSchema,
};

const componentValues = new Set<string>(Object.keys(componentSchemas));

/**
 * A manifest is resolved per surface, but a shared component registry alone
 * is not enough: it would let a merchant/courier revision accidentally carry
 * customer-home-only sections. Keep the policy explicit at the contract
 * boundary and let each native renderer own its surface-appropriate UI.
 */
export const EXPERIENCE_SURFACE_COMPONENTS: Record<ExperienceSurface, readonly ExperienceComponent[]> = {
  customer_android: [
    'hero_banner', 'campaign_strip', 'promo_carousel', 'service_grid', 'info_card',
    'quick_actions', 'notice', 'spacer', 'campaign_intro', 'design_tokens',
  ],
  customer_web: [
    'hero_banner', 'campaign_strip', 'promo_carousel', 'service_grid', 'info_card',
    'quick_actions', 'notice', 'spacer', 'campaign_intro', 'design_tokens',
  ],
  merchant_android: ['campaign_strip', 'info_card', 'quick_actions', 'notice', 'spacer', 'design_tokens'],
  courier_android: ['campaign_strip', 'info_card', 'quick_actions', 'notice', 'spacer', 'design_tokens'],
};

export const experienceManifestInputSchema = z.object({
  schema_version: z.coerce.number().int().min(1).max(10).default(1),
  market_code: z.string().trim().toLowerCase().regex(MARKET_CODE),
  locale,
  surface: z.enum(EXPERIENCE_SURFACES),
  min_app_version: semver,
  max_app_version: semver.nullable().optional(),
  starts_at: z.coerce.date().default(() => new Date()),
  ends_at: z.coerce.date().nullable().optional(),
  schedule_timezone: scheduleTimezone.default('UTC'),
  rollout_stage: z.enum(['canary', 'public']).default('public'),
  canary_cohort: identifier.nullable().optional(),
  rollout_percentage: z.coerce.number().int().min(0).max(100).default(100),
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
  enabled?: boolean;
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
  schedule_timezone: string;
  rollout_stage: 'canary' | 'public';
  canary_cohort: string | null;
  rollout_percentage: number;
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
  requires_approval: boolean;
  approval_status: ExperienceApprovalStatus;
  approval_requested_by: string | null;
  approval_requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  kill_switch_active: boolean;
  kill_switched_by: string | null;
  kill_switched_at: string | null;
  kill_switch_reason: string | null;
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
  schedule_timezone: string;
  ttl_seconds: number;
  cache_policy: ExperienceCachePolicy;
  sections: ExperienceSection[];
  asset_references: ExperienceAssetReference[];
  checksum: string;
  signature: string | null;
};

export type ExperienceManifestCandidate = Pick<ExperienceManifestRecord, 'manifest_id' | 'revision' | 'schema_version' | 'market_code' | 'locale' | 'surface' | 'min_app_version' | 'max_app_version' | 'starts_at' | 'ends_at' | 'schedule_timezone' | 'rollout_stage' | 'canary_cohort' | 'rollout_percentage' | 'ttl_seconds' | 'cache_policy' | 'targeting' | 'sections' | 'asset_references' | 'checksum' | 'signature'> & {
  default_locale?: string;
  kill_switch_active?: boolean;
};

export class ExperienceManifestError extends Error {
  public readonly issues: ExperienceValidationIssue[];

  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly reasonCodes: string[] = [],
    issues: ExperienceValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ExperienceManifestError';
    this.issues = issues.length > 0 ? issues : [{ path: '$', code, message }];
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

const parseComponent = (value: unknown, index: number, surface: ExperienceSurface): ExperienceSection => {
  const section = jsonObject(value, `sections[${index}]`);
  const id = typeof section.id === 'string' ? section.id.trim().toLowerCase() : '';
  const component = typeof section.component === 'string' ? section.component.trim().toLowerCase() : '';
  const enabled = section.enabled;
  if (!IDENTIFIER.test(id)) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_SECTION', 400, `sections[${index}].id is invalid`);
  }
  if (!componentValues.has(component)) {
    throw new ExperienceManifestError('EXPERIENCE_COMPONENT_NOT_ALLOWED', 400, `sections[${index}].component is not allowlisted`);
  }
  if (!EXPERIENCE_SURFACE_COMPONENTS[surface].includes(component as ExperienceComponent)) {
    throw new ExperienceManifestError(
      'EXPERIENCE_COMPONENT_NOT_ALLOWED_FOR_SURFACE',
      400,
      `sections[${index}].component '${component}' is not allowed on ${surface}`,
    );
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_SECTION', 400, `sections[${index}].enabled must be a boolean`);
  }
  const properties = jsonObject(section.properties, `sections[${index}].properties`);
  const parsed = componentSchemas[component as ExperienceComponent].safeParse(properties);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: `sections[${index}].properties${issue.path.length ? `.${issue.path.join('.')}` : ''}`,
      code: issue.code,
      message: issue.message,
    }));
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_COMPONENT_PROPERTIES',
      400,
      issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
      [],
      issues,
    );
  }
  const parsedProperties = parsed.data as JsonObject;
  if (Buffer.byteLength(JSON.stringify(parsedProperties), 'utf8') > MAX_EXPERIENCE_COMPONENT_BYTES) {
    throw new ExperienceManifestError(
      'EXPERIENCE_COMPONENT_TOO_LARGE',
      400,
      `sections[${index}].properties exceeds the ${MAX_EXPERIENCE_COMPONENT_BYTES}-byte component limit`,
    );
  }
  if (typeof parsedProperties.deep_link === 'string' && typeof parsedProperties.external_url === 'string') {
    throw new ExperienceManifestError(
      'EXPERIENCE_MULTIPLE_CTA_TARGETS',
      400,
      `sections[${index}].properties must contain only one CTA target`,
    );
  }
  return {
    id,
    component: component as ExperienceComponent,
    ...(enabled === undefined ? {} : { enabled }),
    properties: parsed.data as JsonObject,
  };
};

const parseSections = (value: unknown, surface: ExperienceSurface): ExperienceSection[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_SECTIONS',
      400,
      'sections must contain 1 to 20 entries',
      [],
      [{ path: 'sections', code: 'invalid_length', message: 'sections must contain 1 to 20 entries' }],
    );
  }
  const seen = new Set<string>();
  const sections = value.map((item, index) => {
    const section = parseComponent(item, index, surface);
    if (seen.has(section.id)) {
      throw new ExperienceManifestError('DUPLICATE_EXPERIENCE_SECTION', 400, `section id '${section.id}' is duplicated`);
    }
    seen.add(section.id);
    return section;
  });
  if (!sections.some((section) => section.enabled !== false)) {
    throw new ExperienceManifestError(
      'NO_ENABLED_EXPERIENCE_SECTION',
      400,
      'At least one experience section must remain enabled',
    );
  }
  return sections;
};

const parseTargeting = (value: unknown): z.infer<typeof targetingSchema> => {
  const parsed = targetingSchema.safeParse(value ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: `targeting.${issue.path.join('.') || '$'}`,
      code: issue.code,
      message: issue.message,
    }));
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_TARGETING',
      400,
      issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
      [],
      issues,
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
      const issues = parsed.error.issues.map((issue) => ({
        path: `asset_references[${index}]${issue.path.length ? `.${issue.path.join('.')}` : ''}`,
        code: issue.code,
        message: issue.message,
      }));
      throw new ExperienceManifestError(
        'INVALID_EXPERIENCE_ASSET',
        400,
        issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
        [],
        issues,
      );
    }
    if (seen.has(parsed.data.asset_id)) {
      throw new ExperienceManifestError('DUPLICATE_EXPERIENCE_ASSET', 400, `asset '${parsed.data.asset_id}' is duplicated`);
    }
    seen.add(parsed.data.asset_id);
    return parsed.data;
  });
};

const defaultAssetContentType = (kind: ExperienceAssetReference['kind']): string => {
  if (kind === 'video') return 'video/mp4';
  if (kind === 'animation') return 'image/gif';
  return 'image/webp';
};

// New revisions persist a complete asset delivery contract. Reads remain
// backwards compatible with older JSONB rows whose optional metadata is absent.
const normalizeAssetReferencesForInput = (assets: ExperienceAssetReference[]): ExperienceAssetReference[] => assets.map((asset) => ({
  ...asset,
  content_type: asset.content_type || defaultAssetContentType(asset.kind),
  width: asset.width ?? null,
  height: asset.height ?? null,
  aspect_ratio: asset.aspect_ratio ?? (asset.width && asset.height ? asset.width / asset.height : null),
  size_limit_bytes: asset.size_limit_bytes ?? MAX_EXPERIENCE_ASSET_BYTES,
  version: asset.version || '1',
  expires_at: asset.expires_at ?? null,
  cache_policy: asset.cache_policy || 'private',
  retention_until: asset.retention_until ?? null,
  fallback_asset_id: asset.fallback_asset_id ?? null,
}));

export const validateExperienceAsset = (value: unknown): ExperienceAssetReference => {
  const parsed = normalizeAssetReferencesForInput(parseAssets([value]));
  return parsed[0];
};

export const validateExperienceDeepLink = (value: unknown): string => {
  const parsed = safeDeepLink.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: 'deep_link',
      code: issue.code,
      message: issue.message,
    }));
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_DEEP_LINK',
      400,
      issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
      [],
      issues,
    );
  }
  return parsed.data;
};

const parseUuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !UUID.test(value.trim())) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_MANIFEST_ID', 400, `${field} must be a UUID`);
  }
  return value.trim().toLowerCase();
};

const parseInput = (body: unknown): ExperienceManifestInput => {
  const parsed = experienceManifestInputSchema.safeParse(normalizeScheduleInput(body));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.') || '$',
      code: issue.code,
      message: issue.message,
    }));
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_MANIFEST',
      400,
      issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
      [],
      issues,
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
  const canaryCohort = input.canary_cohort ?? null;
  if (input.rollout_stage === 'canary' && !canaryCohort) {
    throw new ExperienceManifestError('EXPERIENCE_CANARY_COHORT_REQUIRED', 400, 'canary_cohort is required for a canary rollout');
  }
  if (input.rollout_stage === 'public' && canaryCohort) {
    throw new ExperienceManifestError('EXPERIENCE_CANARY_COHORT_INVALID', 400, 'canary_cohort is only valid for a canary rollout');
  }
  const normalized: ExperienceManifestInput = {
    ...input,
    locale: normalizedLocale,
    max_app_version: maxVersion,
    ends_at: endsAt,
    canary_cohort: canaryCohort,
    targeting: parseTargeting(input.targeting),
    sections: parseSections(input.sections, input.surface),
    asset_references: normalizeAssetReferencesForInput(parseAssets(input.asset_references)),
  };
  rejectProtectedKeys({ targeting: normalized.targeting, sections: normalized.sections, asset_references: normalized.asset_references });
  validateAssetReferences(normalized.sections, normalized.asset_references);
  const payloadBytes = Buffer.byteLength(JSON.stringify(normalized), 'utf8');
  if (payloadBytes > MAX_EXPERIENCE_MANIFEST_BYTES) {
    throw new ExperienceManifestError(
      'EXPERIENCE_MANIFEST_TOO_LARGE',
      400,
      `Manifest payload exceeds the ${MAX_EXPERIENCE_MANIFEST_BYTES}-byte limit`,
    );
  }
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
  const invalidFallback = assets.find((asset) => asset.fallback_asset_id && (
    asset.fallback_asset_id === asset.asset_id || !assetIds.has(asset.fallback_asset_id)
  ));
  if (invalidFallback) {
    throw new ExperienceManifestError(
      'EXPERIENCE_ASSET_FALLBACK_NOT_DECLARED',
      400,
      `Fallback asset for '${invalidFallback.asset_id}' must reference another declared asset`,
    );
  }
  const incompatibleFallback = assets.find((asset) => {
    const fallback = asset.fallback_asset_id ? assets.find((candidate) => candidate.asset_id === asset.fallback_asset_id) : null;
    if (!fallback) return false;
    const imageFamily = new Set(['image', 'animation', 'icon']);
    return imageFamily.has(asset.kind) !== imageFamily.has(fallback.kind);
  });
  if (incompatibleFallback) {
    throw new ExperienceManifestError(
      'EXPERIENCE_ASSET_FALLBACK_KIND_MISMATCH',
      400,
      `Fallback asset for '${incompatibleFallback.asset_id}' must use the same media family`,
    );
  }
  const fallbackCycle = assets.some((asset) => {
    const fallback = asset.fallback_asset_id ? assets.find((candidate) => candidate.asset_id === asset.fallback_asset_id) : null;
    return Boolean(fallback?.fallback_asset_id === asset.asset_id);
  });
  if (fallbackCycle) {
    throw new ExperienceManifestError('EXPERIENCE_ASSET_FALLBACK_CYCLE', 400, 'Asset fallbacks must not form a cycle');
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
  if (value instanceof Date) return value.toISOString();
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
  schedule_timezone: string;
  rollout_stage: 'canary' | 'public';
  canary_cohort: string | null;
  rollout_percentage?: number;
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
  schedule_timezone: input.schedule_timezone,
  rollout_stage: input.rollout_stage,
  canary_cohort: input.canary_cohort,
  rollout_percentage: input.rollout_percentage ?? 100,
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
         min_app_version, max_app_version, starts_at, ends_at, schedule_timezone,
         rollout_stage, canary_cohort, rollout_percentage, ttl_seconds,
         cache_policy, targeting, sections, asset_references, content_checksum,
         signature, state, created_by, updated_by, published_by, published_at,
         rolled_back_by, rolled_back_at, created_at, updated_at,
         requires_approval, approval_status, approval_requested_by, approval_requested_at,
         approved_by, approved_at, kill_switch_active, kill_switched_by,
         kill_switched_at, kill_switch_reason
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
  schedule_timezone: String(row.schedule_timezone || 'UTC'),
  rollout_stage: row.rollout_stage === 'canary' ? 'canary' : 'public',
  canary_cohort: row.canary_cohort ? String(row.canary_cohort) : null,
  rollout_percentage: Number(row.rollout_percentage ?? 100),
  ttl_seconds: Number(row.ttl_seconds),
  cache_policy: row.cache_policy as ExperienceCachePolicy,
  targeting: parseTargeting(row.targeting),
  sections: parseSections(row.sections, row.surface as ExperienceSurface),
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
  requires_approval: Boolean(row.requires_approval),
  approval_status: row.approval_status === 'approved'
    ? 'approved'
    : row.approval_status === 'pending'
      ? 'pending'
      : row.approval_status === 'rejected' ? 'rejected' : 'not_required',
  approval_requested_by: row.approval_requested_by ? String(row.approval_requested_by) : null,
  approval_requested_at: row.approval_requested_at ? new Date(row.approval_requested_at).toISOString() : null,
  approved_by: row.approved_by ? String(row.approved_by) : null,
  approved_at: row.approved_at ? new Date(row.approved_at).toISOString() : null,
  kill_switch_active: Boolean(row.kill_switch_active),
  kill_switched_by: row.kill_switched_by ? String(row.kill_switched_by) : null,
  kill_switched_at: row.kill_switched_at ? new Date(row.kill_switched_at).toISOString() : null,
  kill_switch_reason: row.kill_switch_reason ? String(row.kill_switch_reason) : null,
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
  schedule_timezone: manifest.schedule_timezone || 'UTC',
  rollout_stage: manifest.rollout_stage || 'public',
  canary_cohort: manifest.canary_cohort ?? null,
  rollout_percentage: manifest.rollout_percentage ?? 100,
  ttl_seconds: manifest.ttl_seconds,
  cache_policy: manifest.cache_policy,
  targeting: manifest.targeting,
  sections: manifest.sections,
  asset_references: manifest.asset_references,
  signature: manifest.signature ?? null,
  state: manifest.state,
  requires_approval: manifest.requires_approval ?? false,
  approval_status: manifest.approval_status ?? 'not_required',
  approval_requested_by: manifest.approval_requested_by ?? null,
  approval_requested_at: manifest.approval_requested_at ?? null,
  approved_by: manifest.approved_by ?? null,
  approved_at: manifest.approved_at ?? null,
  kill_switch_active: manifest.kill_switch_active ?? false,
  kill_switched_by: manifest.kill_switched_by ?? null,
  kill_switched_at: manifest.kill_switched_at ?? null,
  kill_switch_reason: manifest.kill_switch_reason ?? null,
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
  context: ExperienceAuditContext = {},
): Promise<void> => {
  const hasPreviousRevision = Object.prototype.hasOwnProperty.call(metadata, 'previous_revision');
  const hasNewRevision = Object.prototype.hasOwnProperty.call(metadata, 'new_revision');
  const auditMetadata = {
    ...metadata,
    actor_role: context.actorRole ?? null,
    request_id: context.requestId ?? null,
    previous_revision: hasPreviousRevision ? metadata.previous_revision : manifest.revision,
    new_revision: hasNewRevision ? metadata.new_revision : manifest.revision,
    market_code: manifest.market_code,
    surface: manifest.surface,
  };
  await client.query(
    `INSERT INTO experience_manifest_audit (
       revision_id, manifest_id, revision, action, actor_id, reason,
       correlation_id, previous_state, new_state, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      manifest.id, manifest.manifest_id, manifest.revision, action, actorId, reason,
      correlationId, previousState, newState, serialize(auditMetadata),
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
    schedule_timezone: input.schedule_timezone,
    rollout_stage: input.rollout_stage,
    canary_cohort: input.canary_cohort ?? null,
    rollout_percentage: input.rollout_percentage,
    ttl_seconds: input.ttl_seconds,
    cache_policy: input.cache_policy,
    targeting: input.targeting,
    sections: input.sections,
    asset_references: input.asset_references,
  });
  const checksum = checksumFor(payload);
  return { payload, checksum, signature: signatureFor(checksum) };
};

const assertPersistedManifestIntegrity = (manifest: ExperienceManifestRecord): void => {
  const input = parseExperienceManifestInput({
    schema_version: manifest.schema_version,
    market_code: manifest.market_code,
    locale: manifest.locale,
    surface: manifest.surface,
    min_app_version: manifest.min_app_version,
    max_app_version: manifest.max_app_version,
    starts_at: manifest.starts_at,
    ends_at: manifest.ends_at,
    schedule_timezone: manifest.schedule_timezone,
    rollout_stage: manifest.rollout_stage,
    canary_cohort: manifest.canary_cohort,
    rollout_percentage: manifest.rollout_percentage,
    ttl_seconds: manifest.ttl_seconds,
    cache_policy: manifest.cache_policy,
    targeting: manifest.targeting,
    sections: manifest.sections,
    asset_references: manifest.asset_references,
  });
  const expected = contentValues(manifest.manifest_id, manifest.revision, input);
  if (manifest.checksum !== expected.checksum || (expected.signature && manifest.signature !== expected.signature)) {
    throw new ExperienceManifestError(
      'EXPERIENCE_MANIFEST_INTEGRITY_MISMATCH',
      409,
      'The stored manifest checksum or signature does not match its canonical payload',
      ['experience_manifest_integrity_failed'],
    );
  }
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
  auditContext: ExperienceAuditContext = {},
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
    const requiresApproval = !hasTargetingConstraints(input.targeting);
    const result = await client.query(
      `INSERT INTO experience_manifest_revisions (
         manifest_id, revision, schema_version, market_code, locale, surface,
         min_app_version, max_app_version, starts_at, ends_at, schedule_timezone, rollout_percentage, ttl_seconds,
         cache_policy, targeting, sections, asset_references, content_checksum,
         signature, state, created_by, updated_by, rollout_stage, canary_cohort,
         requires_approval, approval_status, approval_requested_by, approval_requested_at,
         approved_by, approved_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15::jsonb, $16::jsonb, $17, $18, $19, 'draft', $20, $20,
                 $21, $22, $23, CASE WHEN $23 THEN 'pending' ELSE 'not_required' END,
                 $24, CASE WHEN $23 THEN NOW() ELSE NULL END, NULL, NULL)
       RETURNING *`,
      [
        manifestId, revision, input.schema_version, input.market_code, input.locale, input.surface,
        input.min_app_version, input.max_app_version ?? null, input.starts_at, input.ends_at ?? null,
        input.schedule_timezone, input.rollout_percentage, input.ttl_seconds, input.cache_policy, serialize(input.targeting),
        serialize(input.sections), serialize(input.asset_references), content.checksum, content.signature, actorId,
        input.rollout_stage, input.canary_cohort ?? null, requiresApproval, requiresApproval ? actorId : null,
      ],
    );
    const manifest = rowToManifest(result.rows[0]);
    await audit(client, manifest, 'draft_created', actorId, 'Experience manifest draft created', null, 'draft', correlationId, {
      previous_revision: null,
      new_revision: manifest.revision,
    }, auditContext);
    return manifest;
  });
};

export const updateExperienceManifestDraft = async (
  manifestIdValue: unknown,
  body: unknown,
  actorId: string,
  correlationId: string | null,
  auditContext: ExperienceAuditContext = {},
  expectedVersion: ExperienceExpectedVersion = {},
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
    if ((expectedVersion.revision != null && current.revision !== expectedVersion.revision)
      || (expectedVersion.checksum != null && current.checksum !== expectedVersion.checksum)) {
      throw new ExperienceManifestError(
        'EXPERIENCE_VERSION_CONFLICT',
        409,
        'The draft changed since it was loaded. Refresh the draft and retry with the latest ETag.',
        ['experience_draft_version_changed'],
      );
    }
    if (current.market_code !== input.market_code || current.surface !== input.surface || current.locale !== input.locale) {
      // Scope changes are allowed only while a revision is still a draft, but
      // the explicit branch keeps the decision visible for audit/review.
    }
    const content = contentValues(manifestId, current.revision, input);
    const requiresApproval = !hasTargetingConstraints(input.targeting);
    const result = await client.query(
      `UPDATE experience_manifest_revisions
          SET schema_version = $1, market_code = $2, locale = $3, surface = $4,
              min_app_version = $5, max_app_version = $6, starts_at = $7, ends_at = $8,
              schedule_timezone = $9, rollout_stage = $10, canary_cohort = $11,
              rollout_percentage = $12, ttl_seconds = $13, cache_policy = $14, targeting = $15::jsonb,
              sections = $16::jsonb, asset_references = $17::jsonb,
              content_checksum = $18, signature = $19,
              requires_approval = $20,
              approval_status = CASE WHEN $20 THEN 'pending' ELSE 'not_required' END,
              approval_requested_by = CASE WHEN $20 THEN $21 ELSE NULL END,
              approval_requested_at = CASE WHEN $20 THEN NOW() ELSE NULL END,
              approved_by = NULL, approved_at = NULL,
              updated_by = $22, updated_at = NOW()
        WHERE id = $23 AND state = 'draft'
        RETURNING *`,
      [
        input.schema_version, input.market_code, input.locale, input.surface, input.min_app_version,
        input.max_app_version ?? null, input.starts_at, input.ends_at ?? null, input.schedule_timezone,
        input.rollout_stage, input.canary_cohort ?? null, input.rollout_percentage, input.ttl_seconds, input.cache_policy,
        serialize(input.targeting), serialize(input.sections), serialize(input.asset_references), content.checksum,
        content.signature, requiresApproval, actorId, actorId, current.id,
      ],
    );
    const manifest = rowToManifest(result.rows[0]);
    await audit(client, manifest, 'draft_updated', actorId, 'Experience manifest draft updated', 'draft', 'draft', correlationId, {
      previous_revision: current.revision,
      new_revision: manifest.revision,
    }, auditContext);
    return manifest;
  });
};

export const previewExperienceManifest = async (
  manifestIdValue: unknown,
  actorId: string,
  correlationId: string | null,
  auditContext: ExperienceAuditContext = {},
): Promise<ExperienceManifestRecord> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  return withTransaction(async (client) => {
    const result = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'draft' FOR UPDATE`, [manifestId]);
    if (!result.rows[0]) throw new ExperienceManifestError('EXPERIENCE_DRAFT_NOT_FOUND', 404, `Draft manifest '${manifestId}' was not found`);
    const manifest = rowToManifest(result.rows[0]);
    await audit(client, manifest, 'previewed', actorId, 'Experience manifest preview requested', 'draft', 'draft', correlationId, {}, auditContext);
    return manifest;
  });
};

export type ExperienceManifestValidation = {
  valid: true;
  manifest_id: string;
  revision: number;
  checksum: string;
  issues: ExperienceValidationIssue[];
};

export const validateExperienceManifestDraft = async (
  manifestIdValue: unknown,
): Promise<ExperienceManifestValidation> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  const result = await readDb.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'draft' LIMIT 1`, [manifestId]);
  if (!result.rows[0]) throw new ExperienceManifestError('EXPERIENCE_DRAFT_NOT_FOUND', 404, `Draft manifest '${manifestId}' was not found`);
  const manifest = rowToManifest(result.rows[0]);
  assertPersistedManifestIntegrity(manifest);
  return {
    valid: true,
    manifest_id: manifest.manifest_id,
    revision: manifest.revision,
    checksum: manifest.checksum,
    issues: [],
  };
};

export const submitExperienceManifestApproval = async (
  manifestIdValue: unknown,
  actorId: string,
  correlationId: string | null,
  auditContext: ExperienceAuditContext = {},
): Promise<ExperienceManifestRecord> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  return withTransaction(async (client) => {
    await lockManifest(client, manifestId);
    const result = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'draft' FOR UPDATE`, [manifestId]);
    if (!result.rows[0]) throw new ExperienceManifestError('EXPERIENCE_DRAFT_NOT_FOUND', 404, `Draft manifest '${manifestId}' was not found`);
    const draft = rowToManifest(result.rows[0]);
    if (!draft.requires_approval) {
      throw new ExperienceManifestError('EXPERIENCE_APPROVAL_NOT_REQUIRED', 409, 'This manifest does not require two-step approval');
    }
    if (draft.approval_status === 'pending' || draft.approval_status === 'approved') return draft;
    const submittedResult = await client.query(
      `UPDATE experience_manifest_revisions
          SET approval_status = 'pending', approval_requested_by = $1,
              approval_requested_at = NOW(), approved_by = NULL, approved_at = NULL,
              updated_by = $1, updated_at = NOW()
        WHERE id = $2 AND state = 'draft' AND requires_approval = TRUE
        RETURNING *`,
      [actorId, draft.id],
    );
    const submitted = rowToManifest(submittedResult.rows[0]);
    await audit(client, submitted, 'approval_requested', actorId, 'High-impact experience manifest submitted for approval', 'draft', 'draft', correlationId, {
      previous_revision: draft.revision,
      new_revision: submitted.revision,
    }, auditContext);
    return submitted;
  });
};

export const rejectExperienceManifest = async (
  manifestIdValue: unknown,
  actorId: string,
  reason: string,
  correlationId: string | null,
  auditContext: ExperienceAuditContext = {},
): Promise<ExperienceManifestRecord> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    throw new ExperienceManifestError('EXPERIENCE_APPROVAL_REASON_REQUIRED', 400, 'Rejection reason must contain 3 to 500 characters');
  }

  return withTransaction(async (client) => {
    await lockManifest(client, manifestId);
    const result = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'draft' FOR UPDATE`, [manifestId]);
    if (!result.rows[0]) throw new ExperienceManifestError('EXPERIENCE_DRAFT_NOT_FOUND', 404, `Draft manifest '${manifestId}' was not found`);
    const draft = rowToManifest(result.rows[0]);
    if (!draft.requires_approval) {
      throw new ExperienceManifestError('EXPERIENCE_APPROVAL_NOT_REQUIRED', 409, 'This manifest does not require two-step approval');
    }
    if (draft.approval_status === 'approved') {
      throw new ExperienceManifestError('EXPERIENCE_APPROVAL_ALREADY_APPROVED', 409, 'An approved manifest cannot be rejected');
    }
    if (draft.approval_status === 'rejected') return draft;
    const rejectedResult = await client.query(
      `UPDATE experience_manifest_revisions
          SET approval_status = 'rejected', approved_by = NULL, approved_at = NULL,
              updated_by = $1, updated_at = NOW()
        WHERE id = $2 AND state = 'draft' AND requires_approval = TRUE
        RETURNING *`,
      [actorId, draft.id],
    );
    const rejected = rowToManifest(rejectedResult.rows[0]);
    await audit(client, rejected, 'rejected', actorId, normalizedReason, 'draft', 'draft', correlationId, {
      previous_revision: draft.revision,
      new_revision: rejected.revision,
      maker_id: draft.created_by,
    }, auditContext);
    return rejected;
  });
};

export const approveExperienceManifest = async (
  manifestIdValue: unknown,
  actorId: string,
  correlationId: string | null,
  auditContext: ExperienceAuditContext = {},
): Promise<ExperienceManifestRecord> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  return withTransaction(async (client) => {
    await lockManifest(client, manifestId);
    const result = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'draft' FOR UPDATE`, [manifestId]);
    if (!result.rows[0]) throw new ExperienceManifestError('EXPERIENCE_DRAFT_NOT_FOUND', 404, `Draft manifest '${manifestId}' was not found`);
    const draft = rowToManifest(result.rows[0]);
    if (!draft.requires_approval) {
      throw new ExperienceManifestError('EXPERIENCE_APPROVAL_NOT_REQUIRED', 409, 'This manifest does not require two-step approval');
    }
    if (draft.created_by && draft.created_by === actorId) {
      throw new ExperienceManifestError('EXPERIENCE_APPROVAL_MAKER_CHECKER_REQUIRED', 403, 'The manifest creator cannot approve the same high-impact campaign');
    }
    if (draft.approval_status === 'rejected') {
      throw new ExperienceManifestError('EXPERIENCE_APPROVAL_NOT_PENDING', 409, 'The manifest must be submitted again after rejection before it can be approved');
    }
    if (draft.approval_status === 'approved') return draft;
    const approvedResult = await client.query(
      `UPDATE experience_manifest_revisions
          SET approval_status = 'approved', approved_by = $1, approved_at = NOW(),
              updated_by = $1, updated_at = NOW()
        WHERE id = $2 AND state = 'draft' AND requires_approval = TRUE
        RETURNING *`,
      [actorId, draft.id],
    );
    const approved = rowToManifest(approvedResult.rows[0]);
    await audit(client, approved, 'approved', actorId, 'High-impact experience manifest approved', 'pending', 'approved', correlationId, {
      maker_id: draft.created_by,
    }, auditContext);
    return approved;
  });
};

export const publishExperienceManifest = async (
  manifestIdValue: unknown,
  actorId: string,
  correlationId: string | null,
  auditContext: ExperienceAuditContext = {},
): Promise<ExperienceManifestRecord> => {
  assertSigningConfiguration();
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  return withTransaction(async (client) => {
    await lockManifest(client, manifestId);
    const draftResult = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'draft' FOR UPDATE`, [manifestId]);
    if (!draftResult.rows[0]) throw new ExperienceManifestError('EXPERIENCE_DRAFT_NOT_FOUND', 404, `Draft manifest '${manifestId}' was not found`);
    const draft = rowToManifest(draftResult.rows[0]);
    assertPersistedManifestIntegrity(draft);
    if (draft.requires_approval && draft.approval_status !== 'approved') {
      throw new ExperienceManifestError('EXPERIENCE_APPROVAL_REQUIRED', 409, 'A high-impact manifest requires approval by a different authorized operator before publishing');
    }
    const currentResult = await client.query(`${manifestSelect} WHERE manifest_id = $1 AND state = 'published' FOR UPDATE`, [manifestId]);
    const current = currentResult.rows[0] ? rowToManifest(currentResult.rows[0]) : null;
    const fallbackResult = await client.query(
      `${manifestSelect}
         WHERE market_code = $1
           AND surface = $2
           AND state = 'published'
           AND kill_switch_active = FALSE
           AND id <> $3
           AND starts_at <= NOW()
           AND (ends_at IS NULL OR ends_at > NOW())
       LIMIT 500`,
      [draft.market_code, draft.surface, current?.id ?? draft.id],
    );
    const hasFallbackAudience = !hasTargetingConstraints(draft.targeting)
      || fallbackResult.rows.some((row) => !hasTargetingConstraints(rowToManifest(row).targeting));
    if (!hasFallbackAudience) {
      throw new ExperienceManifestError(
        'EXPERIENCE_FALLBACK_REQUIRED',
        409,
        'At least one active untargeted fallback audience is required before publishing a targeted manifest',
      );
    }
    if (current) {
      await client.query(
        `UPDATE experience_manifest_revisions SET state = 'superseded', updated_by = $1, updated_at = NOW() WHERE id = $2`,
        [actorId, current.id],
      );
      await audit(client, { ...current, state: 'superseded' }, 'superseded', actorId, 'Superseded by a newer published revision', 'published', 'superseded', correlationId, {
        replacement_revision: draft.revision,
        previous_revision: current.revision,
        new_revision: draft.revision,
      }, auditContext);
    }
    const publishedResult = await client.query(
      `UPDATE experience_manifest_revisions
          SET state = 'published', published_by = $1, published_at = NOW(), updated_by = $1, updated_at = NOW()
        WHERE id = $2 AND state = 'draft'
        RETURNING *`,
      [actorId, draft.id],
    );
    const published = rowToManifest(publishedResult.rows[0]);
    await audit(client, published, 'published', actorId, 'Experience manifest published', 'draft', 'published', correlationId, {
      previous_revision: current?.revision ?? null,
      new_revision: published.revision,
    }, auditContext);
    return published;
  });
};

export const rollbackExperienceManifest = async (
  manifestIdValue: unknown,
  targetRevisionValue: unknown,
  actorId: string,
  reason: string,
  correlationId: string | null,
  auditContext: ExperienceAuditContext = {},
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
    await audit(client, { ...current, state: 'rolled_back' }, 'rolled_back', actorId, normalizedReason, 'published', 'rolled_back', correlationId, {
      target_revision: target.revision,
      previous_revision: current.revision,
      new_revision: target.revision,
    }, auditContext);
    const publishedTarget = await client.query(
      `UPDATE experience_manifest_revisions
          SET state = 'published', published_by = $1, published_at = NOW(), updated_by = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [actorId, target.id],
    );
    const published = rowToManifest(publishedTarget.rows[0]);
    await audit(client, published, 'published', actorId, `Rollback to revision ${target.revision}: ${normalizedReason}`, target.state, 'published', correlationId, {
      rollback_from_revision: current.revision,
      previous_revision: current.revision,
      new_revision: target.revision,
    }, auditContext);
    return published;
  });
};

export const setExperienceManifestKillSwitch = async (
  manifestIdValue: unknown,
  active: boolean,
  actorId: string,
  reason: string,
  correlationId: string | null,
  auditContext: ExperienceAuditContext = {},
): Promise<ExperienceManifestRecord> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    throw new ExperienceManifestError(
      'EXPERIENCE_KILL_SWITCH_REASON_REQUIRED',
      400,
      'Kill-switch reason must contain 3 to 500 characters',
    );
  }

  return withTransaction(async (client) => {
    await lockManifest(client, manifestId);
    const currentResult = await client.query(
      `${manifestSelect} WHERE manifest_id = $1 AND state = 'published' FOR UPDATE`,
      [manifestId],
    );
    if (!currentResult.rows[0]) {
      throw new ExperienceManifestError(
        'EXPERIENCE_PUBLISHED_NOT_FOUND',
        409,
        `Manifest '${manifestId}' has no published revision`,
      );
    }
    const current = rowToManifest(currentResult.rows[0]);
    if (current.kill_switch_active === active) return current;

    const result = await client.query(
      `UPDATE experience_manifest_revisions
          SET kill_switch_active = $1,
              kill_switched_by = CASE WHEN $1 THEN $2 ELSE NULL END,
              kill_switched_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
              kill_switch_reason = CASE WHEN $1 THEN $3 ELSE NULL END,
              updated_by = $2,
              updated_at = NOW()
        WHERE id = $4 AND state = 'published'
        RETURNING *`,
      [active, actorId, normalizedReason, current.id],
    );
    const updated = rowToManifest(result.rows[0]);
    await audit(
      client,
      updated,
      active ? 'kill_switched' : 'kill_switch_cleared',
      actorId,
      normalizedReason,
      'published',
      'published',
      correlationId,
      { kill_switch_active: active },
      auditContext,
    );
    return updated;
  });
};

/**
 * Retire a published revision from the campaign catalog without mutating its
 * immutable payload. The historical row becomes superseded, so public
 * resolution can no longer select it; a future campaign can still be created
 * as a new revision under the same manifest identity.
 */
export const retireExperienceManifest = async (
  manifestIdValue: unknown,
  actorId: string,
  reason: string,
  correlationId: string | null,
  auditContext: ExperienceAuditContext = {},
): Promise<ExperienceManifestRecord> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    throw new ExperienceManifestError(
      'EXPERIENCE_RETIRE_REASON_REQUIRED',
      400,
      'Retire reason must contain 3 to 500 characters',
    );
  }

  return withTransaction(async (client) => {
    await lockManifest(client, manifestId);
    const currentResult = await client.query(
      `${manifestSelect} WHERE manifest_id = $1 AND state = 'published' FOR UPDATE`,
      [manifestId],
    );
    if (!currentResult.rows[0]) {
      throw new ExperienceManifestError(
        'EXPERIENCE_PUBLISHED_NOT_FOUND',
        409,
        `Manifest '${manifestId}' has no published revision`,
      );
    }
    const current = rowToManifest(currentResult.rows[0]);
    const result = await client.query(
      `UPDATE experience_manifest_revisions
          SET state = 'superseded', updated_by = $1, updated_at = NOW()
        WHERE id = $2 AND state = 'published'
        RETURNING *`,
      [actorId, current.id],
    );
    const retired = rowToManifest(result.rows[0]);
    await audit(
      client,
      retired,
      'superseded',
      actorId,
      normalizedReason,
      'published',
      'superseded',
      correlationId,
      { retired: true, previous_revision: current.revision, new_revision: null },
      auditContext,
    );
    return retired;
  });
};

const validateListFilter = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (field === 'market_code' && !MARKET_CODE.test(normalized)) throw new ExperienceManifestError('INVALID_EXPERIENCE_FILTER', 400, `${field} is invalid`);
  if (field === 'surface' && !EXPERIENCE_SURFACES.includes(normalized as ExperienceSurface)) throw new ExperienceManifestError('INVALID_EXPERIENCE_FILTER', 400, `${field} is invalid`);
  if (field === 'state' && !['draft', 'published', 'superseded', 'rolled_back'].includes(normalized)) throw new ExperienceManifestError('INVALID_EXPERIENCE_FILTER', 400, `${field} is invalid`);
  if (['city_code', 'zone_code'].includes(field) && !IDENTIFIER.test(normalized)) throw new ExperienceManifestError('INVALID_EXPERIENCE_FILTER', 400, `${field} is invalid`);
  if (field === 'locale' && !LOCALE.test(normalized)) throw new ExperienceManifestError('INVALID_EXPERIENCE_FILTER', 400, `${field} is invalid`);
  if (field === 'app_version' && !SEMVER.test(normalized)) throw new ExperienceManifestError('INVALID_EXPERIENCE_FILTER', 400, `${field} is invalid`);
  return normalized;
};

const matchesOverviewTarget = (values: string[], requested: string | null): boolean =>
  !requested || values.length === 0 || values.includes(requested);

export const listExperienceManifestRevisions = async (filters: {
  market_code?: unknown;
  surface?: unknown;
  state?: unknown;
  city_code?: unknown;
  zone_code?: unknown;
  locale?: unknown;
  app_version?: unknown;
} = {}): Promise<ExperienceManifestRecord[]> => {
  const marketCode = validateListFilter(filters.market_code, 'market_code');
  const surface = validateListFilter(filters.surface, 'surface');
  const state = validateListFilter(filters.state, 'state');
  const cityCode = validateListFilter(filters.city_code, 'city_code');
  const zoneCode = validateListFilter(filters.zone_code, 'zone_code');
  const requestedLocale = validateListFilter(filters.locale, 'locale');
  const appVersion = validateListFilter(filters.app_version, 'app_version');
  const values: unknown[] = [];
  const where: string[] = [];
  if (marketCode) { values.push(marketCode); where.push(`market_code = $${values.length}`); }
  if (surface) { values.push(surface); where.push(`surface = $${values.length}`); }
  if (state) { values.push(state); where.push(`state = $${values.length}`); }
  const result = await readDb.query(`${manifestSelect}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY manifest_id ASC, revision DESC LIMIT 1000`, values);
  return result.rows.map(rowToManifest).filter((manifest) => {
    if (!matchesOverviewTarget(manifest.targeting.city_codes, cityCode)) return false;
    if (!matchesOverviewTarget(manifest.targeting.zone_codes, zoneCode)) return false;
    if (requestedLocale && normalizeLocale(manifest.locale) !== normalizeLocale(requestedLocale)) return false;
    if (appVersion && !isWithinAppRange(manifest, appVersion)) return false;
    return true;
  });
};

export const validateExperienceRollout = (body: unknown): JsonObject => {
  const schema = z.object({
    rollout_stage: z.enum(['canary', 'public']).default('public'),
    canary_cohort: identifier.nullable().optional(),
    rollout_percentage: z.coerce.number().int().min(0).max(100).default(100),
    min_app_version: semver.optional(),
    max_app_version: semver.nullable().optional(),
    starts_at: z.coerce.date().default(() => new Date()),
    ends_at: z.coerce.date().nullable().optional(),
    schedule_timezone: scheduleTimezone.default('UTC'),
  }).strict();
  const parsed = schema.safeParse(normalizeScheduleInput(body));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.') || '$',
      code: issue.code,
      message: issue.message,
    }));
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_ROLLOUT',
      400,
      issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
      [],
      issues,
    );
  }
  const data = parsed.data;
  if (data.rollout_stage === 'canary' && !data.canary_cohort) {
    throw new ExperienceManifestError('EXPERIENCE_CANARY_COHORT_REQUIRED', 400, 'canary_cohort is required for a canary rollout', [], [{
      path: 'canary_cohort', code: 'required', message: 'canary_cohort is required for a canary rollout',
    }]);
  }
  if (data.rollout_stage === 'public' && data.canary_cohort) {
    throw new ExperienceManifestError('EXPERIENCE_CANARY_COHORT_INVALID', 400, 'canary_cohort is only valid for a canary rollout', [], [{
      path: 'canary_cohort', code: 'invalid', message: 'canary_cohort is only valid for a canary rollout',
    }]);
  }
  if (data.ends_at && data.ends_at.getTime() <= data.starts_at.getTime()) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_SCHEDULE', 400, 'ends_at must be after starts_at', [], [{
      path: 'ends_at', code: 'invalid', message: 'ends_at must be after starts_at',
    }]);
  }
  return {
    ...data,
    starts_at: data.starts_at.toISOString(),
    ends_at: data.ends_at?.toISOString() ?? null,
    canary_cohort: data.canary_cohort ?? null,
    rollout_percentage: data.rollout_percentage,
    max_app_version: data.max_app_version ?? null,
  };
};

export const listExperienceAssets = async (filters: {
  market_code?: unknown;
  surface?: unknown;
} = {}): Promise<Array<ExperienceAssetReference & { manifest_id: string; revision: number }>> => {
  const manifests = await listExperienceManifestRevisions(filters);
  const seen = new Set<string>();
  const assets: Array<ExperienceAssetReference & { manifest_id: string; revision: number }> = [];
  manifests.forEach((manifest) => {
    manifest.asset_references.forEach((asset) => {
      const key = `${asset.asset_id}:${asset.version || '1'}:${asset.checksum}`;
      if (seen.has(key)) return;
      seen.add(key);
      assets.push({ ...asset, manifest_id: manifest.manifest_id, revision: manifest.revision });
    });
  });
  return assets;
};

const collectDeepLinks = (value: unknown, result: Set<string>): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectDeepLinks(item, result));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.entries(value as JsonObject).forEach(([key, nested]) => {
    if (key === 'deep_link' && typeof nested === 'string') result.add(nested);
    collectDeepLinks(nested, result);
  });
};

export const listExperienceDeepLinks = async (filters: {
  market_code?: unknown;
  surface?: unknown;
} = {}): Promise<string[]> => {
  const manifests = await listExperienceManifestRevisions(filters);
  const result = new Set<string>();
  manifests.forEach((manifest) => manifest.sections.forEach((section) => collectDeepLinks(section.properties, result)));
  return Array.from(result).sort();
};

export const listExperienceRollouts = async (filters: {
  market_code?: unknown;
  surface?: unknown;
} = {}): Promise<Array<JsonObject>> => {
  const manifests = await listExperienceManifestRevisions(filters);
  return manifests.map((manifest) => ({
    manifest_id: manifest.manifest_id,
    revision: manifest.revision,
    market_code: manifest.market_code,
    surface: manifest.surface,
    state: manifest.state,
    rollout_stage: manifest.rollout_stage,
    canary_cohort: manifest.canary_cohort,
    rollout_percentage: manifest.rollout_percentage,
    starts_at: manifest.starts_at,
    ends_at: manifest.ends_at,
    schedule_timezone: manifest.schedule_timezone,
  }));
};

export const listExperienceKillSwitches = async (filters: {
  market_code?: unknown;
  surface?: unknown;
} = {}): Promise<Array<JsonObject>> => {
  const manifests = await listExperienceManifestRevisions(filters);
  return manifests
    .filter((manifest) => manifest.state === 'published')
    .map((manifest) => ({
      manifest_id: manifest.manifest_id,
      revision: manifest.revision,
      market_code: manifest.market_code,
      surface: manifest.surface,
      active: manifest.kill_switch_active,
      reason: manifest.kill_switch_reason,
      changed_by: manifest.kill_switched_by,
      changed_at: manifest.kill_switched_at,
    }));
};

export type ExperienceManifestAuditRecord = {
  id: string;
  revision_id: string;
  manifest_id: string;
  revision: number;
  action: string;
  actor_id: string | null;
  reason: string | null;
  correlation_id: string | null;
  previous_state: string | null;
  new_state: string;
  metadata: JsonObject;
  created_at: string;
};

export type ExperienceManifestHistory = {
  revisions: ExperienceManifestRecord[];
  audit: ExperienceManifestAuditRecord[];
};

const auditRowToRecord = (row: Record<string, any>): ExperienceManifestAuditRecord => ({
  id: String(row.id),
  revision_id: String(row.revision_id),
  manifest_id: String(row.manifest_id),
  revision: Number(row.revision),
  action: String(row.action),
  actor_id: row.actor_id ? String(row.actor_id) : null,
  reason: row.reason ? String(row.reason) : null,
  correlation_id: row.correlation_id ? String(row.correlation_id) : null,
  previous_state: row.previous_state ? String(row.previous_state) : null,
  new_state: String(row.new_state),
  metadata: auditMetadata(row.metadata),
  created_at: new Date(row.created_at).toISOString(),
});

const auditMetadata = (value: unknown): JsonObject => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
};

export const getExperienceManifestHistory = async (manifestIdValue: unknown): Promise<ExperienceManifestHistory> => {
  const manifestId = parseUuid(manifestIdValue, 'manifest_id');
  const [revisionsResult, auditResult] = await Promise.all([
    readDb.query(`${manifestSelect} WHERE manifest_id = $1 ORDER BY revision DESC`, [manifestId]),
    readDb.query(
      `SELECT id, revision_id, manifest_id, revision, action, actor_id, reason,
              correlation_id, previous_state, new_state, metadata, created_at
         FROM experience_manifest_audit
        WHERE manifest_id = $1
        ORDER BY created_at DESC, id DESC`,
      [manifestId],
    ),
  ]);
  return {
    revisions: revisionsResult.rows.map((row) => rowToManifest(row)),
    audit: auditResult.rows.map((row) => auditRowToRecord(row)),
  };
};

export const listExperienceAudit = async (filters: {
  market_code?: unknown;
  surface?: unknown;
  manifest_id?: unknown;
} = {}): Promise<ExperienceManifestAuditRecord[]> => {
  const marketCode = validateListFilter(filters.market_code, 'market_code');
  const surface = validateListFilter(filters.surface, 'surface');
  const manifestId = filters.manifest_id == null || filters.manifest_id === ''
    ? null
    : parseUuid(filters.manifest_id, 'manifest_id');
  const values: unknown[] = [];
  const where: string[] = [];
  if (marketCode) { values.push(marketCode); where.push(`r.market_code = $${values.length}`); }
  if (surface) { values.push(surface); where.push(`r.surface = $${values.length}`); }
  if (manifestId) { values.push(manifestId); where.push(`a.manifest_id = $${values.length}`); }
  const result = await readDb.query(
    `SELECT a.id, a.revision_id, a.manifest_id, a.revision, a.action, a.actor_id,
            a.reason, a.correlation_id, a.previous_state, a.new_state, a.metadata,
            a.created_at
       FROM experience_manifest_audit a
       JOIN experience_manifest_revisions r ON r.id = a.revision_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 1000`,
    values,
  );
  return result.rows.map((row) => auditRowToRecord(row));
};

const NEW_USER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const deriveUserStatus = async (
  request: ExperienceAudienceContext & { user_id?: string | null },
  candidates: ExperienceManifestRecord[],
): Promise<'new' | 'existing' | null> => {
  if (request.user_status || !request.user_id) return request.user_status ?? null;
  if (!candidates.some((candidate) => candidate.targeting.user_status)) return null;
  const result = await readDb.query<{ created_at: string }>(
    'SELECT created_at FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [request.user_id],
  );
  const createdAt = result.rows[0]?.created_at ? new Date(result.rows[0].created_at).getTime() : NaN;
  if (!Number.isFinite(createdAt)) return null;
  return Date.now() - createdAt <= NEW_USER_WINDOW_MS ? 'new' : 'existing';
};

const isWithinAppRange = (candidate: ExperienceManifestCandidate, appVersion: string): boolean => {
  if (compareSemanticVersions(appVersion, candidate.min_app_version) < 0) return false;
  return !candidate.max_app_version || compareSemanticVersions(appVersion, candidate.max_app_version) <= 0;
};

export type ExperienceAudienceContext = {
  market_code: string;
  locale: string;
  app_version: string;
  user_id?: string | null;
  cohort?: string | null;
  experiment_ref?: string | null;
  experiment_assignment?: string | null;
  city_code?: string | null;
  zone_code?: string | null;
  service_usage_cohort?: string | null;
  user_status?: 'new' | 'existing' | null;
  role?: 'customer' | 'merchant' | 'courier' | null;
};

const matchesTargetList = (
  values: string[],
  actual: string | null | undefined,
  normalizeValue: (value: string) => string = (value) => value.toLowerCase(),
): boolean => values.length === 0 || Boolean(actual && values.map(normalizeValue).includes(normalizeValue(actual)));

const targetingScore = (
  targeting: z.infer<typeof targetingSchema>,
  context: ExperienceAudienceContext,
): number | null => {
  const normalizedTargeting = targetingSchema.parse(targeting);
  if (!matchesTargetList(normalizedTargeting.market_codes, context.market_code)) return null;
  if (!matchesTargetList(normalizedTargeting.city_codes, context.city_code)) return null;
  if (!matchesTargetList(normalizedTargeting.zone_codes, context.zone_code)) return null;
  if (!matchesTargetList(normalizedTargeting.locales, context.locale, normalizeLocale)) return null;
  if (!matchesTargetList(normalizedTargeting.service_usage_cohorts, context.service_usage_cohort)) return null;
  if (normalizedTargeting.user_status && normalizedTargeting.user_status !== context.user_status) return null;
  if (!matchesTargetList(normalizedTargeting.roles, context.role)) return null;
  if (!matchesTargetList(normalizedTargeting.cohorts, context.cohort)) return null;
  if (normalizedTargeting.experiment_ref && normalizedTargeting.experiment_ref !== context.experiment_ref) return null;
  if (!matchesTargetList(normalizedTargeting.experiment_assignments, context.experiment_assignment)) return null;

  return (normalizedTargeting.market_codes.length > 0 ? 1 : 0)
    + (normalizedTargeting.city_codes.length > 0 ? 2 : 0)
    + (normalizedTargeting.zone_codes.length > 0 ? 2 : 0)
    + (normalizedTargeting.locales.length > 0 ? 1 : 0)
    + (normalizedTargeting.service_usage_cohorts.length > 0 ? 2 : 0)
    + (normalizedTargeting.user_status ? 2 : 0)
    + (normalizedTargeting.roles.length > 0 ? 1 : 0)
    + (normalizedTargeting.cohorts.length > 0 ? 2 : 0)
    + (normalizedTargeting.experiment_ref ? 1 : 0)
    + (normalizedTargeting.experiment_assignments.length > 0 ? 2 : 0);
};

const rolloutBucket = (manifestId: string, userId: string): number => {
  const digest = createHash('sha256').update(`${manifestId}:${userId}`).digest('hex');
  return Number.parseInt(digest.slice(0, 8), 16) % 100;
};

const isIncludedInRollout = (candidate: ExperienceManifestCandidate, userId?: string | null): boolean => {
  const percentage = candidate.rollout_percentage ?? 100;
  if (percentage >= 100) return true;
  if (percentage <= 0 || !userId) return false;
  return rolloutBucket(candidate.manifest_id, userId) < percentage;
};

export const pickExperienceManifest = (
  candidates: ExperienceManifestCandidate[],
  request: ExperienceAudienceContext & { default_locale: string },
): PublicExperienceManifest | null => {
  const localeChain = localeFallbackChain(request.locale, request.default_locale).map(normalizeLocale);
  const ranked = candidates.flatMap((candidate) => {
    if (candidate.kill_switch_active) return [];
    if (candidate.market_code !== request.market_code) return [];
    if (candidate.rollout_stage === 'canary' && candidate.canary_cohort !== request.cohort) return [];
    if (!isIncludedInRollout(candidate, request.user_id)) return [];
    const candidateLocale = normalizeLocale(candidate.locale);
    const localeIndex = localeChain.indexOf(candidateLocale);
    const localeScore = localeIndex < 0 ? 0 : localeChain.length - localeIndex;
    if (localeScore === 0 || !isWithinAppRange(candidate, request.app_version)) return [];
    const targetScore = targetingScore(candidate.targeting, request);
    if (targetScore === null) return [];
    return [{ candidate, localeScore, targetScore: targetScore + (candidate.rollout_stage === 'canary' ? 100 : 0) }];
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
    schedule_timezone: selected.schedule_timezone || 'UTC',
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
  experiment_assignment?: string | null;
  city_code?: string | null;
  zone_code?: string | null;
  service_usage_cohort?: string | null;
  user_status?: 'new' | 'existing' | null;
  user_id?: string | null;
  role?: 'customer' | 'merchant' | 'courier' | null;
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
         AND kill_switch_active = FALSE
         AND starts_at <= NOW()
         AND (ends_at IS NULL OR ends_at > NOW())
       ORDER BY revision DESC
       LIMIT 500`,
    [marketCode, request.surface],
  );
  const candidates = result.rows.map((row) => rowToManifest(row));
  const userStatus = await deriveUserStatus(request, candidates);
  const selected = pickExperienceManifest(candidates, {
    market_code: marketCode,
    locale: request.locale,
    default_locale: marketResult.rows[0].default_locale,
    app_version: request.app_version,
    user_id: request.user_id ?? null,
    cohort: request.cohort ?? null,
    experiment_ref: request.experiment_ref ?? null,
    experiment_assignment: request.experiment_assignment ?? null,
    city_code: request.city_code ?? null,
    zone_code: request.zone_code ?? null,
    service_usage_cohort: request.service_usage_cohort ?? null,
    user_status: userStatus,
    role: request.role ?? null,
  });
  if (!selected) throw new ExperienceManifestError('EXPERIENCE_MANIFEST_NOT_AVAILABLE', 404, 'No published experience manifest matches this market, locale, surface and app version');
  const localized = await resolveLocalizedContentReferences({
    market_code: marketCode,
    surface: request.surface,
    requested_locale: request.locale,
    market_default_locale: marketResult.rows[0].default_locale,
    sections: selected.sections,
  });
  if (Object.keys(localized.resolved).length === 0 && localized.sections === selected.sections) return selected;

  // Dynamic copy is part of the public representation, so derive a new
  // checksum/signature from the resolved payload. The stored manifest remains
  // immutable and only contains safe references to the approved content pack.
  // Include the immutable manifest checksum so a copy response cannot be
  // detached from the signed/published manifest revision that referenced it.
  const payload = JSON.stringify({
    manifest_checksum: selected.checksum,
    sections: localized.sections,
  });
  const checksum = checksumFor(payload);
  return { ...selected, sections: localized.sections as ExperienceSection[], checksum, signature: signatureFor(checksum) };
};

const previewAudienceSchema = z.object({
  market_code: z.string().trim().toLowerCase().regex(MARKET_CODE),
  locale,
  default_locale: locale.optional(),
  app_version: semver,
  user_id: identifier.nullable().optional(),
  cohort: identifier.nullable().optional(),
  experiment_ref: identifier.nullable().optional(),
  experiment_assignment: identifier.nullable().optional(),
  city_code: identifier.nullable().optional(),
  zone_code: identifier.nullable().optional(),
  service_usage_cohort: identifier.nullable().optional(),
  user_status: z.enum(['new', 'existing']).nullable().optional(),
  role: z.enum(['customer', 'merchant', 'courier']).nullable().optional(),
  at: z.coerce.date().optional(),
}).strict();

export const previewExperienceManifestAudience = (
  manifest: ExperienceManifestRecord,
  value: unknown,
): JsonObject => {
  const parsed = previewAudienceSchema.safeParse(value);
  if (!parsed.success) {
    throw new ExperienceManifestError(
      'INVALID_EXPERIENCE_PREVIEW_CONTEXT',
      400,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  const context = parsed.data;
  const at = context.at ?? new Date();
  const startsAt = new Date(manifest.starts_at).getTime();
  const endsAt = manifest.ends_at ? new Date(manifest.ends_at).getTime() : null;
  const withinSchedule = startsAt <= at.getTime() && (endsAt === null || at.getTime() < endsAt);
  const selected = withinSchedule ? pickExperienceManifest([manifest], {
    market_code: context.market_code,
    locale: context.locale,
    default_locale: context.default_locale || manifest.locale,
    app_version: context.app_version,
    user_id: context.user_id ?? null,
    cohort: context.cohort ?? null,
    experiment_ref: context.experiment_ref ?? null,
    experiment_assignment: context.experiment_assignment ?? null,
    city_code: context.city_code ?? null,
    zone_code: context.zone_code ?? null,
    service_usage_cohort: context.service_usage_cohort ?? null,
    user_status: context.user_status ?? null,
    role: context.role ?? null,
  }) : null;

  return {
    matched: Boolean(selected),
    reason: !withinSchedule ? 'outside_schedule' : selected ? 'matched' : 'audience_or_version_mismatch',
    simulated_context: {
      market_code: context.market_code,
      locale: normalizeLocale(context.locale),
      app_version: context.app_version,
      cohort: context.cohort ?? null,
      experiment_ref: context.experiment_ref ?? null,
      experiment_assignment: context.experiment_assignment ?? null,
      city_code: context.city_code ?? null,
      zone_code: context.zone_code ?? null,
      service_usage_cohort: context.service_usage_cohort ?? null,
      user_status: context.user_status ?? null,
      role: context.role ?? null,
      at: at.toISOString(),
    },
    selected_manifest: selected ? { manifest_id: selected.manifest_id, revision: selected.revision, resolved_locale: selected.resolved_locale } : null,
  };
};

export const getExperienceCacheControl = (manifest: PublicExperienceManifest): string => {
  if (manifest.cache_policy === 'no-store') return 'no-store';
  const visibility = manifest.cache_policy === 'public' ? 'public' : 'private';
  return `${visibility}, max-age=${manifest.ttl_seconds}, stale-while-revalidate=300`;
};
