import { campaignAssignment, dispatchCrmCampaign, getCrmCampaignMetrics, recordCrmCampaignConversion } from './crmCampaign.service';

jest.mock('../db', () => ({ db: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('../notifications', () => ({ createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }) }));
jest.mock('../security/logRedaction', () => ({ securityLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const { db } = jest.requireMock('../db') as { db: { query: jest.Mock; connect: jest.Mock } };
const { createNotification } = jest.requireMock('../notifications') as { createNotification: jest.Mock };

describe('CRM campaign delivery boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('produces a stable holdout assignment', () => {
    expect(campaignAssignment('campaign-1', 'customer-1', 100)).toBe('HOLDOUT');
    expect(campaignAssignment('campaign-1', 'customer-1', 0)).toBe('TREATMENT');
  });

  it('records a consented treatment exposure and communication event', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'exposure-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValueOnce(client);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'campaign-1', campaign_code: 'winback', market_code: 'id-jk', state: 'ACTIVE', audience_definition: {}, frequency_cap: { per_user: 1, window_days: 7 }, holdout_percent: 0 }] })
      .mockResolvedValueOnce({ rows: [{ completed_orders: '1', completed_revenue_minor: '1000', margin_complete_orders: '1', contribution_margin_minor: '500', refunded_orders: '0', support_orders: '0', spam_orders: '0' }] })
      .mockResolvedValueOnce({ rows: [{ version: 2, title_template: 'Kabar', body_template: 'Halo {{first_name}}', required_variables: ['first_name'] }] })
      .mockResolvedValueOnce({ rows: [{ id: 'customer-1', personalization_allowed: false }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
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
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'exposure-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValueOnce(client);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'campaign-1', campaign_code: 'winback', market_code: 'id-jk', state: 'ACTIVE', audience_definition: {}, frequency_cap: { per_user: 1, window_days: 7 }, holdout_percent: 100 }] })
      .mockResolvedValueOnce({ rows: [{ completed_orders: '1', completed_revenue_minor: '1000', margin_complete_orders: '1', contribution_margin_minor: '500', refunded_orders: '0', support_orders: '0', spam_orders: '0' }] })
      .mockResolvedValueOnce({ rows: [{ version: 1, title_template: 'Kabar', body_template: 'Halo', required_variables: [] }] })
      .mockResolvedValueOnce({ rows: [{ id: 'customer-1', personalization_allowed: false }] });

    const stats = await dispatchCrmCampaign('campaign-1', { templateKey: 'crm.winback', locale: 'id-ID' });

    expect(stats).toMatchObject({ evaluated: 1, holdout: 1, delivered: 0 });
    expect(createNotification).not.toHaveBeenCalled();
    expect(String(client.query.mock.calls[1][0])).toContain('INSERT INTO crm_campaign_exposures');
  });

  it('reports completed orders and revenue by treatment and holdout', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'campaign-1', campaign_code: 'winback', market_code: 'id-jk', state: 'ACTIVE', audience_definition: {}, frequency_cap: {}, holdout_percent: 20, budget_minor: 1000, guardrail_policy: {} }] })
      .mockResolvedValueOnce({ rows: [
        { assignment: 'TREATMENT', exposed: '10', converted: '4', completed_orders: '4', completed_revenue_minor: '4000' },
        { assignment: 'HOLDOUT', exposed: '10', converted: '2', completed_orders: '2', completed_revenue_minor: '1800' },
      ] })
      .mockResolvedValueOnce({ rows: [{ completed_orders: '4', completed_revenue_minor: '4000', margin_complete_orders: '4', contribution_margin_minor: '1200', refunded_orders: '0', support_orders: '0', spam_orders: '0' }] });
    await expect(getCrmCampaignMetrics('campaign-1')).resolves.toMatchObject({
      treatment: { exposed: 10, completed_orders: 4, completed_revenue_minor: 4000 },
      holdout: { exposed: 10, completed_orders: 2, completed_revenue_minor: 1800 },
      incremental_order_rate: 0.2,
      conversion_is_not_coupon_redemption: true,
    });
  });

  it('does not dispatch when guardrail data is insufficient', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'campaign-1', campaign_code: 'winback', market_code: 'id-jk', state: 'ACTIVE', audience_definition: {}, frequency_cap: {}, holdout_percent: 0 }] })
      .mockResolvedValueOnce({ rows: [{ completed_orders: '0', completed_revenue_minor: '0', margin_complete_orders: '0', contribution_margin_minor: null, refunded_orders: '0', support_orders: '0', spam_orders: '0' }] });

    await expect(dispatchCrmCampaign('campaign-1', { templateKey: 'crm.winback', locale: 'id-ID' })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('records an authoritative conversion and emits one Experiment/Data event transactionally', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'exposure-1', campaign_code: 'winback', market_code: 'id-jk' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'exposure-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValueOnce(client);

    await expect(recordCrmCampaignConversion('campaign-1', 'customer-1', 'order-1')).resolves.toBe(true);

    expect(String(client.query.mock.calls[1][0])).toContain('o.status IN');
    expect(String(client.query.mock.calls[2][0])).toContain('first_conversion_at');
    expect(String(client.query.mock.calls[3][0])).toContain('INSERT INTO event_outbox');
    expect(String(client.query.mock.calls[3][1])).toContain('experiment.conversion');
    expect(client.query.mock.calls[client.query.mock.calls.length - 1]?.[0]).toBe('COMMIT');
  });
});
