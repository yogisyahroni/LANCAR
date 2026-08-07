import { NextFunction, Request, Response } from 'express';
import { verifyInternalGatewayAuth } from '../internalAuth';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SESSION_COOKIE_NAMES = ['admin_session', 'customer_session', 'web_session'];

const DEFAULT_DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:3004',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3004',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
];

const isProductionRuntime = () =>
  process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

const readHeader = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
};

const normalizeOrigin = (value: string | undefined) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch (_error) {
    return null;
  }
};

const parseOriginList = (value: string | undefined) =>
  String(value || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter((origin): origin is string => Boolean(origin));

export const getAllowedCsrfOrigins = () => {
  const configured = [
    ...parseOriginList(process.env.ALLOWED_ORIGINS),
    ...parseOriginList(process.env.FRONTEND_URL),
    ...parseOriginList(process.env.ADMIN_DASHBOARD_URL),
    ...parseOriginList(process.env.PUBLIC_APP_URL),
  ];

  const uniqueConfigured = [...new Set(configured)];
  if (uniqueConfigured.length > 0) return uniqueConfigured;

  return isProductionRuntime() ? [] : DEFAULT_DEVELOPMENT_ORIGINS;
};

const requestHasSessionCookie = (req: Request) =>
  SESSION_COOKIE_NAMES.some((cookieName) => Boolean(req.cookies?.[cookieName]));

const resolveRequestOrigin = (req: Request) => {
  const origin = normalizeOrigin(readHeader(req.headers.origin));
  if (origin) return { source: 'origin', value: origin };

  const referer = normalizeOrigin(readHeader(req.headers.referer));
  if (referer) return { source: 'referer', value: referer };

  return null;
};

export const requireCookieCsrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  if (!requestHasSessionCookie(req)) {
    next();
    return;
  }

  const internalAuth = verifyInternalGatewayAuth(req.headers);
  if (internalAuth.status === 'valid') {
    next();
    return;
  }

  const requestOrigin = resolveRequestOrigin(req);
  const allowedOrigins = getAllowedCsrfOrigins();
  if (!requestOrigin || !allowedOrigins.includes(requestOrigin.value)) {
    res.status(403).json({
      status: 'error',
      code: 'ERR_CSRF_ORIGIN',
      message: 'Cookie-authenticated mutation requires a trusted Origin or Referer header.',
    });
    return;
  }

  next();
};
