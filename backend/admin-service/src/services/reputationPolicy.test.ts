import { detectCoordinatedRatingAbuse, moderateReview, publicAggregate, qualityScore, validateReview } from './reputationPolicy';

describe('reputation policy', () => {
  it('requires completed order and dedupes one review per dimension/service', () => {
    const base = { reviewerId: 'u1', subjectId: 'u2', orderId: 'o1', serviceCode: 'food', state: 'completed' as const, stars: 5, dimensions: { service: 5 } };
    expect(validateReview(base, new Set())).toEqual([]);
    expect(validateReview({ ...base, state: 'created' as any }, new Set())).toContain('order_not_completed');
    expect(validateReview(base, new Set(['u1:u2:o1:food']))).toContain('duplicate_review');
  });

  it('routes reported content to moderation and protects cold-start aggregates', () => {
    expect(moderateReview('Great service').state).toBe('PUBLISHED');
    expect(moderateReview('Call me on WhatsApp').state).toBe('IN_REVIEW');
    expect(publicAggregate([5, 5, 5]).visible).toBe(false);
    expect(qualityScore({ completed: 2, preventableCancelRate: 0, verifiedIncidentRate: 0, ratingAverage: null }).coldStart).toBe(true);
  });

  it('detects a signal without making an automatic permanent enforcement decision', () => {
    expect(detectCoordinatedRatingAbuse([
      { reviewerId: 'u1', subjectId: 's1', createdAt: '1', stars: 1 },
      { reviewerId: 'u1', subjectId: 's2', createdAt: '2', stars: 1 },
      { reviewerId: 'u2', subjectId: 's3', createdAt: '3', stars: 1 },
    ])).toBe(true);
  });
});
