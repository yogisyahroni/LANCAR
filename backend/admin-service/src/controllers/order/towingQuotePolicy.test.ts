import { evaluateTowingQuoteConsent } from './towingQuotePolicy';

describe('evaluateTowingQuoteConsent', () => {
  const nowMs = Date.parse('2026-09-01T08:00:00.000Z');

  it.each([
    ['expired quote', { quoteGeneratedAt: '2026-09-01T07:00:00.000Z' }],
    ['changed route', { quoteGeneratedAt: '2026-09-01T07:55:00.000Z', submittedSnapshotHash: 'old' }],
    ['material price increase', { quoteGeneratedAt: '2026-09-01T07:55:00.000Z', trustedTotalIdr: 50000 }],
  ])('requires explicit consent for %s', (_label, override) => {
    const result = evaluateTowingQuoteConsent(Object.assign({
      submittedTotalIdr: 30000,
      trustedTotalIdr: 30000,
      quoteGeneratedAt: '2026-09-01T07:55:00.000Z',
      submittedSnapshotHash: 'same',
      trustedSnapshotHash: 'same',
      consent: false,
      nowMs,
    }, override));
    expect(result.requiresConsent).toBe(true);
  });

  it('does not require consent for an unchanged fresh quote', () => {
    expect(evaluateTowingQuoteConsent({
      submittedTotalIdr: 30000,
      trustedTotalIdr: 30000,
      quoteGeneratedAt: '2026-09-01T07:55:00.000Z',
      submittedSnapshotHash: 'same',
      trustedSnapshotHash: 'same',
      consent: false,
      nowMs,
    })).toMatchObject({ requiresConsent: false, priceDeltaIdr: 0, expired: false, routeChanged: false });
  });

  it('allows a changed or expired quote only after explicit consent', () => {
    expect(evaluateTowingQuoteConsent({
      submittedTotalIdr: 30000,
      trustedTotalIdr: 50000,
      quoteGeneratedAt: '2026-09-01T07:00:00.000Z',
      submittedSnapshotHash: 'old',
      trustedSnapshotHash: 'new',
      consent: true,
      nowMs,
    })).toMatchObject({ requiresConsent: false, priceDeltaIdr: 20000, expired: true, routeChanged: true });
  });

  it('requires consent when the client submits no trustworthy quote timestamp', () => {
    expect(evaluateTowingQuoteConsent({
      submittedTotalIdr: 30000,
      trustedTotalIdr: 30000,
      quoteGeneratedAt: null,
      consent: false,
      nowMs,
    })).toMatchObject({ requiresConsent: true, expired: true });
  });
});
