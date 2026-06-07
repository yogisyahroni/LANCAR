const mockReadDbQuery = jest.fn();
const mockConnect = jest.fn();

jest.mock('../db', () => ({
  db: {
    connect: mockConnect,
  },
  readDb: {
    query: mockReadDbQuery,
  },
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

import {
  previewPromoNotificationAudience,
  releasePromoReservation,
  validatePromoForCheckout,
} from './promoEngine';

describe('promoEngine checkout guards', () => {
  const campaign = {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'HEMAT10',
    name: 'Hemat 10',
    description: null,
    status: 'active',
    discount_type: 'fixed',
    discount_value_idr: 5000,
    discount_percent: 0,
    max_discount_idr: 0,
    min_order_idr: 10000,
    service_codes: ['instant_motor'],
    component_scope: 'shipping',
    stacking_key: 'instant_motor',
    allow_stack_different_service: true,
    total_budget_idr: 100000,
    daily_budget_idr: 0,
    reserved_budget_idr: 0,
    redeemed_budget_idr: 0,
    max_redemptions: 0,
    per_user_limit: 1,
    starts_at: '2026-06-01T00:00:00.000Z',
    ends_at: '2026-07-01T00:00:00.000Z',
    audience_rules: {},
    eligibility_rules: {},
    notification_copy: {},
    risk_campaign: false,
    risk_reason: null,
    approved_by: null,
    approved_at: null,
    published_by: null,
    published_at: null,
    paused_by: null,
    paused_at: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };

  const servicePolicy = {
    code: 'instant_motor',
    platform_commission_percent: 20,
    courier_payout_percent: 70,
    courier_min_payout_idr: 12000,
    mdr_percent: 2,
    ppn_percent: 1,
    min_margin_amount_idr: 3000,
    min_margin_percent: 5,
  };

  const validationInput = {
    code: 'HEMAT10',
    service_code: 'instant_motor',
    vehicle_type: 'motor',
    gross_amount_idr: 50000,
    insurance_amount_idr: 1000,
  };

  const createMockClient = () => ({
    query: jest.fn(),
    release: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a promo that would break contribution margin', async () => {
    mockReadDbQuery
      .mockResolvedValueOnce({ rows: [{ ...campaign, discount_value_idr: 30000 }] })
      .mockResolvedValueOnce({ rows: [{ ...servicePolicy, min_margin_amount_idr: 10000, min_margin_percent: 20 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await validatePromoForCheckout(
      '22222222-2222-4222-8222-222222222222',
      validationInput,
      'quote',
    );

    expect(result).toEqual(expect.objectContaining({
      eligible: false,
      reason: 'Promo tidak memenuhi batas margin layanan.',
      discount_idr: 0,
    }));
  });

  it('reserves budget once and stores redemption economics server-side', async () => {
    const mockClient = createMockClient();
    mockConnect.mockResolvedValue(mockClient);
    mockReadDbQuery
      .mockResolvedValueOnce({ rows: [campaign] })
      .mockResolvedValueOnce({ rows: [servicePolicy] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: campaign.id, total_budget_idr: 100000, reserved_budget_idr: 0, redeemed_budget_idr: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'ledger-1' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await validatePromoForCheckout(
      '22222222-2222-4222-8222-222222222222',
      {
        ...validationInput,
        idempotency_key: 'order-abc-promo-hemat10',
      },
      'reserve',
    );

    const campaignBudgetUpdate = mockClient.query.mock.calls.find(([sql]: [string]) =>
      sql.includes('SET reserved_budget_idr = reserved_budget_idr + $2'),
    );
    const redemptionInsert = mockClient.query.mock.calls.find(([sql]: [string]) =>
      sql.includes('INSERT INTO promo_redemptions') && sql.includes('gross_order_revenue_idr'),
    );

    expect(result).toEqual(expect.objectContaining({
      eligible: true,
      discount_idr: 5000,
    }));
    expect(campaignBudgetUpdate).toBeTruthy();
    expect(campaignBudgetUpdate[1]).toEqual([campaign.id, 5000]);
    expect(redemptionInsert).toBeTruthy();
  });

  it('allows idempotent reserve replay without double-counting budget', async () => {
    const mockClient = createMockClient();
    mockConnect.mockResolvedValue(mockClient);
    mockReadDbQuery
      .mockResolvedValueOnce({ rows: [{ ...campaign, total_budget_idr: 5000, reserved_budget_idr: 5000 }] })
      .mockResolvedValueOnce({ rows: [servicePolicy] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-redemption', status: 'reserved' }] });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: campaign.id, total_budget_idr: 5000, reserved_budget_idr: 5000, redeemed_budget_idr: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-ledger', status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await validatePromoForCheckout(
      '22222222-2222-4222-8222-222222222222',
      {
        ...validationInput,
        idempotency_key: 'order-abc-promo-hemat10',
      },
      'reserve',
    );

    const campaignBudgetUpdate = mockClient.query.mock.calls.find(([sql]: [string]) =>
      sql.includes('SET reserved_budget_idr = reserved_budget_idr + $2'),
    );

    expect(result).toEqual(expect.objectContaining({
      eligible: true,
      discount_idr: 5000,
    }));
    expect(campaignBudgetUpdate).toBeUndefined();
  });

  it('releases active reservation and restores campaign budget', async () => {
    const mockClient = createMockClient();
    mockConnect.mockResolvedValue(mockClient);
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'ledger-1', campaign_id: campaign.id, amount_idr: 5000 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await releasePromoReservation(
      '22222222-2222-4222-8222-222222222222',
      'order-abc-promo-hemat10',
    );

    const campaignBudgetRelease = mockClient.query.mock.calls.find(([sql]: [string]) =>
      sql.includes('SET reserved_budget_idr = GREATEST(0, reserved_budget_idr - $2)'),
    );

    expect(result).toEqual({ released: true, amount_idr: 5000 });
    expect(campaignBudgetRelease).toBeTruthy();
    expect(campaignBudgetRelease[1]).toEqual([campaign.id, 5000]);
  });

  it('blocks promo marketing audience when velocity cap is zero', async () => {
    mockReadDbQuery.mockResolvedValueOnce({ rows: [campaign] });

    const result = await previewPromoNotificationAudience(campaign.id, {
      max_per_day: 0,
      max_per_week: 3,
    });

    expect(result).toEqual(expect.objectContaining({
      campaign_id: campaign.id,
      eligible_user_count: 0,
      max_per_day: 0,
      max_per_week: 3,
    }));
    expect(mockReadDbQuery).toHaveBeenCalledTimes(1);
  });
});
