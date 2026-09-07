export type PricingExperimentGuardrails = {
  minSampleSize: number;
  maxCancellationDeltaPp: number;
  maxEtaIncreaseMinutes: number;
  maxSupportContactDeltaPp: number;
  maxCourierEarningsDropPct: number;
  maxMarginDropPct: number;
};

export type PricingExperimentOutcome = {
  sampleSize: number;
  cancellationRatePct: number;
  etaDeltaMinutes: number;
  supportContactRatePct: number;
  courierEarningsAvgIdr: number;
  marginAvgIdr: number;
};

export type PricingGuardrailViolation = {
  metric: string;
  observed: number;
  threshold: number;
  direction: 'above' | 'below';
};

export type PricingExperimentGuardrailDecision = {
  approved: boolean;
  baseline: PricingExperimentOutcome;
  treatment: PricingExperimentOutcome;
  violations: PricingGuardrailViolation[];
};

export const DEFAULT_PRICING_EXPERIMENT_GUARDRAILS: PricingExperimentGuardrails = {
  minSampleSize: 100,
  maxCancellationDeltaPp: 2,
  maxEtaIncreaseMinutes: 5,
  maxSupportContactDeltaPp: 1,
  maxCourierEarningsDropPct: 5,
  maxMarginDropPct: 5,
};

const finite = (value: number, field: string, allowNegative = false): number => {
  if (!Number.isFinite(value) || (!allowNegative && value < 0)) {
    throw new Error(`${field} must be a finite ${allowNegative ? '' : 'non-negative '}number`);
  }
  return value;
};

const validateOutcome = (outcome: PricingExperimentOutcome, name: string): void => {
  if (!outcome || !Number.isInteger(outcome.sampleSize) || outcome.sampleSize < 0) {
    throw new Error(`${name}.sampleSize must be a non-negative integer`);
  }
  finite(outcome.cancellationRatePct, `${name}.cancellationRatePct`);
  finite(outcome.etaDeltaMinutes, `${name}.etaDeltaMinutes`, true);
  finite(outcome.supportContactRatePct, `${name}.supportContactRatePct`);
  finite(outcome.courierEarningsAvgIdr, `${name}.courierEarningsAvgIdr`);
  finite(outcome.marginAvgIdr, `${name}.marginAvgIdr`, true);
};

const percentageDrop = (baseline: number, candidate: number): number => {
  const denominator = Math.max(Math.abs(baseline), 1);
  return ((baseline - candidate) / denominator) * 100;
};

export const evaluatePricingExperimentGuardrails = (
  baseline: PricingExperimentOutcome,
  treatment: PricingExperimentOutcome,
  guardrails: PricingExperimentGuardrails = DEFAULT_PRICING_EXPERIMENT_GUARDRAILS,
): PricingExperimentGuardrailDecision => {
  validateOutcome(baseline, 'baseline');
  validateOutcome(treatment, 'treatment');
  finite(guardrails.minSampleSize, 'guardrails.minSampleSize');
  finite(guardrails.maxCancellationDeltaPp, 'guardrails.maxCancellationDeltaPp');
  finite(guardrails.maxEtaIncreaseMinutes, 'guardrails.maxEtaIncreaseMinutes');
  finite(guardrails.maxSupportContactDeltaPp, 'guardrails.maxSupportContactDeltaPp');
  finite(guardrails.maxCourierEarningsDropPct, 'guardrails.maxCourierEarningsDropPct');
  finite(guardrails.maxMarginDropPct, 'guardrails.maxMarginDropPct');

  const violations: PricingGuardrailViolation[] = [];
  if (baseline.sampleSize < guardrails.minSampleSize || treatment.sampleSize < guardrails.minSampleSize) {
    violations.push({
      metric: 'minimum_sample_size',
      observed: Math.min(baseline.sampleSize, treatment.sampleSize),
      threshold: guardrails.minSampleSize,
      direction: 'below',
    });
  }

  const cancellationDeltaPp = treatment.cancellationRatePct - baseline.cancellationRatePct;
  if (cancellationDeltaPp > guardrails.maxCancellationDeltaPp) {
    violations.push({ metric: 'cancellation_rate_delta_pp', observed: cancellationDeltaPp, threshold: guardrails.maxCancellationDeltaPp, direction: 'above' });
  }
  const etaIncreaseMinutes = treatment.etaDeltaMinutes - baseline.etaDeltaMinutes;
  if (etaIncreaseMinutes > guardrails.maxEtaIncreaseMinutes) {
    violations.push({ metric: 'eta_increase_minutes', observed: etaIncreaseMinutes, threshold: guardrails.maxEtaIncreaseMinutes, direction: 'above' });
  }
  const supportDeltaPp = treatment.supportContactRatePct - baseline.supportContactRatePct;
  if (supportDeltaPp > guardrails.maxSupportContactDeltaPp) {
    violations.push({ metric: 'support_contact_rate_delta_pp', observed: supportDeltaPp, threshold: guardrails.maxSupportContactDeltaPp, direction: 'above' });
  }
  const courierEarningsDropPct = percentageDrop(baseline.courierEarningsAvgIdr, treatment.courierEarningsAvgIdr);
  if (courierEarningsDropPct > guardrails.maxCourierEarningsDropPct) {
    violations.push({ metric: 'courier_earnings_drop_pct', observed: courierEarningsDropPct, threshold: guardrails.maxCourierEarningsDropPct, direction: 'above' });
  }
  const marginDropPct = percentageDrop(baseline.marginAvgIdr, treatment.marginAvgIdr);
  if (marginDropPct > guardrails.maxMarginDropPct) {
    violations.push({ metric: 'margin_drop_pct', observed: marginDropPct, threshold: guardrails.maxMarginDropPct, direction: 'above' });
  }

  return { approved: violations.length === 0, baseline, treatment, violations };
};
