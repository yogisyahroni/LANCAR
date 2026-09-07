import { previewZoneRevision, updateZone } from './logistics.controller';
import { db, readDb } from '../db';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

const readQuery = readDb.query as jest.Mock;
const connect = db.connect as jest.Mock;

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('geo operations admin control plane', () => {
  beforeEach(() => {
    readQuery.mockReset();
    connect.mockReset();
  });

  it('returns a zone impact estimate with affected services and markets', async () => {
    readQuery
      .mockResolvedValueOnce({ rows: [{ id: 'zone-1', market_code: 'ID-JK', geometry_version: 2, is_active: true, polygon: 'POLYGON((...))' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'revision-3', zone_id: 'zone-1', revision_number: 3, market_code: 'ID-BDG', status: 'draft', polygon: 'POLYGON((...))', created_by: 'maker-1' }] })
      .mockResolvedValueOnce({ rows: [{ active_orders_count: 4 }] })
      .mockResolvedValueOnce({ rows: [
        { service_code: 'food_delivery', active_orders_count: 3 },
        { service_code: 'parcel', active_orders_count: 1 },
      ] });

    const res = response();
    await previewZoneRevision({ params: { id: 'zone-1' } } as any, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      diff: expect.objectContaining({
        active_orders_count: 4,
        affected_services: [
          { service_code: 'food_delivery', active_orders_count: 3 },
          { service_code: 'parcel', active_orders_count: 1 },
        ],
        affected_markets: ['ID-JK', 'ID-BDG'],
        impact_estimate: {
          active_order_assignments: 4,
          affected_service_count: 2,
          affected_market_count: 2,
          existing_orders_preserved: true,
          new_orders_re_evaluate_zone: true,
        },
      }),
    }));
    expect(readQuery).toHaveBeenCalledTimes(4);
  });

  it('rejects order coordinate fields at the generic zone editor boundary', async () => {
    const res = response();

    await updateZone({
      params: { id: 'zone-1' },
      body: { polygon: 'POLYGON((...))', order_id: 'order-1', pickup_lat: -6.2 },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Zone editor cannot modify active order coordinates.',
      code: 'ZONE_EDITOR_ORDER_COORDINATE_FORBIDDEN',
      fields: ['order_id', 'pickup_lat'],
    });
    expect(connect).not.toHaveBeenCalled();
  });
});
