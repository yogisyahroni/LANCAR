import { resolveMembershipBenefitEligibility } from './loyalty.controller';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../utils/authUtils', () => ({
  getActorId: jest.fn(),
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn(), warn: jest.fn() },
}));

const { readDb } = jest.requireMock('../db') as { readDb: { query: jest.Mock } };
const owner = '11111111-1111-4111-8111-111111111111';

const response = () => {
  const result: any = {};
  result.status = jest.fn(() => result);
  result.json = jest.fn(() => result);
  return result;
};

const request = (body: Record<string, unknown>) => ({
  body,
  header: (name: string) => name.toLowerCase() === 'x-internal-api-key' ? 'test-internal-key' : undefined,
} as any);

describe('membership eligibility boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTERNAL_API_KEY = 'test-internal-key';
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });

  it('fails closed when no entitlement is available', async () => {
    readDb.query.mockResolvedValueOnce({ rows: [] });
    const res = response();

    await resolveMembershipBenefitEligibility(request({ owner_id: owner, market_code: 'id-jk', service_code: 'delivery' }), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { eligible: false, reason: 'NO_ENTITLEMENT', service_code: 'delivery', benefit_code: 'free_delivery' },
    });
  });

  it('returns server-authoritative service and funding eligibility', async () => {
    readDb.query.mockResolvedValueOnce({ rows: [{
      id: 'entitlement-1',
      state: 'ACTIVE',
      current_period_end: '2026-10-01T00:00:00.000Z',
      payment_intent_id: 'payment-1',
      plan_code: 'plus',
      version: 2,
      market_code: 'id-jk',
      currency: 'IDR',
      benefits: { free_delivery: { enabled: true, service_codes: ['delivery'], cap_minor: 2500 } },
    }] });
    const res = response();

    await resolveMembershipBenefitEligibility(request({ owner_id: owner, market_code: 'id-jk', service_code: 'delivery' }), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eligible: true,
        reason: 'ELIGIBLE',
        funding_source: 'MEMBERSHIP',
        subsidy_cap_minor: 2500,
        plan_version: 2,
      }),
    }));
  });
});
