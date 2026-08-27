import { db, readDb } from '../db';
import { redis } from '../redis';
import {
  consumeAdminBroadcastSendAllowance,
  getDeliveryReport,
  writeBroadcastAudit,
} from './broadcast.service';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

const mockRedisMulti = {
  incr: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

jest.mock('../redis', () => ({
  redis: {
    get: jest.fn(),
    multi: jest.fn(() => mockRedisMulti),
  },
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn() },
}));

describe('broadcast delivery report, audit, and send rate limit', () => {
  const broadcastId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds delivery report totals and per-channel counters from database rows', async () => {
    (readDb.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          total_targets: '7',
          sent_count: '5',
          failed_count: '1',
          opened_count: '2',
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { channel: 'in_app', pending: '1', sent: '2', failed: '0', opened: '1' },
          { channel: 'push_and_in_app', pending: '0', sent: '3', failed: '1', opened: '1' },
        ],
      });

    const report = await getDeliveryReport(broadcastId);

    expect(report.totals).toEqual({
      total_targets: 7,
      sent_count: 5,
      failed_count: 1,
      opened_count: 2,
    });
    expect(report.per_channel).toEqual([
      { channel: 'in_app', pending: 1, sent: 2, failed: 0, opened: 1 },
      { channel: 'push_and_in_app', pending: 0, sent: 3, failed: 1, opened: 1 },
    ]);
    expect(readDb.query).toHaveBeenCalledWith(expect.stringContaining('FROM broadcasts WHERE id = $1'), [broadcastId]);
    expect(readDb.query).toHaveBeenCalledWith(expect.stringContaining('FROM broadcast_recipients'), [broadcastId]);
  });

  it('writes broadcast audit payload only when actor id exists', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [] });

    await writeBroadcastAudit(actorId, 'broadcast.cancel', broadcastId, { reason: 'operator_cancel' });

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), [
      actorId,
      'broadcast.cancel',
      broadcastId,
      JSON.stringify({ reason: 'operator_cancel' }),
    ]);

    await writeBroadcastAudit(undefined, 'broadcast.cancel', broadcastId, { reason: 'ignored' });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('allows sends under limit, expires new counters, and blocks over-limit admins', async () => {
    (redis.get as jest.Mock).mockResolvedValueOnce(null);

    await expect(consumeAdminBroadcastSendAllowance(actorId)).resolves.toBe(true);
    expect(redis.multi).toHaveBeenCalledTimes(1);
    expect(mockRedisMulti.incr).toHaveBeenCalledWith(`rate_limit:broadcast_send:${actorId}`);
    expect(mockRedisMulti.expire).toHaveBeenCalledWith(`rate_limit:broadcast_send:${actorId}`, 3600);
    expect(mockRedisMulti.exec).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    (redis.get as jest.Mock).mockResolvedValueOnce('10');

    await expect(consumeAdminBroadcastSendAllowance(actorId)).resolves.toBe(false);
    expect(redis.multi).not.toHaveBeenCalled();
  });
});
