import { applyReferralCode } from './referral.controller';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../utils/authUtils', () => ({
  getActorId: jest.fn(() => '22222222-2222-4222-8222-222222222222'),
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn() },
}));

const { db } = jest.requireMock('../db') as { db: { connect: jest.Mock } };

const response = () => {
  const result: any = {};
  result.status = jest.fn(() => result);
  result.json = jest.fn(() => result);
  return result;
};

describe('referral risk decision contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTERNAL_API_KEY = 'test-internal-key';
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });

  it('stores signal snapshots as arrays required by the central risk schema', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111' }] })
      .mockResolvedValueOnce({ rows: [{ policy_version: 'referral-2026-v1', reward_type: 'POINTS', reward_points: 100, reward_liability_minor: 0, qualifying_rules: {} }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ shared_device_users: 1, shared_payment_users: 0, shared_address_users: 0, prior_rejected_attribution: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'attr-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'risk-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValue(client);

    const res = response();
    await applyReferralCode({
      body: { code: 'REFABC123', market_code: 'id-jk' },
      header: () => undefined,
    } as any, res);

    const riskInsert = client.query.mock.calls.find(([sql]: [string]) => String(sql).includes('INSERT INTO risk_decisions'));
    expect(riskInsert).toBeTruthy();
    expect(JSON.parse(riskInsert[1][6])).toEqual([{ signals: ['shared_device'], source: 'crm_referral_apply', policy_version: 'referral-2026-v1' }]);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
