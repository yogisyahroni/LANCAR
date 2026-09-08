import { Request, Response } from 'express';
import { getAnalyticsDefinitions } from './analytics.controller';

const response = (): Response => ({
  json: jest.fn().mockReturnThis(),
} as unknown as Response);

describe('canonical analytics definitions controller', () => {
  it('exposes the versioned governed event source and required metrics', () => {
    const res = response();
    getAnalyticsDefinitions({} as Request, res);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.source).toBe('canonical event stream');
    expect(payload.data.definitions.map((definition: { name: string }) => definition.name)).toEqual([
      'gmv',
      'completed_order',
      'cancellation_rate',
      'refund_rate',
      'active_courier',
      'active_merchant',
      'sla_compliance',
    ]);
  });
});
