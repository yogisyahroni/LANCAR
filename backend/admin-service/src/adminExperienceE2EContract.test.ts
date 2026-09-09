import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

jest.mock('./db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

import {
  canonicalExperienceManifestPayload,
  parseExperienceManifestInput,
  pickExperienceManifest,
  previewExperienceManifestAudience,
  previewExperienceManifestRevision,
  type ExperienceManifestCandidate,
} from './services/experienceConfig';

const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

const manifestId = '11111111-1111-4111-8111-111111111111';
const checksum = 'a'.repeat(64);

const targeting = {
  cohorts: [],
  market_codes: [],
  city_codes: [],
  zone_codes: [],
  locales: [],
  service_usage_cohorts: [],
  roles: [],
  experiment_assignments: [],
};

const candidate = (overrides: Partial<ExperienceManifestCandidate> = {}): ExperienceManifestCandidate => ({
  manifest_id: manifestId,
  revision: 1,
  schema_version: 1,
  market_code: 'id-jk',
  locale: 'id-ID',
  surface: 'customer_android',
  min_app_version: '1.0.0',
  max_app_version: null,
  starts_at: '2026-09-01T00:00:00.000Z',
  ends_at: null,
  schedule_timezone: 'Asia/Jakarta',
  rollout_stage: 'public',
  canary_cohort: null,
  rollout_percentage: 100,
  ttl_seconds: 300,
  cache_policy: 'private',
  targeting: { ...targeting },
  sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'Banner terbaru' } }],
  asset_references: [],
  checksum,
  signature: null,
  ...overrides,
});

const checksumFor = (value: ExperienceManifestCandidate): string => createHash('sha256').update(canonicalExperienceManifestPayload({
  manifest_id: value.manifest_id,
  revision: value.revision,
  schema_version: value.schema_version,
  market_code: value.market_code,
  locale: value.locale,
  surface: value.surface,
  min_app_version: value.min_app_version,
  max_app_version: value.max_app_version,
  starts_at: value.starts_at,
  ends_at: value.ends_at,
  schedule_timezone: value.schedule_timezone,
  rollout_stage: value.rollout_stage,
  canary_cohort: value.canary_cohort,
  rollout_percentage: value.rollout_percentage,
  ttl_seconds: value.ttl_seconds,
  cache_policy: value.cache_policy,
  targeting: value.targeting,
  sections: value.sections,
  asset_references: value.asset_references,
})).digest('hex');

const record = (overrides: Partial<ExperienceManifestCandidate & {
  state: 'draft' | 'published' | 'superseded' | 'rolled_back';
  requires_approval: boolean;
  approval_status: 'not_required' | 'draft' | 'pending' | 'approved' | 'rejected';
}> = {}) => {
  const value = {
    ...candidate(),
    state: 'draft' as const,
    created_by: '22222222-2222-4222-8222-222222222222',
    updated_by: '22222222-2222-4222-8222-222222222222',
    published_by: null,
    published_at: null,
    rolled_back_by: null,
    rolled_back_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    requires_approval: false,
    approval_status: 'not_required' as const,
    approval_requested_by: null,
    approval_requested_at: null,
    approved_by: null,
    approved_at: null,
    kill_switch_active: false,
    kill_switched_by: null,
    kill_switched_at: null,
    kill_switch_reason: null,
    id: '33333333-3333-4333-8333-333333333333',
    ...overrides,
  };
  return { ...value, checksum: checksumFor(value) } as any;
};

const audience = (overrides: Record<string, unknown> = {}) => ({
  market_code: 'id-jk',
  locale: 'id-ID',
  default_locale: 'id-ID',
  app_version: '1.5.0',
  schema_version: 1,
  device_preset: 'phone',
  theme_mode: 'system',
  at: '2026-09-10T08:00:00.000Z',
  ...overrides,
});

describe('ADMEXP-2026-019 Admin-to-App acceptance contract', () => {
  it('runs draft → preview → eligible app resolution and keeps the published section order', async () => {
    const draft = record({
      sections: [{ id: 'banner', component: 'hero_banner', properties: { title: 'Banner terbaru' } }],
    });
    const preview = await previewExperienceManifestRevision(
      draft,
      audience(),
      { query: jest.fn().mockResolvedValue({ rows: [] }) },
      async () => null,
    );

    expect(preview.validation.valid).toBe(true);
    expect(preview.candidate?.manifest.sections[0].properties.title).toBe('Banner terbaru');
    expect(pickExperienceManifest([draft], audience() as any)?.revision).toBe(1);
    expect(read('../../../admin-dashboard/src/pages/AppExperience.tsx')).toContain('/admin/experience/manifests/${actionManifest?.manifest_id}/publish');
    expect(read('../../../frontend/src/components/experience/ExperienceRenderer.tsx')).toContain('sections.map');
  });

  it('publishes a reordered Home Layout payload without requiring a binary change', () => {
    const ordered = candidate({
      sections: [
        { id: 'service-grid', component: 'service_grid', properties: { title: 'Layanan' } },
        { id: 'notice', component: 'notice', properties: { title: 'Info terbaru' } },
      ],
    });
    expect(pickExperienceManifest([ordered], audience() as any)?.sections.map((section) => section.id))
      .toEqual(['service-grid', 'notice']);
    expect(read('../../../frontend/e2e/runtime-experience.spec.ts')).toContain('without an app release');
  });

  it('honours future schedule boundaries in the configured timezone', () => {
    const scheduled = record({
      starts_at: '2026-09-10T09:00:00.000Z',
      ends_at: '2026-09-10T10:00:00.000Z',
    });
    expect(previewExperienceManifestAudience(scheduled, audience({ at: '2026-09-10T08:59:59.000Z' })))
      .toMatchObject({ matched: false, reason: 'outside_schedule' });
    expect(previewExperienceManifestAudience(scheduled, audience({ at: '2026-09-10T09:30:00.000Z' })))
      .toMatchObject({ matched: true, reason: 'matched' });
    expect(previewExperienceManifestAudience(scheduled, audience({ at: '2026-09-10T10:00:00.000Z' })))
      .toMatchObject({ matched: false, reason: 'outside_schedule' });
  });

  it('selects a city-targeted campaign only in its matching city', () => {
    const targeted = candidate({
      targeting: { ...targeting, city_codes: ['jakarta-selatan'] },
      revision: 2,
    });
    const broad = candidate({ revision: 1 });
    const base = { ...audience(), default_locale: 'id-ID' } as any;
    expect(pickExperienceManifest([broad, targeted], { ...base, city_code: 'jakarta-selatan' })?.revision).toBe(2);
    expect(pickExperienceManifest([broad, targeted], { ...base, city_code: 'bandung' })?.revision).toBe(1);
  });

  it('fails closed for old app/schema clients and renders only compiled components', async () => {
    const future = record({ min_app_version: '2.0.0', schema_version: 2 });
    const preview = await previewExperienceManifestRevision(
      future,
      audience({ app_version: '1.5.0', schema_version: 1 }),
      { query: jest.fn().mockResolvedValue({ rows: [] }) },
      async () => null,
    );
    expect(preview.simulation).toMatchObject({ matched: false, reason: 'unsupported_schema_version' });
    expect(preview.candidate).toBeNull();
    expect(read('../../../frontend/src/lib/experience/experienceClient.ts')).toContain('CUSTOMER_COMPONENTS');
    expect(read('../../../android-app-customer/app/src/test/java/com/tembus/customer/config/DynamicHomeRendererTest.kt'))
      .toContain('unknownComponentIsSkippedAndReportedToTelemetrySink');
  });

  it('blocks unsafe deep-link/schema input with field-level validation instead of publishing it', () => {
    expect(() => parseExperienceManifestInput({
      schema_version: 1,
      market_code: 'id-jk',
      locale: 'id-ID',
      surface: 'customer_android',
      min_app_version: '1.0.0',
      starts_at: '2026-09-01T00:00:00.000Z',
      schedule_timezone: 'Asia/Jakarta',
      ttl_seconds: 300,
      cache_policy: 'private',
      sections: [{ id: 'unsafe', component: 'hero_banner', properties: { title: 'x', deep_link: 'javascript:alert(1)' } }],
      asset_references: [],
    })).toThrow();
    expect(read('../../../admin-dashboard/src/components/experience/DeepLinkTester.tsx')).toContain('Fallback required');
    expect(read('../../../admin-dashboard/src/pages/AppExperience.tsx')).toContain('Preview before publish');
  });

  it('protects publish, rollback and kill-switch endpoints from unauthorized direct calls', () => {
    const routes = read('./routes/admin.routes.ts');
    expect(routes).toContain("requireExperienceAccess(EXPERIENCE_PERMISSIONS.publish");
    expect(routes).toContain("requireExperienceAccess(EXPERIENCE_PERMISSIONS.rollback");
    expect(routes).toContain("requireExperienceAccess(EXPERIENCE_PERMISSIONS.killSwitchExecute");
    expect(read('./middleware/experienceAuthorization.test.ts')).toContain('returns a typed permission denial');
  });

  it('rejects a stale two-admin draft update rather than losing the newer edit', () => {
    expect(read('./services/experienceConfig.ts')).toContain("'EXPERIENCE_VERSION_CONFLICT'");
    expect(read('./services/experienceConfig.test.ts')).toContain('rejects a stale draft update before writing over a newer revision');
  });

  it('limits canary exposure to the assigned cohort and keeps the public fallback', () => {
    const canary = candidate({ revision: 2, rollout_stage: 'canary', canary_cohort: 'internal-test', rollout_percentage: 100 });
    const fallback = candidate({ revision: 1, rollout_stage: 'public' });
    const base = { ...audience(), default_locale: 'id-ID' } as any;
    expect(pickExperienceManifest([fallback, canary], base)?.revision).toBe(1);
    expect(pickExperienceManifest([fallback, canary], { ...base, cohort: 'internal-test' })?.revision).toBe(2);
  });

  it('restores a compatible known-good revision through the audited rollback path', () => {
    const current = record({ revision: 2, state: 'published' });
    const target = record({ revision: 1, state: 'superseded' });
    expect(current.surface).toBe(target.surface);
    expect(current.schema_version).toBe(target.schema_version);
    expect(target.kill_switch_active).toBe(false);
    expect(read('./services/experienceConfig.ts')).toContain("'EXPERIENCE_ROLLBACK_TARGET_INCOMPATIBLE'");
    expect(read('./services/experienceConfig.test.ts')).toContain('rolls back to a historical revision without editing its payload');
  });

  it('keeps new_order_gate semantics separate from marketing visibility and preserves active recovery', () => {
    const killSwitches = read('./services/experienceKillSwitches.ts');
    expect(killSwitches).toContain("'new_order_gate'");
    expect(killSwitches).toContain('preserve_active_orders');
    expect(killSwitches).toContain("reject_new_orders");
    expect(read('../../../frontend/e2e/runtime-experience.spec.ts')).toContain('active-order recovery path');
    expect(read('../../../admin-dashboard/src/pages/AppExperience.tsx')).toContain('Pause');
  });

  it('allows promo presentation to publish while financial eligibility remains server-authoritative', () => {
    expect(() => parseExperienceManifestInput({
      schema_version: 1,
      market_code: 'id-jk',
      locale: 'id-ID',
      surface: 'customer_android',
      min_app_version: '1.0.0',
      starts_at: '2026-09-01T00:00:00.000Z',
      schedule_timezone: 'Asia/Jakarta',
      ttl_seconds: 300,
      cache_policy: 'private',
      sections: [{
        id: 'promo',
        component: 'promo_carousel',
        properties: { items: [{ id: 'sale', title: 'Sale', deep_link: '/promo' }] },
      }],
      asset_references: [],
    })).not.toThrow();
    expect(() => parseExperienceManifestInput({
      schema_version: 1,
      market_code: 'id-jk',
      locale: 'id-ID',
      surface: 'customer_android',
      min_app_version: '1.0.0',
      starts_at: '2026-09-01T00:00:00.000Z',
      schedule_timezone: 'Asia/Jakarta',
      ttl_seconds: 300,
      cache_policy: 'private',
      sections: [{
        id: 'promo',
        component: 'promo_carousel',
        properties: { items: [{ id: 'sale', title: 'Sale', deep_link: '/promo', price: 0 }] },
      }],
      asset_references: [],
    })).toThrow();
    expect(read('./services/promoEngine.ts')).toContain('validatePromoForCheckout');
    expect(read('../../../frontend/src/app/(portal)/orders/new/ondemand/page.tsx')).toContain('/auth/web/promos/validate');
  });
});
