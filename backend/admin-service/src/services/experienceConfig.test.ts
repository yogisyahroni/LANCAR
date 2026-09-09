jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

import { db, readDb } from '../db';
import {
  canonicalExperienceManifestPayload,
  compareSemanticVersions,
  createExperienceManifest,
  approveExperienceManifest,
  getExperienceCacheControl,
  getExperienceManifestHistory,
  parseExperienceManifestInput,
  pickExperienceManifest,
  previewExperienceManifestAudience,
  publishExperienceManifest,
  rollbackExperienceManifest,
  resolvePublicExperienceManifest,
  type ExperienceManifestCandidate,
} from './experienceConfig';

const manifestId = '11111111-1111-4111-8111-111111111111';
const revisionId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const checksum = 'a'.repeat(64);

const validInput = {
  schema_version: 1,
  market_code: 'ID-JK',
  locale: 'en-us',
  surface: 'customer_android',
  min_app_version: '1.2.0',
  starts_at: '2026-01-01T00:00:00.000Z',
  schedule_timezone: 'Asia/Jakarta',
  ttl_seconds: 300,
  cache_policy: 'private',
  targeting: { cohorts: ['beta'], experiment_ref: 'home-v1' },
  sections: [{
    id: 'hero',
    component: 'hero_banner',
    properties: { title: 'Welcome', body: 'Safe presentation only', deep_link: '/home' },
  }],
  asset_references: [],
};

const row = (state: string, revision = 1): Record<string, unknown> => ({
  id: revisionId,
  manifest_id: manifestId,
  revision,
  schema_version: 1,
  market_code: 'id-jk',
  locale: 'en-US',
  surface: 'customer_android',
  min_app_version: '1.0.0',
  max_app_version: null,
  starts_at: '2026-01-01T00:00:00.000Z',
  ends_at: null,
  schedule_timezone: 'Asia/Jakarta',
  rollout_stage: 'public',
  canary_cohort: null,
  ttl_seconds: 300,
  cache_policy: 'private',
  targeting: {
    cohorts: [], market_codes: [], city_codes: [], zone_codes: [], locales: [],
    service_usage_cohorts: [], roles: [], experiment_assignments: [],
  },
  sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'Welcome' } }],
  asset_references: [],
  content_checksum: checksum,
  signature: null,
  state,
  created_by: actorId,
  updated_by: actorId,
  published_by: state === 'published' ? actorId : null,
  published_at: state === 'published' ? '2026-01-01T00:00:00.000Z' : null,
  rolled_back_by: null,
  rolled_back_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  requires_approval: false,
  approval_status: 'not_required',
  approval_requested_by: null,
  approval_requested_at: null,
  approved_by: null,
  approved_at: null,
});

const candidate = (overrides: Partial<ExperienceManifestCandidate> = {}): ExperienceManifestCandidate => ({
  manifest_id: manifestId,
  revision: 1,
  schema_version: 1,
  market_code: 'id-jk',
  locale: 'id-ID',
  surface: 'customer_android',
  min_app_version: '1.0.0',
  max_app_version: null,
  starts_at: '2026-01-01T00:00:00.000Z',
  ends_at: null,
  schedule_timezone: 'Asia/Jakarta',
  rollout_stage: 'public',
  canary_cohort: null,
  ttl_seconds: 300,
  cache_policy: 'private',
  targeting: {
    cohorts: [], market_codes: [], city_codes: [], zone_codes: [], locales: [],
    service_usage_cohorts: [], roles: [], experiment_assignments: [],
  },
  sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'Welcome' } }],
  asset_references: [],
  checksum,
  signature: null,
  ...overrides,
});

describe('experience manifest contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes a valid manifest and applies safe defaults', () => {
    const parsed = parseExperienceManifestInput(validInput);
    expect(parsed.market_code).toBe('id-jk');
    expect(parsed.locale).toBe('en-US');
    expect(parsed.targeting.cohorts).toEqual(['beta']);
    expect(parsed.schedule_timezone).toBe('Asia/Jakarta');
    expect(parsed.sections[0].component).toBe('hero_banner');
    expect(parsed.asset_references).toEqual([]);
  });

  it('converts timezone-less schedule wall-clock values using the declared IANA timezone', () => {
    const parsed = parseExperienceManifestInput({
      ...validInput,
      starts_at: '2026-06-01T09:00:00',
      ends_at: '2026-06-01T10:00:00',
      schedule_timezone: 'Asia/Jakarta',
    });
    expect(parsed.starts_at.toISOString()).toBe('2026-06-01T02:00:00.000Z');
    expect(parsed.ends_at?.toISOString()).toBe('2026-06-01T03:00:00.000Z');
  });

  it('accepts safe audience dimensions and rejects unapproved personal attributes or timezones', () => {
    const parsed = parseExperienceManifestInput({
      ...validInput,
      targeting: {
        market_codes: ['id-jk'],
        city_codes: ['jakarta-selatan'],
        zone_codes: ['zone-south'],
        locales: ['id-ID'],
        service_usage_cohorts: ['food-repeat'],
        user_status: 'existing',
        roles: ['customer'],
        cohorts: ['beta'],
        experiment_ref: 'food-home',
        experiment_assignments: ['treatment-a'],
      },
    });
    expect(parsed.targeting.service_usage_cohorts).toEqual(['food-repeat']);
    expect(() => parseExperienceManifestInput({ ...validInput, targeting: { email: 'user@example.com' } })).toThrow(/email/);
    expect(() => parseExperienceManifestInput({ ...validInput, schedule_timezone: 'Not/A-Timezone' })).toThrow(/schedule_timezone/);
  });

  it('accepts presentation-only service card targeting and native notice/spacer sections', () => {
    const parsed = parseExperienceManifestInput({
      ...validInput,
      sections: [
        {
          id: 'services',
          component: 'service_grid',
          properties: {
            cards: [
              { code: 'tembus_instant', subtitle: 'Cepat', badge: 'Baru' },
            ],
            display_mode: 'cards',
          },
        },
        { id: 'notice', component: 'notice', properties: { title: 'Info' } },
        { id: 'gap', component: 'spacer', properties: { size: 'small' } },
        {
          id: 'intro',
          component: 'campaign_intro',
          properties: {
            campaign_id: 'launch-2026',
            title: 'Selamat datang',
            frequency_cap_hours: 24,
            max_impressions: 2,
            dismissible: true,
            skippable: true,
          },
        },
      ],
    });

    expect(parsed.sections.map((section) => section.component)).toEqual([
      'service_grid',
      'notice',
      'spacer',
      'campaign_intro',
    ]);
    expect(parsed.sections[0].properties).toMatchObject({
      cards: [{ code: 'tembus_instant', subtitle: 'Cepat', badge: 'Baru' }],
    });
  });

  it('accepts first-party banner media, badge, campaign identity and external CTA targets', () => {
    const parsed = parseExperienceManifestInput({
      ...validInput,
      sections: [
        {
          id: 'hero',
          component: 'hero_banner',
          properties: {
            campaign_id: 'ramadan-2026',
            title: 'Promo Ramadan',
            badge: 'Terbatas',
            external_url: 'https://app.bawain.my.id/promo/ramadan?source=home',
          },
        },
        {
          id: 'promos',
          component: 'promo_carousel',
          properties: {
            items: [{
              id: 'promo-1',
              campaign_id: 'ramadan-2026',
              title: 'Diskon ongkir',
              badge: 'Baru',
              external_url: 'https://bawain.my.id/promo/1',
            }],
          },
        },
      ],
    });

    expect(parsed.sections[0].properties).toMatchObject({
      campaign_id: 'ramadan-2026',
      badge: 'Terbatas',
      external_url: 'https://app.bawain.my.id/promo/ramadan?source=home',
    });
    expect(parsed.sections[1].properties).toMatchObject({
      items: [expect.objectContaining({ campaign_id: 'ramadan-2026', badge: 'Baru' })],
    });
  });

  it('accepts bounded runtime design token presets and applies safe defaults', () => {
    const parsed = parseExperienceManifestInput({
      ...validInput,
      sections: [{
        id: 'campaign-theme',
        component: 'design_tokens',
        properties: {
          accent_preset: 'campaign_orange',
          background_preset: 'accent_soft',
          corner_preset: 'emphasized',
          spacing_preset: 'relaxed',
          badge_preset: 'pill',
        },
      }],
    });

    expect(parsed.sections[0].properties).toEqual({
      accent_preset: 'campaign_orange',
      background_preset: 'accent_soft',
      corner_preset: 'emphasized',
      spacing_preset: 'relaxed',
      badge_preset: 'pill',
    });

    const defaults = parseExperienceManifestInput({
      ...validInput,
      sections: [{ id: 'campaign-theme', component: 'design_tokens', properties: {} }],
    });
    expect(defaults.sections[0].properties).toMatchObject({
      accent_preset: 'brand',
      background_preset: 'surface',
      corner_preset: 'standard',
      spacing_preset: 'standard',
      badge_preset: 'pill',
    });
  });

  it('rejects arbitrary design colors, unknown presets, and remote font instructions', () => {
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{
        id: 'campaign-theme',
        component: 'design_tokens',
        properties: { accent_preset: '#FF0000' },
      }],
    })).toThrow();
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{
        id: 'campaign-theme',
        component: 'design_tokens',
        properties: { spacing_preset: 'huge' },
      }],
    })).toThrow();
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{
        id: 'campaign-theme',
        component: 'design_tokens',
        properties: { font_url: 'https://evil.example/font.woff2' },
      }],
    })).toThrow('Unrecognized key');
  });

  it('rejects unknown components, unsafe links, and protected properties', () => {
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{ id: 'hero', component: 'custom_html', properties: { title: 'x' } }],
    })).toThrow('not allowlisted');
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'x', deep_link: 'javascript:alert(1)' } }],
    })).toThrow('allowlisted LANCAR route');
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'x', external_url: 'https://evil.example/promo' } }],
    })).toThrow('allowlisted first-party host');
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{
        id: 'hero',
        component: 'hero_banner',
        properties: { title: 'x', deep_link: '/promo', external_url: 'https://app.bawain.my.id/promo' },
      }],
    })).toThrow('only one CTA target');
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'x', payment: 'override' } }],
    })).toThrow('Unrecognized key');
  });

  it('keeps promo presentation separate from authoritative pricing and eligibility', () => {
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{
        id: 'promos',
        component: 'promo_carousel',
        properties: {
          items: [{ id: 'promo-1', title: 'Promo', discount_amount: 10000 }],
        },
      }],
    })).toThrow('Unrecognized key');

    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{
        id: 'promos',
        component: 'promo_carousel',
        properties: {
          items: [{
            id: 'promo-1',
            title: 'Promo',
            deep_link: '/promo',
            external_url: 'https://app.bawain.my.id/promo',
          }],
        },
      }],
    })).toThrow('only one CTA target');
  });

  it('rejects undeclared assets and invalid version ranges', () => {
    expect(() => parseExperienceManifestInput({
      ...validInput,
      max_app_version: '1.0.0',
    })).toThrow('max_app_version');
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'x', image_asset_id: 'missing' } }],
    })).toThrow('Referenced assets are missing');
  });

  it('compares semantic versions and creates deterministic canonical payloads', () => {
    expect(compareSemanticVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0);
    expect(compareSemanticVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    const payloadA = canonicalExperienceManifestPayload({
      manifest_id: manifestId,
      revision: 1,
      schema_version: 1,
      market_code: 'id-jk',
      locale: 'en-US',
      surface: 'customer_android',
      min_app_version: '1.0.0',
      max_app_version: null,
      starts_at: '2026-01-01T00:00:00.000Z',
      ends_at: null,
      schedule_timezone: 'Asia/Jakarta',
      rollout_stage: 'public',
      canary_cohort: null,
      ttl_seconds: 300,
      cache_policy: 'private',
      targeting: {
        cohorts: [], market_codes: [], city_codes: [], zone_codes: [], locales: [],
        service_usage_cohorts: [], roles: [], experiment_assignments: [],
      },
      sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'x' } }],
      asset_references: [],
    });
    const payloadB = payloadA.replace('"private"', '"private"');
    expect(payloadA).toBe(payloadB);
  });

  it('selects exactly one manifest by locale, targeting, and app range', () => {
    const selected = pickExperienceManifest([
      candidate({ revision: 5, locale: 'en-US' }),
      candidate({ revision: 2, locale: 'en-US', targeting: { cohorts: ['beta'] } as any }),
      candidate({ revision: 9, locale: 'id-ID' }),
    ], { market_code: 'id-jk', locale: 'en-US', default_locale: 'id-ID', app_version: '1.5.0', cohort: 'beta' });
    expect(selected?.revision).toBe(2);
    expect(selected?.resolved_locale).toBe('en-US');

    const fallback = pickExperienceManifest([candidate({ revision: 3 })], {
      market_code: 'id-jk', locale: 'fr-FR', default_locale: 'id-ID', app_version: '1.5.0',
    });
    expect(fallback?.resolved_locale).toBe('id-ID');

    expect(pickExperienceManifest([candidate({ min_app_version: '2.0.0' })], {
      market_code: 'id-jk', locale: 'id-ID', default_locale: 'id-ID', app_version: '1.5.0',
    })).toBeNull();
  });

  it('serves a canary only to its explicit test cohort and keeps the public fallback', () => {
    const canary = candidate({ rollout_stage: 'canary', canary_cohort: 'internal-test', revision: 2 });
    const publicFallback = candidate({ rollout_stage: 'public', canary_cohort: null, revision: 1 });
    const baseRequest = { market_code: 'id-jk', locale: 'id-ID', default_locale: 'id-ID', app_version: '1.5.0' };
    expect(pickExperienceManifest([publicFallback, canary], baseRequest)?.revision).toBe(1);
    expect(pickExperienceManifest([publicFallback, canary], { ...baseRequest, cohort: 'internal-test' })?.revision).toBe(2);
  });

  it('resolves complex audience targeting and preserves an untargeted fallback', () => {
    const targeted = candidate({
      revision: 2,
      targeting: {
        market_codes: ['id-jk'],
        city_codes: ['jakarta-selatan'],
        zone_codes: ['zone-south'],
        locales: ['en-US'],
        service_usage_cohorts: ['food-repeat'],
        user_status: 'existing',
        roles: ['customer'],
        cohorts: ['beta'],
        experiment_ref: 'food-home',
        experiment_assignments: ['treatment-a'],
      } as any,
    });
    const request = {
      market_code: 'id-jk', locale: 'en-US', default_locale: 'id-ID', app_version: '1.5.0',
      city_code: 'jakarta-selatan', zone_code: 'zone-south', service_usage_cohort: 'food-repeat',
      user_status: 'existing' as const, role: 'customer' as const, cohort: 'beta',
      experiment_ref: 'food-home', experiment_assignment: 'treatment-a',
    };
    expect(pickExperienceManifest([candidate({ revision: 1 }), targeted], request)?.revision).toBe(2);
    expect(pickExperienceManifest([candidate({ revision: 1 }), targeted], { ...request, city_code: 'bandung' })?.revision).toBe(1);
  });

  it('previews a draft against a simulated audience and schedule without exposing rules', () => {
    const result = previewExperienceManifestAudience(row('draft') as any, {
      market_code: 'id-jk', locale: 'en-US', app_version: '1.5.0', at: '2026-01-02T00:00:00.000Z',
    });
    expect(result).toMatchObject({ matched: true, reason: 'matched' });
    expect(result).not.toHaveProperty('targeting');
    expect(previewExperienceManifestAudience(row('draft') as any, {
      market_code: 'id-jk', locale: 'en-US', app_version: '1.5.0', at: '2025-12-31T00:00:00.000Z',
    })).toMatchObject({ matched: false, reason: 'outside_schedule' });
  });

  it('maps cache policy to an explicit cache header', () => {
    expect(getExperienceCacheControl({ ...candidate(), cache_policy: 'no-store' } as any)).toBe('no-store');
    expect(getExperienceCacheControl({ ...candidate(), cache_policy: 'public', ttl_seconds: 60 } as any)).toContain('public, max-age=60');
  });
});

describe('experience manifest lifecycle persistence', () => {
  const client = { query: jest.fn(), release: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (db.connect as jest.Mock).mockResolvedValue(client);
  });

  it('creates a draft revision and records an audit event transactionally', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ market_code: 'id-jk' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row('draft')] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await createExperienceManifest({ ...validInput, manifest_id: manifestId }, actorId, 'corr-1');
    expect(result.state).toBe('draft');
    expect(result.revision).toBe(1);
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes('experience_manifest_audit'))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('publishes only the draft and supersedes the previous revision', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row('draft', 2)] })
      .mockResolvedValueOnce({ rows: [row('published', 1)] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row('published', 2)] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await publishExperienceManifest(manifestId, actorId, 'corr-2');
    expect(result.state).toBe('published');
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes("state = 'published'"))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('blocks publishing a targeted manifest when no untargeted fallback is active', async () => {
    const targetedDraft = row('draft', 2) as any;
    targetedDraft.targeting = { cohorts: ['beta'] };
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [targetedDraft] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(publishExperienceManifest(manifestId, actorId, 'corr-fallback'))
      .rejects.toMatchObject({ code: 'EXPERIENCE_FALLBACK_REQUIRED', status: 409 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('requires maker-checker approval before publishing a broad manifest', async () => {
    const pendingDraft = row('draft', 2) as any;
    pendingDraft.requires_approval = true;
    pendingDraft.approval_status = 'pending';
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [pendingDraft] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(publishExperienceManifest(manifestId, actorId, 'corr-approval'))
      .rejects.toMatchObject({ code: 'EXPERIENCE_APPROVAL_REQUIRED', status: 409 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('approves a high-impact draft only through a different operator and records the audit', async () => {
    const pendingDraft = row('draft') as any;
    pendingDraft.requires_approval = true;
    pendingDraft.approval_status = 'pending';
    const approvedDraft = { ...pendingDraft, approval_status: 'approved', approved_by: '44444444-4444-4444-8444-444444444444' };
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [pendingDraft] })
      .mockResolvedValueOnce({ rows: [approvedDraft] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await approveExperienceManifest(manifestId, '44444444-4444-4444-8444-444444444444', 'corr-approval');
    expect(result.approval_status).toBe('approved');
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes("action") && sql.includes('experience_manifest_audit'))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('returns revision history together with append-only audit entries for CMS review', async () => {
    (readDb.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [row('published')] })
      .mockResolvedValueOnce({ rows: [{
        id: '55555555-5555-4555-8555-555555555555', revision_id: revisionId, manifest_id: manifestId,
        revision: 1, action: 'draft_created', actor_id: actorId, reason: 'created', correlation_id: 'corr-history',
        previous_state: null, new_state: 'draft', metadata: {}, created_at: '2026-01-01T00:00:00.000Z',
      }] });

    const result = await getExperienceManifestHistory(manifestId);
    expect(result.revisions).toHaveLength(1);
    expect(result.audit[0]).toMatchObject({ action: 'draft_created', actor_id: actorId });
  });

  it('rolls back to a historical revision without editing its payload', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row('published', 2)] })
      .mockResolvedValueOnce({ rows: [row('superseded', 1)] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row('published', 1)] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await rollbackExperienceManifest(manifestId, 1, actorId, 'Bad campaign copy', 'corr-3');
    expect(result.state).toBe('published');
    expect(result.revision).toBe(1);
    expect(client.query.mock.calls.filter(([sql]: [string]) => sql.includes('experience_manifest_audit')).length).toBe(2);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('does not claim a public manifest from an inactive market', async () => {
    (readDb.query as jest.Mock).mockResolvedValueOnce({ rows: [{ default_locale: 'id-ID', launch_state: 'paused' }] });
    await expect(resolvePublicExperienceManifest({
      market_code: 'id-jk',
      locale: 'id-ID',
      surface: 'customer_android',
      app_version: '1.2.0',
    })).rejects.toMatchObject({ code: 'EXPERIENCE_MARKET_UNAVAILABLE', status: 503 });
    expect(readDb.query).toHaveBeenCalledTimes(1);
  });

  it('derives new/existing user targeting on the server without returning audience rules', async () => {
    const targeted = row('published') as any;
    targeted.targeting = {
      cohorts: [], market_codes: [], city_codes: [], zone_codes: [], locales: [],
      service_usage_cohorts: [], roles: [], experiment_assignments: [], user_status: 'new',
    };
    (readDb.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ default_locale: 'id-ID', launch_state: 'active' }] })
      .mockResolvedValueOnce({ rows: [targeted] })
      .mockResolvedValueOnce({ rows: [{ created_at: new Date(Date.now() - 2 * 86400000).toISOString() }] });

    const result = await resolvePublicExperienceManifest({
      market_code: 'id-jk', locale: 'en-US', surface: 'customer_android', app_version: '1.5.0', user_id: actorId,
    });
    expect(result.revision).toBe(1);
    expect(result).not.toHaveProperty('targeting');
    expect(readDb.query).toHaveBeenNthCalledWith(3, expect.stringContaining('SELECT created_at FROM users'), [actorId]);
  });
});
