import { adjustLoyaltyAccount, applyLoyaltyOrderEvent, applyMembershipPaymentEvent, resolveMembershipBenefitEligibility } from './loyalty.controller';

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

const { db, readDb } = jest.requireMock('../db') as { db: { connect: jest.Mock }; readDb: { query: jest.Mock } };
const owner = '11111111-1111-4111-8111-111111111111';

const response = () => {
  const result: any = {};
  result.status = jest.fn(() => result);
  result.json = jest.fn(() => result);
  return result;
};

const request = (body: Record<string, unknown>, idempotencyKey?: string) => ({
  body,
  header: (name: string) => name.toLowerCase() === 'x-internal-api-key' ? 'test-internal-key' : name.toLowerCase() === 'x-idempotency-key' ? idempotencyKey : undefined,
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

  it('accepts earn only after the authoritative order is completed', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ customer_id: owner, status: 'delivered' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'account-1', points_balance: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'entry-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'account-1', market_code: 'id-jk', points_balance: 100, benefit_balance: {} }] })
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValue(client);
    const res = response();
    await applyLoyaltyOrderEvent({
      body: { owner_id: owner, market_code: 'id-jk', order_id: '22222222-2222-4222-8222-222222222222', event_type: 'EARN', points: 100 },
      header: (name: string) => name.toLowerCase() === 'x-internal-api-key' ? 'test-internal-key' : undefined,
    } as any, res);
    expect(client.query.mock.calls[1][0]).toContain('FROM orders');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('records a reasoned finance adjustment as an append-only ledger entry', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'account-1', points_balance: 100 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'entry-adjustment-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'account-1', market_code: 'id-jk', points_balance: 150, benefit_balance: {} }] })
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValue(client);
    const res = response();
    await adjustLoyaltyAccount({ params: { accountId: '22222222-2222-4222-8222-222222222222' }, body: { points: 50, reason: 'Finance correction ticket FIN-42' }, header: (name: string) => name.toLowerCase() === 'x-idempotency-key' ? 'adjustment-42' : undefined } as any, res);
    expect(client.query.mock.calls[2][0]).toContain("'ADJUSTMENT'");
    expect(client.query.mock.calls[2][0]).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, duplicate: false }));
  });

  it('does not leave a pending entitlement active after payment failure', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'entitlement-1', state: 'PENDING_PAYMENT', payment_intent_id: 'payment-1' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'payment-event-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'entitlement-1', state: 'CANCELLED', current_period_end: '2026-10-01', payment_intent_id: 'payment-1', updated_at: '2026-09-14' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValue(client);
    const res = response();

    await applyMembershipPaymentEvent({
      params: { entitlementId: '22222222-2222-4222-8222-222222222222' },
      body: { payment_state: 'FAILED', payment_intent_id: 'payment-1' },
      header: (name: string) => name.toLowerCase() === 'x-internal-api-key' ? 'test-internal-key' : name.toLowerCase() === 'x-idempotency-key' ? 'membership-payment-1' : undefined,
    } as any, res);

    expect(client.query.mock.calls[2][0]).toContain('crm_membership_payment_events');
    expect(client.query.mock.calls[3][1]).toEqual(['22222222-2222-4222-8222-222222222222', 'CANCELLED', 'FAILED']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, duplicate: false, data: expect.objectContaining({ state: 'CANCELLED' }) }));
  });

  it('rejects reuse of a membership payment idempotency key with a different event', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'entitlement-1', state: 'PENDING_PAYMENT', payment_intent_id: 'payment-1' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ payment_state: 'SUCCEEDED', payment_intent_id: 'payment-1', provider_reference: 'provider-success', resulting_state: 'ACTIVE' }] })
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValue(client);
    const res = response();

    await applyMembershipPaymentEvent({
      params: { entitlementId: '22222222-2222-4222-8222-222222222222' },
      body: { payment_state: 'FAILED', payment_intent_id: 'payment-1', provider_reference: 'provider-failed' },
      header: (name: string) => name.toLowerCase() === 'x-internal-api-key' ? 'test-internal-key' : name.toLowerCase() === 'x-idempotency-key' ? 'membership-payment-reused' : undefined,
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ success: false, code: 'ERR_MEMBERSHIP_IDEMPOTENCY_REUSE' });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
