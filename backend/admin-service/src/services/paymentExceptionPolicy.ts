export const PAYMENT_EXCEPTION_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  OPEN: ['IN_REVIEW', 'ACCEPTED'],
  IN_REVIEW: ['OPEN', 'RESOLVED', 'ACCEPTED'],
  RESOLVED: ['IN_REVIEW'],
  ACCEPTED: ['IN_REVIEW'],
};

export const canTransitionPaymentException = (from: string, to: string): boolean => (
  Boolean(PAYMENT_EXCEPTION_TRANSITIONS[String(from || '').trim().toUpperCase()]?.includes(String(to || '').trim().toUpperCase()))
);
