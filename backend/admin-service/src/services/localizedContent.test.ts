jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

import { readDb } from '../db';
import {
  localeFallbackChain,
  parseLocalizedContentPackInput,
  resolveLocalizedContentReferences,
} from './localizedContent';

const readQuery = readDb.query as jest.Mock;

describe('localized content pack contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the explicit requested-language-market-default fallback order', () => {
    expect(localeFallbackChain('id-ID', 'en-US')).toEqual(['id-ID', 'id', 'en-US', 'en']);
    expect(localeFallbackChain('ar-SA', 'id-ID')).toEqual(['ar-SA', 'ar', 'id-ID', 'id']);
  });

  it('accepts bounded marketing copy and rejects protected content keys', () => {
    const parsed = parseLocalizedContentPackInput({
      market_code: 'ID-JK',
      surface: 'customer_web',
      pack_key: 'home.banner.title',
      content_kind: 'banner',
      locale: 'id-id',
      value: 'Pesan makanan tanpa antre.',
    });
    expect(parsed).toMatchObject({ market_code: 'id-jk', pack_key: 'home.banner.title', locale: 'id-ID' });

    expect(() => parseLocalizedContentPackInput({
      market_code: 'id-jk',
      surface: 'customer_web',
      pack_key: 'legal.terms.title',
      content_kind: 'marketing',
      locale: 'id-ID',
      value: 'Syarat layanan',
    })).toThrow(/approved versioned document\/compliance path/);

    expect(() => parseLocalizedContentPackInput({
      market_code: 'id-jk',
      surface: 'customer_web',
      pack_key: 'home.banner.title',
      content_kind: 'banner',
      locale: 'id-ID',
      value: 'x'.repeat(321),
    })).toThrow(/at most 320 characters/);
  });

  it('resolves a language fallback and never emits an unresolved raw key', async () => {
    readQuery.mockResolvedValueOnce({ rows: [{
      id: '11111111-1111-4111-8111-111111111111',
      market_code: 'id-jk',
      surface: 'customer_web',
      pack_key: 'home.banner.title',
      content_kind: 'banner',
      locale: 'id',
      value: 'Pesan sekarang',
      revision: 2,
      content_checksum: 'a'.repeat(64),
      effective_from: '2026-01-01T00:00:00.000Z',
      effective_to: null,
      state: 'published',
      created_by: null,
      updated_by: null,
      published_by: null,
      published_at: '2026-01-01T00:00:00.000Z',
      rolled_back_by: null,
      rolled_back_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }] });

    const result = await resolveLocalizedContentReferences({
      market_code: 'id-jk',
      surface: 'customer_web',
      requested_locale: 'id-ID',
      market_default_locale: 'en-US',
      sections: [{
        id: 'hero',
        component: 'hero_banner',
        properties: {
          title: 'safe literal fallback',
          localized_copy: { title: 'home.banner.title', body: 'missing.help.copy' },
        },
      }],
    });

    expect(result.sections[0].properties).toEqual({ title: 'Pesan sekarang' });
    expect(result.resolved['home.banner.title']).toMatchObject({ locale: 'id', revision: 2 });
    expect(JSON.stringify(result.sections)).not.toContain('missing.help.copy');
  });

  it('does not query the database when a manifest has no localized references', async () => {
    const result = await resolveLocalizedContentReferences({
      market_code: 'id-jk',
      surface: 'customer_android',
      requested_locale: 'id-ID',
      market_default_locale: 'id-ID',
      sections: [{ id: 'notice', component: 'notice', properties: { title: 'Info' } }],
    });
    expect(readQuery).not.toHaveBeenCalled();
    expect(result.sections[0].properties).toEqual({ title: 'Info' });
  });
});
