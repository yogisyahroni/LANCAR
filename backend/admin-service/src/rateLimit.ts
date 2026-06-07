import { Request, Response, NextFunction } from 'express';
import { redis } from './redis';

const MAX_TOGGLES_PER_HOUR = 10;
const WINDOW_SECONDS = 3600; // 1 hour
const DEFAULT_MOBILE_COURIER_MUTATION_MAX_PER_MINUTE = 60;
const MOBILE_COURIER_MUTATION_WINDOW_SECONDS = 60;
const DEFAULT_COMMUNICATION_MESSAGE_MAX_PER_MINUTE = 30;
const DEFAULT_COMMUNICATION_CALL_MAX_PER_MINUTE = 6;
const DEFAULT_COMMUNICATION_READ_MAX_PER_MINUTE = 120;
const DEFAULT_PROMO_MUTATION_MAX_PER_MINUTE = 20;
const DEFAULT_PROMO_READ_MAX_PER_MINUTE = 120;
const COMMUNICATION_WINDOW_SECONDS = 60;

const resolvePositiveInteger = (rawValue: string | undefined, fallback: number, max: number) => {
  const parsed = Number.parseInt(String(rawValue || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const mobileCourierMutationLimit = resolvePositiveInteger(
  process.env.MOBILE_COURIER_MUTATION_RATE_LIMIT_PER_MINUTE,
  DEFAULT_MOBILE_COURIER_MUTATION_MAX_PER_MINUTE,
  600
);

const communicationMessageLimit = resolvePositiveInteger(
  process.env.COMMUNICATION_MESSAGE_RATE_LIMIT_PER_MINUTE,
  DEFAULT_COMMUNICATION_MESSAGE_MAX_PER_MINUTE,
  300
);

const communicationCallLimit = resolvePositiveInteger(
  process.env.COMMUNICATION_CALL_RATE_LIMIT_PER_MINUTE,
  DEFAULT_COMMUNICATION_CALL_MAX_PER_MINUTE,
  60
);

const communicationReadLimit = resolvePositiveInteger(
  process.env.COMMUNICATION_READ_RATE_LIMIT_PER_MINUTE,
  DEFAULT_COMMUNICATION_READ_MAX_PER_MINUTE,
  600
);

const promoMutationLimit = resolvePositiveInteger(
  process.env.PROMO_MUTATION_RATE_LIMIT_PER_MINUTE,
  DEFAULT_PROMO_MUTATION_MAX_PER_MINUTE,
  120
);

const promoReadLimit = resolvePositiveInteger(
  process.env.PROMO_READ_RATE_LIMIT_PER_MINUTE,
  DEFAULT_PROMO_READ_MAX_PER_MINUTE,
  600
);

export const toggleRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = req.user.id;
    const key = `rate_limit:toggle:${userId}`;

    // Get current count
    const current = await redis.get(key);
    
    if (current && parseInt(current, 10) >= MAX_TOGGLES_PER_HOUR) {
      res.status(429).json({ 
        error: 'Too Many Requests: Maximum toggle limit reached for this hour' 
      });
      return;
    }

    // Increment and set expiry if it's a new key
    const multi = redis.multi();
    multi.incr(key);
    if (!current) {
      multi.expire(key, WINDOW_SECONDS);
    }
    
    await multi.exec();
    
    next();
  } catch (error) {
    // If redis fails, fail open to avoid blocking ops, but log it
    console.error('Rate limiter error:', error);
    next();
  }
};

export const createMobileCourierMutationRateLimiter = (scope: string) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }

    const key = `rate_limit:mobile_courier:${scope}:${req.user.id}`;
    const current = await redis.get(key);
    const currentCount = current ? Number.parseInt(current, 10) : 0;

    if (Number.isFinite(currentCount) && currentCount >= mobileCourierMutationLimit) {
      res.status(429).json({
        success: false,
        data: {
          limit: mobileCourierMutationLimit,
          window_seconds: MOBILE_COURIER_MUTATION_WINDOW_SECONDS,
        },
        message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
        code: 'ERR_RATE_LIMITED',
      });
      return;
    }

    const multi = redis.multi();
    multi.incr(key);
    if (!current) {
      multi.expire(key, MOBILE_COURIER_MUTATION_WINDOW_SECONDS);
    }

    await multi.exec();
    next();
  } catch (error) {
    console.error('Mobile courier mutation rate limiter error:', error);
    next();
  }
};

const stableKeyPart = (value: unknown) =>
  String(value || 'global')
    .replace(/[^A-Za-z0-9_.:-]/g, '_')
    .slice(0, 80);

export const createAuthenticatedMutationRateLimiter = (
  scope: string,
  limit: number,
  windowSeconds = COMMUNICATION_WINDOW_SECONDS,
) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }

    const actorKey = `rate_limit:authenticated:${stableKeyPart(scope)}:actor:${stableKeyPart(req.user.id)}`;
    const orderKey = `rate_limit:authenticated:${stableKeyPart(scope)}:order:${stableKeyPart(req.user.id)}:${stableKeyPart(req.params.id || req.params.orderId)}`;
    const [actorValue, orderValue] = await redis.mget(actorKey, orderKey);
    const actorCount = actorValue ? Number.parseInt(actorValue, 10) : 0;
    const orderCount = orderValue ? Number.parseInt(orderValue, 10) : 0;

    if ((Number.isFinite(actorCount) && actorCount >= limit) || (Number.isFinite(orderCount) && orderCount >= limit)) {
      res.status(429).json({
        success: false,
        data: {
          limit,
          window_seconds: windowSeconds,
        },
        message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
        code: 'ERR_RATE_LIMITED',
      });
      return;
    }

    const multi = redis.multi();
    multi.incr(actorKey);
    multi.incr(orderKey);
    if (!actorValue) {
      multi.expire(actorKey, windowSeconds);
    }
    if (!orderValue) {
      multi.expire(orderKey, windowSeconds);
    }

    await multi.exec();
    next();
  } catch (error) {
    console.error('Authenticated mutation rate limiter error:', error);
    next();
  }
};

export const courierOfferRateLimiter = createMobileCourierMutationRateLimiter('offer');
export const courierProofRateLimiter = createMobileCourierMutationRateLimiter('proof');
export const courierFaceRateLimiter = createMobileCourierMutationRateLimiter('face');
export const communicationMessageRateLimiter = createAuthenticatedMutationRateLimiter(
  'communication_message',
  communicationMessageLimit,
);
export const communicationCallRateLimiter = createAuthenticatedMutationRateLimiter(
  'communication_call',
  communicationCallLimit,
);
export const communicationReadRateLimiter = createAuthenticatedMutationRateLimiter(
  'communication_read',
  communicationReadLimit,
);
export const promoMutationRateLimiter = createAuthenticatedMutationRateLimiter(
  'promo_mutation',
  promoMutationLimit,
);
export const promoReadRateLimiter = createAuthenticatedMutationRateLimiter(
  'promo_read',
  promoReadLimit,
);
