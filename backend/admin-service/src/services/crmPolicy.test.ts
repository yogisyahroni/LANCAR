import { applyLoyaltyEventOnce, canSendCampaign, campaignFunding, evaluateReferralAbuse, membershipStateAllowsBenefit, resolvePromoStack, validateCampaignAudience, validateCampaignFinancialContract, validateCampaignFundingBreakdown, validateLoyaltyEntry } from './crmPolicy';

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

  it('routes referral abuse signals to review before reward release', () => {
    expect(evaluateReferralAbuse({ sharedDeviceUsers: 1, sharedPaymentUsers: 1 })).toEqual({
      status: 'REVIEW',
      reasons: ['shared_device', 'shared_payment_instrument'],
      reward_releasable: false,
    });
    expect(evaluateReferralAbuse({})).toMatchObject({ status: 'PENDING', reward_releasable: true });
  });

  it('governs CRM audience and funding before campaign publication', () => {
    expect(validateCampaignAudience({ email: 'private@example.test' }).valid).toBe(false);
    expect(validateCampaignAudience({ lifecycle_stage: 'at_risk', consent_required: true }).valid).toBe(true);
    expect(validateCampaignFundingBreakdown({}, 1000)).toMatchObject({ valid: true, normalized: { platform: 1000, total: 1000 } });
    expect(validateCampaignFundingBreakdown({ platform: 500, merchant: 100 }, 1000).valid).toBe(false);
    const funding = validateCampaignFundingBreakdown({ platform: 1000 }, 1000).normalized;
    expect(validateCampaignFinancialContract({ budget_version: 'budget-v1' }, 1000, funding)).toMatchObject({ valid: true, normalized: { promo_subsidy_minor: 1000, ads_spend_minor: 0 } });
    expect(validateCampaignFinancialContract({}, 1000, funding).valid).toBe(false);
  });
});
