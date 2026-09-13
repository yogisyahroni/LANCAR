import { applyReferralCode } from './referral.controller';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../utils/authUtils', () => ({
  getActorId: jest.fn(() => '22222222-2222-4222-8222-222222222222'),
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn(), warn: jest.fn() },
}));

const { db } = jest.requireMock('../db') as { db: { connect: jest.Mock } };
const userId = '22222222-2222-4222-8222-222222222222';
const referrerId = '11111111-1111-4111-8111-111111111111';

const response = () => {
  const result: any = {};
  result.status = jest.fn(() => result);
  result.json = jest.fn(() => result);
  return result;
};

describe('referral risk integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTERNAL_API_KEY = 'test-internal-key';
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });

  it('moves a referral to risk review when server-observed identities overlap', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: referrerId }] })
      .mockResolvedValueOnce({ rows: [{ policy_version: 'id-jk-v1', reward_type: 'POINTS', reward_points: 100, reward_liability_minor: 1000, qualifying_rules: {} }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ shared_device_users: 1, shared_payment_users: 0, shared_address_users: 0, prior_rejected_attribution: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'attribution-1', status: 'REVIEW' }] })
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValue(client);
    const res = response();

    await applyReferralCode({
      body: { code: 'INVITE-1', market_code: 'id-jk' },
      user: { id: userId },
    } as any, res);

    const insert = client.query.mock.calls[5];
    expect(String(insert[0])).toContain('INSERT INTO crm_referral_attributions');
    expect(insert[1][4]).toBe('REVIEW');
    expect(JSON.parse(insert[1][7])).toMatchObject({
      signals: ['shared_device'],
      state: 'PENDING_RISK_REVIEW',
      reward_releasable: false,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'REVIEW', risk_signals: ['shared_device'], reward_releasable: false } }));
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});
