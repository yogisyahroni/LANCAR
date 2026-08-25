/**
 * S3-CW-03: Validate a deep_link from a push notification before navigating.
 *
 * Only relative paths within the same origin are permitted (e.g. /orders/123).
 * Absolute URLs, protocol-relative URLs (//evil.com), and javascript: URIs are
 * all rejected. Additionally, only pre-approved route prefixes are allowed —
 * this prevents redirect to internal/admin pages like /analytics or /feature-flags.
 * Returns null when the link should be ignored.
 */

// S3-CW-03b: Only these customer-facing routes are allowed as deep link destinations
const ALLOWED_DEEP_LINK_PREFIXES = [
  '/orders/',
  '/orders',
  '/disputes/',
  '/disputes',
  '/resi/',
  '/resi',
  '/dashboard',
  '/profil',
  '/alamat',
  '/laporan',
] as const;

export function sanitizeDeepLink(rawLink: string | undefined | null): string | null {
  if (!rawLink) return null;

  const trimmed = rawLink.trim();
  if (!trimmed) return null;

  // Must start with '/' and be a relative path — block absolute URLs and protocol-relative
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;

  // Reject path traversal
  if (trimmed.includes('..')) return null;

  // Guard against javascript: injections encoded as a path
  let safePath: string;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    // Only allow internal paths — block cross-origin even via tricky encoding
    safePath = url.pathname + (url.search || '') + (url.hash || '');
  } catch {
    return null;
  }

  // S3-CW-03b: Allowlist check — only navigate to known customer routes
  const isAllowed = ALLOWED_DEEP_LINK_PREFIXES.some(
    (prefix) => safePath === prefix || safePath.startsWith(`${prefix}`)
  );

  if (!isAllowed) {
    return null; // Blocked — path not in allowlist (e.g. /analytics, /feature-flags, /admin)
  }

  return safePath;
}
