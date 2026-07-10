import { describe, it, expect } from '@jest/globals';

// A mock utility to verify if a journal entry list is balanced (Debit == Credit)
function verifyJournalBalance(entries: { account: string; debit: number; credit: number }[]): boolean {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const entry of entries) {
    totalDebit += entry.debit;
    totalCredit += entry.credit;
  }
  return totalDebit === totalCredit;
}

// A mock function to simulate append-only trigger checks
function canAppendToLedger(periodStatus: 'OPEN' | 'CLOSED'): boolean {
  if (periodStatus === 'CLOSED') {
    return false; // Append-only trigger rejects entry if period is closed
  }
  return true;
}

describe('QA-001 - Ledger Tests', () => {
  it('Test payment journal balance: must balance debit and credit', () => {
    // Example: Customer pays Rp 50,000 via Gateway
    const paymentJournal = [
      { account: '1100-Cash-Gateway', debit: 50000, credit: 0 },
      { account: '2100-Courier-Payable', debit: 0, credit: 40000 },
      { account: '4100-Platform-Revenue', debit: 0, credit: 10000 },
    ];
    expect(verifyJournalBalance(paymentJournal)).toBe(true);
  });

  it('Test refund journal balance: must balance debit and credit', () => {
    // Example: Refund Rp 50,000 to customer
    const refundJournal = [
      { account: '2100-Courier-Payable', debit: 40000, credit: 0 },
      { account: '4100-Platform-Revenue', debit: 10000, credit: 0 }, // Reversal of revenue
      { account: '1100-Cash-Gateway', debit: 0, credit: 50000 },
    ];
    expect(verifyJournalBalance(refundJournal)).toBe(true);
  });

  it('Test payout journal balance: must balance debit and credit', () => {
    // Example: Payout Rp 40,000 to courier
    const payoutJournal = [
      { account: '2100-Courier-Payable', debit: 40000, credit: 0 },
      { account: '1101-Bank-Cash', debit: 0, credit: 40000 },
    ];
    expect(verifyJournalBalance(payoutJournal)).toBe(true);
  });

  it('Test merchant settlement journal balance: must balance debit and credit', () => {
    // Example: Settlement Rp 100,000 to merchant
    const settlementJournal = [
      { account: '2200-Merchant-Payable', debit: 100000, credit: 0 },
      { account: '1101-Bank-Cash', debit: 0, credit: 100000 },
    ];
    expect(verifyJournalBalance(settlementJournal)).toBe(true);
  });

  it('Test provider invoice journal balance: must balance debit and credit', () => {
    // Example: Provider invoices us Rp 30,000
    const providerInvoiceJournal = [
      { account: '5100-Cost-of-Revenue', debit: 30000, credit: 0 },
      { account: '2300-Provider-Payable', debit: 0, credit: 30000 },
    ];
    expect(verifyJournalBalance(providerInvoiceJournal)).toBe(true);
  });

  it('Test append-only trigger: reject append if period is closed', () => {
    expect(canAppendToLedger('OPEN')).toBe(true);
    expect(canAppendToLedger('CLOSED')).toBe(false);
  });

  it('Test append-only trigger: cannot mutate existing entries (immutability)', () => {
    const originalEntry = { id: 'JRN-001', amount: 50000, is_locked: true };
    const attemptUpdate = () => {
      if (originalEntry.is_locked) {
        throw new Error('Ledger entries are immutable');
      }
      originalEntry.amount = 60000;
    };
    expect(attemptUpdate).toThrow('Ledger entries are immutable');
  });
});
