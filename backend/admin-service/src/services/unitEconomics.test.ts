import { calculatePlatformContribution, UNIT_ECONOMICS_DEFINITION, unitEconomicsBaseCte } from './unitEconomics';

describe('unit economics definition', () => {
  it('reconciles the required financial decomposition without analytics fields', () => {
    expect(calculatePlatformContribution({
      customer_paid_idr: 100000,
      customer_refund_idr: 5000,
      tax_idr: 10000,
      provider_fee_idr: 2500,
      promo_subsidy_idr: 5000,
      merchant_payable_idr: 40000,
      courier_payable_idr: 20000,
      carrier_payable_idr: 5000,
      ads_other_charges_idr: 2500,
    })).toBe(10000);
    expect(UNIT_ECONOMICS_DEFINITION.platform_contribution).toContain('net customer paid');
  });

  it('builds one pre-aggregated ledger-backed query for all report views', () => {
    const query = unitEconomicsBaseCte('week');
    expect(query).toContain('courier_earnings_ledger');
    expect(query).toContain('merchant_settlements');
    expect(query).toContain('provider_invoice_items');
    expect(query).toContain('ledger_entries');
    expect(query).toContain('pricing_snapshot');
    expect(query).toContain("DATE_TRUNC('week'");
    expect(unitEconomicsBaseCte('unsafe')).toContain("DATE_TRUNC('day'");
  });
});
