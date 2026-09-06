import { evaluatePreferredCourierEligibility } from './preferredCourierValidation';

describe('evaluatePreferredCourierEligibility', () => {
  const eligible = {
    courier_id: 'courier-user-1',
    verification_status: 'approved',
    is_online: true,
    location_fresh: true,
    capability_ok: true,
    zone_ok: true,
    distance_m: 1500,
    assignment_radius_pickup_km: 2,
    active_count: 0,
    max_active_orders_on_demand: 1,
  };

  it('accepts an approved, capable, online courier inside the latest pickup radius', () => {
    expect(evaluatePreferredCourierEligibility(eligible)).toEqual({ ok: true, statusCode: 200 });
  });

  it('fails closed when the preferred courier no longer has the required capability', () => {
    const decision = evaluatePreferredCourierEligibility({ ...eligible, capability_ok: false });
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe('CAPABILITY_MISMATCH');
  });

  it('rejects a stale/offline or out-of-radius preferred courier', () => {
    const stale = evaluatePreferredCourierEligibility({ ...eligible, location_fresh: false });
    const far = evaluatePreferredCourierEligibility({ ...eligible, distance_m: 2501 });
    expect(stale.code).toBe('NO_COURIER');
    expect(far.code).toBe('NO_COURIER');
  });

  it('rejects a courier whose active workload reached service capacity', () => {
    const decision = evaluatePreferredCourierEligibility({
      ...eligible,
      active_count: 1,
      max_active_orders_on_demand: 1,
    });
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe('NO_COURIER');
  });
});
