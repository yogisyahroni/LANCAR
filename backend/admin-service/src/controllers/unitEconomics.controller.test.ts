import { Request, Response } from 'express';
import { readDb } from '../db';
import { getUnitEconomicsV2 } from './unitEconomics.controller';

jest.mock('../db', () => ({ readDb: { query: jest.fn() } }));
jest.mock('../security/logRedaction', () => ({ securityLog: { error: jest.fn() } }));

const response = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
} as unknown as Response);

describe('authoritative unit economics report', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns decomposition, cohort metrics, formula check, and negative-margin trace', async () => {
    (readDb.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{
        order_count: 2,
        customer_paid_idr: '100000',
        customer_refund_idr: '5000',
        net_customer_paid_idr: '95000',
        tax_idr: '10000',
        provider_fee_idr: '2500',
        promo_subsidy_idr: '5000',
        merchant_payable_idr: '40000',
        courier_payable_idr: '20000',
        carrier_payable_idr: '5000',
        ads_other_charges_idr: '2500',
        platform_contribution_idr: '10000',
        negative_margin_order_count: 0,
        missing_payment_order_count: 0,
        pricing_snapshot_order_count: 2,
        courier_ledger_order_count: 2,
        merchant_settlement_order_count: 1,
        provider_invoice_order_count: 1,
        ads_ledger_order_count: 1,
      }] })
      .mockResolvedValueOnce({ rows: [{ market_bucket: 'ID-JK', service_bucket: 'food_delivery', order_cohort: '2026-09-07', order_count: 2, customer_paid_idr: '100000', customer_refund_idr: '5000', net_customer_paid_idr: '95000', tax_idr: '10000', provider_fee_idr: '2500', promo_subsidy_idr: '5000', merchant_payable_idr: '40000', courier_payable_idr: '20000', carrier_payable_idr: '5000', ads_other_charges_idr: '2500', platform_contribution_idr: '10000', negative_margin_order_count: 0, missing_payment_order_count: 0, pricing_snapshot_order_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ order_id: 'order-1', order_number: 'ORD-1', market_bucket: 'ID-JK', service_bucket: 'food_delivery', order_cohort: '2026-09-07', financial_at: '2026-09-08T00:00:00.000Z', customer_paid_idr: '50000', customer_refund_idr: '0', net_customer_paid_idr: '50000', tax_idr: '5000', provider_fee_idr: '1000', promo_subsidy_idr: '10000', merchant_payable_idr: '30000', courier_payable_idr: '10000', carrier_payable_idr: '1000', ads_other_charges_idr: '0', platform_contribution_idr: '-7000', pricing_rule_version: 'pricing-v1', pricing_policy_version: 'pricing-v1', merchant_contract_version: 'merchant-v1', pricing_components: [], merchant_payable_source: 'pricing_snapshot', courier_payable_source: 'courier_earnings_ledger', carrier_payable_source: 'order_cost_snapshot', ads_other_charges_source: 'settlement_snapshot' }] });

    const res = response();
    await getUnitEconomicsV2({ query: { start_date: '2026-09-01', end_date: '2026-09-08', cohort: 'week' } } as unknown as Request, res);

    expect((res.json as jest.Mock).mock.calls[0][0]).toEqual(expect.objectContaining({ success: true, data: expect.objectContaining({
      summary: expect.objectContaining({ platform_contribution_idr: 10000, reconciliation_check: { formula_result_idr: 10000, matches_formula: true, source_coverage_complete: true } }),
      cohorts: expect.arrayContaining([expect.objectContaining({ service_bucket: 'food_delivery', platform_contribution_idr: 10000 })]),
      negative_margin_outliers: expect.arrayContaining([expect.objectContaining({ pricing_rule_version: 'pricing-v1', platform_contribution_idr: -7000 })]),
    }) }));
    const sql = (readDb.query as jest.Mock).mock.calls.map(([query]) => String(query)).join('\n');
    expect(sql).toContain('courier_earnings_ledger');
    expect(sql).toContain('ledger_entries');
    expect(sql).toContain('merchant_settlements');
    expect(sql).not.toContain('customer_price');
  });
});
