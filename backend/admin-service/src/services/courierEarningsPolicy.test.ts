import {
  buildCourierEarningPolicy,
  calculateCourierEarnings,
  earningComponentsFromSnapshot,
} from './courierEarningsPolicy';

describe('courier earnings policy', () => {
  it('keeps service-specific policy data in the immutable order snapshot', () => {
    const policy = buildCourierEarningPolicy({
      code: 'food_delivery',
      courier_payout_percent: 82,
      courier_min_payout_idr: 9000,
      metadata: {
        courier_earning_policy: {
          version: 'food-earnings-v2',
          compensation: {
            waiting: { threshold_minutes: 15, rate_idr_per_minute: 750, cap_idr: 12000 },
          },
        },
      },
    });

    expect(policy).toEqual(expect.objectContaining({
      version: 'food-earnings-v2',
      service_code: 'food_delivery',
      payout_percent: 82,
      minimum_payout_idr: 9000,
    }));
    expect(policy.compensation.waiting).toEqual(expect.objectContaining({
      threshold_minutes: 15,
      rate_idr_per_minute: 750,
      cap_idr: 12000,
    }));
  });

  it('calculates server-owned compensation components with policy caps', () => {
    const policy = buildCourierEarningPolicy({
      code: 'towing_motor',
      metadata: {
        courier_earning_policy: {
          compensation: {
            toll: { cap_idr: 30000 },
            return: { cap_idr: 10000 },
          },
        },
      },
    });
    const result = calculateCourierEarnings(policy, {
      base_earning_idr: 70000,
      waiting_compensation_idr: 6000,
      toll_reimbursement_idr: 40000,
      return_compensation_idr: 15000,
      extra_service_compensation_idr: 5000,
      cancellation_compensation_idr: 3000,
      penalty_idr: 4000,
    });

    expect(result).toEqual({
      base_earning_idr: 70000,
      waiting_compensation_idr: 6000,
      toll_reimbursement_idr: 30000,
      return_compensation_idr: 10000,
      extra_service_compensation_idr: 5000,
      cancellation_compensation_idr: 3000,
      penalty_idr: 4000,
      estimated_total_idr: 120000,
    });
  });

  it('exposes an offer-safe fallback for legacy orders without a policy snapshot', () => {
    const result = earningComponentsFromSnapshot(null, 24000);
    expect(result.policy.version).toBe('courier-earnings-2026-v1');
    expect(result.components).toEqual(expect.objectContaining({
      base_earning_idr: 24000,
      estimated_total_idr: 24000,
    }));
  });
});
