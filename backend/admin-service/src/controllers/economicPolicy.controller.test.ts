import { Request, Response } from 'express';
import { db, readDb } from '../db';
import {
  approveEconomicPolicyRevision,
  createEconomicPolicyRevision,
  previewEconomicPolicyRevision,
} from './economicPolicy.controller';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

const makeResponse = () => {
  const response: Partial<Response> & { bodyValue?: unknown; statusCodeValue?: number } = {
    statusCode: 200,
    status(code: number) {
      response.statusCodeValue = code;
      response.statusCode = code;
      return response as Response;
    },
    json(body: unknown) {
      response.bodyValue = body;
      return response as Response;
    },
  };
  return response as Response & { bodyValue?: unknown; statusCodeValue?: number };
};

const validBody = {
  policy_type: 'pricing',
  market_code: 'default',
  service_code: 'food_delivery',
  policy_version: 'controller-test-v1',
  business_reason: 'Validasi dampak peak window food.',
  payload: {
    zone_scope: 'active_zone',
    timezone: 'Asia/Jakarta',
    floor_multiplier: 1,
    ceiling_multiplier: 1.3,
    protected_cap_multiplier: 1.4,
    peak_multiplier: 1.1,
    peak_windows: [{ start_hour: 11, end_hour: 14 }],
    fairness_reviewed: true,
  },
};

describe('economic policy controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a draft and audits the business reason', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'revision-1', status: 'draft' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    (db.connect as jest.Mock).mockResolvedValue(client);

    const response = makeResponse();
    await createEconomicPolicyRevision({ body: validBody, user: { id: 'maker-1' } } as unknown as Request, response);

    expect(response.statusCodeValue).toBe(201);
    expect(response.bodyValue).toEqual(expect.objectContaining({ success: true }));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['maker-1', 'economics_policy.drafted', 'revision-1']),
    );
  });

  it('rejects same-actor approval before attempting a state transition', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'revision-1', status: 'draft', created_by: 'maker-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    (db.connect as jest.Mock).mockResolvedValue(client);

    const response = makeResponse();
    await approveEconomicPolicyRevision({ params: { id: '11111111-1111-4111-8111-111111111111' }, user: { id: 'maker-1' } } as unknown as Request, response);

    expect(response.statusCodeValue).toBe(409);
    expect(response.bodyValue).toEqual(expect.objectContaining({ error: expect.stringContaining('berbeda') }));
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining("SET status = 'approved'"), expect.anything());
  });

  it('returns server-side impact scope and tariff-backed examples', async () => {
    (readDb.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'revision-1', policy_type: 'pricing', policy_version: 'candidate-v1', runtime_config_key: 'dynamic_pricing_policy_default_food_delivery', market_code: 'default', zone_id: null, service_code: 'food_delivery', payload: validBody.payload, status: 'draft', created_by: 'maker-1' }] })
      .mockResolvedValueOnce({ rows: [{ value: { policy_version: 'old', ceiling_multiplier: 1.2, protected_cap_multiplier: 1.2 } }] })
      .mockResolvedValueOnce({ rows: [{ code: 'food_delivery', base_fare_idr: 5000, included_distance_km: 2, per_km_idr: 2500, service_multiplier: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ active_order_count: 4 }] });

    const response = makeResponse();
    await previewEconomicPolicyRevision({ params: { id: '11111111-1111-4111-8111-111111111111' } } as unknown as Request, response);

    expect(response.statusCodeValue).toBeUndefined();
    expect(response.bodyValue).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        affected_scope: expect.objectContaining({ active_order_count: 4, service_codes: ['food_delivery'] }),
        example_quotes: expect.objectContaining({ candidate_quotes: expect.any(Array) }),
      }),
    }));
  });
});
