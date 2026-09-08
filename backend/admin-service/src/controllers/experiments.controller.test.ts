import { createExperiment, killExperiment, listExperiments } from './experiments.controller';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));
jest.mock('../utils/authUtils', () => ({ getActorId: jest.fn(() => '00000000-0000-4000-8000-000000000001') }));
jest.mock('../security/logRedaction', () => ({ securityLog: { error: jest.fn() } }));

const { db, readDb } = jest.requireMock('../db') as {
  db: { connect: jest.Mock };
  readDb: { query: jest.Mock };
};

const response = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
});

const validBody = {
  key: 'food-home-layout-v1',
  name: 'Food home layout',
  namespace: 'food-home',
  status: 'draft',
  targeting: { market_codes: ['id-jk'], service_codes: ['food_delivery'], safe_attributes: { platform: ['android'] } },
  variants: [
    { key: 'control', weight_basis_points: 5000, payload: {} },
    { key: 'treatment', weight_basis_points: 5000, payload: { layout: 'dense_cards' } },
  ],
};

describe('experimentation control plane', () => {
  beforeEach(() => {
    db.connect.mockReset();
    readDb.query.mockReset();
  });

  it('lists server-stored experiments for the admin GUI', async () => {
    readDb.query.mockResolvedValueOnce({ rows: [{ key: 'food-home-layout-v1', status: 'draft' }] });
    const res = response();
    await listExperiments({ query: {} } as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ key: 'food-home-layout-v1', status: 'draft' }] });
  });

  it('rejects financial treatment configuration before opening a database transaction', async () => {
    const res = response();
    await createExperiment({ body: { ...validBody, variants: [
      validBody.variants[0], { key: 'treatment', weight_basis_points: 5000, payload: { price_override: 1 } },
    ] } } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('creates and kills an experiment transactionally with an audit record', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', ...validBody }] })
        .mockResolvedValueOnce({}) // audit
        .mockResolvedValueOnce({}), // COMMIT
      release: jest.fn(),
    };
    db.connect.mockResolvedValue(client);
    const createRes = response();
    await createExperiment({ body: validBody } as any, createRes as any);
    expect(createRes.status).toHaveBeenCalledWith(201);
    expect(client.query.mock.calls.some(([sql]: [string]) => String(sql).includes("experiment.created"))).toBe(true);

    client.query.mockReset();
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', status: 'RUNNING' }] })
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', key: validBody.key, status: 'killed' }] })
      .mockResolvedValueOnce({}) // audit
      .mockResolvedValueOnce({}); // COMMIT
    const killRes = response();
    await killExperiment({ params: { key: validBody.key }, body: { reason: 'Guardrail breached' } } as any, killRes as any);
    expect(killRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: expect.stringContaining('existing assignments') }));
    expect(client.query.mock.calls.some(([sql]: [string]) => String(sql).includes("experiment.killed"))).toBe(true);
  });
});
