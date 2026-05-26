import Redis from 'ioredis';

const isProductionRuntime =
  process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

if (!process.env.REDIS_URL && isProductionRuntime) {
  throw new Error('REDIS_URL is required in production');
}

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
