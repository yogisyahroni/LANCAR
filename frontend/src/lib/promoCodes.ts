/**
 * Normalize the comma-separated promo input used by the customer checkout.
 * The server remains authoritative for eligibility, ordering, budgets and
 * conflict rules; this helper only keeps the client payload deterministic.
 */
export function normalizePromoCodes(value: string): string[] {
  return Array.from(new Set(
    value
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  ));
}

export function appendPromoCode(value: string, code: string): string {
  const next = normalizePromoCodes(`${value},${code}`);
  return next.join(', ');
}
