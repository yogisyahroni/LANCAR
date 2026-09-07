import { evaluateMarketplaceExperiment, MarketplaceFairnessSnapshot } from './marketplaceFairness';

const snapshot = (overrides: Partial<MarketplaceFairnessSnapshot> = {}): MarketplaceFairnessSnapshot => ({
  courierEarningsP10Idr: 10000,
  courierEarningsP50Idr: 18000,
  courierEarningsP95Idr: 40000,
  merchantTopSharePct: 30,
  merchantHHI: 1200,
  noSupplyRatePct: 4,
  customerPriceP50Idr: 35000,
  customerPriceP95Idr: 60000,
  cancellationRatePct: 5,
  acceptanceRatePct: 90,
  newSmallMerchantDiscoverySharePct: 25,
  sampleSize: 100,
  ...overrides,
});

describe('marketplace fairness guardrails', () => {
  it('does not approve a harmful experiment even when revenue increases', () => {
    const decision = evaluateMarketplaceExperiment(snapshot(), snapshot({ courierEarningsP10Idr: 8000, customerPriceP95Idr: 80000 }), 25);
    expect(decision.approved).toBe(false);
    expect(decision.revenueUpliftPct).toBe(25);
    expect(decision.violations.map((violation) => violation.metric)).toEqual([
      'courier_earnings_p10_drop_pct',
      'customer_price_p95_increase_pct',
    ]);
  });

  it('detects concentration and no-supply guardrails in a scoped dimension', () => {
    const decision = evaluateMarketplaceExperiment(snapshot(), snapshot({ merchantTopSharePct: 60, merchantHHI: 3200, noSupplyRatePct: 25 }), 0);
    expect(decision.approved).toBe(false);
    expect(decision.violations.map((violation) => violation.metric)).toEqual([
      'merchant_top_share_pct', 'merchant_hhi', 'no_supply_rate_pct',
    ]);
  });

  it('approves a neutral candidate while revenue remains informational', () => {
    expect(evaluateMarketplaceExperiment(snapshot(), snapshot(), 12)).toEqual({
      approved: true,
      revenueUpliftPct: 12,
      policyVersion: 'marketplace-fairness-2026-v1',
      violations: [],
    });
  });

  it('fails closed when a comparison has no sample', () => {
    expect(() => evaluateMarketplaceExperiment(snapshot(), snapshot({ sampleSize: 0 }), 1)).toThrow('candidate requires a positive sample size');
  });
});
