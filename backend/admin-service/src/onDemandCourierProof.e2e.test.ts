import fs from 'fs';
import axios from 'axios';
import { scanMobileCourierOrder, uploadMobileCourierPod } from './controllers/courierAuth.controller';
import { getOrderTracking } from './controllers/customerOrder.controller';
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

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ status: 200, data: { success: true } }),
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

const makeValidatedImageFile = (name: string) => ({
  originalname: name,
  mimetype: 'image/jpeg',
  size: 12,
  buffer: Buffer.from('validated-photo'),
  detectedMimeType: 'image/jpeg',
  safeExtension: '.jpg',
  safeFileName: `test-${name}`,
  checksumSha256: 'test-checksum',
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
          status: 'pickup_arrived',
          model: 'p2p',
          service_code: 'instant',
          leg_id: 'leg-1',
          leg_status: 'assigned',
          distance_m: 8,
          face_verification_required: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ total_packages: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
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
          status: 'pickup_arrived',
          model: 'p2p',
          service_code: 'instant',
          leg_id: 'leg-1',
          leg_status: 'assigned',
          distance_m: 10,
          face_verification_required: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'face-pickup' }] })
      .mockResolvedValueOnce({ rows: [{ total_packages: 0 }] })
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
        face_verification_id: 'face-pickup',
      },
      file: makeValidatedImageFile('pickup.jpg'),
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
          service_code: 'instant',
          leg_id: 'leg-1',
          leg_status: 'in_transit',
          distance_m: 8,
          face_verification_required: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'face-delivery' }] })
      .mockResolvedValueOnce({ rows: [{ total_packages: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'scan-pod', recorded_at: '2026-05-18T04:20:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ complete: true }] })
      .mockResolvedValueOnce({ rows: [] }) // update orders
      .mockResolvedValueOnce({ rows: [] }) // update legs
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ id: 'ledger-1', amount_idr: 24000 }] }) // ledger credit
      .mockResolvedValueOnce({ rows: [] }) // pod event
      .mockResolvedValueOnce({ rows: [] }) // proof attempt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    process.env.INTERNAL_API_KEY = 'test-internal-api-key';

    const podRes = makeResponse();
    await uploadMobileCourierPod({
      user: { id: 'courier-1', role: 'courier' },
      body: {
        order_id: 'order-1',
        proof_type: 'delivery',
        latitude: -6.218285,
        longitude: 106.802433,
        accuracy: 9,
        face_verification_id: 'face-delivery',
      },
      file: makeValidatedImageFile('pod.jpg'),
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
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/internal/orders/food-settlement'),
      { order_id: 'order-1' },
      expect.objectContaining({
        timeout: 8000,
        headers: { 'X-Internal-Api-Key': 'test-internal-api-key' },
      })
    );

    (db.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-1',
          order_number: 'LCR-OD-1',
          status: 'delivered',
          customer_id: 'customer-1',
          courier_id: 'courier-1',
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
          pickup_scan_verified: true,
          pickup_photo_verified: true,
          pod_verified: true,
          pickup_cancelled: false,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          courier_id: 'courier-profile-1',
          latitude: '-6.218285',
          longitude: '106.802433',
          heading_deg: '180',
          speed_kmh: '0',
          accuracy_m: '8',
          recorded_at: '2026-05-18T04:21:00.000Z',
        }],
      });

    const trackingRes = makeResponse();
    await getOrderTracking({
      user: { id: 'customer-1', role: 'customer' },
      query: { order_id: 'order-1' },
    } as any, trackingRes);

    expect(trackingRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        order_id: 'order-1',
        stage: 'selesai',
        status: 'delivered',
        proof_summary: expect.objectContaining({
          pickup_scan_verified: true,
          pickup_photo_verified: true,
          pod_verified: true,
        }),
        route_provider: expect.any(String),
        eta_minutes: expect.any(Number),
      }),
    }));
  });

  it('reuses existing courier earning ledger on duplicate POD retry', async () => {
    const podClient = makeClient();
    (db.connect as jest.Mock).mockResolvedValueOnce(podClient);

    podClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-1',
          customer_id: 'customer-1',
          order_number: 'LCR-OD-1',
          status: 'in_transit',
          model: 'p2p',
          service_code: 'tambal_ban_motor',
          leg_id: 'leg-1',
          leg_status: 'in_transit',
          distance_m: 6,
          face_verification_required: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'face-delivery' }] })
      .mockResolvedValueOnce({ rows: [{ total_packages: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'scan-pod-retry', recorded_at: '2026-05-18T04:22:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ complete: true }] })
      .mockResolvedValueOnce({ rows: [] }) // update orders
      .mockResolvedValueOnce({ rows: [] }) // update legs
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [] }) // insert ledger skipped by NOT EXISTS
      .mockResolvedValueOnce({ rows: [{ id: 'ledger-existing', amount_idr: 24000 }] }) // existing ledger replay
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
        face_verification_id: 'face-delivery',
      },
      file: makeValidatedImageFile('pod-retry.jpg'),
    } as any, podRes);

    expect(podRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        earning_ledger_id: 'ledger-existing',
        earning_amount_idr: 24000,
      }),
    }));
    const ledgerInsertCalls = podClient.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO courier_earnings_ledger')
    );
    expect(ledgerInsertCalls).toHaveLength(1);
    expect(String(ledgerInsertCalls[0][0])).toContain('NOT EXISTS');
    expect(podClient.query.mock.calls.some(([sql]) =>
      String(sql).includes('FROM courier_earnings_ledger') && String(sql).includes('ORDER BY created_at DESC')
    )).toBe(true);
  });

  it('rejects pickup barcode that does not match handover token (FOOD-BIKE-032)', async () => {
    const pickupClient = makeClient();
    const auditClient = makeClient();

    (db.connect as jest.Mock)
      .mockResolvedValueOnce(pickupClient)
      .mockResolvedValueOnce(auditClient);

    pickupClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-1',
          customer_id: 'customer-1',
          order_number: 'LCR-OD-1',
          status: 'pickup_arrived',
          model: 'p2p',
          service_code: 'instant',
          leg_id: 'leg-1',
          leg_status: 'assigned',
          distance_m: 8,
          face_verification_required: true,
          handover_token: 'TOKEN-HO-001',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ total_packages: 0 }] })
      .mockResolvedValueOnce({ rows: [] }) // package lookup
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    auditClient.query.mockResolvedValue({ rows: [] });

    const res = makeResponse();
    await scanMobileCourierOrder({
      user: { id: 'courier-1', role: 'courier' },
      body: {
        order_id: 'order-1',
        scan_type: 'pickup',
        latitude: -6.175392,
        longitude: 106.827153,
        accuracy: 12,
        barcode_value: 'WRONG-CODE',
      },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'ERR_BARCODE_MISMATCH',
    }));
    expect(auditClient.query.mock.calls.some(([sql, params]: any[]) =>
      String(sql).includes('courier_proof_attempts') && params.includes('barcode_mismatch')
    )).toBe(true);
  });

  it('accepts pickup barcode that matches handover token (FOOD-BIKE-032)', async () => {
    const pickupScanClient = makeClient();

    (db.connect as jest.Mock).mockResolvedValueOnce(pickupScanClient);

    pickupScanClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-1',
          customer_id: 'customer-1',
          order_number: 'LCR-OD-1',
          status: 'pickup_arrived',
          model: 'p2p',
          service_code: 'instant',
          leg_id: 'leg-1',
          leg_status: 'assigned',
          distance_m: 8,
          face_verification_required: true,
          handover_token: 'TOKEN-HO-001',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ total_packages: 0 }] })
      .mockResolvedValueOnce({ rows: [] }) // package lookup
      .mockResolvedValueOnce({ rows: [{ id: 'scan-pickup-code', recorded_at: '2026-05-18T04:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ has_scan: true, has_photo: false }] })
      .mockResolvedValueOnce({ rows: [] }) // order event
      .mockResolvedValueOnce({ rows: [] }) // proof attempt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = makeResponse();
    await scanMobileCourierOrder({
      user: { id: 'courier-1', role: 'courier' },
      body: {
        order_id: 'order-1',
        scan_type: 'pickup',
        latitude: -6.175392,
        longitude: 106.827153,
        accuracy: 12,
        barcode_value: 'TOKEN-HO-001',
      },
    } as any, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        scan_type: 'pickup_scan',
        pickup_scan_verified: true,
      }),
    }));
  });
});
