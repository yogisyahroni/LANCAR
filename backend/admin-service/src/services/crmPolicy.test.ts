import { applyLoyaltyEventOnce, canSendCampaign, campaignFunding, evaluateCampaignGuardrails, evaluateReferralAbuse, membershipStateAllowsBenefit, resolveMembershipPaymentTransition, resolvePromoStack, validateCampaignAudience, validateCampaignFinancialContract, validateCampaignFundingBreakdown, validateLoyaltyEntry, validatePropensityRecommendation } from './crmPolicy';

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
    expect(resolveMembershipPaymentTransition('PENDING_PAYMENT', 'SUCCEEDED')).toBe('ACTIVE');
    expect(resolveMembershipPaymentTransition('PENDING_PAYMENT', 'FAILED')).toBe('CANCELLED');
    expect(resolveMembershipPaymentTransition('ACTIVE', 'FAILED')).toBe('GRACE');
    expect(resolveMembershipPaymentTransition('GRACE', 'FAILED')).toBe('EXPIRED');
    expect(resolveMembershipPaymentTransition('ACTIVE', 'REFUNDED')).toBe('REFUNDED');
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

  it('keeps propensity as a non-sensitive recommendation signal', () => {
    expect(validatePropensityRecommendation({ score: 0.8 })).toMatchObject({ valid: true, use: 'RECOMMENDATION_ONLY', merchant_visible: false });
    expect(validatePropensityRecommendation({ score: 0.8, enforcement: true }).valid).toBe(false);
    expect(validatePropensityRecommendation({ score: 0.8, expose_to_merchant: true }).errors).toContain('propensity_cannot_be_merchant_visible');
  });

  it('pauses experiments when governed harm/economics guardrails breach', () => {
    const metrics = {
      completed_orders: 20,
      completed_revenue_minor: 2_000_000,
      contribution_margin_minor: 80_000,
      refund_rate_pct: 25,
      support_case_rate_pct: 4,
      spam_complaint_rate_pct: 1,
    };
    expect(evaluateCampaignGuardrails({ min_contribution_margin_minor: 100_000, max_refund_rate_pct: 20 }, metrics)).toMatchObject({
      status: 'BREACH', action: 'PAUSE_AND_REVIEW', breaches: ['contribution_margin_below_floor', 'refund_rate_above_cap'],
    });
    expect(evaluateCampaignGuardrails({}, { ...metrics, contribution_margin_minor: null, refund_rate_pct: 1 })).toMatchObject({ status: 'INSUFFICIENT_DATA', action: 'NO_DECISION', breaches: ['margin_data_unavailable'] });
  });
});
