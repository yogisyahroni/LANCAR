import { Request, Response } from 'express';
import { getMarketplaceFairnessMetrics } from './marketplaceFairness.controller';
import { readDb } from '../db';

jest.mock('../db', () => ({ readDb: { query: jest.fn() } }));

const queryMock = readDb.query as jest.Mock;

const response = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
} as unknown as Response);

describe('marketplace fairness monitoring controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects invalid windows before touching the database', async () => {
    const res = response();
    await getMarketplaceFairnessMetrics({ query: { window_hours: '0' } } as unknown as Request, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns scoped aggregate metrics and outlier flags without identifiers', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{
        market_code: 'ID-JK', zone_code: 'JKT-PST', service_code: 'food_delivery',
        courier_sample_size: '2', courier_earnings_p10_idr: '10000', courier_earnings_p50_idr: '18000', courier_earnings_p95_idr: '60000',
        merchant_top_share_pct: '55', merchant_hhi: '2800', price_sample_size: '4', customer_price_p50_idr: '35000', customer_price_p95_idr: '60000',
        current_sample_size: '4', current_cancellation_rate_pct: '12', previous_cancellation_rate_pct: '4', current_acceptance_rate_pct: '80', previous_acceptance_rate_pct: '90',
        current_no_supply_rate_pct: '25', previous_no_supply_rate_pct: '5',
      }] })
      .mockResolvedValueOnce({ rows: [{ discovery_events: '10', new_small_discovery_events: '3' }] });
    const res = response();

    await getMarketplaceFairnessMetrics({ query: { window_hours: '24', market_code: 'ID-JK' } } as unknown as Request, res);

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][1]).toEqual([24, 'ID-JK', null, null]);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.dimensions[0].outlier_flags).toEqual([
      'courier_earnings_p95_to_p10_ratio', 'merchant_top_share_pct', 'merchant_hhi',
      'no_supply_rate_pct', 'cancellation_rate_increase_pp', 'acceptance_rate_drop_pp',
    ]);
    expect(body.discovery.new_small_merchant_share_pct).toBe(30);
  });
});
