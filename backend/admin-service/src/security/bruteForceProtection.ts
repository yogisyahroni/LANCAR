import crypto from 'crypto';
import type Redis from 'ioredis';
import type { Request } from 'express';

type AuthProtectionScope =
  | 'admin_web_login'
  | 'courier_login'
  | 'courier_otp_verify'
  | 'customer_jwt_exchange'
  | 'password_reset';

type AuthProtectionInput = {
  scope: AuthProtectionScope;
  identifier?: string | null;
  ipAddress?: string | null;
};

type AuthFailureInput = AuthProtectionInput & {
  reason: string;
};

type AuthProtectionPolicy = {
  requestLimit: number;
  requestWindowSeconds: number;
  identifierFailureLimit: number;
  ipFailureLimit: number;
  baseLockoutSeconds: number;
  maxLockoutSeconds: number;
};

type CounterState = {
  value: number;
  expiresAt: number;
};

type MemoryStoreValue = CounterState | string;

const memoryStore = new Map<string, MemoryStoreValue>();

const defaultPolicy = (): AuthProtectionPolicy => {
  const production = process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';
  return {
    requestLimit: Number(process.env.AUTH_BRUTE_FORCE_REQUEST_LIMIT || (production ? 30 : 300)),
    requestWindowSeconds: Number(process.env.AUTH_BRUTE_FORCE_REQUEST_WINDOW_SECONDS || 60),
    identifierFailureLimit: Number(process.env.AUTH_BRUTE_FORCE_IDENTIFIER_FAILURE_LIMIT || (production ? 5 : 20)),
    ipFailureLimit: Number(process.env.AUTH_BRUTE_FORCE_IP_FAILURE_LIMIT || (production ? 30 : 100)),
    baseLockoutSeconds: Number(process.env.AUTH_BRUTE_FORCE_BASE_LOCKOUT_SECONDS || (production ? 15 * 60 : 60)),
    maxLockoutSeconds: Number(process.env.AUTH_BRUTE_FORCE_MAX_LOCKOUT_SECONDS || (production ? 60 * 60 : 5 * 60)),
  };
};

let redisClientPromise: Promise<Redis | null> | null = null;

const isProductionRuntime = () =>
  process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

const resolveRedisClient = async (): Promise<Redis | null> => {
  if (process.env.NODE_ENV === 'test' && !process.env.REDIS_URL) {
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = import('../redis')
      .then((module) => module.redis)
      .catch((error) => {
        if (isProductionRuntime()) {
          throw error;
        }
        return null;
      });
  }

  return redisClientPromise;
};

export class AuthProtectionError extends Error {
  statusCode: number;
  retryAfterSeconds: number;
  code: string;

  constructor(message: string, code: string, statusCode: number, retryAfterSeconds: number) {
    super(message);
    this.name = 'AuthProtectionError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

const purgeExpiredMemoryKey = (key: string) => {
  const value = memoryStore.get(key);
  if (!value || typeof value === 'string') return;
  if (value.expiresAt <= nowSeconds()) {
    memoryStore.delete(key);
  }
};

const hashKeyPart = (value: string) =>
  crypto
    .createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');

const normalizeIdentifier = (identifier?: string | null) => {
  const value = String(identifier || '').trim().toLowerCase();
  return value || 'anonymous';
};

export const getRequestIpAddress = (req: Request) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const lockoutKey = (scope: AuthProtectionScope, dimension: 'identifier' | 'ip', value: string) =>
  `auth:lockout:${scope}:${dimension}:${hashKeyPart(value)}`;

const failureKey = (scope: AuthProtectionScope, dimension: 'identifier' | 'ip', value: string) =>
  `auth:fail:${scope}:${dimension}:${hashKeyPart(value)}`;

const requestKey = (scope: AuthProtectionScope, ipAddress: string) =>
  `auth:req:${scope}:ip:${hashKeyPart(ipAddress)}`;

const getTtlSeconds = async (key: string) => {
  const redis = await resolveRedisClient();
  if (redis) {
    const ttl = await redis.ttl(key);
    return ttl > 0 ? ttl : 0;
  }

  purgeExpiredMemoryKey(key);
  const value = memoryStore.get(key);
  if (!value) return 0;
  if (typeof value === 'string') return 0;
  return Math.max(0, value.expiresAt - nowSeconds());
};

const hasLockout = async (key: string) => {
  const redis = await resolveRedisClient();
  if (redis) {
    const exists = await redis.exists(key);
    return exists === 1;
  }

  purgeExpiredMemoryKey(key);
  return memoryStore.has(key);
};

const incrementWithExpiry = async (key: string, expirySeconds: number) => {
  const redis = await resolveRedisClient();
  if (redis) {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, expirySeconds);
    const results = await pipeline.exec();
    const incrResult = results?.[0]?.[1];
    return typeof incrResult === 'number' ? incrResult : Number(incrResult || 0);
  }

  purgeExpiredMemoryKey(key);
  const existing = memoryStore.get(key);
  const nextValue = typeof existing === 'object' ? existing.value + 1 : 1;
  memoryStore.set(key, {
    value: nextValue,
    expiresAt: nowSeconds() + expirySeconds,
  });
  return nextValue;
};

const setLockout = async (key: string, ttlSeconds: number) => {
  const redis = await resolveRedisClient();
  if (redis) {
    await redis.set(key, '1', 'EX', ttlSeconds);
    return;
  }

  memoryStore.set(key, {
    value: 1,
    expiresAt: nowSeconds() + ttlSeconds,
  });
};

const clearKeys = async (keys: string[]) => {
  const redis = await resolveRedisClient();
  if (redis) {
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return;
  }

  for (const key of keys) {
    memoryStore.delete(key);
  }
};

const withProtectionStore = async <T>(operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AuthProtectionError) {
      throw error;
    }

    if (isProductionRuntime()) {
      throw new AuthProtectionError(
        'Authentication protection is temporarily unavailable',
        'ERR_AUTH_PROTECTION_UNAVAILABLE',
        503,
        30
      );
    }

    console.warn(JSON.stringify({
      event: 'auth_protection_degraded',
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return null as T;
  }
};

const calculateLockoutSeconds = (failureCount: number, failureLimit: number, policy: AuthProtectionPolicy) => {
  const extraFailures = Math.max(0, failureCount - failureLimit);
  const multiplier = Math.min(8, 2 ** extraFailures);
  return Math.min(policy.maxLockoutSeconds, policy.baseLockoutSeconds * multiplier);
};

const emitAuthAbuseAudit = (
  event: string,
  input: AuthFailureInput,
  failureCount: number,
  locked: boolean,
  lockoutSeconds: number
) => {
  const identifier = normalizeIdentifier(input.identifier);
  console.warn(JSON.stringify({
    event,
    scope: input.scope,
    identifier_hash: hashKeyPart(identifier),
    ip_hash: hashKeyPart(input.ipAddress || 'unknown'),
    reason: input.reason,
    failure_count: failureCount,
    locked,
    lockout_seconds: lockoutSeconds,
  }));
};

export const assertAuthAttemptAllowed = async (input: AuthProtectionInput) => {
  const policy = defaultPolicy();
  const identifier = normalizeIdentifier(input.identifier);
  const ipAddress = input.ipAddress || 'unknown';

  return withProtectionStore(async () => {
    const identifierLockKey = lockoutKey(input.scope, 'identifier', identifier);
    const ipLockKey = lockoutKey(input.scope, 'ip', ipAddress);

    if (await hasLockout(identifierLockKey)) {
      throw new AuthProtectionError(
        'Too many failed attempts. Try again later.',
        'ERR_ACCOUNT_TEMPORARILY_LOCKED',
        423,
        await getTtlSeconds(identifierLockKey)
      );
    }

    if (await hasLockout(ipLockKey)) {
      throw new AuthProtectionError(
        'Too many failed attempts from this network. Try again later.',
        'ERR_AUTH_NETWORK_TEMPORARILY_LOCKED',
        429,
        await getTtlSeconds(ipLockKey)
      );
    }

    const requestCount = await incrementWithExpiry(
      requestKey(input.scope, ipAddress),
      policy.requestWindowSeconds
    );
    if (requestCount > policy.requestLimit) {
      throw new AuthProtectionError(
        'Too many authentication attempts. Slow down and try again later.',
        'ERR_AUTH_RATE_LIMIT',
        429,
        policy.requestWindowSeconds
      );
    }
  });
};

export const recordAuthFailure = async (input: AuthFailureInput) => {
  const policy = defaultPolicy();
  const identifier = normalizeIdentifier(input.identifier);
  const ipAddress = input.ipAddress || 'unknown';

  return withProtectionStore(async () => {
    const identifierFailures = await incrementWithExpiry(
      failureKey(input.scope, 'identifier', identifier),
      policy.maxLockoutSeconds
    );
    const ipFailures = await incrementWithExpiry(
      failureKey(input.scope, 'ip', ipAddress),
      policy.maxLockoutSeconds
    );

    const identifierLocked = identifierFailures >= policy.identifierFailureLimit;
    const ipLocked = ipFailures >= policy.ipFailureLimit;
    let lockoutSeconds = 0;

    if (identifierLocked) {
      lockoutSeconds = calculateLockoutSeconds(identifierFailures, policy.identifierFailureLimit, policy);
      await setLockout(lockoutKey(input.scope, 'identifier', identifier), lockoutSeconds);
    }

    if (ipLocked) {
      const ipLockoutSeconds = calculateLockoutSeconds(ipFailures, policy.ipFailureLimit, policy);
      lockoutSeconds = Math.max(lockoutSeconds, ipLockoutSeconds);
      await setLockout(lockoutKey(input.scope, 'ip', ipAddress), ipLockoutSeconds);
    }

    emitAuthAbuseAudit('auth_failure_recorded', input, identifierFailures, identifierLocked || ipLocked, lockoutSeconds);
  });
};

export const recordAuthSuccess = async (input: AuthProtectionInput) => {
  const identifier = normalizeIdentifier(input.identifier);
  await withProtectionStore(async () => {
    await clearKeys([
      failureKey(input.scope, 'identifier', identifier),
      lockoutKey(input.scope, 'identifier', identifier),
    ]);
  });
};

export const sendAuthProtectionError = (res: ResponseLike, error: AuthProtectionError) => {
  if (error.retryAfterSeconds > 0) {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
  }

  res.status(error.statusCode).json({
    success: false,
    data: null,
    message: error.message,
    code: error.code,
  });
};

type ResponseLike = {
  setHeader(name: string, value: string): void;
  status(code: number): ResponseLike;
  json(body: unknown): ResponseLike;
};

export const resetInMemoryAuthProtectionForTests = () => {
  memoryStore.clear();
};
