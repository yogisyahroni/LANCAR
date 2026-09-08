import { getRiskReview, listRiskReviews, resolveRiskReview } from './riskReview.controller';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn() },
}));

const { db, readDb } = jest.requireMock('../db') as {
  db: { connect: jest.Mock };
  readDb: { query: jest.Mock };
};

const response = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
});
describe('central risk review controller', () => {
  beforeEach(() => {
    db.connect.mockReset();
    readDb.query.mockReset();
  });

  it('lists only the bounded, server-derived review projection', async () => {
    readDb.query.mockResolvedValueOnce({ rows: [{ id: 'review-1', decision: 'HOLD' }] });
    const res = response();

    await listRiskReviews({ query: { status: 'pending', decision: 'hold', limit: '9999' } } as any, res as any);

    expect(readDb.query.mock.calls[0][1]).toEqual(['PENDING', 'HOLD', 250]);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 'review-1', decision: 'HOLD' }], total: 1, status: 'PENDING', decision: 'HOLD', limit: 250 });
  });

  it('rejects malformed review ids before touching the database', async () => {
    const res = response();
    await getRiskReview({ params: { id: 'not-a-uuid' } } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(readDb.query).not.toHaveBeenCalled();
  });

  it('resolves a pending review transactionally with bounded evidence and reviewer identity', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', risk_decision_id: '22222222-2222-4222-8222-222222222222', status: 'PENDING' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    db.connect.mockResolvedValueOnce(client);
    const res = response();

    await resolveRiskReview({
      params: { id: '11111111-1111-4111-8111-111111111111' },
      body: {
        decision: 'allow',
        reason: 'Bukti operasional sudah diverifikasi',
        evidence: { summary: 'Validasi internal selesai', references: ['case-1', 42, 'case-2'] },
      },
      user: { id: '33333333-3333-4333-8333-333333333333', role: 'ops_security', full_name: 'Ops', totp_verified: true },
    } as any, res as any);

    expect(client.query.mock.calls.map(([sql]: [string]) => sql)).toEqual(['BEGIN', expect.stringContaining('SELECT id, risk_decision_id'), expect.stringContaining('UPDATE risk_manual_reviews'), expect.stringContaining('UPDATE risk_decisions'), 'COMMIT']);
    expect(client.query.mock.calls[2][1][1]).toContain('reviewer_submission');
    expect(client.query.mock.calls[2][1][1]).toContain('case-1');
    expect(client.query.mock.calls[2][1][1]).not.toContain('42');
    expect(res.json).toHaveBeenCalledWith({ data: { id: '11111111-1111-4111-8111-111111111111', status: 'RESOLVED', decision: 'ALLOW', reviewer_id: '33333333-3333-4333-8333-333333333333', reason: 'Bukti operasional sudah diverifikasi' } });
    expect(client.release).toHaveBeenCalled();
  });
});
