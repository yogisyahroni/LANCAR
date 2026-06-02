import { Request, Response, NextFunction } from 'express';
import { redis } from './redis';

const MAX_TOGGLES_PER_HOUR = 10;
const WINDOW_SECONDS = 3600; // 1 hour
const DEFAULT_MOBILE_COURIER_MUTATION_MAX_PER_MINUTE = 60;
const MOBILE_COURIER_MUTATION_WINDOW_SECONDS = 60;

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

export const courierOfferRateLimiter = createMobileCourierMutationRateLimiter('offer');
export const courierProofRateLimiter = createMobileCourierMutationRateLimiter('proof');
export const courierFaceRateLimiter = createMobileCourierMutationRateLimiter('face');
