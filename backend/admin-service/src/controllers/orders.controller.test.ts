import { getAllOrders, getOrderById } from './orders.controller';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

const { readDb } = jest.requireMock('../db') as {
  readDb: { query: jest.Mock };
};

const response = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
});

describe('admin operational order controllers', () => {
  beforeEach(() => {
    readDb.query.mockReset();
  });

  it('passes every operational filter to the parameterized order query', async () => {
    readDb.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'order-1', service_category: 'food' }] });

    const res = response();
    await getAllOrders({
      query: {
        page: '1',
        limit: '20',
        service: 'food',
        subtype: 'food_delivery',
        provider: 'jne',
        merchant: 'merchant-1',
        courier: 'courier-1',
        payment_state: 'paid',
      },
    } as any, res as any);

    const [countSql, values] = readDb.query.mock.calls[0];
    expect(countSql).toContain('o.service_category ILIKE');
    expect(countSql).toContain('o.service_sub_type ILIKE');
    expect(countSql).toContain('cei_filter.provider ILIKE');
    expect(countSql).toContain('m.nama_toko ILIKE');
    expect(countSql).toContain('cu_filter.full_name ILIKE');
    expect(countSql).toContain('LOWER(p_filter.status) = LOWER');
    expect(values).toEqual([
      '%food%',
      '%food_delivery%',
      '%jne%',
      '%merchant-1%',
      '%courier-1%',
      'paid',
    ]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      total: 1,
      data: [{ id: 'order-1', service_category: 'food' }],
    }));
  });

  it('returns payment, refund, and carrier raw-event records only from admin detail data', async () => {
    readDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'order-1', awb_number: 'AWB-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'payment-1', status: 'paid' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'refund-1', status: 'completed' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'carrier-event-1', raw_payload: '{"status":"DELIVERED"}' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = response();
    await getOrderById({ params: { id: 'order-1' } } as any, res as any);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      payments: [{ id: 'payment-1', status: 'paid' }],
      refunds: [{ id: 'refund-1', status: 'completed' }],
      carrier_events: [{ id: 'carrier-event-1', raw_payload: '{"status":"DELIVERED"}' }],
    }));
    const carrierQuery = readDb.query.mock.calls[16][0] as string;
    expect(carrierQuery).toContain('cei.raw_payload');
    expect(carrierQuery).toContain('FROM carrier_event_inbox cei');
  });
});
