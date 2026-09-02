import { normalizePackageInputs, summarizePackages, validatePackagePolicy } from './_shared';

const service = {
  name: 'TEMBUS Instant',
  max_packages_per_order: 10,
  requires_dimension_scan: false,
  dimension_rules: { volumetric_divisor: 6000 },
} as any;

describe('package facts contract', () => {
  it('normalizes quantity and uses it for authoritative chargeable weight', () => {
    const packages = normalizePackageInputs(null, {
      category: 'Dokumen',
      item_description: 'Dokumen kontrak',
      quantity: 2,
      weight_kg: 1,
      length_cm: 30,
      width_cm: 20,
      height_cm: 10,
      item_value_idr: 500000,
      is_fragile: true,
      requires_delivery_code: true,
    });

    const summary = summarizePackages(service, packages);
    expect(summary.package_count).toBe(2);
    expect(summary.actual_weight_kg).toBe(2);
    expect(summary.dimensional_weight_kg).toBeCloseTo(2);
    expect(packages[0]).toMatchObject({ category: 'Dokumen', quantity: 2, is_fragile: true });
  });

  it('rejects an explicitly prohibited package before quote/order work', () => {
    const packages = normalizePackageInputs(null, { is_prohibited: true });
    expect(() => validatePackagePolicy(service, packages)).toThrow('terlarang');
  });
});
