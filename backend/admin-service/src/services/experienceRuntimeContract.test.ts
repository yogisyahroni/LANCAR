import {
  parseExperienceManifestInput,
  pickExperienceManifest,
  type ExperienceManifestCandidate,
} from './experienceConfig';

const checksum = 'a'.repeat(64);

const validInput = {
  schema_version: 1,
  market_code: 'id-jk',
  locale: 'id-ID',
  surface: 'customer_android',
  min_app_version: '1.0.0',
  starts_at: '2026-01-01T00:00:00.000Z',
  schedule_timezone: 'Asia/Jakarta',
  ttl_seconds: 300,
  cache_policy: 'private',
  sections: [{
    id: 'hero',
    component: 'hero_banner',
    properties: { title: 'Promo', deep_link: '/promo' },
  }],
  asset_references: [],
};

const candidate = (overrides: Partial<ExperienceManifestCandidate> = {}): ExperienceManifestCandidate => ({
  manifest_id: '11111111-1111-4111-8111-111111111111',
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
  sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'Promo' } }],
  asset_references: [],
  checksum,
  signature: null,
  ...overrides,
});

describe('runtime experience contract fuzz corpus', () => {
  it('rejects arbitrary components and protected transaction fields across generated inputs', () => {
    const protectedFields = ['price', 'payment', 'eligibility', 'order_state', 'provider', 'transaction'];

    for (let index = 0; index < 64; index += 1) {
      const untrustedComponent = `remote_component_${index}`;
      expect(() => parseExperienceManifestInput({
        ...validInput,
        sections: [{
          id: `section-${index}`,
          component: untrustedComponent,
          properties: { title: 'Must never execute remotely' },
        }],
      })).toThrow(/not allowlisted/);

      const protectedField = protectedFields[index % protectedFields.length];
      expect(() => parseExperienceManifestInput({
        ...validInput,
        sections: [{
          id: `section-${index}`,
          component: 'hero_banner',
          properties: { title: 'Presentation only', [protectedField]: index },
        }],
      })).toThrow(/Unrecognized key/);
    }
  });

  it('keeps remotely shown promo content separate from authoritative eligibility and price', () => {
    expect(() => parseExperienceManifestInput({
      ...validInput,
      sections: [{
        id: 'promos',
        component: 'promo_carousel',
        properties: {
          items: [{
            id: 'promo-1',
            title: 'Diskon',
            deep_link: '/promo',
            eligibility: { minimum_order: 10000 },
            price: 0,
          }],
        },
      }],
    })).toThrow(/Unrecognized key/);
  });

  it('never selects a killed revision and preserves the explicit public fallback', () => {
    const killed = candidate({ revision: 2, kill_switch_active: true });
    const fallback = candidate({ revision: 1, sections: [{ id: 'fallback', component: 'notice', properties: { title: 'Order tetap tersedia' } }] });
    const selected = pickExperienceManifest([killed, fallback], {
      market_code: 'id-jk',
      locale: 'id-ID',
      default_locale: 'id-ID',
      app_version: '1.5.0',
    });

    expect(selected?.revision).toBe(1);
    expect(selected?.sections[0].properties).toEqual({ title: 'Order tetap tersedia' });
  });
});
