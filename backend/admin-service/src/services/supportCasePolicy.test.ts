import {
  canViewRestrictedSupportData,
  getSupportCasePolicy,
  isRestrictedSupportReference,
} from './supportCasePolicy';

describe('support case policy', () => {
  const base = {
    serviceCode: 'food_delivery',
    marketCode: 'id-jk',
    category: 'food_refund',
    caseStatus: 'investigating' as const,
    orderStatus: 'preparing',
    paymentStatus: 'paid',
  };

  it('allows financial actions only for an eligible service, market and paid state', () => {
    const eligible = getSupportCasePolicy({ ...base, actorRole: 'finance_admin' });
    expect(eligible.allowedActions).toEqual(expect.arrayContaining(['refund', 'compensate']));
    expect(eligible.financialActionsRequireTotp).toBe(true);

    const unpaid = getSupportCasePolicy({ ...base, paymentStatus: 'pending', actorRole: 'finance_admin' });
    expect(unpaid.financialActions).toEqual([]);

    const wrongMarket = getSupportCasePolicy({ ...base, marketCode: 'xx-blocked', actorRole: 'finance_admin' });
    expect(wrongMarket.financialActions).toEqual([]);
  });

  it('does not give non-staff actors case actions and only permits reopen after resolution', () => {
    expect(getSupportCasePolicy({ ...base, actorRole: 'customer' }).allowedActions).toEqual([]);
    expect(getSupportCasePolicy({ ...base, caseStatus: 'resolved', actorRole: 'ops_admin' }).allowedActions).toEqual(['reopen']);
  });

  it('keeps sensitive proof/payment references behind a role boundary', () => {
    expect(isRestrictedSupportReference('payment')).toBe(true);
    expect(isRestrictedSupportReference('proof')).toBe(true);
    expect(canViewRestrictedSupportData('cs_agent')).toBe(false);
    expect(canViewRestrictedSupportData('finance_admin')).toBe(true);
  });
});
