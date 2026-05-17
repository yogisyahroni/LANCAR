export type LedgerDirection = 'credit' | 'debit';

export type LedgerSettlementStatus =
  | 'pending'
  | 'available'
  | 'requested'
  | 'processing'
  | 'paid'
  | 'failed';

export type PayoutLedgerEntry = {
  direction: LedgerDirection;
  amountIdr: number;
  settlementStatus: LedgerSettlementStatus | string;
  hasOpenDispute?: boolean;
};

export type PayoutBalance = {
  totalBalanceIdr: number;
  availableBalanceIdr: number;
  pendingBalanceIdr: number;
};

export const calculatePayoutBalance = (entries: PayoutLedgerEntry[]): PayoutBalance => {
  return entries.reduce<PayoutBalance>(
    (acc, entry) => {
      const amount = Number.isFinite(entry.amountIdr) ? Math.trunc(entry.amountIdr) : 0;
      const signed = entry.direction === 'credit' ? amount : -amount;
      acc.totalBalanceIdr += signed;

      if (entry.direction === 'credit' && entry.settlementStatus === 'available' && !entry.hasOpenDispute) {
        acc.availableBalanceIdr += amount;
      }

      if (entry.direction === 'debit' && ['requested', 'processing', 'paid'].includes(entry.settlementStatus)) {
        acc.availableBalanceIdr -= amount;
      }

      if (entry.direction === 'credit' && entry.settlementStatus === 'pending') {
        acc.pendingBalanceIdr += amount;
      }

      if (entry.direction === 'debit' && ['requested', 'processing'].includes(entry.settlementStatus)) {
        acc.pendingBalanceIdr += amount;
      }

      return acc;
    },
    { totalBalanceIdr: 0, availableBalanceIdr: 0, pendingBalanceIdr: 0 },
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
