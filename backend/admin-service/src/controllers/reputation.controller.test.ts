import {
  createReputationReview,
  getPublicReputationAggregate,
  reviewAdminReputationAppeal,
} from './reputation.controller';

jest.mock('../db', () => ({
  db: { query: jest.fn(), connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../utils/authUtils', () => ({
  getActorId: jest.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn(), warn: jest.fn() },
}));

const { db, readDb } = jest.requireMock('../db') as {
  db: { query: jest.Mock; connect: jest.Mock };
  readDb: { query: jest.Mock };
};

const actor = '11111111-1111-4111-8111-111111111111';
const subject = '22222222-2222-4222-8222-222222222222';
const order = '33333333-3333-4333-8333-333333333333';
const review = '44444444-4444-4444-8444-444444444444';
const appeal = '55555555-5555-4555-8555-555555555555';

const response = () => {
  const result: any = {};
  result.status = jest.fn(() => result);
  result.json = jest.fn(() => result);
  return result;
};

describe('reputation controller governance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records automated pressure signals in moderation without permanent punishment', async () => {
    readDb.query.mockResolvedValueOnce({
      rows: [{
        id: order,
        customer_id: actor,
        service_code: 'delivery',
        status: 'completed',
        subject_is_courier: true,
        subject_is_merchant: false,
      }],
    });
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: review, state: 'IN_REVIEW', moderation_reason: 'rating_threat_for_compensation' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'action-1', action: 'REPORT' }] })
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValue(client);
    const res = response();

    await createReputationReview({
      body: {
        order_id: order,
        subject_id: subject,
        stars: 1,
        market_code: 'id-jk',
        body: 'Kalau rating jelek saya minta kompensasi',
        dimensions: { delivery: 1 },
      },
      user: { id: actor },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const actionInsert = client.query.mock.calls[2];
    expect(String(actionInsert[0])).toContain('INSERT INTO reputation_actions');
    expect(JSON.parse(actionInsert[1][3])).toMatchObject({ temporary_investigation: true });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('recomputes a versioned aggregate snapshot when an appeal reverses enforcement', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{
        id: appeal,
        review_id: review,
        subject_id: subject,
        appeal_state: 'IN_REVIEW',
        review_state: 'HIDDEN',
        service_code: 'delivery',
        market_code: 'id-jk',
      }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'snapshot-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValue(client);
    const res = response();

    await reviewAdminReputationAppeal({
      params: { appealId: appeal },
      body: { state: 'REVERSED', reason: 'Evidence review confirms the original restriction was not justified' },
      user: { id: actor, role: 'ops_security' },
    } as any, res);

    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO reputation_signal_snapshots'))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("'reputation.aggregate.recomputed'"))).toBe(true);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ aggregate_recomputed: true }) }));
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('returns a privacy-safe aggregate visibility reason without moderation details', async () => {
    readDb.query.mockResolvedValueOnce({ rows: [{ sample_size: 3, average_stars: 2, service_average: 2, delivery_average: 2 }] });
    const res = response();

    await getPublicReputationAggregate({
      params: { subjectId: subject },
      query: { service_code: 'delivery', market_code: 'id-jk' },
    } as any, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        visible: false,
        aggregate_visibility_reason: 'PUBLISHED_SAMPLE_BELOW_PRIVACY_THRESHOLD',
      }),
    });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('moderation_reason');
  });
});
