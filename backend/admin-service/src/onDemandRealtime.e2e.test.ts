import { getOrderTracking, sendOrderChat, syncCourierTracking } from './controllers/customerOrder.controller';
import { dispatchNextOnDemandCourier, notifyOnDemandOffers } from './controllers/courierAuth.controller';
import { db } from './db';
import { createNotification } from './notifications';
import { getIO } from './websocket';
import { ON_DEMAND_REALTIME_EVENTS } from './services/onDemandRealtime';

jest.mock('./db', () => ({
  db: {
    connect: jest.fn(),
    query: jest.fn(),
  },
  readDb: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  },
}));

jest.mock('./notifications', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./services/mapsProviderConfig', () => {
  const actual = jest.requireActual('./services/mapsProviderConfig');
  return {
    ...actual,
    buildMapsRouteEtaSnapshot: jest.fn().mockResolvedValue({
      generated_at: '2026-05-18T04:00:30.000Z',
      eta: '10 menit',
      eta_minutes: 10,
      distance_km: 3.4,
      distance_meters: 3400,
      duration_seconds: 600,
      route_polyline: null,
      route_geometry: null,
      provider: 'test_route_snapshot',
      requested_provider: 'tomtom_maps',
      active_provider: 'tomtom_maps',
      scope: 'tracking',
      route_profile: 'motorcycle',
      vehicle_type: 'motorcycle',
      service_code: null,
      traffic_aware: false,
      confidence: 'high',
      fallback_reason: null,
    }),
  };
});

const emit = jest.fn();
let socketChain: any;
const to: jest.Mock = jest.fn(() => socketChain);
socketChain = { to, emit };

jest.mock('./websocket', () => ({
  getIO: jest.fn(() => ({ to })),
}));

const makeResponse = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('on-demand realtime lifecycle contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.query as jest.Mock).mockReset();
    (db.query as jest.Mock).mockResolvedValue({ rows: [] });
    to.mockReturnValue(socketChain);
  });

  it('syncs courier location, exposes customer tracking, and broadcasts order chat in the same order room', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn(),
    };

    (db.connect as jest.Mock).mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'courier-profile-1', user_id: '44444444-4444-4444-8444-444444444444' }] })
      .mockResolvedValueOnce({ rows: [] }) // previous valid location
      .mockResolvedValueOnce({ rows: [{ customer_id: '33333333-3333-4333-8333-333333333333', courier_id: '44444444-4444-4444-8444-444444444444' }] })
      .mockResolvedValueOnce({ rows: [] }) // INSERT courier_locations
      .mockResolvedValueOnce({ rows: [] }) // UPDATE courier_profiles
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const syncReq: any = {
      user: { id: '44444444-4444-4444-8444-444444444444', role: 'courier' },
      body: {
        courier_id: '44444444-4444-4444-8444-444444444444',
        device_id: 'device-1',
        locations: [{
          order_id: '11111111-1111-4111-8111-111111111111',
          latitude: -6.175392,
          longitude: 106.827153,
          heading: 92,
          accuracy: 8,
          speed: 12,
          timestamp: new Date().toISOString(),
        }],
      },
    };
    const syncRes = makeResponse();

    await syncCourierTracking(syncReq, syncRes);

    expect(syncRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ syncedCount: 1 }),
    }));
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes('INSERT INTO courier_locations'))).toBe(true);
    expect(to).toHaveBeenCalledWith('order:11111111-1111-4111-8111-111111111111');
    expect(emit).toHaveBeenCalledWith('on_demand_event', expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED,
      order_id: '11111111-1111-4111-8111-111111111111',
      customer_id: '33333333-3333-4333-8333-333333333333',
      courier_user_id: '44444444-4444-4444-8444-444444444444',
      location: expect.objectContaining({
        latitude: -6.175392,
        longitude: 106.827153,
        accuracy: 8,
      }),
    }));
    expect(emit).toHaveBeenCalledWith(ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED, expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED,
      order_id: '11111111-1111-4111-8111-111111111111',
    }));
    expect(emit).toHaveBeenCalledWith('order_tracking_updated', expect.objectContaining({
      order_id: '11111111-1111-4111-8111-111111111111',
      customer_id: '33333333-3333-4333-8333-333333333333',
      courier_user_id: '44444444-4444-4444-8444-444444444444',
    }));

    (db.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: '11111111-1111-4111-8111-111111111111',
          order_number: 'LCR-OD-1',
          status: 'accepted',
          customer_id: '33333333-3333-4333-8333-333333333333',
          courier_id: '44444444-4444-4444-8444-444444444444',
          courier_profile_id: 'courier-profile-1',
          pickup_address: 'Monas, Jakarta Pusat',
          dropoff_address: 'GBK, Jakarta Pusat',
          pickup_latitude: '-6.175392',
          pickup_longitude: '106.827153',
          dropoff_latitude: '-6.218285',
          dropoff_longitude: '106.802433',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          pickup_scan_verified: false,
          pickup_photo_verified: false,
          pod_verified: false,
          pickup_cancelled: false,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          courier_id: 'courier-profile-1',
          latitude: '-6.175392',
          longitude: '106.827153',
          heading_deg: '92',
          speed_kmh: '12',
          accuracy_m: '8',
          recorded_at: '2026-05-18T04:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const trackingReq: any = {
      user: { id: '33333333-3333-4333-8333-333333333333', role: 'customer' },
      query: { order_id: '11111111-1111-4111-8111-111111111111' },
    };
    const trackingRes = makeResponse();

    await getOrderTracking(trackingReq, trackingRes);

    expect(trackingRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        courier_id: 'courier-profile-1',
        location: expect.objectContaining({
          latitude: -6.175392,
          longitude: 106.827153,
          heading: 92,
        }),
        stage: 'kurir_menuju_pickup',
        target: expect.objectContaining({
          type: 'pickup',
        }),
        eta_minutes: expect.any(Number),
      }),
    }));

    (db.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: '11111111-1111-4111-8111-111111111111',
          order_number: 'LCR-OD-1',
          customer_id: '33333333-3333-4333-8333-333333333333',
          status: 'accepted',
          recipient_name: 'Dewi Lestari',
          recipient_phone_hash: null,
          actor_phone_number: null,
          courier_id: '44444444-4444-4444-8444-444444444444',
          courier_has_access: true,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'conversation-1', order_id: '11111111-1111-4111-8111-111111111111', phase: 'customer_courier', status: 'active' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'chat-1',
          order_id: '11111111-1111-4111-8111-111111111111',
          conversation_id: 'conversation-1',
          sender_id: '44444444-4444-4444-8444-444444444444',
          message: 'Saya sudah di titik pickup.',
          message_type: 'text',
          client_message_id: 'e2e-chat-message-1',
          sender_role_snapshot: 'courier',
          created_at: '2026-05-18T04:01:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ member_id: '33333333-3333-4333-8333-333333333333' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const chatReq: any = {
      user: { id: '44444444-4444-4444-8444-444444444444', role: 'courier', full_name: 'Andri Pratama' },
      params: { id: '11111111-1111-4111-8111-111111111111' },
      body: { message: 'Saya sudah di titik pickup.', client_message_id: 'e2e-chat-message-1' },
    };
    const chatRes = makeResponse();

    await sendOrderChat(chatReq, chatRes);

    expect(chatRes.status).toHaveBeenCalledWith(201);
    expect(chatRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      chat: expect.objectContaining({
        order_id: '11111111-1111-4111-8111-111111111111',
        sender_role: 'courier',
      }),
    }));
    expect(to).toHaveBeenCalledWith('order:11111111-1111-4111-8111-111111111111');
    expect(emit).toHaveBeenCalledWith('on_demand_event', expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE,
      order_id: '11111111-1111-4111-8111-111111111111',
      customer_id: '33333333-3333-4333-8333-333333333333',
      courier_user_id: '44444444-4444-4444-8444-444444444444',
      chat: expect.objectContaining({
        order_id: '11111111-1111-4111-8111-111111111111',
        sender_name: 'Andri Pratama',
      }),
    }));
    expect(emit).toHaveBeenCalledWith(ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE, expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE,
      order_id: '11111111-1111-4111-8111-111111111111',
    }));
    expect(emit).toHaveBeenCalledWith('new_chat_message', expect.objectContaining({
      order_id: '11111111-1111-4111-8111-111111111111',
      sender_name: 'Andri Pratama',
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      user_id: '33333333-3333-4333-8333-333333333333',
      type: 'chat',
      order_id: '11111111-1111-4111-8111-111111111111',
    }));
    expect(getIO).toHaveBeenCalled();
  });

  it('broadcasts a stable offer_created payload before FCM notification', async () => {
    await notifyOnDemandOffers([{
      dispatch_id: 'dispatch-1',
      order_id: '22222222-2222-4222-8222-222222222222',
      courier_id: '55555555-5555-4555-8555-555555555555',
      pickup_address: 'Monas, Jakarta Pusat',
      dropoff_address: null,
      distance: '2.4',
      fee: '12000',
      customer_name: 'Customer Test',
      expires_at: new Date('2026-05-18T04:10:15.000Z'),
      service_name: 'TEMBUS Instant',
      service_code: 'TEMBUS_INSTANT',
      vehicle_type: 'motorcycle',
      route_profile: 'motorcycle',
      route_provider: 'openstreetmap',
      route_distance_meters: 2400,
      route_duration_seconds: 900,
      eta_minutes: 15,
      route_snapshot_hash: 'route-hash-1',
      route_snapshot_version: 1,
      route_version: 'route_snapshot_v1',
      courier_payout_estimate_idr: 12000,
    }]);

    expect(to).toHaveBeenCalledWith('order:22222222-2222-4222-8222-222222222222');
    expect(to).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555');
    expect(emit).toHaveBeenCalledWith('on_demand_event', expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.OFFER_CREATED,
      order_id: '22222222-2222-4222-8222-222222222222',
      courier_user_id: '55555555-5555-4555-8555-555555555555',
      status: 'offered',
      stage: 'offer_created',
      metadata: expect.objectContaining({
        dispatch_id: 'dispatch-1',
        pickup_address: 'Monas, Jakarta Pusat',
        offer_ttl_seconds: 15,
        route_snapshot_hash: 'route-hash-1',
        route_distance_meters: 2400,
        eta_minutes: 15,
        courier_payout_estimate_idr: 12000,
      }),
    }));
    expect(emit).toHaveBeenCalledWith(ON_DEMAND_REALTIME_EVENTS.OFFER_CREATED, expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.OFFER_CREATED,
      order_id: '22222222-2222-4222-8222-222222222222',
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      user_id: '55555555-5555-4555-8555-555555555555',
      type: 'on_demand_offer',
      order_id: '22222222-2222-4222-8222-222222222222',
      metadata: expect.objectContaining({
        dispatch_id: 'dispatch-1',
        offer_ttl_seconds: '15',
        route_snapshot_hash: 'route-hash-1',
        route_distance_meters: '2400',
        eta_minutes: '15',
      }),
    }));
  });

  it('dispatches on-demand courier offers from the stored route snapshot contract', async () => {
    const client = {
      query: jest.fn(),
    };
    const routeSnapshot = {
      generated_at: '2026-05-18T04:10:00.000Z',
      provider: 'openstreetmap',
      route_profile: 'motorcycle',
      vehicle_type: 'motorcycle',
      service_code: 'TEMBUS_INSTANT',
      distance_km: 2.4,
      distance_meters: 2400,
      duration_seconds: 900,
      eta_minutes: 15,
      route_polyline: 'encoded-route',
      snapshot_version: 1,
      route_version: 'route_snapshot_v1',
      snapshot_hash: 'route-hash-1',
    };

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          courier_id: '55555555-5555-4555-8555-555555555555',
          zone_id: 'zone-1',
          distance_m: 125,
          rating_snapshot: '4.90',
          acceptance_rate_snapshot: 100,
          completion_rate_snapshot: 99,
          pickup_address: 'Monas, Jakarta Pusat',
          dropoff_address: 'GBK, Jakarta Pusat',
          distance: '2.4',
          fee: '12000',
          courier_payout_estimate_idr: 12000,
          customer_price_idr: 15000,
          route_snapshot: routeSnapshot,
          route_provider: 'openstreetmap',
          route_profile: 'motorcycle',
          route_distance_meters: 2400,
          route_duration_seconds: 900,
          route_polyline: 'encoded-route',
          route_fallback_reason: null,
          vehicle_type: 'motorcycle',
          eta_minutes: 15,
          route_snapshot_hash: 'route-hash-1',
          route_snapshot_version: 1,
          route_version: 'route_snapshot_v1',
          service_code: 'TEMBUS_INSTANT',
          customer_name: 'Customer Test',
          service_name: 'TEMBUS Instant',
          score: '98.20',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ next_rank: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'dispatch-1', expires_at: new Date('2026-05-18T04:10:15.000Z') }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const offer = await dispatchNextOnDemandCourier(client, '22222222-2222-4222-8222-222222222222');

    expect(offer).toEqual(expect.objectContaining({
      dispatch_id: 'dispatch-1',
      order_id: '22222222-2222-4222-8222-222222222222',
      courier_id: '55555555-5555-4555-8555-555555555555',
      distance: '2.4',
      fee: '12000',
      eta_minutes: 15,
      route_snapshot_hash: 'route-hash-1',
      route_distance_meters: 2400,
      courier_payout_estimate_idr: 12000,
    }));
    const insertDispatchCall = client.query.mock.calls.find(([sql]: [string]) => sql.includes('INSERT INTO courier_offer_dispatches'));
    expect(JSON.parse(insertDispatchCall?.[1]?.[10])).toEqual(expect.objectContaining({
      source: 'dispatch_engine_v1',
      route_snapshot_hash: 'route-hash-1',
      route_distance_meters: 2400,
      route_duration_seconds: 900,
      courier_payout_estimate_idr: 12000,
    }));
    const eventCall = client.query.mock.calls.find(([sql]: [string]) => sql.includes('offer_dispatched'));
    expect(JSON.parse(eventCall?.[1]?.[2])).toEqual(expect.objectContaining({
      dispatch_id: 'dispatch-1',
      route_snapshot_hash: 'route-hash-1',
      eta_minutes: 15,
    }));
  });
});
