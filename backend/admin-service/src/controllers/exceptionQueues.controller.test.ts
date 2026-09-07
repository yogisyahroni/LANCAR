import { listOrderExceptions } from './exceptionQueues.controller';

jest.mock('../db', () => ({
  readDb: { query: jest.fn() },
}));

const { readDb } = jest.requireMock('../db') as { readDb: { query: jest.Mock } };

const response = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
});

describe('admin order exception queue', () => {
  beforeEach(() => readDb.query.mockReset());

  it('returns the server-derived exception feed and supports a safe category filter', async () => {
    readDb.query.mockResolvedValueOnce({
      rows: [
        { category: 'payment_sla', severity: 'critical', order_id: 'order-1', total: 1 },
      ],
    });

    const res = response();
    await listOrderExceptions({ query: { category: 'payment_sla', limit: '20' } } as any, res as any);

    const [sql, values] = readDb.query.mock.calls[0];
    expect(sql).toContain('carrier_ordered');
    expect(sql).toContain("a.status = 'failed'");
    expect(sql).toContain("fre.status IN ('open', 'under_review')");
    expect(sql).toContain('c.occurred_at < c.previous_occurred_at');
    expect(sql).toContain('repeated_post_dispatch_cancellation');
    expect(sql).toContain('HAVING COUNT(*) >= 3');
    expect(values).toEqual(['payment_sla', 20]);
    expect(res.json).toHaveBeenCalledWith({
      data: [{ category: 'payment_sla', severity: 'critical', order_id: 'order-1', total: 1 }],
      total: 1,
      limit: 20,
      category: 'payment_sla',
    });
  });

  it('clamps an invalid or oversized limit and treats unknown categories as all categories', async () => {
    readDb.query.mockResolvedValueOnce({ rows: [] });

    const res = response();
    await listOrderExceptions({ query: { category: 'not-a-category', limit: '9999' } } as any, res as any);

    expect(readDb.query.mock.calls[0][1]).toEqual(['', 250]);
    expect(res.json).toHaveBeenCalledWith({ data: [], total: 0, limit: 250, category: null });
  });
});
