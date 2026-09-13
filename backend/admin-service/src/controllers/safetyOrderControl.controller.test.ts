jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

import { db } from '../db';
import { applyAdminSafetyOrderAction } from './safety.controller';

const incidentId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const legId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';

const response = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('SAFE-2026-003 order action controller', () => {
  afterEach(() => jest.clearAllMocks());

  it('applies an auditable hold without replacing the authoritative delivery status', async () => {
    const client: any = { query: jest.fn(), release: jest.fn() };
    (db.connect as jest.Mock).mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{
        id: incidentId,
        order_id: orderId,
        state: 'ACKNOWLEDGED',
        order_status: 'in_transit',
        leg_id: legId,
        courier_id: actorId,
        leg_status: 'in_transit',
        safety_control_state: 'NONE',
      }] })
      .mockResolvedValueOnce({ rows: [{ id: legId, order_id: orderId, courier_id: actorId, status: 'in_transit', safety_control_state: 'HELD' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const res = response();

    await applyAdminSafetyOrderAction({
      params: { id: incidentId },
      body: { action: 'HOLD', reason: 'Immediate safety review required' },
      user: { id: actorId },
    } as any, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        to_control: 'HELD',
        order_action_is_authoritative: true,
      }),
    }));
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes("safety_order_action"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes("UPDATE orders SET status"))).toBe(false);
  });

  it('rejects reassignment after pickup until a safe handoff policy exists', async () => {
    const client: any = { query: jest.fn(), release: jest.fn() };
    (db.connect as jest.Mock).mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{
        id: incidentId,
        order_id: orderId,
        state: 'OPEN',
        order_status: 'in_transit',
        leg_id: legId,
        courier_id: actorId,
        leg_status: 'in_transit',
        safety_control_state: 'NONE',
      }] })
      .mockResolvedValueOnce({});
    const res = response();

    await applyAdminSafetyOrderAction({
      params: { id: incidentId },
      body: { action: 'REASSIGN', reason: 'A safe transfer is not confirmed' },
      user: { id: actorId },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ success: false, code: 'ERR_REASSIGN_REQUIRES_SAFE_TRANSFER' });
  });
});
