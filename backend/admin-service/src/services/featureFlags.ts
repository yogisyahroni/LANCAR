import { readDb } from '../db';
import { redis } from '../redis';

export type RuntimeFeatureFlag = {
  key: string;
  is_enabled: boolean;
  config: Record<string, unknown> | null;
};

const cacheKeyForFlag = (key: string) => `flag:${key}`;

const parseCachedFlag = (payload: string | null): RuntimeFeatureFlag | null => {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as RuntimeFeatureFlag;
    if (typeof parsed?.key !== 'string' || typeof parsed?.is_enabled !== 'boolean') {
      return null;
    }

    return {
      key: parsed.key,
      is_enabled: parsed.is_enabled,
      config: parsed.config && typeof parsed.config === 'object' ? parsed.config : null,
    };
  } catch {
    return null;
  }
};

export const getFeatureFlag = async (key: string): Promise<RuntimeFeatureFlag | null> => {
  const cacheKey = cacheKeyForFlag(key);

  try {
    const cached = parseCachedFlag(await redis.get(cacheKey));
    if (cached) return cached;
  } catch {
    // Redis is an optimization only. The database remains the source of truth.
  }

  const result = await readDb.query<RuntimeFeatureFlag>(
    'SELECT key, is_enabled, config FROM feature_flags WHERE key = $1 LIMIT 1',
    [key]
  );

  const flag = result.rows[0] ?? null;
  if (!flag) return null;

  try {
    await redis.set(cacheKey, JSON.stringify(flag), 'EX', 60);
  } catch {
    // Cache write failures must not change feature behavior.
  }

  return flag;
};

export const isFeatureFlagEnabled = async (key: string, defaultValue = false): Promise<boolean> => {
  const flag = await getFeatureFlag(key);
  return flag?.is_enabled ?? defaultValue;
};
