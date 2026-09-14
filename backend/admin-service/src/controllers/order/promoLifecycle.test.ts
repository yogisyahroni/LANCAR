const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock('../../db', () => ({
  db: { connect: jest.fn() },
}));

import { reverseRedeemedPromosForOrders } from './_shared';

describe('order promo lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes one append-only release and decrements redeemed budget once', async () => {
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [{
          campaign_id: '11111111-1111-4111-8111-111111111111',
          user_id: '22222222-2222-4222-8222-222222222222',
          order_id: '33333333-3333-4333-8333-333333333333',
          discount_idr: 5000,
          idempotency_key: 'order-promo-key',
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'release-entry' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await reverseRedeemedPromosForOrders({
      query: mockClientQuery,
      release: mockClientRelease,
    } as any, ['33333333-3333-4333-8333-333333333333'], 'customer_cancelled');

    expect(mockClientQuery).toHaveBeenCalledTimes(4);
    expect(mockClientQuery.mock.calls[1][0]).toContain("'release'");
    expect(mockClientQuery.mock.calls[1][1]).toEqual(expect.arrayContaining(['order-promo-key:refund', 5000]));
    expect(mockClientQuery.mock.calls[2][0]).toContain('redeemed_budget_idr = GREATEST(0, redeemed_budget_idr - $2)');
    expect(mockClientQuery.mock.calls[3][0]).toContain("SET status = 'released'");
  });

  it('does not decrement budget again when a release replay already exists', async () => {
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [{
          campaign_id: '11111111-1111-4111-8111-111111111111',
          user_id: '22222222-2222-4222-8222-222222222222',
          order_id: '33333333-3333-4333-8333-333333333333',
          discount_idr: 5000,
          idempotency_key: 'order-promo-key',
        }],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await reverseRedeemedPromosForOrders({
      query: mockClientQuery,
      release: mockClientRelease,
    } as any, ['33333333-3333-4333-8333-333333333333']);

    expect(mockClientQuery).toHaveBeenCalledTimes(3);
    expect(mockClientQuery.mock.calls.some(([sql]: [string]) => sql.includes('redeemed_budget_idr ='))).toBe(false);
  });
});
