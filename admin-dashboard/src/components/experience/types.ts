export type ExperienceSurface = 'customer_android' | 'customer_web' | 'merchant_android' | 'courier_android'
export type RolloutStage = 'canary' | 'public'
export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected'

export type ExperienceTargeting = {
  cohorts: string[]
  market_codes: string[]
  city_codes: string[]
  zone_codes: string[]
  locales: string[]
  service_usage_cohorts: string[]
  user_status?: 'new' | 'existing' | null
  roles: Array<'customer' | 'merchant' | 'courier'>
  experiment_ref?: string | null
  experiment_assignments: string[]
}

export type ExperienceSection = {
  id: string
  component: string
  enabled?: boolean
  properties: Record<string, unknown>
}

export type ServiceExposureEntry = {
  service_code: string
  service_category?: string
  enabled: boolean
  position: number
  label?: string
  subtitle?: string
  badge?: string
  fallback_behavior: 'hide_entry' | 'show_authoritative_name' | 'show_unavailable_notice'
}

export type ExperienceAsset = {
  asset_id: string
  uri: string
  kind: 'image' | 'animation' | 'icon' | 'video'
  checksum: string
  content_type?: string
  width?: number | null
  height?: number | null
  aspect_ratio?: number | null
  size_limit_bytes?: number
  version?: string
  expires_at?: string | null
  cache_policy?: 'no-store' | 'private' | 'public'
  retention_until?: string | null
  fallback_asset_id?: string | null
}

export type ExperienceManifest = {
  id: string
  manifest_id: string
  revision: number
  schema_version: number
  market_code: string
  locale: string
  surface: ExperienceSurface
  min_app_version: string
  max_app_version: string | null
  starts_at: string
  ends_at: string | null
  schedule_timezone: string
  rollout_stage: RolloutStage
  canary_cohort: string | null
  rollout_percentage: number
  ttl_seconds: number
  cache_policy: 'no-store' | 'private' | 'public'
  targeting: ExperienceTargeting
  sections: ExperienceSection[]
  asset_references: ExperienceAsset[]
  checksum: string
  signature: string | null
  state: 'draft' | 'published' | 'superseded' | 'rolled_back'
  created_by: string | null
  updated_by: string | null
  published_by: string | null
  published_at: string | null
  rolled_back_by: string | null
  rolled_back_at: string | null
  created_at: string
  updated_at: string
  requires_approval: boolean
  approval_status: ApprovalStatus
  approval_requested_by: string | null
  approval_requested_at: string | null
  approved_by: string | null
  approved_at: string | null
  kill_switch_active: boolean
  kill_switched_by: string | null
  kill_switched_at: string | null
  kill_switch_reason: string | null
}

export type ExperienceCampaignStatus = 'draft' | 'scheduled' | 'live' | 'paused' | 'expired'

export const experienceCampaignStatus = (
  manifest: Pick<ExperienceManifest, 'state' | 'starts_at' | 'ends_at' | 'kill_switch_active'>,
  now = new Date(),
): ExperienceCampaignStatus => {
  if (manifest.state === 'draft') return 'draft'
  if (manifest.state === 'superseded' || manifest.state === 'rolled_back') return 'expired'
  if (manifest.ends_at && new Date(manifest.ends_at).getTime() <= now.getTime()) return 'expired'
  if (manifest.kill_switch_active) return 'paused'
  if (new Date(manifest.starts_at).getTime() > now.getTime()) return 'scheduled'
  return 'live'
}

export const campaignNameForManifest = (manifest: Pick<ExperienceManifest, 'sections'>): string => {
  const first = manifest.sections[0]
  return String(first?.properties.campaign_name || first?.properties.title || first?.component || 'Untitled campaign')
}

export const placementForComponent = (component: string): string => ({
  hero_banner: 'Hero',
  campaign_strip: 'Campaign strip',
  promo_carousel: 'Carousel',
} as Record<string, string>)[component] ?? component.replaceAll('_', ' ')

export type ExperienceAuditRecord = {
  id: string
  revision_id: string
  manifest_id: string
  revision: number
  action: string
  actor_id: string | null
  reason: string | null
  correlation_id: string | null
  previous_state: string | null
  new_state: string
  metadata: Record<string, unknown>
  created_at: string
}

export type ExperienceHistory = {
  revisions: ExperienceManifest[]
  audit: ExperienceAuditRecord[]
}

export type ExperienceForm = {
  manifest_id?: string
  schema_version: number
  market_code: string
  locale: string
  surface: ExperienceSurface
  min_app_version: string
  max_app_version: string
  starts_at: string
  ends_at: string
  schedule_timezone: string
  rollout_stage: RolloutStage
  canary_cohort: string
  rollout_percentage: number
  ttl_seconds: number
  cache_policy: 'no-store' | 'private' | 'public'
  targeting: ExperienceTargeting
  sections: ExperienceSection[]
  asset_references: ExperienceAsset[]
}

export type ExperienceConflict = {
  manifest_id: string
  revision: number
  campaign_name: string
  placements: string[]
  starts_at: string
  ends_at: string | null
}

export const emptyTargeting = (): ExperienceTargeting => ({
  cohorts: [],
  market_codes: [],
  city_codes: [],
  zone_codes: [],
  locales: [],
  service_usage_cohorts: [],
  user_status: null,
  roles: [],
  experiment_ref: null,
  experiment_assignments: [],
})

export const defaultSection = (): ExperienceSection => ({
  id: `hero-${Date.now()}`,
  component: 'hero_banner',
  enabled: true,
  properties: {
    title: 'Campaign title',
    body: 'Campaign message',
    cta_label: 'Lihat sekarang',
    deep_link: '/food',
  },
})

const dateTimeForTimezone = (value: Date, timeZone: string) => {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(value).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
  } catch {
    return value.toISOString().slice(0, 16)
  }
}

const defaultContentTypeForKind = (kind: ExperienceAsset['kind']) => kind === 'video'
  ? 'video/mp4'
  : kind === 'animation' ? 'image/gif' : 'image/webp'

const normalizeAssetForForm = (asset: ExperienceAsset): ExperienceAsset => ({
  ...asset,
  content_type: asset.content_type || defaultContentTypeForKind(asset.kind),
  width: asset.width ?? null,
  height: asset.height ?? null,
  aspect_ratio: asset.aspect_ratio ?? null,
  size_limit_bytes: asset.size_limit_bytes ?? 5 * 1024 * 1024,
  version: asset.version || '1',
  expires_at: asset.expires_at ?? null,
  cache_policy: asset.cache_policy || 'private',
  retention_until: asset.retention_until ?? null,
  fallback_asset_id: asset.fallback_asset_id ?? null,
})

export const defaultExperienceForm = (): ExperienceForm => ({
  schema_version: 1,
  market_code: 'id-jk',
  locale: 'id-ID',
  surface: 'customer_android',
  min_app_version: '1.0.0',
  max_app_version: '',
  starts_at: dateTimeForTimezone(new Date(), 'Asia/Jakarta'),
  ends_at: '',
  schedule_timezone: 'Asia/Jakarta',
  rollout_stage: 'public',
  canary_cohort: '',
  rollout_percentage: 100,
  ttl_seconds: 300,
  cache_policy: 'private',
  targeting: emptyTargeting(),
  sections: [defaultSection()],
  asset_references: [],
})

export const defaultServiceVisibilityForm = (): ExperienceForm => ({
  ...defaultExperienceForm(),
  sections: [{
    id: 'service-visibility',
    component: 'service_grid',
    enabled: true,
    properties: {
      title: 'Services',
      display_mode: 'cards',
      service_entries: [{
        service_code: 'food_delivery',
        service_category: 'food',
        enabled: true,
        position: 0,
        label: 'Food delivery',
        subtitle: 'Pesan makanan',
        badge: '',
        fallback_behavior: 'hide_entry',
      } satisfies ServiceExposureEntry],
    },
  }],
})

export const formFromManifest = (manifest: ExperienceManifest): ExperienceForm => ({
  manifest_id: manifest.manifest_id,
  schema_version: manifest.schema_version,
  market_code: manifest.market_code,
  locale: manifest.locale,
  surface: manifest.surface,
  min_app_version: manifest.min_app_version,
  max_app_version: manifest.max_app_version ?? '',
  starts_at: manifest.starts_at ? dateTimeForTimezone(new Date(manifest.starts_at), manifest.schedule_timezone) : '',
  ends_at: manifest.ends_at ? dateTimeForTimezone(new Date(manifest.ends_at), manifest.schedule_timezone) : '',
  schedule_timezone: manifest.schedule_timezone,
  rollout_stage: manifest.rollout_stage,
  canary_cohort: manifest.canary_cohort ?? '',
  rollout_percentage: manifest.rollout_percentage ?? 100,
  ttl_seconds: manifest.ttl_seconds,
  cache_policy: manifest.cache_policy,
  targeting: manifest.targeting,
  sections: manifest.sections.map((section) => ({ ...section, enabled: section.enabled !== false })),
  asset_references: manifest.asset_references.map(normalizeAssetForForm),
})

export const hasAudienceConstraints = (targeting: ExperienceTargeting) => Boolean(
  targeting.cohorts.length
  || targeting.market_codes.length
  || targeting.city_codes.length
  || targeting.zone_codes.length
  || targeting.locales.length
  || targeting.service_usage_cohorts.length
  || targeting.user_status
  || targeting.roles.length
  || targeting.experiment_ref
  || targeting.experiment_assignments.length,
)

const overlap = (left: string[], right: string[]) => left.length === 0 || right.length === 0 || left.some((value) => right.includes(value))

const targetingOverlaps = (left: ExperienceTargeting, right: ExperienceTargeting) => {
  if (!overlap(left.market_codes, right.market_codes)
    || !overlap(left.city_codes, right.city_codes)
    || !overlap(left.zone_codes, right.zone_codes)
    || !overlap(left.locales.map((value) => value.toLowerCase()), right.locales.map((value) => value.toLowerCase()))
    || !overlap(left.service_usage_cohorts, right.service_usage_cohorts)
    || !overlap(left.cohorts, right.cohorts)
    || !overlap(left.roles, right.roles)
    || !overlap(left.experiment_assignments, right.experiment_assignments)) return false
  if (left.user_status && right.user_status && left.user_status !== right.user_status) return false
  if (left.experiment_ref && right.experiment_ref && left.experiment_ref !== right.experiment_ref) return false
  return true
}

const dateRangeOverlaps = (leftStart: string, leftEnd: string | null, rightStart: string, rightEnd: string | null) => {
  const start = Math.max(new Date(leftStart).getTime(), new Date(rightStart).getTime())
  const end = Math.min(leftEnd ? new Date(leftEnd).getTime() : Number.POSITIVE_INFINITY, rightEnd ? new Date(rightEnd).getTime() : Number.POSITIVE_INFINITY)
  return Number.isFinite(start) && start < end
}

const placementSet = (sections: ExperienceSection[]) => Array.from(new Set(sections.filter((section) => section.enabled !== false).map((section) => placementForComponent(section.component))))

export const detectExperienceConflicts = (form: ExperienceForm, manifests: ExperienceManifest[], selectedManifestId?: string | null): ExperienceConflict[] => {
  const currentPlacements = placementSet(form.sections)
  return manifests.filter((manifest) => {
    if (manifest.manifest_id === selectedManifestId || manifest.state !== 'published' || manifest.kill_switch_active) return false
    if (manifest.market_code !== form.market_code.trim().toLowerCase() || manifest.surface !== form.surface) return false
    if (!dateRangeOverlaps(form.starts_at, form.ends_at || null, manifest.starts_at, manifest.ends_at)) return false
    if (!targetingOverlaps(form.targeting, manifest.targeting)) return false
    return currentPlacements.some((placement) => placementSet(manifest.sections).includes(placement))
  }).map((manifest) => ({
    manifest_id: manifest.manifest_id,
    revision: manifest.revision,
    campaign_name: campaignNameForManifest(manifest),
    placements: placementSet(manifest.sections),
    starts_at: manifest.starts_at,
    ends_at: manifest.ends_at,
  }))
}

const cleanedProperties = (properties: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(properties)
  .map(([key, value]) => [
    key,
    ['items', 'actions'].includes(key) && Array.isArray(value)
      ? value.map((item) => item && typeof item === 'object' && !Array.isArray(item)
        ? cleanedProperties(item as Record<string, unknown>)
        : item)
      : value,
  ])
  .filter(([, value]) => {
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    return value !== undefined && value !== null
  }))

export const formToPayload = (form: ExperienceForm) => ({
  ...(form.manifest_id ? { manifest_id: form.manifest_id } : {}),
  schema_version: form.schema_version,
  market_code: form.market_code.trim().toLowerCase(),
  locale: form.locale.trim(),
  surface: form.surface,
  min_app_version: form.min_app_version.trim(),
  max_app_version: form.max_app_version.trim() || null,
  starts_at: form.starts_at,
  ends_at: form.ends_at.trim() || null,
  schedule_timezone: form.schedule_timezone.trim() || 'UTC',
  rollout_stage: form.rollout_stage,
  canary_cohort: form.rollout_stage === 'canary' ? form.canary_cohort.trim().toLowerCase() : null,
  rollout_percentage: form.rollout_percentage,
  ttl_seconds: form.ttl_seconds,
  cache_policy: form.cache_policy,
  targeting: form.targeting,
  sections: form.sections.map((section) => ({ ...section, properties: cleanedProperties(section.properties) })),
  asset_references: form.asset_references.map((asset) => normalizeAssetForForm(asset)),
})
