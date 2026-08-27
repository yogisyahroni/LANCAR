import { db } from '../db';
import {
  updateBroadcast,
  validateBroadcastInput,
  validateBroadcastPatch,
} from './broadcast.service';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../redis', () => ({
  redis: {
    get: jest.fn(),
    multi: jest.fn(() => ({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    })),
  },
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn() },
}));

describe('broadcast scheduling draft cancel rules', () => {
  const broadcastId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('validates draft and scheduled create payloads with future scheduled_at only', () => {
    jest.useFakeTimers({ now: new Date('2026-08-27T00:00:00.000Z') });

    const draft = validateBroadcastInput({
      title: 'Info operasi',
      body: 'Pesan operasional singkat',
      status: 'draft',
      channels: ['push'],
      target_type: 'all',
    });
    expect(draft.status).toBe('draft');
    expect(draft.scheduled_at).toBeNull();

    const scheduled = validateBroadcastInput({
      title: 'Info terjadwal',
      body: 'Pesan terjadwal singkat',
      status: 'scheduled',
      scheduled_at: '2026-08-27T01:00:00.000Z',
      channels: ['fcm', 'in_app'],
      target_type: 'all',
    });
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.scheduled_at?.toISOString()).toBe('2026-08-27T01:00:00.000Z');
    expect(scheduled.channels).toEqual(['in_app', 'push']);

    expect(() => validateBroadcastInput({
      title: 'Info lampau',
      body: 'Pesan lampau singkat',
      status: 'scheduled',
      scheduled_at: '2026-08-26T23:59:59.000Z',
      target_type: 'all',
    })).toThrow('scheduled_at must be a future ISO timestamp when status=scheduled');
  });

  it('updates scheduled broadcasts, cancels them, and blocks terminal edits', async () => {
    jest.useFakeTimers({ now: new Date('2026-08-27T00:00:00.000Z') });
    const scheduledAt = new Date('2026-08-27T02:00:00.000Z');

    const patch = validateBroadcastPatch({
      status: 'scheduled',
      scheduled_at: scheduledAt.toISOString(),
    });
    expect(patch.status).toBe('scheduled');
    expect(patch.scheduled_at?.toISOString()).toBe(scheduledAt.toISOString());

    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: broadcastId, status: 'draft', scheduled_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: broadcastId, status: 'scheduled', scheduled_at: scheduledAt }] });

    const scheduled = await updateBroadcast(broadcastId, patch);
    expect(scheduled).toEqual(expect.objectContaining({ status: 'scheduled' }));
    expect((db.query as jest.Mock).mock.calls[1][0]).toContain('UPDATE broadcasts SET');
    expect((db.query as jest.Mock).mock.calls[1][1]).toEqual([
      'scheduled',
      scheduledAt.toISOString(),
      broadcastId,
    ]);

    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: broadcastId, status: 'scheduled', scheduled_at: scheduledAt }] })
      .mockResolvedValueOnce({ rows: [{ id: broadcastId, status: 'cancelled', scheduled_at: null }] });

    const cancelled = await updateBroadcast(broadcastId, validateBroadcastPatch({ status: 'cancelled' }));
    expect(cancelled).toEqual(expect.objectContaining({ status: 'cancelled' }));
    expect((db.query as jest.Mock).mock.calls[3][1]).toEqual(['cancelled', null, broadcastId]);

    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: broadcastId, status: 'sent', scheduled_at: scheduledAt }] });

    await expect(updateBroadcast(broadcastId, validateBroadcastPatch({ status: 'cancelled' })))
      .rejects.toThrow("Broadcast with status 'sent' cannot be edited or cancelled");
  });
});
