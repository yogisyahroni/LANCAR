jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn(), warn: jest.fn() },
}));

import { db, readDb } from '../db';
import {
  createCourierSafetyIncident,
  createCustomerSafetyIncident,
  getCustomerSafetyCenter,
  triggerCustomerSOS,
} from './safety.controller';
import {
  canViewerSeeSensitiveSafetyData,
  safetyCenterPolicy,
  safetySlaDueAt,
} from '../services/safetyIncidentPolicy';

const customerId = '11111111-1111-4111-8111-111111111111';
const courierId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const incidentId = '44444444-4444-4444-8444-444444444444';

const response = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const activeOrder = (serviceCode: string, actor: string) => ({
  id: orderId,
  customer_id: customerId,
  service_code: serviceCode,
  status: 'in_transit',
  market_code: 'id-jk',
  merchant_user_id: null,
  courier_id: actor === courierId ? courierId : courierId,
});

const createdIncident = (category: string, severity = 'HIGH') => ({
  id: incidentId,
  order_id: orderId,
  service_code: 'TOWING',
  market_code: 'id-jk',
  category,
  severity,
  state: 'OPEN',
  escalation_state: 'NOT_ESCALATED',
  created_at: new Date('2026-09-14T00:00:00.000Z'),
});

describe('SAFE-2026-010 safety drill controller contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.EMERGENCY_PROVIDER_URL;
  });

  it('records a customer emergency report for an active Towing order', async () => {
    (readDb.query as jest.Mock).mockResolvedValueOnce({ rows: [activeOrder('TOWING', customerId)] });
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [createdIncident('emergency_report')] });
    const res = response();

    await createCustomerSafetyIncident({
      params: { orderId },
      body: { category: 'emergency_report', severity: 'CRITICAL', latitude: -6.2, longitude: 106.8, message: 'Need immediate help' },
      user: { id: customerId, role: 'customer' },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      escalation: 'recorded',
      data: expect.objectContaining({ order_id: orderId, category: 'emergency_report' }),
    }));
    expect((readDb.query as jest.Mock).mock.calls[0][0]).toContain("o.service_metadata->>'market_code'");
    expect((db.query as jest.Mock).mock.calls[0][0]).toContain('COALESCE($3::uuid, $4::uuid)');
    expect((db.query as jest.Mock).mock.calls[0][0]).toContain('$9::numeric');
    expect((db.query as jest.Mock).mock.calls[0][0]).toContain('INSERT INTO safety_incidents');
  });

  it('records a courier unsafe-location report for an active Paket order without mutating order state', async () => {
    (readDb.query as jest.Mock).mockResolvedValueOnce({ rows: [activeOrder('PAKET', courierId)] });
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [createdIncident('unsafe_location')] });
    const res = response();

    await createCourierSafetyIncident({
      params: { orderId },
      body: { category: 'unsafe_location', severity: 'HIGH', message: 'Unsafe pickup area' },
      user: { id: courierId, role: 'courier' },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      order_action: 'unchanged',
      data: expect.objectContaining({ order_id: orderId, category: 'unsafe_location' }),
    }));
    expect((db.query as jest.Mock).mock.calls[0][0]).toContain('$3::uuid');
    expect((db.query as jest.Mock).mock.calls[0][0]).not.toContain('UPDATE orders');
  });

  it('reads the same incident after a simulated reconnect instead of relying on client memory', async () => {
    const incident = createdIncident('unsafe_location');
    (readDb.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [activeOrder('PAKET', customerId)] })
      .mockResolvedValueOnce({ rows: [incident] });
    const res = response();

    await getCustomerSafetyCenter({
      params: { orderId },
      user: { id: customerId, role: 'customer' },
    } as any, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        active_order_reachable: true,
        incidents: [expect.objectContaining({ id: incidentId, category: 'unsafe_location' })],
      }),
    }));
  });

  it('keeps evidence/location restricted and the active Safety Center reachable under a killed experience', () => {
    expect(canViewerSeeSensitiveSafetyData('cs_agent', true)).toBe(false);
    expect(canViewerSeeSensitiveSafetyData('ops_security', false)).toBe(false);
    expect(safetyCenterPolicy({ sosConfigured: false })).toEqual(expect.objectContaining({
      activeOrderReachable: true,
      sos: expect.objectContaining({ status: 'fallback' }),
    }));
  });

  it('uses the severity SLA as the Ops queue deadline', () => {
    const createdAt = new Date('2026-09-14T00:00:00.000Z');
    expect(safetySlaDueAt('HIGH', createdAt).toISOString()).toBe('2026-09-14T00:05:00.000Z');
  });

  it('records SOS with an approved fallback and never claims an emergency provider response when absent', async () => {
    (readDb.query as jest.Mock).mockResolvedValueOnce({ rows: [activeOrder('TOWING', customerId)] });
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [createdIncident('EMERGENCY_SOS', 'CRITICAL')] });
    const res = response();

    await triggerCustomerSOS({
      params: { orderId },
      user: { id: customerId, role: 'customer' },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      escalation: 'fallback_instructions',
      provider_response_claimed: false,
    }));
    expect((db.query as jest.Mock).mock.calls[0][1][5]).toBe('FALLBACK_INSTRUCTIONS');
  });
});
