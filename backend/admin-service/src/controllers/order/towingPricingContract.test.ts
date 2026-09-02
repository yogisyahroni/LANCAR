import { calculateCustomerPriceBreakdown } from './_shared';

jest.mock('../../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../../redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null) },
}));

const service = (tollCostIdr: number) => ({
  code: 'towing_mobil',
  name: 'Towing Mobil',
  description: 'Layanan towing mobil',
  service_family: 'on_demand',
  service_category: 'towing',
  route_model: 'p2p' as const,
  is_enabled: true,
  display_order: 1,
  vehicle_types: ['mobil'],
  exclusive_driver: true,
  batching_allowed: false,
  max_packages_per_order: 1,
  max_active_orders_regular: 1,
  max_active_orders_on_demand: 1,
  same_customer_batching_required: true,
  allow_new_offer_while_pickup: false,
  allow_new_offer_while_delivery: false,
  max_pickup_detour_km: 0,
  max_delivery_detour_km: 0,
  max_direction_deviation_degrees: 0,
  assignment_radius_pickup_km: 10,
  assignment_radius_delivery_km: 10,
  traffic_aware_assignment: true,
  proof_geofence_radius_m: 30,
  proof_min_accuracy_m: 30,
  proof_gps_override_policy: {},
  face_verification_required: false,
  regular_max_reschedule_attempts: 0,
  failed_delivery_policy: 'must_deliver' as const,
  pod_label: 'POD',
  max_eta_minutes: 180,
  max_distance_km: 100,
  max_weight_kg: 100,
  uses_size_tier: false,
  requires_dimension_scan: false,
  allows_manual_dimension: true,
  requires_pickup_verification: true,
  price_mode: 'estimated_then_adjusted' as const,
  base_fare_idr: 5000,
  included_distance_km: 1,
  per_km_idr: 2000,
  service_multiplier: 1,
  platform_commission_percent: 10,
  courier_payout_percent: 90,
  courier_min_payout_idr: 0,
  mdr_percent: 2,
  ppn_percent: 11,
  platform_fee_idr: 1000,
  platform_fee_pct: 0.1,
  extra_dropoff_fee_idr: 0,
  show_customer_price_to_courier: true,
  search_radii_km: [5, 10],
  size_tiers: [],
  dimension_rules: {},
  availability_rules: {},
  metadata: tollCostIdr > 0 ? { toll_cost_idr: tollCostIdr } : {},
});

const routeSnapshot = {
  generated_at: '2026-09-01T08:00:00.000Z',
  provider: 'tomtom_routing_car_traffic_aware_optimal',
  requested_provider: 'tomtom_maps',
  active_provider: 'tomtom_maps',
  scope: 'customer_mobile',
  route_profile: 'car',
  vehicle_type: 'car',
  distance_km: 12,
  distance_meters: 12000,
  duration_seconds: 1800,
  eta_minutes: 30,
  route_polyline: null,
  route_geometry: null,
  traffic_aware: true,
  confidence: 'high',
  fallback_reason: null,
  snapshot_hash: 'route-hash',
  snapshot_version: 1,
} as any;

describe('towing price breakdown contract', () => {
  it('includes configured toll only as an explicit server component', async () => {
    const breakdown = await calculateCustomerPriceBreakdown({
      service: service(18000),
      pickupPoint: { lat: -6.2, lng: 106.8 },
      dropoffPoint: { lat: -6.3, lng: 106.9 },
      routeSnapshotOverride: routeSnapshot,
    });

    expect(breakdown).toEqual(expect.objectContaining({
      distance_km: 12,
      toll_cost_idr: 18000,
      toll_cost_source: 'service_configuration',
    }));
    expect(breakdown.total_price_idr).toBe(
      breakdown.base_price_idr + breakdown.dynamic_price_idr + breakdown.volumetric_surcharge_idr
      + breakdown.insurance_premium_idr + breakdown.platform_fee_idr + breakdown.material_cost_idr + 18000
    );
  });

  it('does not invent toll cost when the provider/service has no toll value', async () => {
    const breakdown = await calculateCustomerPriceBreakdown({
      service: service(0),
      pickupPoint: { lat: -6.2, lng: 106.8 },
      dropoffPoint: { lat: -6.3, lng: 106.9 },
      routeSnapshotOverride: routeSnapshot,
    });

    expect(breakdown).toEqual(expect.objectContaining({
      toll_cost_idr: 0,
      toll_cost_source: 'unavailable',
    }));
  });
});
