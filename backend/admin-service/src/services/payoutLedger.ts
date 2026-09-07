export type LedgerDirection = 'credit' | 'debit';

export type LedgerSettlementStatus =
  | 'pending'
  | 'available'
  | 'requested'
  | 'processing'
  | 'paid'
  | 'failed';

export type LedgerStatementCategory = 'order' | 'incentive' | 'adjustment' | 'tax' | 'fee' | 'payout' | 'other';

export type PayoutLedgerEntry = {
  direction: LedgerDirection;
  amountIdr: number;
  settlementStatus: LedgerSettlementStatus | string;
  hasOpenDispute?: boolean;
  withdrawable?: boolean;
  statementCategory?: LedgerStatementCategory | string;
  source?: string;
};

export type PayoutBalance = {
  totalBalanceIdr: number;
  availableBalanceIdr: number;
  pendingBalanceIdr: number;
  heldBalanceIdr: number;
  withdrawnBalanceIdr: number;
  orderEarningsIdr: number;
  incentiveEarningsIdr: number;
  adjustmentIdr: number;
  taxIdr: number;
  feeIdr: number;
};

const signedAmount = (entry: PayoutLedgerEntry, amount: number) =>
  entry.direction === 'credit' ? amount : -amount;

const statementCategory = (entry: PayoutLedgerEntry): LedgerStatementCategory => {
  if (entry.statementCategory) return entry.statementCategory as LedgerStatementCategory;
  if (entry.source === 'delivery') return 'order';
  if (entry.source === 'incentive') return 'incentive';
  if (entry.source === 'adjustment' || entry.source === 'reversal') return 'adjustment';
  if (entry.source === 'payout') return 'payout';
  return 'other';
};

export const calculatePayoutBalance = (entries: PayoutLedgerEntry[]): PayoutBalance => {
  return entries.reduce<PayoutBalance>(
    (acc, entry) => {
      const amount = Number.isFinite(entry.amountIdr) ? Math.trunc(entry.amountIdr) : 0;
      const signed = signedAmount(entry, amount);
      const category = statementCategory(entry);
      acc.totalBalanceIdr += signed;

      if (category === 'order') acc.orderEarningsIdr += signed;
      if (category === 'incentive') acc.incentiveEarningsIdr += signed;
      if (category === 'adjustment') acc.adjustmentIdr += signed;
      if (category === 'tax') acc.taxIdr += signed;
      if (category === 'fee') acc.feeIdr += signed;

      const isWithdrawable = entry.withdrawable !== false;
      if (entry.direction === 'credit' && entry.settlementStatus === 'available' && isWithdrawable && !entry.hasOpenDispute) {
        acc.availableBalanceIdr += amount;
      }

      if (entry.direction === 'debit' && ['requested', 'processing', 'paid'].includes(entry.settlementStatus)) {
        acc.availableBalanceIdr -= amount;
      }

      if (entry.direction === 'credit' && entry.settlementStatus === 'pending' && isWithdrawable) {
        acc.pendingBalanceIdr += amount;
      }

      if (entry.direction === 'debit' && ['requested', 'processing'].includes(entry.settlementStatus)) {
        acc.pendingBalanceIdr += amount;
      }

      if (entry.direction === 'credit' && entry.settlementStatus !== 'cancelled'
        && (entry.settlementStatus === 'held' || !isWithdrawable)) {
        acc.heldBalanceIdr += amount;
      }

      if (entry.direction === 'debit' && entry.settlementStatus === 'paid') {
        acc.withdrawnBalanceIdr += amount;
      }

      return acc;
    },
    {
      totalBalanceIdr: 0,
      availableBalanceIdr: 0,
      pendingBalanceIdr: 0,
      heldBalanceIdr: 0,
      withdrawnBalanceIdr: 0,
      orderEarningsIdr: 0,
      incentiveEarningsIdr: 0,
      adjustmentIdr: 0,
      taxIdr: 0,
      feeIdr: 0,
    },
  );
};

export const canCreatePayoutRequest = (
  balance: PayoutBalance,
  amountIdr: number,
  minAmountIdr: number,
  hasVerifiedAccount: boolean,
) => {
  if (!hasVerifiedAccount) return false;
  if (amountIdr < minAmountIdr) return false;
  return balance.availableBalanceIdr >= amountIdr;
};
