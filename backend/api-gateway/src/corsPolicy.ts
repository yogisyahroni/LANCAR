import { NextFunction, Request, Response } from 'express';
import { CorsOptions } from 'cors';

const INTERNAL_HEADERS = [
  'x-user-id',
  'x-user-role',
  'x-user-full-name',
  'x-totp-verified',
  'x-internal-auth',
  'x-internal-auth-ts',
];

const DEFAULT_DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
];

export const PUBLIC_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'x-portal',
  'x-idempotency-key',
  'x-device-id',
  'x-csrf-token',
  'x-request-id',
  'traceparent',
  'x-requested-with',
];

type EnvLike = NodeJS.ProcessEnv;

export const isProductionRuntime = (env: EnvLike = process.env) =>
  env.NODE_ENV === 'production' || env.ENVIRONMENT === 'production';

export const parseAllowedOrigins = (env: EnvLike = process.env) => {
  const configuredOrigins = env.ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  return isProductionRuntime(env) ? [] : DEFAULT_DEVELOPMENT_ORIGINS;
};

export const isOriginAllowed = (origin: string | undefined, env: EnvLike = process.env) => {
  if (!origin) {
    return true;
  }

  return parseAllowedOrigins(env).includes(origin);
};

export const hasInternalRequestHeader = (requestedHeaders: string | string[] | undefined) => {
  const normalizedHeaders = Array.isArray(requestedHeaders)
    ? requestedHeaders.join(',')
    : requestedHeaders || '';

  const requestedHeaderSet = new Set(
    normalizedHeaders
      .split(',')
      .map((headerName) => headerName.trim().toLowerCase())
      .filter(Boolean),
  );

  return INTERNAL_HEADERS.some((headerName) => requestedHeaderSet.has(headerName));
};

export const rejectUnsafeCorsPreflight = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.method !== 'OPTIONS') {
    return next();
  }

  if (hasInternalRequestHeader(req.headers['access-control-request-headers'])) {
    return res.status(403).json({
      status: 'error',
      code: 'ERR_FORBIDDEN_CORS_HEADER',
      message: 'Requested CORS headers are not allowed',
    });
  }

  if (!isOriginAllowed(req.headers.origin)) {
    return res.status(403).json({
      status: 'error',
      code: 'ERR_FORBIDDEN_ORIGIN',
      message: 'Origin not allowed by CORS',
    });
  }

  return next();
};

export const buildCorsOptions = (env: EnvLike = process.env): CorsOptions => ({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin, env)) {
      return callback(null, true);
    }

    console.warn(`[CORS] Blocked unauthorized origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: PUBLIC_ALLOWED_HEADERS,
  exposedHeaders: ['X-Request-ID', 'X-Correlation-ID', 'X-Trace-ID'],
});
