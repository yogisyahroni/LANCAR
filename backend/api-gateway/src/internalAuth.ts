import { createHmac } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const INTERNAL_AUTH_HEADER = 'x-internal-auth';
const INTERNAL_AUTH_TS_HEADER = 'x-internal-auth-ts';

const INTERNAL_IDENTITY_HEADERS = [
  'x-user-id',
  'x-user-role',
  'x-user-full-name',
  'x-totp-verified',
  'x-portal',
  INTERNAL_AUTH_HEADER,
  INTERNAL_AUTH_TS_HEADER,
] as const;

type EnvLike = NodeJS.ProcessEnv;

const readHeader = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
};

const buildSignaturePayload = (timestamp: string, req: Request): string => {
  const userId = readHeader(req.headers['x-user-id']);
  const role = readHeader(req.headers['x-user-role']);
  const fullName = readHeader(req.headers['x-user-full-name']);
  const totpVerified = readHeader(req.headers['x-totp-verified']);

  return [timestamp, userId, role, fullName, totpVerified].join('.');
};

export const resolveInternalGatewaySecret = (env: EnvLike = process.env): string | undefined => {
  const explicitSecret = env.INTERNAL_GATEWAY_SECRET || env.SERVICE_INTERNAL_AUTH_SECRET;
  if (explicitSecret) {
    return explicitSecret;
  }

  return env.NODE_ENV === 'production' ? undefined : env.JWT_SECRET;
};

export const stripInternalIdentityHeaders = (req: Request, _res: Response, next: NextFunction) => {
  for (const headerName of INTERNAL_IDENTITY_HEADERS) {
    delete req.headers[headerName];
  }

  next();
};

export const applyInternalGatewayAuth = (proxyReq: any, req: Request) => {
  for (const headerName of INTERNAL_IDENTITY_HEADERS) {
    if (typeof proxyReq.removeHeader === 'function') {
      proxyReq.removeHeader(headerName);
    }
  }

  const userId = readHeader(req.headers['x-user-id']);
  if (!userId) {
    return;
  }

  const secret = resolveInternalGatewaySecret();
  if (!secret) {
    return;
  }

  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', secret)
    .update(buildSignaturePayload(timestamp, req))
    .digest('hex');

  proxyReq.setHeader(INTERNAL_AUTH_TS_HEADER, timestamp);
  proxyReq.setHeader(INTERNAL_AUTH_HEADER, signature);
  proxyReq.setHeader('x-user-id', userId);

  const role = readHeader(req.headers['x-user-role']);
  const fullName = readHeader(req.headers['x-user-full-name']);
  const totpVerified = readHeader(req.headers['x-totp-verified']);

  if (role) {
    proxyReq.setHeader('x-user-role', role);
  }
  if (fullName) {
    proxyReq.setHeader('x-user-full-name', fullName);
  }
  if (totpVerified) {
    proxyReq.setHeader('x-totp-verified', totpVerified);
  }
};
