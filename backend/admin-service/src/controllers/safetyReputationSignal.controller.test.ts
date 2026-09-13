import { emitAdminSafetyReputationSignal } from './safety.controller';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn(), warn: jest.fn() },
}));

const { db } = jest.requireMock('../db') as { db: { connect: jest.Mock } };

const incidentId = '11111111-1111-4111-8111-111111111111';
const actor = '33333333-3333-4333-8333-333333333333';
const subject = '44444444-4444-4444-8444-444444444444';

const response = () => {
  const result: any = {};
  result.statusCode = 200;
  result.status = jest.fn(() => result);
  result.json = jest.fn(() => result);
  return result;
};

const request = () => ({
  params: { id: incidentId },
  body: { reason: 'Verified incident requires quality recalculation' },
  user: { id: actor, role: 'ops_security' },
} as any);

describe('safety reputation signal controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an allegation before any reputation write', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ state: 'OPEN', subject_id: subject }] })
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValue(client);
    const res = response();

    await emitAdminSafetyReputationSignal(request(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ success: false, code: 'ERR_SAFETY_REPUTATION_REVIEW_REQUIRED' });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO reputation_actions'))).toBe(false);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('emits one reviewed signal and refuses a duplicate insert', async () => {
    const firstClient = { query: jest.fn(), release: jest.fn() };
    firstClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ state: 'RESOLVED', subject_id: subject, category: 'THREAT', severity: 'HIGH' }] })
      .mockResolvedValueOnce({ rows: [{ actor_id: actor, created_at: '2026-09-12T00:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'signal-1', subject_id: subject, action: 'QUALITY_RECALCULATE', rule_version: 'safety-reputation-2026-09-12' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValueOnce(firstClient);
    const firstRes = response();

    await emitAdminSafetyReputationSignal(request(), firstRes);

    expect(firstRes.status).toHaveBeenCalledWith(201);
    expect(firstRes.json.mock.calls[0][0]).toMatchObject({ success: true, data: { duplicate: false, automatic_enforcement: false } });

    const replayClient = { query: jest.fn(), release: jest.fn() };
    replayClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ state: 'RESOLVED', subject_id: subject, category: 'THREAT', severity: 'HIGH' }] })
      .mockResolvedValueOnce({ rows: [{ actor_id: actor, created_at: '2026-09-12T00:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'signal-1', subject_id: subject, action: 'QUALITY_RECALCULATE', rule_version: 'safety-reputation-2026-09-12' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValueOnce(replayClient);
    const replayRes = response();

    await emitAdminSafetyReputationSignal(request(), replayRes);

    expect(replayRes.status).toHaveBeenCalledWith(200);
    expect(replayRes.json.mock.calls[0][0]).toMatchObject({ success: true, data: { duplicate: true, automatic_enforcement: false } });
    expect(replayClient.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO reputation_actions'))).toHaveLength(1);
  });
});
