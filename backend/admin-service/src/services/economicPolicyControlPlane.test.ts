import {
  buildExampleQuotes,
  EconomicPolicyValidationError,
  normalizeEconomicPolicyDraft,
  validateEconomicPolicyPayload,
} from './economicPolicyControlPlane';

const validPayload = {
  zone_scope: 'active_zone',
  timezone: 'Asia/Jakarta',
  floor_multiplier: 1,
  ceiling_multiplier: 1.35,
  protected_cap_multiplier: 1.4,
  peak_multiplier: 1.1,
  peak_windows: [{ start_hour: 11, end_hour: 14 }],
  fairness_reviewed: true,
};

describe('economic policy control plane guardrails', () => {
  it('normalizes a draft to the runtime pricing key and server-owned metadata', () => {
    const draft = normalizeEconomicPolicyDraft({
      policy_type: 'surge',
      market_code: 'ID-JK',
      service_code: 'food_delivery',
      policy_version: 'food-pricing-v3',
      payload: validPayload,
      business_reason: 'Menyesuaikan peak window berdasarkan monitoring supply.',
    });

    expect(draft.runtimeConfigKey).toBe('dynamic_pricing_policy_id-jk_food_delivery');
    expect(draft.policyKey).toContain('global');
    expect(draft.payload).toEqual(expect.objectContaining({
      market: 'id-jk',
      service_code: 'food_delivery',
      policy_version: 'food-pricing-v3',
    }));
  });

  it('rejects a protected cap above the service-specific consumer boundary', () => {
    expect(() => validateEconomicPolicyPayload(
      { ...validPayload, protected_cap_multiplier: 1.41 },
      { marketCode: 'id-jk', serviceCode: 'food_delivery', policyVersion: 'v1' },
    )).toThrow(EconomicPolicyValidationError);
  });

  it('requires fairness review and valid peak windows before a policy can enter workflow', () => {
    expect(() => validateEconomicPolicyPayload(
      { ...validPayload, fairness_reviewed: false },
      { marketCode: 'id-jk', serviceCode: 'food_delivery', policyVersion: 'v1' },
    )).toThrow('fairness_reviewed=true');
    expect(() => validateEconomicPolicyPayload(
      { ...validPayload, peak_windows: [{ start_hour: 22, end_hour: 2 }] },
      { marketCode: 'id-jk', serviceCode: 'food_delivery', policyVersion: 'v1' },
    )).toThrow('peak_windows[0]');
  });

  it('simulates candidate quotes from the persisted service tariff basis', () => {
    const quotes = buildExampleQuotes({
      baseFareIdr: 5000,
      includedDistanceKm: 2,
      perKmIdr: 2500,
      serviceMultiplier: 1,
      source: 'delivery_service_products',
    }, validPayload);

    expect(quotes).toHaveLength(3);
    expect(quotes[0]).toEqual(expect.objectContaining({ distance_km: 1, base_quote_idr: 5000, candidate_quote_idr: 5000 }));
    expect(quotes[2]).toEqual(expect.objectContaining({ distance_km: 5, base_quote_idr: 12500, candidate_quote_idr: 12500 }));
    expect(quotes.every((quote) => quote.quote_type === 'server_simulation_only')).toBe(true);
  });
});
