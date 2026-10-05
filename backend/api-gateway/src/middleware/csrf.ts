/**
 * csrf.ts
 * S-AD-01 FIX: Backend CSRF verification middleware for admin routes.
 *
 * Implements the Double Submit Cookie verification:
 *  1. Read CSRF token from the canonical `csrf_token` cookie. The legacy
 *     `tembus_admin_csrf` cookie remains accepted for older admin-dashboard
 *     clients during the cookie migration.
 *  2. Read CSRF token from the `X-CSRF-Token` request header.
 *  3. Reject if either is missing or if they do not match (timing-safe comparison).
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
 * Parse the CSRF token value from the Cookie header.
 * Returns null if the cookie is absent or empty.
 */
const parseCsrfFromCookie = (cookieHeader: string | undefined): string | null => {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => CSRF_COOKIE_NAMES.some((name) => c.startsWith(`${name}=`)));
  if (!match) return null;
  const cookieName = CSRF_COOKIE_NAMES.find((name) => match.startsWith(`${name}=`));
  if (!cookieName) return null;
  const raw = match.slice(cookieName.length + 1);
  try {
    return decodeURIComponent(raw) || null;
  } catch {
    return null;
  }
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

  const cookieToken = parseCsrfFromCookie(req.headers.cookie);
  const headerToken = (req.headers[CSRF_HEADER_NAME] as string | undefined)?.trim() || null;

  if (!cookieToken || !headerToken) {
    res.status(403).json({
      status: 'error',
      code: 'ERR_CSRF_TOKEN_MISSING',
      message: 'Permintaan tidak dapat diproses: token keamanan tidak ditemukan.',
    });
    return;
  }

  // Reject tokens of different length immediately (timing-safe comparison requires equal-length buffers)
  if (cookieToken.length !== headerToken.length) {
    res.status(403).json({
      status: 'error',
      code: 'ERR_CSRF_TOKEN_INVALID',
      message: 'Permintaan tidak dapat diproses: token keamanan tidak valid.',
    });
    return;
  }

  // Timing-safe comparison to prevent timing oracle attacks
  const cookieBuffer = Buffer.from(cookieToken, 'utf8');
  const headerBuffer = Buffer.from(headerToken, 'utf8');

  if (!timingSafeEqual(cookieBuffer, headerBuffer)) {
    res.status(403).json({
      status: 'error',
      code: 'ERR_CSRF_TOKEN_INVALID',
      message: 'Permintaan tidak dapat diproses: token keamanan tidak valid.',
    });
    return;
  }

  next();
};
