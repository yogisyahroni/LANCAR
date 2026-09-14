export type LoyaltyEntryType = 'EARN' | 'REDEEM' | 'EXPIRE' | 'REVERSE' | 'ADJUSTMENT';
export type PromoSource = 'platform' | 'merchant' | 'membership' | 'loyalty' | 'referral';

export type ReferralAbuseSignals = {
  selfReferral?: boolean;
  sharedDeviceUsers?: number;
  sharedPaymentUsers?: number;
  sharedAddressUsers?: number;
  priorRejectedAttribution?: boolean;
};

export const evaluateReferralAbuse = (signals: ReferralAbuseSignals) => {
  const reasons: string[] = [];
  if (signals.selfReferral) reasons.push('self_referral');
  if (Number(signals.sharedDeviceUsers || 0) > 0) reasons.push('shared_device');
  if (Number(signals.sharedPaymentUsers || 0) > 0) reasons.push('shared_payment_instrument');
  if (Number(signals.sharedAddressUsers || 0) > 0) reasons.push('shared_address');
  if (signals.priorRejectedAttribution) reasons.push('prior_rejected_attribution');
  return {
    status: reasons.length ? 'REVIEW' : 'PENDING',
    reasons,
    reward_releasable: reasons.length === 0,
  } as const;
};

const CAMPAIGN_AUDIENCE_FIELDS = new Set([
  'market_code',
  'service_codes',
  'lifecycle_stage',
  'order_count_band',
  'last_order_days_band',
  'locale',
  'platform',
  'consent_required',
  'personalization_allowed',
]);

const SENSITIVE_AUDIENCE_MARKERS = [
  'gender', 'race', 'religion', 'health', 'medical', 'income', 'ethnicity',
  'precise_location', 'address', 'nik', 'phone', 'email', 'device', 'payment',
  'disability', 'sexual', 'political', 'biometric',
];

export type CampaignAudienceValidation = {
  valid: boolean;
  errors: string[];
  normalized: Record<string, unknown>;
};

/**
 * CRM campaigns may target only documented, non-sensitive segments. Customer
 * identifiers and raw device/payment/contact attributes are deliberately not
 * accepted here; delivery resolves eligible users from server-side data.
 */
export const validateCampaignAudience = (value: unknown): CampaignAudienceValidation => {
  const audience = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const errors: string[] = [];
  for (const key of Object.keys(audience)) {
    const normalizedKey = key.trim().toLowerCase();
    if (!CAMPAIGN_AUDIENCE_FIELDS.has(normalizedKey)) {
      errors.push(`unsupported_audience_field:${normalizedKey}`);
      continue;
    }
    if (SENSITIVE_AUDIENCE_MARKERS.some((marker) => normalizedKey.includes(marker))) {
      errors.push(`sensitive_audience_field:${normalizedKey}`);
    }
  }
  if (audience.consent_required !== undefined && audience.consent_required !== true) {
    errors.push('marketing_consent_required');
  }
  if (audience.personalization_allowed === true && audience.consent_required !== true) {
    errors.push('personalization_requires_consent');
  }
  if (audience.service_codes !== undefined && (!Array.isArray(audience.service_codes) || audience.service_codes.some((code) => typeof code !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(code)))) {
    errors.push('service_codes_invalid');
  }
  if (audience.lifecycle_stage !== undefined && !['new', 'active', 'at_risk'].includes(String(audience.lifecycle_stage).toLowerCase())) {
    errors.push('lifecycle_stage_invalid');
  }
  if (audience.order_count_band !== undefined && !['zero', 'one_to_three', 'four_plus'].includes(String(audience.order_count_band).toLowerCase())) {
    errors.push('order_count_band_invalid');
  }
  if (audience.last_order_days_band !== undefined && !['zero_to_thirty', 'thirty_one_to_ninety', 'ninety_plus'].includes(String(audience.last_order_days_band).toLowerCase())) {
    errors.push('last_order_days_band_invalid');
  }
  return {
    valid: errors.length === 0,
    errors,
    normalized: { ...audience, consent_required: true },
  };
};

export type CampaignFundingBreakdown = {
  platform: number;
  merchant: number;
  membership: number;
  referral: number;
  total: number;
};

/** Funding is an auditable budget split, never an opaque client-side label. */
export const validateCampaignFundingBreakdown = (value: unknown, budgetMinor: number): { valid: boolean; errors: string[]; normalized: CampaignFundingBreakdown } => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const errors: string[] = [];
  const read = (key: string) => {
    const numeric = Number(source[key] ?? (key === 'platform' ? budgetMinor : 0));
    if (!Number.isSafeInteger(numeric) || numeric < 0) errors.push(`funding_${key}_invalid`);
    return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
  };
  const normalized = { platform: read('platform'), merchant: read('merchant'), membership: read('membership'), referral: read('referral') };
  const total = normalized.platform + normalized.merchant + normalized.membership + normalized.referral;
  if (total !== budgetMinor) errors.push('funding_total_must_equal_budget');
  return { valid: errors.length === 0, errors, normalized: { ...normalized, total } };
};

export type CampaignFinancialContract = {
  valid: boolean;
  errors: string[];
  normalized: {
    budget_version: string;
    merchant_agreement_version?: string;
    promo_subsidy_minor: number;
    ads_spend_minor: number;
    guardrail_policy: Record<string, unknown>;
  };
};

/** Budget lineage and promo-vs-Ads separation are required before publication. */
export const validateCampaignFinancialContract = (value: unknown, budgetMinor: number, funding: CampaignFundingBreakdown): CampaignFinancialContract => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const errors: string[] = [];
  const budgetVersion = String(source.budget_version || '').trim().slice(0, 64);
  const merchantAgreementVersion = String(source.merchant_agreement_version || '').trim().slice(0, 64);
  const promoSubsidy = Number(source.promo_subsidy_minor ?? budgetMinor);
  const adsSpend = Number(source.ads_spend_minor ?? 0);
  const guardrailPolicy = source.guardrail_policy && typeof source.guardrail_policy === 'object' && !Array.isArray(source.guardrail_policy)
    ? source.guardrail_policy as Record<string, unknown>
    : {};
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$/.test(budgetVersion)) errors.push('budget_version_required');
  if (funding.merchant > 0 && !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$/.test(merchantAgreementVersion)) errors.push('merchant_agreement_version_required');
  if (!Number.isSafeInteger(promoSubsidy) || promoSubsidy < 0 || promoSubsidy !== budgetMinor) errors.push('promo_subsidy_must_equal_campaign_budget');
  if (!Number.isSafeInteger(adsSpend) || adsSpend < 0) errors.push('ads_spend_invalid');
  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      budget_version: budgetVersion,
      ...(merchantAgreementVersion ? { merchant_agreement_version: merchantAgreementVersion } : {}),
      promo_subsidy_minor: Number.isSafeInteger(promoSubsidy) && promoSubsidy >= 0 ? promoSubsidy : 0,
      ads_spend_minor: Number.isSafeInteger(adsSpend) && adsSpend >= 0 ? adsSpend : 0,
      guardrail_policy: guardrailPolicy,
    },
  };
};

export type CampaignFrequencyCapValidation = {
  valid: boolean;
  errors: string[];
  normalized: Record<string, unknown>;
};

/** Every campaign must carry a server-enforced per-user cap and time window. */
export const validateCampaignFrequencyCap = (value: unknown): CampaignFrequencyCapValidation => {
  const cap = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const errors: string[] = [];
  const perUser = Number(cap.per_user ?? 1);
  const windowDays = Number(cap.window_days ?? 7);
  if (!Number.isSafeInteger(perUser) || perUser < 1 || perUser > 20) errors.push('per_user_cap_invalid');
  if (!Number.isSafeInteger(windowDays) || windowDays < 1 || windowDays > 90) errors.push('window_days_invalid');
  return {
    valid: errors.length === 0,
    errors,
    normalized: { ...cap, per_user: perUser, window_days: windowDays },
  };
};

export type LoyaltyEntry = { type: LoyaltyEntryType; points: number; idempotencyKey: string; liabilityMinor?: number; sourceId: string };

export const validateLoyaltyEntry = (entry: LoyaltyEntry): string[] => {
  const errors: string[] = [];
  if (!Number.isInteger(entry.points) || entry.points === 0) errors.push('points_must_be_non_zero_integer');
  if (!entry.idempotencyKey.trim()) errors.push('idempotency_required');
  if (entry.liabilityMinor !== undefined && (!Number.isInteger(entry.liabilityMinor) || entry.liabilityMinor < 0)) errors.push('liability_invalid');
  return errors;
};

export const applyLoyaltyEventOnce = (ledger: LoyaltyEntry[], entry: LoyaltyEntry): LoyaltyEntry[] =>
  ledger.some((existing) => existing.idempotencyKey === entry.idempotencyKey) ? ledger : [...ledger, entry];

const PROMO_PRIORITY: PromoSource[] = ['membership', 'platform', 'merchant', 'loyalty', 'referral'];

export const resolvePromoStack = (requested: PromoSource[], eligible: Set<PromoSource>): PromoSource[] =>
  PROMO_PRIORITY.filter((source) => requested.includes(source) && eligible.has(source));

export const canSendCampaign = (input: { optedIn: boolean; frequencyCount: number; frequencyCap: number; holdout: boolean }): boolean =>
  input.optedIn && !input.holdout && input.frequencyCount < Math.max(0, input.frequencyCap);

export type PropensityRecommendation = {
  valid: boolean;
  use: 'RECOMMENDATION_ONLY';
  merchant_visible: false;
  errors: string[];
};

/**
 * A propensity value may help select a customer communication, but it is not
 * an eligibility, pricing, risk, or merchant-facing decision. Keep this
 * contract pure so every future scorer has to pass the same privacy boundary.
 */
export const validatePropensityRecommendation = (value: unknown): PropensityRecommendation => {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const errors: string[] = [];
  if (source.enforcement === true || source.enforce === true) errors.push('propensity_cannot_enforce');
  if (source.merchant_visible === true || source.expose_to_merchant === true) errors.push('propensity_cannot_be_merchant_visible');
  const forbidden = ['gender', 'race', 'religion', 'health', 'income', 'address', 'phone', 'email', 'national_id', 'precise_location'];
  for (const key of Object.keys(source)) {
    if (forbidden.some((marker) => key.toLowerCase().includes(marker))) errors.push(`propensity_sensitive_field:${key.toLowerCase()}`);
  }
  return { valid: errors.length === 0, use: 'RECOMMENDATION_ONLY', merchant_visible: false, errors };
};

export type CampaignGuardrailMetrics = {
  completed_orders: number;
  completed_revenue_minor: number;
  contribution_margin_minor: number | null;
  refund_rate_pct: number | null;
  support_case_rate_pct: number | null;
  spam_complaint_rate_pct: number | null;
};

export type CampaignGuardrailEvaluation = {
  status: 'PASS' | 'BREACH' | 'INSUFFICIENT_DATA';
  action: 'CONTINUE' | 'PAUSE_AND_REVIEW' | 'NO_DECISION';
  breaches: string[];
  metrics: CampaignGuardrailMetrics;
  policy_version: string;
};

/**
 * Campaign experiments must stop when customer harm or subsidy economics
 * cross the configured bound. Missing margin data is explicit: it cannot be
 * treated as a passing zero or silently bypassed.
 */
export const evaluateCampaignGuardrails = (policyValue: unknown, metrics: CampaignGuardrailMetrics): CampaignGuardrailEvaluation => {
  const policy = policyValue && typeof policyValue === 'object' && !Array.isArray(policyValue)
    ? policyValue as Record<string, unknown>
    : {};
  const policyVersion = String(policy.policy_version || 'crm-guardrails-2026-v1').slice(0, 96);
  const minMargin = Number(policy.min_contribution_margin_minor ?? 0);
  const maxRefund = Number(policy.max_refund_rate_pct ?? 20);
  const maxSupport = Number(policy.max_support_case_rate_pct ?? 15);
  const maxSpam = Number(policy.max_spam_complaint_rate_pct ?? 5);
  const breaches: string[] = [];
  if (metrics.contribution_margin_minor == null) breaches.push('margin_data_unavailable');
  else if (Number.isFinite(minMargin) && metrics.contribution_margin_minor < minMargin) breaches.push('contribution_margin_below_floor');
  if (metrics.refund_rate_pct != null && Number.isFinite(maxRefund) && metrics.refund_rate_pct > maxRefund) breaches.push('refund_rate_above_cap');
  if (metrics.support_case_rate_pct != null && Number.isFinite(maxSupport) && metrics.support_case_rate_pct > maxSupport) breaches.push('support_case_rate_above_cap');
  if (metrics.spam_complaint_rate_pct != null && Number.isFinite(maxSpam) && metrics.spam_complaint_rate_pct > maxSpam) breaches.push('spam_complaint_rate_above_cap');
  const insufficient = metrics.completed_orders === 0 || breaches.includes('margin_data_unavailable');
  return {
    status: insufficient ? 'INSUFFICIENT_DATA' : breaches.length ? 'BREACH' : 'PASS',
    action: insufficient ? 'NO_DECISION' : breaches.length ? 'PAUSE_AND_REVIEW' : 'CONTINUE',
    breaches,
    metrics,
    policy_version: policyVersion,
  };
};

export const campaignFunding = (input: { platform: number; merchant: number; membership: number; referral: number }) => {
  const values = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Math.max(0, Math.trunc(value))]));
  return { ...values, total: Object.values(values).reduce((sum, value) => sum + value, 0) };
};

export const membershipStateAllowsBenefit = (state: 'PENDING_PAYMENT' | 'ACTIVE' | 'GRACE' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED', periodEnd: Date, now = new Date()) =>
  (state === 'ACTIVE' || state === 'GRACE') && periodEnd.getTime() > now.getTime();

export type MembershipPaymentState = 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
export type MembershipState = 'PENDING_PAYMENT' | 'ACTIVE' | 'GRACE' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';

/** Payment events are the only input allowed to move an entitlement state. */
export const resolveMembershipPaymentTransition = (current: MembershipState, payment: MembershipPaymentState): MembershipState => {
  if (payment === 'REFUNDED') return 'REFUNDED';
  if (payment === 'CANCELLED') return 'CANCELLED';
  if (payment === 'SUCCEEDED') return ['PENDING_PAYMENT', 'ACTIVE', 'GRACE'].includes(current) ? 'ACTIVE' : current;
  if (payment === 'FAILED') {
    if (current === 'PENDING_PAYMENT') return 'CANCELLED';
    if (current === 'ACTIVE') return 'GRACE';
    return current === 'GRACE' ? 'EXPIRED' : current;
  }
  return current;
};
