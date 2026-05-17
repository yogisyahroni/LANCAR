import { calculatePayoutBalance, canCreatePayoutRequest } from './payoutLedger';

describe('payout ledger calculation', () => {
  it('calculates available, pending, and total balances without exposing disputed credits', () => {
    const balance = calculatePayoutBalance([
      { direction: 'credit', amountIdr: 80000, settlementStatus: 'available' },
      { direction: 'credit', amountIdr: 30000, settlementStatus: 'pending' },
      { direction: 'credit', amountIdr: 20000, settlementStatus: 'available', hasOpenDispute: true },
      { direction: 'debit', amountIdr: 25000, settlementStatus: 'requested' },
      { direction: 'debit', amountIdr: 10000, settlementStatus: 'paid' },
    ]);

    expect(balance).toEqual({
      totalBalanceIdr: 95000,
      availableBalanceIdr: 45000,
      pendingBalanceIdr: 55000,
    });
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
