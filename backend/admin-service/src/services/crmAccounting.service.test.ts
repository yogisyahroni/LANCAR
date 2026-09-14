import { reconcileCrmCampaignReservation, reconcileLoyaltyAccount, reconcileReferralRewardBudget, reserveCrmCampaignReservation, resolveReservationState, validateReservationFunding } from './crmAccounting.service';

jest.mock('../db', () => ({ db: { connect: jest.fn() } }));

const { db } = jest.requireMock('../db') as { db: { connect: jest.Mock } };

describe('CRM campaign accounting boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires every per-order funding source to reconcile to the reservation amount', () => {
    expect(validateReservationFunding({ platform: 700, merchant: 300 }, 1000)).toMatchObject({
      valid: true,
      normalized: { platform: 700, merchant: 300, total: 1000 },
    });
    expect(validateReservationFunding({ platform: 700, merchant: 200 }, 1000).errors).toContain('funding_total_must_equal_amount');
  });

  it('derives release/reversal/consumption from canonical order state', () => {
    expect(resolveReservationState('completed', 100)).toBe('CONSUMED');
    expect(resolveReservationState('cancelled', 0)).toBe('RELEASED');
    expect(resolveReservationState('refunded', 100)).toBe('REVERSED');
    expect(resolveReservationState('in_transit', 100)).toBe('RESERVED');
  });

  it('records an exception when the canonical order subsidy differs', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{
        id: 'reservation-1', campaign_id: 'campaign-1', campaign_code: 'winback', order_id: 'order-1', customer_id: 'customer-1',
        amount_minor: '1000', funding_breakdown: { platform: 700, merchant: 300 }, state: 'RESERVED', order_status: 'completed', actual_subsidy_minor: '900',
      }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValueOnce(client);

    await expect(reconcileCrmCampaignReservation('reservation-1', 'admin-1', 'settlement-1')).resolves.toMatchObject({
      expected_minor: 1000,
      actual_minor: 900,
      difference_minor: -100,
      reservation_state: 'CONSUMED',
      exception_recorded: true,
    });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO crm_reconciliation_exceptions'))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('reserves the order-service subsidy and is idempotent by campaign/order', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ state: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [{ customer_id: 'customer-1', promo_subsidy_minor: '1000' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'reservation-1' }] })
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValueOnce(client);

    await expect(reserveCrmCampaignReservation('campaign-1', 'order-1', { platform: 700, merchant: 300 }, 'crm:order-1:v1')).resolves.toMatchObject({
      reservation_id: 'reservation-1',
      customer_id: 'customer-1',
      amount_minor: 1000,
      duplicate: false,
    });
    expect(String(client.query.mock.calls[3][0])).toContain('INSERT INTO crm_campaign_reservations');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('flags loyalty drift or order/payment state that cannot justify an entry', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'account-1', points_balance: '100' }] })
      .mockResolvedValueOnce({ rows: [{ ledger_balance: '80' }] })
      .mockResolvedValueOnce({ rows: [{ invalid_order_entries: 1 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValueOnce(client);

    await expect(reconcileLoyaltyAccount('account-1', 'admin-1')).resolves.toMatchObject({
      expected_balance: 100,
      ledger_balance: 80,
      difference_minor: -20,
      invalid_order_entries: 1,
      exception_recorded: true,
    });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("VALUES ('LOYALTY_ACCOUNT'"))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('reconciles order earn/redeem/reverse rows against canonical refunds', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'account-1', points_balance: '100' }] })
      .mockResolvedValueOnce({ rows: [{ ledger_balance: '100' }] })
      .mockResolvedValueOnce({ rows: [{ invalid_order_entries: 0 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValueOnce(client);

    await expect(reconcileLoyaltyAccount('account-1', 'admin-1')).resolves.toMatchObject({
      invalid_order_entries: 0,
      exception_recorded: false,
    });
    const reconciliationSql = String(client.query.mock.calls[3][0]);
    expect(reconciliationSql).toContain('payment_refunds');
    expect(reconciliationSql).toContain("entry_type = 'REDEEM'");
    expect(reconciliationSql).toContain("entry_type = 'REVERSE'");
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('reconciles referral liability against the immutable loyalty ledger', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ expected_liability_minor: '5000', open_reward_attributions: '2' }] })
      .mockResolvedValueOnce({ rows: [{ ledger_liability_minor: '4000' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    db.connect.mockResolvedValueOnce(client);

    await expect(reconcileReferralRewardBudget('id-jk', 'admin-1')).resolves.toMatchObject({
      market_code: 'id-jk', expected_liability_minor: 5000, ledger_liability_minor: 4000,
      difference_minor: -1000, open_reward_attributions: 2, exception_recorded: true,
    });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("VALUES ('REFERRAL_REWARD_BUDGET'"))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});
