export type LoyaltyEntryType = 'EARN' | 'REDEEM' | 'EXPIRE' | 'REVERSE' | 'ADJUSTMENT';
export type PromoSource = 'platform' | 'merchant' | 'membership' | 'loyalty' | 'referral';

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

export const campaignFunding = (input: { platform: number; merchant: number; membership: number; referral: number }) => {
  const values = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Math.max(0, Math.trunc(value))]));
  return { ...values, total: Object.values(values).reduce((sum, value) => sum + value, 0) };
};

export const membershipStateAllowsBenefit = (state: 'PENDING_PAYMENT' | 'ACTIVE' | 'GRACE' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED', periodEnd: Date, now = new Date()) =>
  (state === 'ACTIVE' || state === 'GRACE') && periodEnd.getTime() > now.getTime();
