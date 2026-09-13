import { campaignAssignment, dispatchCrmCampaign } from './crmCampaign.service';

jest.mock('../db', () => ({ db: { query: jest.fn() } }));
jest.mock('../notifications', () => ({ createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }) }));
jest.mock('../security/logRedaction', () => ({ securityLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const { db } = jest.requireMock('../db') as { db: { query: jest.Mock } };
const { createNotification } = jest.requireMock('../notifications') as { createNotification: jest.Mock };

describe('CRM campaign delivery boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('produces a stable holdout assignment', () => {
    expect(campaignAssignment('campaign-1', 'customer-1', 100)).toBe('HOLDOUT');
    expect(campaignAssignment('campaign-1', 'customer-1', 0)).toBe('TREATMENT');
  });

  it('records a consented treatment exposure and communication event', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'campaign-1', campaign_code: 'winback', market_code: 'id-jk', state: 'ACTIVE', audience_definition: {}, frequency_cap: { per_user: 1, window_days: 7 }, holdout_percent: 0 }] })
      .mockResolvedValueOnce({ rows: [{ version: 2, title_template: 'Kabar', body_template: 'Halo {{first_name}}', required_variables: ['first_name'] }] })
      .mockResolvedValueOnce({ rows: [{ id: 'customer-1', personalization_allowed: false }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'exposure-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const stats = await dispatchCrmCampaign('campaign-1', { templateKey: 'crm.winback', locale: 'id-ID', variables: { first_name: 'Pelanggan' } });

    expect(stats).toMatchObject({ evaluated: 1, delivered: 1, failed: 0, holdout: 0 });
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'customer-1', body: 'Halo Pelanggan', type: 'crm_campaign' }));
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO communication_events'))).toBe(true);
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes("status = 'completed'"))).toBe(true);
  });

  it('persists holdout exposure without sending a notification', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'campaign-1', campaign_code: 'winback', market_code: 'id-jk', state: 'ACTIVE', audience_definition: {}, frequency_cap: { per_user: 1, window_days: 7 }, holdout_percent: 100 }] })
      .mockResolvedValueOnce({ rows: [{ version: 1, title_template: 'Kabar', body_template: 'Halo', required_variables: [] }] })
      .mockResolvedValueOnce({ rows: [{ id: 'customer-1', personalization_allowed: false }] })
      .mockResolvedValueOnce({});

    const stats = await dispatchCrmCampaign('campaign-1', { templateKey: 'crm.winback', locale: 'id-ID' });

    expect(stats).toMatchObject({ evaluated: 1, holdout: 1, delivered: 0 });
    expect(createNotification).not.toHaveBeenCalled();
    expect(String(db.query.mock.calls[3][0])).toContain('INSERT INTO crm_campaign_exposures');
  });
});
