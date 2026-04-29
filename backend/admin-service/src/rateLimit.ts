import { Request, Response, NextFunction } from 'express';
import { redis } from './redis';

const MAX_TOGGLES_PER_HOUR = 10;
const WINDOW_SECONDS = 3600; // 1 hour

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
