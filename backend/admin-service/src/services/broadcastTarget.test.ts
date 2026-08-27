import { db, readDb } from '../db';
import { estimateCount, iterateTargetBatches } from './broadcastTarget.service';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

const readQuery = readDb.query as jest.Mock;

describe('broadcast target segmentation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('estimate count applies online predicate for target_type=online', async () => {
    readQuery.mockResolvedValueOnce({ rows: [{ count: '42' }] });
    const count = await estimateCount('online', null);
    expect(count).toBe(42);
    const sql = readQuery.mock.calls[0][0] as string;
    expect(sql).toContain('courier_profiles cp');
    expect(sql).toContain('cp.is_online = TRUE');
  });

  it('estimate count applies zone predicate when zone_ids provided', async () => {
    readQuery.mockResolvedValueOnce({ rows: [{ count: '7' }] });
    const count = await estimateCount('filter', {
      zone_ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      online_now: true,
    });
    expect(count).toBe(7);
    const sql = readQuery.mock.calls[0][0] as string;
    expect(sql).toContain('courier_zones cz');
    expect(sql).toContain('cp.is_online = TRUE');
  });

  it('iterateTargetBatches yields user ids from batched rows', async () => {
    readQuery
      .mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }] })
      .mockResolvedValueOnce({ rows: [] });
    const ids: string[] = [];
    for await (const batch of iterateTargetBatches('all', null, 2)) {
      for (const row of batch as unknown as string[]) ids.push(row);
    }
    expect(ids).toEqual(['a', 'b']);
  });
});
