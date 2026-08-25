import { Request, Response } from 'express';
import { readDb } from '../db';
import { redis } from '../redis';

type PublicFlagEntry = { enabled: boolean; variant?: string };

const CACHE_TTL_SECONDS = 30;

const cacheKeyForPortal = (portal: 'web' | 'mobile') => `flags:public:${portal}`;

const shapeEnabledFlags = (
  rows: Array<{ key: string; config: unknown }>,
): Record<string, PublicFlagEntry> => {
  const flags: Record<string, PublicFlagEntry> = {};
  for (const row of rows) {
    const config =
      row.config && typeof row.config === 'object' && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {};
    const variant = typeof config.variant === 'string' ? config.variant : undefined;
    flags[row.key] = variant ? { enabled: true, variant } : { enabled: true };
  }
  return flags;
};

const loadEnabledFlags = async (
  portal: 'web' | 'mobile',
): Promise<Record<string, PublicFlagEntry>> => {
  const cacheKey = cacheKeyForPortal(portal);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, PublicFlagEntry>;
      }
    }
  } catch {
    // Redis is an optimization only. The database remains the source of truth.
  }

  const result = await readDb.query<{ key: string; config: unknown }>(
    'SELECT key, config FROM feature_flags WHERE is_enabled = TRUE ORDER BY key ASC',
  );

  const shaped = shapeEnabledFlags(result.rows);

  try {
    await redis.set(cacheKey, JSON.stringify(shaped), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // Cache write failures must not change feature behavior.
  }

  return shaped;
};

const respondWithFlags = async (req: Request, res: Response, portal: 'web' | 'mobile') => {
  try {
    const flags = await loadEnabledFlags(portal);
    // Read-only + cache-friendly so clients can poll cheaply behind CDNs.
    res.setHeader('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
    res.json({ success: true, data: { flags }, message: 'Feature flags fetched' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};

export const getWebFeatureFlags = async (req: Request, res: Response): Promise<void> => {
  await respondWithFlags(req, res, 'web');
};

export const getMobileFeatureFlags = async (req: Request, res: Response): Promise<void> => {
  await respondWithFlags(req, res, 'mobile');
};
