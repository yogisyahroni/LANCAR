import { canTransitionPaymentException } from './paymentExceptionPolicy';

describe('payment reconciliation exception policy', () => {
  it('requires review before resolving or accepting an open exception', () => {
    expect(canTransitionPaymentException('OPEN', 'IN_REVIEW')).toBe(true);
    expect(canTransitionPaymentException('OPEN', 'RESOLVED')).toBe(false);
    expect(canTransitionPaymentException('OPEN', 'ACCEPTED')).toBe(true);
  });

  it('allows reopening a terminal queue decision but never an invalid status jump', () => {
    expect(canTransitionPaymentException('RESOLVED', 'IN_REVIEW')).toBe(true);
    expect(canTransitionPaymentException('ACCEPTED', 'IN_REVIEW')).toBe(true);
    expect(canTransitionPaymentException('RESOLVED', 'OPEN')).toBe(false);
    expect(canTransitionPaymentException('IN_REVIEW', 'RESOLVED')).toBe(true);
  });
});
