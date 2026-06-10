/**
 * csrf.ts
 * S-AD-01 FIX: Double-Submit Cookie pattern for CSRF protection on admin dashboard.
 *
 * How it works:
 *  1. On first mutating request, generate a cryptographically random token.
 *  2. Store it in a readable (NOT HttpOnly) cookie so the browser persists it.
 *  3. Also send it as a request header (X-CSRF-Token).
 *  4. The backend verifies that cookie value === header value.
 *     Cross-origin attackers cannot read the cookie value (SOP) and therefore
 *     cannot set the matching header — even with credentials: include.
 *
 * References:
 *  - OWASP CSRF Prevention Cheat Sheet: Double Submit Cookie
 *  - https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 */

const CSRF_COOKIE_NAME = 'tembus_admin_csrf';
const TOKEN_BYTES = 32; // 256 bits of entropy

/**
 * Reads the CSRF token from the cookie store.
 * Returns null if no token exists yet.
 */
const readCsrfTokenFromCookie = (): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE_NAME.length + 1)) : null;
};

import { adminApiUrl } from './runtimeConfig';

const getSharedDomain = () => {
  try {
    const apiHostname = new URL(adminApiUrl).hostname;
    if (apiHostname === 'localhost' || apiHostname === '127.0.0.1') return undefined;
    const parts = apiHostname.split('.');
    if (parts.length > 2) {
      return `.${parts.slice(1).join('.')}`;
    }
    return `.${apiHostname}`;
  } catch {
    return undefined;
  }
};

/**
 * Writes a CSRF token into a same-site cookie.
 * The cookie is NOT HttpOnly (must be readable by JS for double-submit),
 * but IS SameSite=Lax to allow cross-subdomain API calls.
 */
const writeCsrfTokenToCookie = (token: string): void => {
  if (typeof document === 'undefined') return;
  const isHttps = window.location.protocol === 'https:';
  const domain = getSharedDomain();
  
  const parts = [
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'Max-Age=3600',
    'SameSite=Lax',
  ];
  if (domain) parts.push(`Domain=${domain}`);
  if (isHttps) parts.push('Secure');
  document.cookie = parts.join('; ');
};

/**
 * Returns an existing CSRF token or generates + stores a new one.
 * Safe to call on every request — idempotent if token already exists.
 */
export const getOrCreateCsrfToken = (): string => {
  const existing = readCsrfTokenFromCookie();
  if (existing && existing.length >= TOKEN_BYTES * 2) {
    return existing;
  }

  // Generate using Web Crypto for cryptographic randomness
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  writeCsrfTokenToCookie(token);
  return token;
};

/** The header name to use when sending the CSRF token in requests. */
export const CSRF_HEADER_NAME = 'X-CSRF-Token';

/** HTTP methods that mutate state and require CSRF protection. */
export const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
