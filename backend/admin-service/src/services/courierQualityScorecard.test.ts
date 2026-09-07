import {
  buildCourierQualityScorecard,
  buildCourierServiceMetrics,
  COURIER_SCORECARD_VERSION,
  summarizeCourierRatings,
} from './courierQualityScorecard';

describe('courier quality scorecard', () => {
  it('flags one anomalous rating for review without using it as an enforcement penalty', () => {
    const rating = summarizeCourierRatings([5, 5, 5, 5, 1]);

    expect(rating.average_rating).toBe(4.2);
    expect(rating.score_rating).toBe(5);
    expect(rating.anomalous_rating_count).toBe(1);
    expect(rating.anomaly_review_required).toBe(true);
  });

  it('does not manufacture a quality score before an eligible performance signal exists', () => {
    const scorecard = buildCourierQualityScorecard({
      completion_rate_pct: null,
      preventable_cancellation_rate_pct: null,
      pickup_delivery_sla_pct: null,
      proof_quality_pct: null,
      ratings: [],
      reviewed_safety_incidents: 0,
      quality_impact_safety_incidents: 0,
    });

    expect(scorecard.version).toBe(COURIER_SCORECARD_VERSION);
    expect(scorecard.score).toBeNull();
    expect(scorecard.status).toBe('insufficient_data');
    expect(scorecard.enforcement_eligible).toBe(false);
  });

  it('keeps a rating anomaly review-only even when other metrics are strong', () => {
    const scorecard = buildCourierQualityScorecard({
      completion_rate_pct: 100,
      preventable_cancellation_rate_pct: 0,
      pickup_delivery_sla_pct: 100,
      proof_quality_pct: 100,
      ratings: [5, 5, 5, 5, 1],
      reviewed_safety_incidents: 1,
      quality_impact_safety_incidents: 0,
    });

    expect(scorecard.score).toBe(100);
    expect(scorecard.material_decision_requires_review).toBe(true);
    expect(scorecard.enforcement_eligible).toBe(false);
  });

  it('returns separate service metrics and keeps preventable cancellation scoped to cancellations', () => {
    const [metric] = buildCourierServiceMetrics([{
      service_code: 'food_delivery',
      total_assignments: 10,
      completed_deliveries: 8,
      cancelled_deliveries: 2,
      preventable_cancellations: 1,
      sla_eligible: 8,
      sla_met: 7,
      proof_attempts: 10,
      proof_accepted: 9,
    }]);

    expect(metric.service_code).toBe('food_delivery');
    expect(metric.completion_rate_pct).toBe(80);
    expect(metric.preventable_cancellation_rate_pct).toBe(50);
    expect(metric.pickup_delivery_sla_pct).toBe(87.5);
    expect(metric.proof_quality_pct).toBe(90);
    expect(metric.metric_definitions.every((definition) => definition.service_scoped)).toBe(true);
  });
});
