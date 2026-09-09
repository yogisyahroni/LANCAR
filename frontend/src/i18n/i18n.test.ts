import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, directionForLocale, localeFallbackChain, normalizeLocale } from './config';
import { formatAddress, formatCurrency, formatDateTime, formatPhone, formatNumber } from './format';
import { resolveLegalContent, resolveMarketingContent, type LocalizedContentRecord } from './content';
import { messages, translate } from './messages';

describe('locale contract', () => {
  it('normalizes supported browser hints and has a deterministic fallback chain', () => {
    expect(normalizeLocale('en-GB')).toBe('en-US');
    expect(normalizeLocale('id')).toBe(DEFAULT_LOCALE);
    expect(localeFallbackChain('en-AU', 'id-ID')).toEqual(['en-AU', 'en', 'id-ID', 'id']);
  });

  it('keeps RTL behavior testable before an RTL locale is released', () => {
    expect(directionForLocale('ar-SA')).toBe('rtl');
    expect(directionForLocale('he')).toBe('rtl');
    expect(directionForLocale('en-US')).toBe('ltr');
  });

  it('keeps every typed dictionary key translated', () => {
    expect(Object.keys(messages['id-ID']).sort()).toEqual(Object.keys(messages['en-US']).sort());
    expect(translate('en-US', 'nav.orders')).toBe('Order History');
    expect(translate('id-ID', 'nav.sender', { name: 'TOKO' })).toBe('PENGIRIM: TOKO');
  });
});

describe('locale-aware presentation', () => {
  it('formats money and numbers using the requested locale', () => {
    expect(formatNumber(1234567, 'id-ID')).not.toBe(formatNumber(1234567, 'en-US'));
    expect(formatCurrency(12500, 'IDR', 'id-ID')).toContain('12.500');
    expect(formatDateTime('2026-01-02T03:04:05Z', 'en-US', 'UTC')).toContain('2026');
  });

  it('formats address and phone values without losing data', () => {
    expect(formatAddress({ street: 'Jl. Merdeka 1', city: 'Jakarta', postalCode: '10110' }, 'id-ID')).toContain('Jakarta');
    expect(formatPhone('08123456789', 'ID')).toBe('+62 8123 4567 89');
    expect(formatPhone(undefined)).toBe('—');
  });
});

const content: LocalizedContentRecord[] = [
  { key: 'home.banner', locale: 'id-ID', value: 'Kirim lebih mudah', status: 'published', publishedAt: '2026-01-01T00:00:00Z' },
  { key: 'home.banner', locale: 'en', value: 'Send with ease', status: 'published', publishedAt: '2026-01-01T00:00:00Z' },
  { key: 'terms', locale: 'id-ID', value: 'Syarat versi 4', status: 'approved', version: 4, approvedAt: '2026-01-01T00:00:00Z', effectiveFrom: '2026-01-01T00:00:00Z' },
  { key: 'terms', locale: 'en-US', value: 'Terms version 3', status: 'draft', version: 3, effectiveFrom: '2026-01-01T00:00:00Z' },
];

describe('dynamic localized content', () => {
  const options = { requestedLocale: 'en-AU', marketDefaultLocale: 'id-ID', now: new Date('2026-02-01T00:00:00Z') };

  it('falls back from a regional locale to language and market default', () => {
    expect(resolveMarketingContent(content, 'home.banner', options)?.value).toBe('Send with ease');
  });

  it('never returns unapproved legal content', () => {
    expect(resolveLegalContent(content, 'terms', options)?.value).toBe('Syarat versi 4');
    expect(resolveLegalContent(content, 'missing', options)).toBeNull();
  });
});
