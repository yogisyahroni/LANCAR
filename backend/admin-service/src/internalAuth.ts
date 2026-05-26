import { createHmac, timingSafeEqual } from 'crypto';
import { IncomingHttpHeaders } from 'http';

const INTERNAL_AUTH_HEADER = 'x-internal-auth';
const INTERNAL_AUTH_TS_HEADER = 'x-internal-auth-ts';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type InternalIdentity = {
  userId: string;
  role: string;
  fullName: string;
  totpVerified: boolean;
};

type VerificationResult =
  | { status: 'none' }
  | { status: 'valid'; identity: InternalIdentity }
  | { status: 'invalid'; reason: string };

const readHeader = (headers: IncomingHttpHeaders, name: string): string => {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
};

const buildSignaturePayload = (
  timestamp: string,
  userId: string,
  role: string,
  fullName: string,
  totpVerified: string
): string => {
  return [timestamp, userId, role, fullName, totpVerified].join('.');
};

export const resolveInternalGatewaySecret = (env: NodeJS.ProcessEnv = process.env): string | undefined => {
  const explicitSecret = env.INTERNAL_GATEWAY_SECRET || env.SERVICE_INTERNAL_AUTH_SECRET;
  if (explicitSecret) {
    return explicitSecret;
  }

  return env.NODE_ENV === 'production' ? undefined : env.JWT_SECRET;
};

export const createInternalAuthSignature = (
  identity: InternalIdentity,
  timestamp: string,
  secret: string
): string => {
  return createHmac('sha256', secret)
    .update(
      buildSignaturePayload(
        timestamp,
        identity.userId,
        identity.role,
        identity.fullName,
        identity.totpVerified ? 'true' : 'false'
      )
    )
    .digest('hex');
};

export const buildInternalAuthHeaders = (
  identity: InternalIdentity,
  secret: string,
  timestamp = Date.now().toString()
): Record<string, string> => {
  return {
    'x-user-id': identity.userId,
    'x-user-role': identity.role,
    'x-user-full-name': identity.fullName,
    'x-totp-verified': identity.totpVerified ? 'true' : 'false',
    [INTERNAL_AUTH_TS_HEADER]: timestamp,
    [INTERNAL_AUTH_HEADER]: createInternalAuthSignature(identity, timestamp, secret),
  };
};

export const verifyInternalGatewayAuth = (
  headers: IncomingHttpHeaders,
  now = Date.now()
): VerificationResult => {
  const userId = readHeader(headers, 'x-user-id');
  const role = readHeader(headers, 'x-user-role');
  const fullName = readHeader(headers, 'x-user-full-name');
  const totpVerified = readHeader(headers, 'x-totp-verified');

  if (!userId && !role && !fullName && !totpVerified) {
    return { status: 'none' };
  }

  const timestamp = readHeader(headers, INTERNAL_AUTH_TS_HEADER);
  const providedSignature = readHeader(headers, INTERNAL_AUTH_HEADER);
  if (!timestamp || !providedSignature) {
    return { status: 'invalid', reason: 'missing internal auth signature' };
  }

  const secret = resolveInternalGatewaySecret();
  if (!secret) {
    return { status: 'invalid', reason: 'internal auth secret is not configured' };
  }

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(now - timestampNumber) > MAX_CLOCK_SKEW_MS) {
    return { status: 'invalid', reason: 'internal auth timestamp is invalid or expired' };
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(buildSignaturePayload(timestamp, userId, role, fullName, totpVerified))
    .digest('hex');

  const providedBuffer = Buffer.from(providedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { status: 'invalid', reason: 'internal auth signature mismatch' };
  }

  return {
    status: 'valid',
    identity: {
      userId,
      role,
      fullName: fullName || 'User',
      totpVerified: totpVerified === 'true',
    },
  };
};
