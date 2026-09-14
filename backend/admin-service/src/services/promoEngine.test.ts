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
  selectCanonicalPromoStack,
  validatePromoForCheckout,
  validatePromoStackForCheckout,
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

  it('selects one winner per stacking key in deterministic priority order', () => {
    const result = selectCanonicalPromoStack([
      {
        campaign: { ...campaign, code: 'SHIPPING-LOW', stacking_key: 'shipping', stack_priority: 10 },
        discount_idr: 4000,
        economics: { ...campaign, gross_amount_idr: 50000, contribution_margin_idr: 20000, min_margin_amount_idr: 3000, min_margin_percent: 5 },
      },
      {
        campaign: { ...campaign, code: 'SHIPPING-HIGH', stacking_key: 'shipping', stack_priority: 20 },
        discount_idr: 5000,
        economics: { gross_amount_idr: 50000, contribution_margin_idr: 19000, min_margin_amount_idr: 3000, min_margin_percent: 5 },
      },
      {
        campaign: { ...campaign, code: 'INSURANCE', stacking_key: 'insurance', stack_priority: 1 },
        discount_idr: 1000,
        economics: { gross_amount_idr: 50000, contribution_margin_idr: 24000, min_margin_amount_idr: 3000, min_margin_percent: 5 },
      },
    ]);

    expect(result.selected.map((item) => item.campaign.code)).toEqual(['SHIPPING-HIGH', 'INSURANCE']);
    expect(result.total_discount_idr).toBe(6000);
    expect(result.excluded).toEqual([{ code: 'SHIPPING-LOW', reason: 'STACKING_KEY_CONFLICT', winner: 'SHIPPING-HIGH' }]);
  });

  it('does not select a campaign whose remaining budget cannot cover the discount', () => {
    const result = selectCanonicalPromoStack([
      {
        campaign: { ...campaign, code: 'EMPTY', stacking_key: 'shipping', total_budget_idr: 5000, reserved_budget_idr: 5000 },
        discount_idr: 5000,
        economics: { gross_amount_idr: 50000, contribution_margin_idr: 20000, min_margin_amount_idr: 3000, min_margin_percent: 5 },
      },
      {
        campaign: { ...campaign, code: 'AVAILABLE', stacking_key: 'insurance', total_budget_idr: 10000, reserved_budget_idr: 0 },
        discount_idr: 1000,
        economics: { gross_amount_idr: 50000, contribution_margin_idr: 24000, min_margin_amount_idr: 3000, min_margin_percent: 5 },
      },
    ]);

    expect(result.selected.map((item) => item.campaign.code)).toEqual(['AVAILABLE']);
    expect(result.excluded).toEqual([{ code: 'EMPTY', reason: 'BUDGET_UNAVAILABLE' }]);
  });

  it('validates a multi-campaign checkout stack before any reservation', async () => {
    const secondCampaign = {
      ...campaign,
      id: '33333333-3333-4333-8333-333333333333',
      code: 'INSURE5000',
      discount_value_idr: 2000,
      stacking_key: 'insurance',
      component_scope: 'insurance',
    };
    mockReadDbQuery
      .mockResolvedValueOnce({ rows: [{ ...campaign, stack_priority: 20 }] })
      .mockResolvedValueOnce({ rows: [{ ...servicePolicy }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [secondCampaign] })
      .mockResolvedValueOnce({ rows: [{ ...servicePolicy }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await validatePromoStackForCheckout(
      '22222222-2222-4222-8222-222222222222',
      { ...validationInput, promo_codes: ['HEMAT10', 'INSURE5000'] },
      'quote',
    );

    expect(result).toEqual(expect.objectContaining({
      eligible: true,
      discount_idr: 7000,
      promotions: expect.arrayContaining([
        expect.objectContaining({ campaign: expect.objectContaining({ code: 'HEMAT10' }), discount_idr: 5000 }),
        expect.objectContaining({ campaign: expect.objectContaining({ code: 'INSURE5000' }), discount_idr: 2000 }),
      ]),
    }));
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
