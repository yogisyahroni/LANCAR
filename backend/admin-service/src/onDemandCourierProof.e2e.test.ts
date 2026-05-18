import fs from 'fs';
import { scanMobileCourierOrder, uploadMobileCourierPod } from './controllers/courierAuth.controller';
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

jest.mock('./services/realtimeObservability', () => ({
  evaluateOnDemandRealtimeAlerts: jest.fn(),
  recordRealtimeEventDelivery: jest.fn(),
  recordRealtimeMetric: jest.fn(),
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

const makeClient = () => ({
  query: jest.fn(),
  release: jest.fn(),
});

describe('on-demand courier proof to ledger lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined as any);
    to.mockReturnValue(socketChain);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires pickup scan plus pickup photo before delivery, then credits ledger after POD', async () => {
    const pickupScanClient = makeClient();
    const pickupPhotoClient = makeClient();
    const podClient = makeClient();

    (db.connect as jest.Mock)
      .mockResolvedValueOnce(pickupScanClient)
      .mockResolvedValueOnce(pickupPhotoClient)
      .mockResolvedValueOnce(podClient);

    pickupScanClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-1',
          customer_id: 'customer-1',
          order_number: 'LCR-OD-1',
          status: 'accepted',
          model: 'p2p',
          leg_id: 'leg-1',
          leg_status: 'assigned',
          distance_m: 12,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'scan-pickup-code', recorded_at: '2026-05-18T04:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ has_scan: true, has_photo: false }] })
      .mockResolvedValueOnce({ rows: [] }) // order event
      .mockResolvedValueOnce({ rows: [] }) // proof attempt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const scanRes = makeResponse();
    await scanMobileCourierOrder({
      user: { id: 'courier-1', role: 'courier' },
      body: {
        order_id: 'order-1',
        scan_type: 'pickup',
        latitude: -6.175392,
        longitude: 106.827153,
        accuracy: 12,
        barcode_value: 'LCR-OD-1',
      },
    } as any, scanRes);

    expect(scanRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        scan_type: 'pickup_scan',
        pickup_scan_verified: true,
        pickup_photo_verified: false,
        pickup_complete: false,
      }),
    }));
    expect(emit).toHaveBeenCalledWith(ON_DEMAND_REALTIME_EVENTS.PICKUP_VERIFIED, expect.objectContaining({
      order_id: 'order-1',
      stage: 'pickup_validation',
      proof: expect.objectContaining({ pickup_complete: false }),
    }));

    pickupPhotoClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-1',
          customer_id: 'customer-1',
          order_number: 'LCR-OD-1',
          status: 'accepted',
          model: 'p2p',
          leg_id: 'leg-1',
          leg_status: 'assigned',
          distance_m: 10,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'scan-pickup-photo', recorded_at: '2026-05-18T04:01:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ has_scan: true, has_photo: true }] })
      .mockResolvedValueOnce({ rows: [] }) // update orders
      .mockResolvedValueOnce({ rows: [] }) // update legs
      .mockResolvedValueOnce({ rows: [] }) // pickup event
      .mockResolvedValueOnce({ rows: [] }) // delivery started event
      .mockResolvedValueOnce({ rows: [] }) // proof attempt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const pickupPhotoRes = makeResponse();
    await uploadMobileCourierPod({
      user: { id: 'courier-1', role: 'courier' },
      body: {
        order_id: 'order-1',
        proof_type: 'pickup',
        latitude: -6.175392,
        longitude: 106.827153,
        accuracy: 10,
      },
      file: {
        originalname: 'pickup.jpg',
        buffer: Buffer.from('pickup-photo'),
      },
    } as any, pickupPhotoRes);

    expect(pickupPhotoRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        scan_type: 'pickup_photo',
        status: 'in_transit',
        pickup_complete: true,
      }),
    }));
    expect(pickupPhotoClient.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE orders'))).toBe(true);
    expect(emit).toHaveBeenCalledWith(ON_DEMAND_REALTIME_EVENTS.DELIVERY_STARTED, expect.objectContaining({
      order_id: 'order-1',
      stage: 'delivery_started',
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'customer-1',
      type: 'delivery_started',
      order_id: 'order-1',
    }));

    podClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-1',
          customer_id: 'customer-1',
          order_number: 'LCR-OD-1',
          status: 'in_transit',
          model: 'p2p',
          leg_id: 'leg-1',
          leg_status: 'in_transit',
          distance_m: 8,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'scan-pod', recorded_at: '2026-05-18T04:20:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] }) // update orders
      .mockResolvedValueOnce({ rows: [] }) // update legs
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ id: 'ledger-1', amount_idr: 24000 }] }) // ledger credit
      .mockResolvedValueOnce({ rows: [] }) // pod event
      .mockResolvedValueOnce({ rows: [] }) // proof attempt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const podRes = makeResponse();
    await uploadMobileCourierPod({
      user: { id: 'courier-1', role: 'courier' },
      body: {
        order_id: 'order-1',
        proof_type: 'delivery',
        latitude: -6.218285,
        longitude: 106.802433,
        accuracy: 9,
      },
      file: {
        originalname: 'pod.jpg',
        buffer: Buffer.from('pod-photo'),
      },
    } as any, podRes);

    expect(podRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        status: 'delivered',
        scan_type: 'pod',
        earning_ledger_id: 'ledger-1',
        earning_amount_idr: 24000,
      }),
    }));
    expect(podClient.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO courier_earnings_ledger'))).toBe(true);
    expect(emit).toHaveBeenCalledWith(ON_DEMAND_REALTIME_EVENTS.POD_COMPLETED, expect.objectContaining({
      order_id: 'order-1',
      stage: 'pod_completed',
      metadata: expect.objectContaining({
        earning_ledger_id: 'ledger-1',
        earning_amount_idr: 24000,
      }),
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'customer-1',
      type: 'delivery_completed',
      order_id: 'order-1',
      metadata: expect.objectContaining({
        earning_ledger_id: 'ledger-1',
        earning_amount_idr: 24000,
      }),
    }));
    expect(getIO).toHaveBeenCalled();
  });
});
