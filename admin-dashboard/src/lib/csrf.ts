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
const CANONICAL_CSRF_COOKIE_NAME = 'csrf_token';
const TOKEN_BYTES = 32; // 256 bits of entropy

/**
 * Reads the CSRF token from the cookie store.
 * Returns null if no token exists yet.
 */
const readCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
};

const readCsrfTokenFromCookie = (): string | null => {
  // Prefer the session-bound cookie issued by the backend. Fall back to the
  // legacy client-generated cookie for older sessions still being migrated.
  return readCookie(CANONICAL_CSRF_COOKIE_NAME) || readCookie(CSRF_COOKIE_NAME);
};

import { adminApiUrl } from './runtimeConfig';

const getSharedDomain = () => {
  try {
    const apiHostname = new URL(adminApiUrl).hostname;
    
    // RFC 6265: Browsers reject the 'Domain' attribute for IP addresses and 'localhost'.
    // If we return undefined, the cookie becomes a host-only cookie, which is structurally required here.
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(apiHostname) || apiHostname.includes(':');
    if (apiHostname === 'localhost' || isIpAddress) {
      return undefined;
    }

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

  // Older dashboard builds could create a host-only cookie on
  // admin.bawain.my.id. The browser then sends the header but not that cookie
  // to api.bawain.my.id, which makes every DELETE/PATCH/POST fail at the
  // gateway with 403. Remove that legacy host-only copy before writing the
  // shared-domain cookie used by the API.
  const legacyCookie = [
    `${CSRF_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'SameSite=Lax',
  ];
  if (isHttps) legacyCookie.push('Secure');
  document.cookie = legacyCookie.join('; ');
  
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
    // Re-assert the cookie with the API's shared domain so a token left by an
    // older host-only cookie cannot keep mutating requests blocked.
    writeCsrfTokenToCookie(existing);
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
