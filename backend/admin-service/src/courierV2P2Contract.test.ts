import { Request, Response } from 'express';
import {
  acceptMobileCourierOffer,
  getMobileCourierOnDemandServices,
  updateMobileCourierOrderStatus,
} from './controllers/courierAuth.controller';
import { dispatchNextOnDemandCourier, dispatchToPreferredCourier } from './controllers/courier/courierOnDemand.controller';
import { findDeliveryServiceByCode, updateAdminDeliveryService } from './controllers/deliveryServices.controller';
import { db } from './db';
import { createNotification } from './notifications';

jest.mock('./db', () => ({
  db: {
    connect: jest.fn(),
    query: jest.fn(),
  },
}));

jest.mock('./notifications', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./services/onDemandRealtime', () => ({
  ON_DEMAND_REALTIME_EVENTS: {
    OFFER_ACCEPTED: 'offer_accepted',
    COURIER_OTW_PICKUP: 'courier_otw_pickup',
    TRACKING_UPDATED: 'tracking_updated',
  },
  emitOnDemandRealtime: jest.fn(),
}));

jest.mock('./services/realtimeObservability', () => ({
  evaluateOnDemandRealtimeAlerts: jest.fn(),
  recordRealtimeEventDelivery: jest.fn(),
  recordRealtimeMetric: jest.fn(),
}));

jest.mock('./services/mapsProviderConfig', () => ({
  buildMapsRouteEtaSnapshot: jest.fn(),
}));

jest.mock('./services/featureFlags', () => ({
  isFeatureFlagEnabled: jest.fn().mockResolvedValue(false),
}));

jest.mock('./security/uploadSecurity', () => ({
  saveSecureUploadBuffer: jest.fn(),
}));

jest.mock('./services/payoutRiskEngine', () => ({
  evaluateCourierPayoutRisk: jest.fn().mockResolvedValue({ decision: 'approved' }),
}));

jest.mock('./services/payoutStatusPolicy', () => ({
  decoratePayoutRequest: jest.fn((request) => request),
  payoutMobileMessage: jest.fn(() => 'Payout request updated'),
}));

jest.mock('./utils/payoutObservability', () => ({
  evaluatePayoutAlerts: jest.fn(),
  writePayoutAuditEvent: jest.fn(),
}));

const makeResponse = () => {
  const res: any = {};
  res.status = jest.fn((statusCode: number) => {
    res.statusCodeValue = statusCode;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.bodyValue = body;
    return res;
  });
  return res as Response & { bodyValue: any; statusCodeValue?: number };
};

const makeClient = () => ({
  query: jest.fn(),
  release: jest.fn(),
});

const makeReq = (overrides: Record<string, unknown> = {}) => ({
  params: {},
  body: {},
  user: { id: 'courier-user-id', role: 'courier', full_name: 'Courier Test', totp_verified: false },
  ...overrides,
}) as unknown as Request;

const serviceRow = {
  id: 'service-1',
  code: 'instant',
  name: 'Instant',
  description: 'Instant on-demand delivery',
  service_family: 'instant',
  service_category: 'on_demand',
  route_model: 'p2p',
  is_enabled: true,
  display_order: 1,
  vehicle_types: ['motorcycle'],
  exclusive_driver: false,
  batching_allowed: true,
  max_eta_minutes: 45,
  max_distance_km: 15,
  max_weight_kg: 20,
  max_packages_per_order: 4,
  max_active_orders_regular: 5,
  max_active_orders_on_demand: 2,
  same_customer_batching_required: true,
  allow_new_offer_while_pickup: true,
  allow_new_offer_while_delivery: false,
  max_pickup_detour_km: 1.5,
  max_delivery_detour_km: 2,
  max_direction_deviation_degrees: 45,
  assignment_radius_pickup_km: 2,
  assignment_radius_delivery_km: 3,
  traffic_aware_assignment: true,
  proof_geofence_radius_m: 10,
  proof_min_accuracy_m: 30,
  proof_gps_override_policy: 'supervisor_review',
  face_verification_required: true,
  regular_max_reschedule_attempts: 3,
  failed_delivery_policy: 'must_deliver',
  pod_label: 'POD',
  uses_size_tier: true,
  requires_dimension_scan: false,
  allows_manual_dimension: false,
  requires_pickup_verification: true,
  requires_delivery_photo: true,
  requires_recipient_signature: false,
  base_fare: 9000,
  included_distance_km: 3,
  per_km_rate: 2500,
  service_multiplier: 1,
  platform_commission_percent: 15,
  courier_payout_percent: 85,
  mdr_percent: 2,
  ppn_percent: 11,
  driver_incentive_enabled: true,
  insurance_enabled: false,
  insurance_fee: 0,
};

describe('courier v2 P2 contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes mobile on-demand service policy fields required by the courier app', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [serviceRow] });

    const res = makeResponse();
    await getMobileCourierOnDemandServices(makeReq(), res);

    expect(res.bodyValue.success).toBe(true);
    expect(res.bodyValue.data[0]).toEqual(expect.objectContaining({
      code: 'instant',
      max_packages_per_order: 4,
      max_active_orders_on_demand: 2,
      allow_new_offer_while_pickup: true,
      allow_new_offer_while_delivery: false,
      same_customer_batching_required: true,
      traffic_aware_assignment: true,
      proof_geofence_radius_m: 10,
      proof_min_accuracy_m: 30,
      failed_delivery_policy: 'must_deliver',
      pod_label: 'POD',
    }));
  });

  it('writes an audit log when admin pricing/service policy is updated', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [serviceRow] })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq({
      params: { code: 'instant' },
      body: serviceRow,
      user: { id: 'admin-user-id', role: 'super_admin', full_name: 'Admin Test', totp_verified: true },
    });
    const res = makeResponse();

    await updateAdminDeliveryService(req, res);

    expect(res.bodyValue.success).toBe(true);
    expect((db.query as jest.Mock).mock.calls[1][0]).toContain('INSERT INTO audit_logs');
    expect((db.query as jest.Mock).mock.calls[1][1][0]).toBe('admin-user-id');
    expect((db.query as jest.Mock).mock.calls[1][1][1]).toBe('lookup.delivery_service.updated');
    expect(JSON.parse((db.query as jest.Mock).mock.calls[1][1][2])).toEqual(expect.objectContaining({
      after: expect.objectContaining({
        code: 'instant',
        max_packages_per_order: 4,
        proof_geofence_radius_m: 10,
      }),
    }));
  });

  it('resolves enabled aggregator services even when their route model is hub-and-spoke', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [{
      ...serviceRow,
      code: 'tembus_aggregator',
      service_category: 'aggregator',
      route_model: 'hub_and_spoke',
    }] });

    const service = await findDeliveryServiceByCode('tembus_aggregator');

    expect(service).toEqual(expect.objectContaining({
      code: 'tembus_aggregator',
      service_category: 'aggregator',
      route_model: 'hub_and_spoke',
    }));
    expect((db.query as jest.Mock).mock.calls[0][0]).toContain("route_model = 'p2p' OR service_category = 'aggregator'");
  });

  it('rejects on-demand failed or return statuses because the service must be delivered', async () => {
    const client = makeClient();
    (db.connect as jest.Mock).mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          order_id: 'order-od-1',
          order_number: 'TMB-OD-1',
          customer_id: 'customer-1',
          model: 'p2p',
          order_status: 'in_transit',
          leg_id: 'leg-1',
          leg_status: 'in_transit',
          service_category: 'on_demand',
          failed_delivery_policy: 'must_deliver',
          regular_max_reschedule_attempts: 3,
          workflow_role: 'on_demand',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ body: { order_id: 'order-od-1', status: 'failed' } });
    const res = makeResponse();

    await updateMobileCourierOrderStatus(req, res);

    expect(res.statusCodeValue).toBe(409);
    expect(res.bodyValue).toEqual(expect.objectContaining({ code: 'ERR_ON_DEMAND_MUST_DELIVER' }));
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE order_legs'), expect.anything());
    expect(client.release).toHaveBeenCalled();
  });

  it('moves regular delivery to return_required after the configured failed-delivery attempt limit', async () => {
    const client = makeClient();
    (db.connect as jest.Mock).mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          order_id: 'order-regular-1',
          order_number: 'TMB-R-1',
          customer_id: 'customer-1',
          model: 'p2p',
          order_status: 'in_transit',
          leg_id: 'leg-regular-1',
          leg_status: 'in_transit',
          service_category: 'regular',
          failed_delivery_policy: 'reschedule_then_return',
          regular_max_reschedule_attempts: 3,
          workflow_role: 'regular',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ attempts: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ to_status: 'return_required', label: 'Return required', requires_proof: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ body: { order_id: 'order-regular-1', status: 'failed', notes: 'Penerima tidak tersedia' } });
    const res = makeResponse();

    await updateMobileCourierOrderStatus(req, res);

    const legUpdateCall = client.query.mock.calls.find((call: any[]) => String(call[0]).includes('UPDATE order_legs'));
    const eventCall = client.query.mock.calls.find((call: any[]) => String(call[0]).includes('INSERT INTO order_events'));
    const eventMetadata = JSON.parse(eventCall[1][4]);

    expect(res.bodyValue.success).toBe(true);
    expect(legUpdateCall[1]).toEqual(['leg-regular-1', 'return_required']);
    expect(eventMetadata).toEqual(expect.objectContaining({
      requested_status: 'failed',
      to_status: 'return_required',
      regular_failed_attempt: 3,
      regular_max_reschedule_attempts: 3,
    }));
  });

  it('rejects accepting an on-demand offer when service capacity or batching policy disallows it', async () => {
    const client = makeClient();
    (db.connect as jest.Mock).mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          dispatch_id: 'dispatch-1',
          order_id: 'order-od-2',
          courier_id: 'courier-user-id',
          dispatch_status: 'offered',
          expires_at: new Date(Date.now() + 60_000),
          zone_id: 'zone-1',
          dispatch_metadata: {},
          model: 'p2p',
          total_price_idr: 30000,
          courier_payout_estimate_idr: 22000,
          platform_commission_idr: 8000,
          pickup_location: null,
          service_code: 'instant',
          customer_id: 'customer-1',
          order_number: 'TMB-OD-2',
          route_snapshot: {},
          route_provider: 'maps_provider',
          route_profile: 'motorcycle',
          route_distance_meters: 5000,
          route_duration_seconds: 1200,
          route_polyline: 'encoded',
          route_fallback_reason: null,
          route_vehicle_type: 'motorcycle',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ params: { id: 'dispatch-1' } });
    const res = makeResponse();

    await acceptMobileCourierOffer(req, res);

    expect(res.statusCodeValue).toBe(403);
    expect(res.bodyValue).toEqual(expect.objectContaining({ code: 'ERR_COURIER_NOT_ELIGIBLE' }));
    expect(createNotification).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });

  it('guards preferred towing dispatch with vehicle, freshness, radius, and active-job policy', async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await dispatchToPreferredCourier(client, 'order-towing-1', 'courier-user-id');

    expect(result).toBeNull();
    const candidateQuery = client.query.mock.calls[2][0] as string;
    expect(candidateQuery).toContain('JOIN courier_vehicles cv');
    expect(candidateQuery).toContain("cv.verification_status = 'approved'");
    expect(candidateQuery).toContain("COALESCE(o.service_code, o.service_sub_type) = 'towing_motor'");
    expect(candidateQuery).toContain("COALESCE(o.service_code, o.service_sub_type) = 'towing_mobil'");
    expect(candidateQuery).toContain('COALESCE(aj.active_count, 0) < COALESCE(dsp.max_active_orders_on_demand, 1)');
    expect(candidateQuery).toContain('assignment_radius_pickup_km');
  });

  it('guards normal towing dispatch with persisted capability, payment, zone, and workload policy', async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await dispatchNextOnDemandCourier(client, 'order-towing-2');

    expect(result).toBeNull();
    const candidateQuery = client.query.mock.calls[2][0] as string;
    expect(candidateQuery).toContain("cp.verification_status = 'approved'");
    expect(candidateQuery).toContain('cp.is_online = TRUE');
    expect(candidateQuery).toContain("cp.last_location_at >= NOW() - INTERVAL '10 minutes'");
    expect(candidateQuery).toContain('JOIN courier_service_capabilities csc');
    expect(candidateQuery).toContain("csc.status = 'enabled'");
    expect(candidateQuery).toContain('JOIN courier_vehicles cv');
    expect(candidateQuery).toContain("cv.verification_status = 'approved'");
    expect(candidateQuery).toContain("p.status = 'paid'");
    expect(candidateQuery).toContain('JOIN zones z');
    expect(candidateQuery).toContain('z.is_active = TRUE');
    expect(candidateQuery).toContain('COALESCE(aj.active_count, 0) < COALESCE(dsp.max_active_orders_on_demand, 1)');
    expect(candidateQuery).toContain('assignment_radius_pickup_km');
    expect(candidateQuery).toContain('NOT EXISTS');
  });
});
