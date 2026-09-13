import { moderateAdminReputationReview } from './platformOperations.controller';

jest.mock('../db', () => ({
  db: { query: jest.fn(), connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../utils/authUtils', () => ({
  getActorId: jest.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

const { db } = jest.requireMock('../db') as { db: { connect: jest.Mock } };
const reviewId = '22222222-2222-4222-8222-222222222222';
const actor = '11111111-1111-4111-8111-111111111111';
const subject = '33333333-3333-4333-8333-333333333333';

const response = () => {
  const result: any = {};
  result.status = jest.fn(() => result);
  result.json = jest.fn(() => result);
  return result;
};

describe('admin reputation material restriction governance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a material hide without reviewed evidence references', async () => {
    const res = response();

    await moderateAdminReputationReview({
      params: { id: reviewId },
      body: { state: 'HIDDEN', reason: 'Material restriction without evidence reference' },
      user: { id: actor, role: 'ops_security' },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('persists reviewed evidence refs while keeping the action auditable', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: reviewId, subject_id: subject, state: 'IN_REVIEW' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValue(client);
    const res = response();

    await moderateAdminReputationReview({
      params: { id: reviewId },
      body: { state: 'HIDDEN', reason: 'Evidence review confirms prohibited content', reviewed_evidence_refs: ['case-1', 'signal-2'] },
      user: { id: actor, role: 'ops_security' },
    } as any, res);

    const actionInsert = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO reputation_actions'));
    expect(actionInsert).toBeTruthy();
    expect(JSON.parse(actionInsert[1][4])).toMatchObject({
      evidence_review_status: 'REVIEWED',
      reviewed_evidence_refs: ['case-1', 'signal-2'],
    });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
