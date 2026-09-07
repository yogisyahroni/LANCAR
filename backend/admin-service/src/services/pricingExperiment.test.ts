import { deterministicPricingExperimentAssignment } from './pricingExperiment';
import {
  evaluatePricingExperimentGuardrails,
  type PricingExperimentOutcome,
} from './pricingExperimentGuardrails';

const runtime = {
  experiment_id: 'food-pricing-guardrail-v1',
  assignment_salt: 'salt',
  traffic_percent: 100,
  control_pricing_rule_version: 'control-v1',
  treatment_pricing_rule_version: 'treatment-v1',
  enabled: true,
  killed: false,
};

describe('pricing experiment assignment', () => {
  it('is deterministic and separates customer/courier subject namespaces', () => {
    const customerA = deterministicPricingExperimentAssignment(runtime, 'customer', 'subject-1');
    const customerB = deterministicPricingExperimentAssignment(runtime, 'customer', 'subject-1');
    const courier = deterministicPricingExperimentAssignment(runtime, 'courier', 'subject-1');
    expect(customerA).toEqual(customerB);
    expect(customerA).toEqual(expect.objectContaining({ variant: 'treatment', pricing_rule_version: 'treatment-v1' }));
    expect(courier?.assignment_key).not.toBe(customerA?.assignment_key);
  });

  it('does not assign a killed experiment', () => {
    expect(deterministicPricingExperimentAssignment({ ...runtime, killed: true }, 'customer', 'subject-1')).toBeNull();
  });
});

const outcome = (overrides: Partial<PricingExperimentOutcome> = {}): PricingExperimentOutcome => ({
  sampleSize: 100,
  cancellationRatePct: 5,
  etaDeltaMinutes: 1,
  supportContactRatePct: 2,
  courierEarningsAvgIdr: 20000,
  marginAvgIdr: 5000,
  ...overrides,
});

describe('pricing experiment financial guardrails', () => {
  it('fails closed on harm even when all data is otherwise valid', () => {
    const decision = evaluatePricingExperimentGuardrails(
      outcome(),
      outcome({ cancellationRatePct: 8, etaDeltaMinutes: 8, supportContactRatePct: 4, courierEarningsAvgIdr: 18000, marginAvgIdr: 4000 }),
      {
        minSampleSize: 100,
        maxCancellationDeltaPp: 2,
        maxEtaIncreaseMinutes: 5,
        maxSupportContactDeltaPp: 1,
        maxCourierEarningsDropPct: 5,
        maxMarginDropPct: 5,
      },
    );
    expect(decision.approved).toBe(false);
    expect(decision.violations.map((violation) => violation.metric)).toEqual(expect.arrayContaining([
      'cancellation_rate_delta_pp',
      'eta_increase_minutes',
      'support_contact_rate_delta_pp',
      'courier_earnings_drop_pct',
      'margin_drop_pct',
    ]));
  });

  it('does not approve until both cohorts meet the minimum sample', () => {
    const decision = evaluatePricingExperimentGuardrails(
      outcome({ sampleSize: 99 }),
      outcome({ sampleSize: 100 }),
    );
    expect(decision.approved).toBe(false);
    expect(decision.violations[0]).toEqual(expect.objectContaining({ metric: 'minimum_sample_size', direction: 'below' }));
  });
});
