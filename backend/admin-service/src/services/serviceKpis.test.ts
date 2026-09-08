import { readDb } from '../db';
import {
  getServiceKpis,
  parseServiceKpiWindow,
  SERVICE_KPI_CATEGORIES,
} from './serviceKpis';

jest.mock('../db', () => ({ readDb: { query: jest.fn() } }));
jest.mock('../security/logRedaction', () => ({ securityLog: { error: jest.fn() } }));

const queryMock = readDb.query as jest.Mock;

describe('service KPI analytics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses an allow-listed time window and preserves null for missing denominators', () => {
    const now = new Date('2026-09-08T12:00:00.000Z');
    const window = parseServiceKpiWindow('30d', now);

    expect(window.range).toBe('30D');
    expect(window.from.toISOString()).toBe('2026-08-09T12:00:00.000Z');
    expect(window.to).toBe(now);
    expect(parseServiceKpiWindow('unsupported', now).range).toBe('7D');
  });

  it('returns all service categories with server-derived coverage and no-data semantics', async () => {
    queryMock.mockResolvedValue({
      rows: [{
        sample_size: 2,
        matched_orders: 1,
        pickup_sla_eligible: 0,
        pickup_sla_met: 0,
        delivery_sla_eligible: 2,
        delivery_sla_met: 1,
        failed_delivery_orders: 1,
        recovery_orders: 1,
        pod_eligible: 2,
        pod_issue_orders: 0,
        response_eligible: 2,
        responded_orders: 1,
        response_minutes: '4.5',
        prep_eligible: 2,
        prep_on_time: 1,
        wait_eligible: 2,
        wait_minutes: '6',
        handoff_eligible: 2,
        handoff_success: 1,
        refund_eligible: 2,
        refunded_orders: 0,
        technician_match_eligible: 2,
        technician_matched: 1,
        eta_minutes: '8',
        onsite_completed: 1,
        onsite_eligible: 2,
        adjusted_orders: 1,
        claimed_orders: 0,
        provider_rate_eligible: 2,
        provider_rate_success: 1,
        provider_mix: [{ provider: 'jne', order_count: 2, share_pct: 100 }],
        awb_attempt_eligible: 2,
        awb_failed: 1,
        webhook_freshness_eligible: 2,
        webhook_fresh: 1,
        carrier_sla_eligible: 2,
        carrier_sla_met: 1,
        exception_orders: 1,
        resolved_exception_orders: 1,
        reconciliation_eligible: 2,
        reconciliation_resolved: 1,
        operator_match_eligible: 2,
        operator_matched: 1,
        arrival_minutes: '9',
        loading_completed: 1,
        loading_eligible: 2,
        transit_completed: 1,
        transit_eligible: 2,
        damage_claim_orders: 0,
      }],
    });

    const result = await getServiceKpis({
      range: '7D',
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-08T00:00:00.000Z'),
    });

    expect(queryMock).toHaveBeenCalledTimes(5);
    expect(queryMock.mock.calls[0][1]).toEqual([
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-08T00:00:00.000Z'),
    ]);
    expect(result.map((item) => item.service_category)).toEqual([...SERVICE_KPI_CATEGORIES]);
    expect(result[0].metrics.pickup_sla_compliance_pct).toBeNull();
    expect(result[0].metrics.delivery_sla_compliance_pct).toBe(50);
    expect(result[1].metrics.prep_accuracy_pct).toBe(50);
    expect(result[2].metrics.technician_eta_minutes).toBe(8);
    expect(result[3].metrics.awb_failure_rate_pct).toBe(50);
    expect(result[3].provider_mix?.[0]).toEqual({ provider: 'jne', order_count: 2, share_pct: 100 });
    expect(result[4].metrics.damage_claim_rate_pct).toBe(0);
  });

  it('does not turn missing duration facts into zero minutes', async () => {
    queryMock.mockResolvedValue({ rows: [{ sample_size: 1 }] });

    const result = await getServiceKpis({
      range: '24H',
      from: new Date('2026-09-08T00:00:00.000Z'),
      to: new Date('2026-09-09T00:00:00.000Z'),
    });

    expect(result.find((item) => item.service_category === 'food')?.metrics.merchant_response_minutes).toBeNull();
    expect(result.find((item) => item.service_category === 'towing')?.metrics.operator_arrival_minutes).toBeNull();
  });
});
