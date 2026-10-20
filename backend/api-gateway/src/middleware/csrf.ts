/**
 * csrf.ts
 * S-AD-01 FIX: Backend CSRF verification middleware for admin routes.
 *
 * Implements the Double Submit Cookie verification:
 *  1. Read CSRF token from the canonical `csrf_token` cookie. The legacy
 *     `tembus_admin_csrf` cookie remains accepted for older admin-dashboard
 *     clients during the cookie migration.
 *  2. Read CSRF token from the `X-CSRF-Token` request header.
 *  3. Reject if either is missing or if no CSRF cookie matches the header
 *     (timing-safe comparison). Both cookie names may coexist during the
 *     migration, so the matching pair must be found rather than assuming one
 *     cookie wins by ordering.
 *
 * This stops Cross-Site Request Forgery attacks where a malicious site tricks
 * an authenticated admin into making unintended requests — the attacker's page
 * cannot read the cookie value due to the Same-Origin Policy, so it cannot
 * construct the matching header.
 *
 * OWASP Reference: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 */

import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const CSRF_COOKIE_NAMES = ['csrf_token', 'tembus_admin_csrf'] as const;
const CSRF_HEADER_NAME = 'x-csrf-token'; // Express normalizes headers to lowercase

/** HTTP methods that do NOT mutate state — CSRF check is skipped. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Parse all CSRF token values from the Cookie header. The canonical and
 * legacy cookies can coexist during migration.
 */
const parseCsrfFromCookie = (cookieHeader: string | undefined): string[] => {
  if (!cookieHeader) return [];

  return cookieHeader.split(';').flatMap((segment) => {
    const trimmed = segment.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) return [];

    const cookieName = trimmed.slice(0, separator);
    if (!CSRF_COOKIE_NAMES.includes(cookieName as (typeof CSRF_COOKIE_NAMES)[number])) return [];

    try {
      const value = decodeURIComponent(trimmed.slice(separator + 1));
      return value ? [value] : [];
    } catch {
      return [];
    }
  });
};

/**
 * Express middleware that verifies the CSRF double-submit cookie for admin routes.
 * Must be mounted BEFORE the route handlers that perform mutations.
 *
 * @example
 * app.use('/api/v1/admin', verifyCsrfToken);
 * app.use(proxyToAdminService);
 */
export const verifyCsrfToken = (req: Request, res: Response, next: NextFunction): void => {
  // Safe methods do not need CSRF protection
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const cookieTokens = parseCsrfFromCookie(req.headers.cookie);
  const headerToken = (req.headers[CSRF_HEADER_NAME] as string | undefined)?.trim() || null;

  if (cookieTokens.length === 0 || !headerToken) {
    res.status(403).json({
      status: 'error',
      code: 'ERR_CSRF_TOKEN_MISSING',
      message: 'Permintaan tidak dapat diproses: token keamanan tidak ditemukan.',
    });
    return;
  }

  // Timing-safe comparison to prevent timing oracle attacks. Accept only when
  // the header matches one of the cookies exactly.
  const headerBuffer = Buffer.from(headerToken, 'utf8');
  const hasMatchingCookie = cookieTokens.some((cookieToken) => {
    if (cookieToken.length !== headerToken.length) return false;
    return timingSafeEqual(Buffer.from(cookieToken, 'utf8'), headerBuffer);
  });

  if (!hasMatchingCookie) {
    res.status(403).json({
      status: 'error',
      code: 'ERR_CSRF_TOKEN_INVALID',
      message: 'Permintaan tidak dapat diproses: token keamanan tidak valid.',
    });
    return;
  }

  next();
};
