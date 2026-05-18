import { getOrderTracking, sendOrderChat, syncCourierTracking } from './controllers/customerOrder.controller';
import { notifyOnDemandOffers } from './controllers/courierAuth.controller';
import { db } from './db';
import { createNotification } from './notifications';
import { getIO } from './websocket';
import { ON_DEMAND_REALTIME_EVENTS } from './services/onDemandRealtime';

jest.mock('./db', () => ({
  db: {
    connect: jest.fn(),
    query: jest.fn(),
  },
}));

jest.mock('./notifications', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

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
      .mockResolvedValueOnce({ rows: [{ id: 'courier-profile-1', user_id: 'courier-user-1' }] })
      .mockResolvedValueOnce({ rows: [] }) // previous valid location
      .mockResolvedValueOnce({ rows: [{ customer_id: 'customer-user-1', courier_id: 'courier-user-1' }] })
      .mockResolvedValueOnce({ rows: [] }) // INSERT courier_locations
      .mockResolvedValueOnce({ rows: [] }) // UPDATE courier_profiles
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const syncReq: any = {
      user: { id: 'courier-user-1', role: 'courier' },
      body: {
        courier_id: 'courier-user-1',
        device_id: 'device-1',
        locations: [{
          order_id: 'order-1',
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
    expect(to).toHaveBeenCalledWith('order:order-1');
    expect(emit).toHaveBeenCalledWith('on_demand_event', expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED,
      order_id: 'order-1',
      customer_id: 'customer-user-1',
      courier_user_id: 'courier-user-1',
      location: expect.objectContaining({
        latitude: -6.175392,
        longitude: 106.827153,
        accuracy: 8,
      }),
    }));
    expect(emit).toHaveBeenCalledWith(ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED, expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED,
      order_id: 'order-1',
    }));
    expect(emit).toHaveBeenCalledWith('order_tracking_updated', expect.objectContaining({
      order_id: 'order-1',
      customer_id: 'customer-user-1',
      courier_user_id: 'courier-user-1',
    }));

    (db.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-1',
          order_number: 'LCR-OD-1',
          status: 'accepted',
          customer_id: 'customer-user-1',
          courier_id: 'courier-user-1',
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
      });

    const trackingReq: any = {
      user: { id: 'customer-user-1', role: 'customer' },
      query: { order_id: 'order-1' },
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
          id: 'order-1',
          order_number: 'LCR-OD-1',
          customer_id: 'customer-user-1',
          courier_id: 'courier-user-1',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'chat-1',
          order_id: 'order-1',
          sender_id: 'courier-user-1',
          message: 'Saya sudah di titik pickup.',
          message_type: 'text',
          created_at: '2026-05-18T04:01:00.000Z',
        }],
      });

    const chatReq: any = {
      user: { id: 'courier-user-1', role: 'courier', full_name: 'Andri Pratama' },
      params: { id: 'order-1' },
      body: { message: 'Saya sudah di titik pickup.' },
    };
    const chatRes = makeResponse();

    await sendOrderChat(chatReq, chatRes);

    expect(chatRes.status).toHaveBeenCalledWith(201);
    expect(chatRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      chat: expect.objectContaining({
        order_id: 'order-1',
        sender_role: 'courier',
      }),
    }));
    expect(to).toHaveBeenCalledWith('order:order-1');
    expect(emit).toHaveBeenCalledWith('on_demand_event', expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE,
      order_id: 'order-1',
      customer_id: 'customer-user-1',
      courier_user_id: 'courier-user-1',
      chat: expect.objectContaining({
        order_id: 'order-1',
        sender_name: 'Andri Pratama',
      }),
    }));
    expect(emit).toHaveBeenCalledWith(ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE, expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE,
      order_id: 'order-1',
    }));
    expect(emit).toHaveBeenCalledWith('new_chat_message', expect.objectContaining({
      order_id: 'order-1',
      sender_name: 'Andri Pratama',
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'customer-user-1',
      type: 'chat',
      order_id: 'order-1',
    }));
    expect(getIO).toHaveBeenCalled();
  });

  it('broadcasts a stable offer_created payload before FCM notification', async () => {
    await notifyOnDemandOffers([{
      dispatch_id: 'dispatch-1',
      order_id: 'order-2',
      courier_id: 'courier-user-2',
      pickup_address: 'Monas, Jakarta Pusat',
      dropoff_address: null,
      distance: '2.4',
      fee: '12000',
      customer_name: 'Customer Test',
      expires_at: new Date('2026-05-18T04:10:15.000Z'),
      service_name: 'LANCAR Instant',
    }]);

    expect(to).toHaveBeenCalledWith('order:order-2');
    expect(to).toHaveBeenCalledWith('courier-user-2');
    expect(emit).toHaveBeenCalledWith('on_demand_event', expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.OFFER_CREATED,
      order_id: 'order-2',
      courier_user_id: 'courier-user-2',
      status: 'offered',
      stage: 'offer_created',
      metadata: expect.objectContaining({
        dispatch_id: 'dispatch-1',
        pickup_address: 'Monas, Jakarta Pusat',
        offer_ttl_seconds: 15,
      }),
    }));
    expect(emit).toHaveBeenCalledWith(ON_DEMAND_REALTIME_EVENTS.OFFER_CREATED, expect.objectContaining({
      event: ON_DEMAND_REALTIME_EVENTS.OFFER_CREATED,
      order_id: 'order-2',
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'courier-user-2',
      type: 'on_demand_offer',
      order_id: 'order-2',
      metadata: expect.objectContaining({
        dispatch_id: 'dispatch-1',
        offer_ttl_seconds: '15',
      }),
    }));
  });
});
