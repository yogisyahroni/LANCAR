import { buildReputationAnalytics, reputationModerationDecision, validateReputationAnalyticsObservation } from './reputationAnalytics';

describe('reputation analytics governance', () => {
  it('builds market/service distributions and drift from versioned observations', () => {
    const rows = buildReputationAnalytics([
      { marketCode: 'id-jk', serviceCode: 'food', stars: 5, period: 'CURRENT', ruleVersion: 'reputation-v2', sourceType: 'customer_review' },
      { marketCode: 'id-jk', serviceCode: 'food', stars: 4, period: 'CURRENT', ruleVersion: 'reputation-v2', sourceType: 'customer_review' },
      { marketCode: 'id-jk', serviceCode: 'food', stars: 3, period: 'PREVIOUS', ruleVersion: 'reputation-v1', sourceType: 'customer_review' },
    ]);
    expect(rows).toEqual([expect.objectContaining({
      market_code: 'id-jk', service_code: 'food', sample_size: 2, average_stars: 4.5,
      previous_sample_size: 1, previous_average_stars: 3, drift_stars: 1.5, drift_status: 'ALERT',
      distribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
    })]);
  });

  it('rejects protected attributes and requires rule/source provenance', () => {
    expect(validateReputationAnalyticsObservation({ marketCode: 'id-jk', serviceCode: 'food', stars: 5, period: 'CURRENT', ruleVersion: '', sourceType: '', featureNames: ['religion'] })).toEqual(expect.arrayContaining(['rule_and_source_provenance_required', 'protected_attribute_not_allowed']));
  });

  it('requires human review and a safe fallback for model-assisted material decisions', () => {
    expect(reputationModerationDecision({ modelSuggested: true, humanReviewed: false, fallbackAvailable: true })).toEqual({ allowed: false, human_review_required: true, fallback: 'QUEUE_FOR_REVIEW' });
    expect(reputationModerationDecision({ modelSuggested: false, humanReviewed: false, fallbackAvailable: false }).allowed).toBe(true);
  });
});
