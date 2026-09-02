import { listCustomerLogisticsLocations } from './logisticsLocations.controller';
import { readDb } from '../db';

jest.mock('../db', () => ({
  readDb: { query: jest.fn() },
}));

const query = readDb.query as jest.Mock;

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('listCustomerLogisticsLocations', () => {
  beforeEach(() => query.mockReset());

  it('rejects a provider that is not backed by an adapter', async () => {
    const res = response();

    await listCustomerLogisticsLocations({ query: { provider: 'sicepat' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNSUPPORTED_LOGISTICS_PROVIDER' }));
    expect(query).not.toHaveBeenCalled();
  });

  it('returns provider-owned area codes from the operational mapping table', async () => {
    const res = response();
    query.mockResolvedValue({ rows: [{ code: 'CGK01', name: 'Jakarta', type: 'both' }] });

    await listCustomerLogisticsLocations({ query: { provider: 'jne' } } as any, res);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('provider_area_mappings'), ['jne']);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      provider: 'jne',
      source: 'provider_area_mappings',
      data: [{ code: 'CGK01', name: 'Jakarta', type: 'both' }],
    });
  });

  it('reports an unavailable mapping instead of returning placeholder locations', async () => {
    const res = response();
    query.mockResolvedValue({ rows: [] });

    await listCustomerLogisticsLocations({ query: { provider: 'jnt' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LOGISTICS_LOCATION_MAPPING_EMPTY' }));
  });

  it('maps a missing table to a safe service-unavailable response', async () => {
    const res = response();
    query.mockRejectedValue({ code: '42P01' });

    await listCustomerLogisticsLocations({ query: { provider: 'jne' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LOGISTICS_LOCATION_MAPPING_UNAVAILABLE' }));
  });
});
