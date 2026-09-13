import { createAdminCrmCampaign } from './platformOperations.controller';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../utils/authUtils', () => ({
  getActorId: jest.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { error: jest.fn(), warn: jest.fn() },
}));

const { db } = jest.requireMock('../db') as { db: { query: jest.Mock } };

const response = () => {
  const result: any = {};
  result.status = jest.fn(() => result);
  result.json = jest.fn(() => result);
  return result;
};

describe('CRM campaign governance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects sensitive or ungoverned audience fields before persistence', async () => {
    const res = response();
    await createAdminCrmCampaign({
      body: {
        campaign_code: 'winback-1',
        market_code: 'id-jk',
        budget_minor: 1000,
        audience_definition: { email: 'customer@example.test' },
      },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.arrayContaining(['unsupported_audience_field:email']),
    }));
    expect(db.query).not.toHaveBeenCalled();
  });

  it('persists a consent-gated audience and explicit frequency window', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'campaign-1', state: 'DRAFT' }] });
    const res = response();
    await createAdminCrmCampaign({
      body: {
        campaign_code: 'winback-2',
        market_code: 'id-jk',
        budget_minor: 2500,
        audience_definition: { lifecycle_stage: 'at_risk', service_codes: ['delivery'] },
        frequency_cap: { per_user: 2, window_days: 14 },
        funding_breakdown: { platform: 2500 },
      },
    } as any, res);

    const call = db.query.mock.calls[0];
    expect(JSON.parse(call[1][2])).toMatchObject({ consent_required: true, lifecycle_stage: 'at_risk' });
    expect(JSON.parse(call[1][5])).toEqual({ per_user: 2, window_days: 14 });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
