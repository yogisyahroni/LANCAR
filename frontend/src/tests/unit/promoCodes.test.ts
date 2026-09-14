import { describe, expect, it } from 'vitest';
import { appendPromoCode, normalizePromoCodes } from '@/lib/promoCodes';

describe('customer promo stack input', () => {
  it('normalizes comma-separated codes deterministically and removes duplicates', () => {
    expect(normalizePromoCodes(' hemat10,ONGKIR5, hemat10 ')).toEqual(['HEMAT10', 'ONGKIR5']);
  });

  it('appends a suggested campaign without duplicating an existing selection', () => {
    expect(appendPromoCode('HEMAT10', 'ongkir5')).toBe('HEMAT10, ONGKIR5');
    expect(appendPromoCode('HEMAT10, ONGKIR5', 'hemat10')).toBe('HEMAT10, ONGKIR5');
  });
});
