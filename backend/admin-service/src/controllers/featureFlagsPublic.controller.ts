import { Request, Response } from 'express';
import { readDb } from '../db';
import { redis } from '../redis';
import {
  compatibilityResponse,
  getClientCompatibilityPolicy,
  isDynamicFeatureSupported,
  readClientCompatibility,
  type SupportedClientType,
} from '../services/clientCompatibility';

type PublicFlagEntry = { enabled: boolean; variant?: string };

const CACHE_TTL_SECONDS = 30;

const cacheKeyForPortal = (portal: 'web' | 'mobile') => `flags:public:v2:${portal}`;

export const shapeEnabledFlags = (
  rows: Array<{ key: string; config: unknown }>,
  compatibility: ReturnType<typeof readClientCompatibility>,
): Record<string, PublicFlagEntry> => {
  const flags: Record<string, PublicFlagEntry> = {};
  for (const row of rows) {
    const config =
      row.config && typeof row.config === 'object' && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {};
    if (!isDynamicFeatureSupported(config, compatibility)) continue;
    const variant = typeof config.variant === 'string' ? config.variant : undefined;
    flags[row.key] = variant ? { enabled: true, variant } : { enabled: true };
  }
  return flags;
};

const loadEnabledFlags = async (
  portal: 'web' | 'mobile',
): Promise<Array<{ key: string; config: unknown }>> => {
  const cacheKey = cacheKeyForPortal(portal);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed as Array<{ key: string; config: unknown }>;
    }
  } catch {
    // Redis is an optimization only. The database remains the source of truth.
  }

  const result = await readDb.query<{ key: string; config: unknown }>(
    'SELECT key, config FROM feature_flags WHERE is_enabled = TRUE ORDER BY key ASC',
  );

  const rows = result.rows;

  try {
    await redis.set(cacheKey, JSON.stringify(rows), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // Cache write failures must not change feature behavior.
  }

  return rows;
};

const respondWithFlags = async (req: Request, res: Response, portal: 'web' | 'mobile') => {
  try {
    const compatibility = readClientCompatibility(req.headers, portal === 'web' ? 'web' : undefined);
    const clientType: SupportedClientType = portal === 'web'
      ? 'web'
      : compatibility.clientType && compatibility.clientType !== 'web'
        ? compatibility.clientType
        : 'customer';
    const rows = await loadEnabledFlags(portal);
    const flags = shapeEnabledFlags(rows, compatibility);
    // Read-only + cache-friendly so clients can poll cheaply behind CDNs.
    res.setHeader('Cache-Control', `private, max-age=${CACHE_TTL_SECONDS}`);
    res.setHeader('Vary', 'X-App-Type, X-App-Version-Code, X-App-Schema-Version, X-App-Capabilities');
    res.json({
      success: true,
      data: {
        flags,
        compatibility: compatibilityResponse(compatibility, getClientCompatibilityPolicy(clientType)),
      },
      message: 'Feature flags fetched',
    });
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
