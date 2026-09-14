import {
  COST_OBSERVABILITY_VERSION,
  COST_USAGE_QUERY,
  evaluateCostAnomalies,
  normalizeCostUsageRow,
} from './costObservability';

describe('cost observability', () => {
  it('normalizes persisted usage rows without turning missing cost into a fake zero', () => {
    expect(normalizeCostUsageRow({ unit_code: 'communication_delivery:sms', unit_count: '4', actual_cost_idr: null, costed_unit_count: '0', unpriced_unit_count: '4', source_table: 'communication_deliveries' })).toEqual({
      unit_code: 'communication_delivery:sms',
      unit_label: 'communication_delivery:sms',
      unit_count: 4,
      actual_cost_idr: 0,
      costed_unit_count: 0,
      unpriced_unit_count: 4,
      source_table: 'communication_deliveries',
    });
  });

  it('raises a critical anomaly when provider cost grows beyond the policy', () => {
    const anomalies = evaluateCostAnomalies(
      [{ unit_code: 'carrier_invoice_item', unit_label: 'Carrier', unit_count: 20, actual_cost_idr: 30000, costed_unit_count: 20, unpriced_unit_count: 0, source_table: 'provider_invoice_items' }],
      [{ unit_code: 'carrier_invoice_item', unit_label: 'Carrier', unit_count: 20, actual_cost_idr: 10000, costed_unit_count: 20, unpriced_unit_count: 0, source_table: 'provider_invoice_items' }],
      { min_units: 5, min_cost_idr: 1000, max_growth_pct: 50, max_unit_cost_growth_pct: 50 },
    );

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toEqual(expect.objectContaining({ severity: 'critical', cost_growth_pct: 200, unit_cost_growth_pct: 200 }));
  });

  it('raises a warning for unpriced usage even when the recorded amount is zero', () => {
    const anomalies = evaluateCostAnomalies(
      [{ unit_code: 'communication_delivery:sms', unit_label: 'SMS', unit_count: 5, actual_cost_idr: 0, costed_unit_count: 0, unpriced_unit_count: 5, source_table: 'communication_deliveries' }],
      [{ unit_code: 'communication_delivery:sms', unit_label: 'SMS', unit_count: 5, actual_cost_idr: 0, costed_unit_count: 0, unpriced_unit_count: 0, source_table: 'communication_deliveries' }],
      { min_units: 5, min_cost_idr: 1000, max_growth_pct: 50, max_unit_cost_growth_pct: 50 },
    );

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].severity).toBe('warning');
  });

  it('queries only persisted operational usage sources and keeps a versioned contract', () => {
    expect(COST_OBSERVABILITY_VERSION).toBe('cost-observability-2026-v1');
    expect(COST_USAGE_QUERY).toContain('communication_deliveries');
    expect(COST_USAGE_QUERY).toContain('provider_invoice_items');
    expect(COST_USAGE_QUERY).toContain('ads_billing_events');
    expect(COST_USAGE_QUERY).toContain('payments');
    expect(COST_USAGE_QUERY).toContain('promo_redemptions');
  });
});
