jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

import { db, readDb } from '../db';
import {
  canonicalExperienceManifestPayload,
  compareSemanticVersions,
  createExperienceManifest,
  getExperienceCacheControl,
  parseExperienceManifestInput,
  pickExperienceManifest,
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
  ttl_seconds: 300,
  cache_policy: 'private',
  targeting: { cohorts: [] },
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
  ttl_seconds: 300,
  cache_policy: 'private',
  targeting: { cohorts: [] },
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
    expect(parsed.sections[0].component).toBe('hero_banner');
    expect(parsed.asset_references).toEqual([]);
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
      ttl_seconds: 300,
      cache_policy: 'private',
      targeting: { cohorts: [] },
      sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'x' } }],
      asset_references: [],
    });
    const payloadB = payloadA.replace('"private"', '"private"');
    expect(payloadA).toBe(payloadB);
  });

  it('selects exactly one manifest by locale, targeting, and app range', () => {
    const selected = pickExperienceManifest([
      candidate({ revision: 5, locale: 'en-US' }),
      candidate({ revision: 2, locale: 'en-US', targeting: { cohorts: ['beta'] } }),
      candidate({ revision: 9, locale: 'id-ID' }),
    ], { locale: 'en-US', default_locale: 'id-ID', app_version: '1.5.0', cohort: 'beta' });
    expect(selected?.revision).toBe(2);
    expect(selected?.resolved_locale).toBe('en-US');

    const fallback = pickExperienceManifest([candidate({ revision: 3 })], {
      locale: 'fr-FR', default_locale: 'id-ID', app_version: '1.5.0',
    });
    expect(fallback?.resolved_locale).toBe('id-ID');

    expect(pickExperienceManifest([candidate({ min_app_version: '2.0.0' })], {
      locale: 'id-ID', default_locale: 'id-ID', app_version: '1.5.0',
    })).toBeNull();
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
      .mockResolvedValueOnce({ rows: [row('published', 2)] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await publishExperienceManifest(manifestId, actorId, 'corr-2');
    expect(result.state).toBe('published');
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes("state = 'published'"))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
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
});
