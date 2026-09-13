export type ReputationReviewState = 'PUBLISHED' | 'REPORTED' | 'IN_REVIEW' | 'HIDDEN';
export type ReputationDimension = 'service' | 'delivery' | 'merchant' | 'courier' | 'communication';
export const REPUTATION_REPORT_CATEGORIES = ['HARASSMENT', 'SPAM', 'PII', 'FRAUD', 'SAFETY', 'OTHER'] as const;

/** First governed release keeps submitted ratings immutable and routes corrections through appeal. */
export const RATING_EDIT_POLICY = Object.freeze({
  version: 'rating-edit-2026-09-12-v1',
  editWindowHours: 0,
  editableFields: [] as const,
  immutableAfterSubmit: true,
  rationale: 'Submitted ratings are immutable; corrections use a moderated appeal.',
});

export const ratingEditDecision = (submittedAt: Date, now = new Date()) => ({
  allowed: RATING_EDIT_POLICY.editWindowHours > 0
    && now.getTime() - submittedAt.getTime() <= RATING_EDIT_POLICY.editWindowHours * 60 * 60 * 1000,
  policyVersion: RATING_EDIT_POLICY.version,
  immutableAfterSubmit: RATING_EDIT_POLICY.immutableAfterSubmit,
});

export type ReviewInput = {
  reviewerId: string;
  subjectId: string;
  orderId: string;
  serviceCode: string;
  state: 'completed' | 'delivered' | 'pod_completed';
  stars: number;
  dimensions: Partial<Record<ReputationDimension, number>>;
};

export const validateReview = (input: ReviewInput, existingKeys: Set<string>): string[] => {
  const errors: string[] = [];
  if (!['completed', 'delivered', 'pod_completed'].includes(input.state)) errors.push('order_not_completed');
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) errors.push('invalid_stars');
  if (input.reviewerId === input.subjectId) errors.push('self_review');
  if (existingKeys.has(`${input.reviewerId}:${input.subjectId}:${input.orderId}:${input.serviceCode}`)) errors.push('duplicate_review');
  for (const value of Object.values(input.dimensions)) if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 5)) errors.push('invalid_dimension');
  return errors;
};

export const moderateReview = (body: string | null | undefined): { state: ReputationReviewState; reasons: string[] } => {
  const value = (body || '').toLowerCase();
  const reasons = [
    value.includes('http://') || value.includes('https://') ? 'spam_link' : null,
    /\b(?:phone|wa|whatsapp)\b/.test(value) ? 'contact_exchange' : null,
    /\b(?:bodoh|ancam|bunuh)\b/.test(value) ? 'harassment_or_threat' : null,
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value) ? 'pii_email' : null,
    /\b(?:\+?\d[\d\s-]{7,}\d)\b/.test(value) ? 'pii_phone' : null,
    /\b(?:kalau|jika|bila)\b[^.?!]{0,80}\b(?:rating|bintang)\b[^.?!]{0,80}\b(?:bayar|uang|kompensasi|refund)\b/.test(value)
      || /\b(?:rating|bintang)\b[^.?!]{0,80}\b(?:bayar|uang|kompensasi|refund)\b/.test(value)
      ? 'rating_threat_for_compensation' : null,
    /\b(?:kompensasi|ganti rugi|refund|bayar)\b[^.?!]{0,100}\b(?:luar aplikasi|di luar aplikasi|transfer langsung|rekening pribadi)\b/.test(value)
      ? 'off_platform_compensation' : null,
  ].filter(Boolean) as string[];
  return { state: reasons.length ? 'IN_REVIEW' : 'PUBLISHED', reasons };
};

export const publicAggregate = (stars: number[], minimumSample = 5): { visible: boolean; average: number | null; sampleSize: number } => {
  if (stars.length < minimumSample) return { visible: false, average: null, sampleSize: stars.length };
  return { visible: true, average: Math.round((stars.reduce((sum, value) => sum + value, 0) / stars.length) * 100) / 100, sampleSize: stars.length };
};

export const detectCoordinatedRatingAbuse = (reviews: Array<{ reviewerId: string; subjectId: string; createdAt: string; stars: number }>): boolean => {
  const uniqueReviewers = new Set(reviews.map((review) => review.reviewerId));
  return reviews.length >= 3 && uniqueReviewers.size < reviews.length && reviews.every((review) => review.stars === reviews[0].stars);
};

export const qualityScore = (input: { completed: number; preventableCancelRate: number; verifiedIncidentRate: number; ratingAverage: number | null }, ruleVersion = 'quality-2026-09-12') => {
  if (input.completed < 5) return { score: null, ruleVersion, coldStart: true };
  const rating = input.ratingAverage == null ? 0.5 : input.ratingAverage / 5;
  const score = Math.round(Math.max(0, Math.min(100, (rating * 60) + ((1 - input.preventableCancelRate) * 25) + ((1 - input.verifiedIncidentRate) * 15))) * 100) / 100;
  return { score, ruleVersion, coldStart: false };
};
