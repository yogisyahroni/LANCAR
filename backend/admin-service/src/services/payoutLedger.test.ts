import { calculatePayoutBalance, canCreatePayoutRequest } from './payoutLedger';

describe('payout ledger calculation', () => {
  it('calculates available, pending, and total balances without exposing disputed credits', () => {
    const balance = calculatePayoutBalance([
      { direction: 'credit', amountIdr: 80000, settlementStatus: 'available', source: 'delivery' },
      { direction: 'credit', amountIdr: 30000, settlementStatus: 'pending', source: 'incentive' },
      { direction: 'credit', amountIdr: 20000, settlementStatus: 'available', hasOpenDispute: true },
      { direction: 'debit', amountIdr: 25000, settlementStatus: 'requested' },
      { direction: 'debit', amountIdr: 10000, settlementStatus: 'paid' },
    ]);

    expect(balance).toEqual({
      totalBalanceIdr: 95000,
      availableBalanceIdr: 45000,
      pendingBalanceIdr: 55000,
      heldBalanceIdr: 0,
      withdrawnBalanceIdr: 10000,
      orderEarningsIdr: 80000,
      incentiveEarningsIdr: 30000,
      adjustmentIdr: 0,
      taxIdr: 0,
      feeIdr: 0,
    });
  });

  it('keeps promotional credits held and separates statement categories', () => {
    const balance = calculatePayoutBalance([
      { direction: 'credit', amountIdr: 40000, settlementStatus: 'available', source: 'incentive', withdrawable: false },
      { direction: 'credit', amountIdr: 12000, settlementStatus: 'available', statementCategory: 'tax' },
      { direction: 'debit', amountIdr: 2500, settlementStatus: 'paid', statementCategory: 'fee' },
    ]);

    expect(balance).toEqual(expect.objectContaining({
      availableBalanceIdr: 9500,
      heldBalanceIdr: 40000,
      withdrawnBalanceIdr: 2500,
      incentiveEarningsIdr: 40000,
      taxIdr: 12000,
      feeIdr: -2500,
    }));
  });

  it('blocks payout when account is unverified, amount is below policy, or available balance is insufficient', () => {
    const balance = calculatePayoutBalance([
      { direction: 'credit', amountIdr: 60000, settlementStatus: 'available' },
    ]);

    expect(canCreatePayoutRequest(balance, 50000, 25000, true)).toBe(true);
    expect(canCreatePayoutRequest(balance, 50000, 25000, false)).toBe(false);
    expect(canCreatePayoutRequest(balance, 10000, 25000, true)).toBe(false);
    expect(canCreatePayoutRequest(balance, 70000, 25000, true)).toBe(false);
  });
});
