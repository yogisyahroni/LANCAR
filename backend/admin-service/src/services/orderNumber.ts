/**
 * Formats a customer-facing order number from an atomic database sequence.
 * The sequence, not the timestamp, is the uniqueness guarantee.
 */
export const formatCustomerOrderNumber = (timestampMs: number, sequence: string | number | bigint): string => {
  const timestampPart = String(Math.trunc(timestampMs)).slice(-6).padStart(6, '0');
  const sequencePart = String(sequence).padStart(6, '0');
  return `TMB-${timestampPart}-${sequencePart}`;
};
