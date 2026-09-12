import { applyLoyaltyEventOnce, canSendCampaign, campaignFunding, membershipStateAllowsBenefit, resolvePromoStack, validateLoyaltyEntry } from './crmPolicy';

describe('CRM and loyalty policy', () => {
  it('keeps loyalty ledger idempotent and separate from cash', () => {
    const entry = { type: 'EARN' as const, points: 100, idempotencyKey: 'order:o1:earn', sourceId: 'o1', liabilityMinor: 1000 };
    expect(validateLoyaltyEntry(entry)).toEqual([]);
    expect(applyLoyaltyEventOnce([entry], entry)).toHaveLength(1);
  });

  it('resolves promo priority and funding explicitly', () => {
    expect(resolvePromoStack(['referral', 'platform', 'merchant'], new Set(['platform', 'merchant', 'referral']))).toEqual(['platform', 'merchant', 'referral']);
    expect(campaignFunding({ platform: 100, merchant: 50, membership: -10, referral: 0 })).toMatchObject({ platform: 100, merchant: 50, membership: 0, total: 150 });
  });

  it('respects opt-out, cap, holdout and valid membership period', () => {
    expect(canSendCampaign({ optedIn: false, frequencyCount: 0, frequencyCap: 3, holdout: false })).toBe(false);
    expect(canSendCampaign({ optedIn: true, frequencyCount: 3, frequencyCap: 3, holdout: false })).toBe(false);
    expect(membershipStateAllowsBenefit('ACTIVE', new Date('2026-09-13T00:00:00Z'), new Date('2026-09-12T00:00:00Z'))).toBe(true);
    expect(membershipStateAllowsBenefit('PENDING_PAYMENT', new Date('2026-09-13T00:00:00Z'), new Date('2026-09-12T00:00:00Z'))).toBe(false);
  });
});
