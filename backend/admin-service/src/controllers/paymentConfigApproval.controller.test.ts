import { approvePaymentConfigChange, requestPaymentConfigChange } from './paymentConfigApproval.controller';
import { db } from '../db';

jest.mock('../db', () => ({
  db: { query: jest.fn(), connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

const mockedDb = db as unknown as { query: jest.Mock; connect: jest.Mock };

const makeResponse = () => {
  const response: any = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  return response;
};

const makeRequest = (body: any, actor = 'actor-requester') => ({
  body,
  headers: { 'x-idempotency-key': 'payment-config-test-1' },
  header(name: string) {
    return this.headers[name.toLowerCase() as keyof typeof this.headers];
  },
  user: { id: actor, role: 'super_admin' },
  params: { id: '5e1d2b8f-1e4f-4d7e-9c2f-72c12a0f8b51' },
  query: {},
} as any);

describe('payment config maker-checker controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a pending request and records an append-only requested event', async () => {
    mockedDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'request-1', change_type: 'PROVIDER_HEALTH', status: 'PENDING' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const response = makeResponse();

    await requestPaymentConfigChange(
      makeRequest({ provider: 'staging', state: 'degraded', reason: 'provider test' }),
      response,
      'PROVIDER_HEALTH',
    );

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json.mock.calls[0][0]).toMatchObject({ success: true, pending_approval: true });
    expect(mockedDb.query.mock.calls[1][0]).toContain("event_type, actor_id, payload");
  });

  it('replays the same request independent of JSON object key order', async () => {
    mockedDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'request-1', change_type: 'PROVIDER_HEALTH', status: 'PENDING', reason: 'provider test', payload: { reason: 'provider test', state: 'degraded', provider: 'staging' } }] });
    const response = makeResponse();

    await requestPaymentConfigChange(
      makeRequest({ provider: 'staging', state: 'degraded', reason: 'provider test' }),
      response,
      'PROVIDER_HEALTH',
    );

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json.mock.calls[0][0]).toMatchObject({ success: true, duplicate: true });
  });

  it('rejects self-approval before any target projection mutation', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'request-1', change_type: 'PROVIDER_HEALTH', requested_by: 'actor-requester', status: 'PENDING', payload: { provider: 'staging', state: 'degraded', reason: 'provider test' } }] })
      .mockResolvedValueOnce({});
    mockedDb.connect.mockResolvedValue(client);
    const response = makeResponse();

    await approvePaymentConfigChange(makeRequest({}, 'actor-requester'), response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json.mock.calls[0][0]).toMatchObject({ code: 'MAKER_CHECKER_REQUIRED' });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('payment_provider_health'))).toBe(false);
  });

  it('applies a pending request atomically under a different approver', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'request-1', change_type: 'PROVIDER_HEALTH', requested_by: 'actor-requester', status: 'PENDING', payload: { provider: 'staging', state: 'degraded', reason: 'provider test' } }] })
      .mockResolvedValueOnce({ rows: [{ provider: 'staging', state: 'degraded' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'request-1', status: 'APPLIED' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    mockedDb.connect.mockResolvedValue(client);
    const response = makeResponse();

    await approvePaymentConfigChange(makeRequest({}, 'actor-approver'), response);

    expect(response.json.mock.calls[0][0]).toMatchObject({ success: true, data: { applied: { provider: 'staging', state: 'degraded' } } });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("status = 'APPLIED'"))).toBe(true);
  });
});
