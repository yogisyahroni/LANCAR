import { Request, Response } from 'express';
import { getAnalyticsServiceKPIs } from './analytics.controller';
import {
  getServiceKpis,
  parseServiceKpiWindow,
  SERVICE_KPI_DEFINITIONS,
} from '../services/serviceKpis';

jest.mock('../db', () => ({ readDb: { query: jest.fn() }, db: { query: jest.fn() } }));
jest.mock('../security/logRedaction', () => ({ securityLog: { error: jest.fn() } }));
jest.mock('../services/serviceKpis', () => ({
  getServiceKpis: jest.fn(),
  parseServiceKpiWindow: jest.fn(),
  SERVICE_KPI_DEFINITIONS: { package_on_demand: { match_rate_pct: 'definition' } },
}));

const response = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
} as unknown as Response);

describe('service KPI analytics controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a versioned service KPI payload with the selected window', async () => {
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-08T00:00:00.000Z');
    (parseServiceKpiWindow as jest.Mock).mockReturnValue({ range: '7D', from, to });
    (getServiceKpis as jest.Mock).mockResolvedValue([{ service_category: 'food', sample_size: 2, coverage: {}, metrics: {} }]);
    const res = response();

    await getAnalyticsServiceKPIs({ query: { range: '7D' } } as unknown as Request, res);

    expect(parseServiceKpiWindow).toHaveBeenCalledWith('7D');
    expect(getServiceKpis).toHaveBeenCalledWith({ range: '7D', from, to });
    expect((res.json as jest.Mock).mock.calls[0][0]).toEqual({
      success: true,
      data: {
        window: { range: '7D', from: from.toISOString(), to: to.toISOString() },
        services: [{ service_category: 'food', sample_size: 2, coverage: {}, metrics: {} }],
        definitions: SERVICE_KPI_DEFINITIONS,
      },
    });
  });
});
