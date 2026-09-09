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
import {
  evaluateFeatureFlag,
  isProtectedFeatureFlag,
  type FeatureFlagEvaluationContext,
} from '../services/featureFlagEvaluator';

export type PublicFlagEntry = {
  enabled: boolean;
  variant?: string;
  evaluation_revision: number;
};

const CACHE_TTL_SECONDS = 30;

const cacheKeyForPortal = (portal: 'web' | 'mobile') => `flags:public:v3:${portal}`;

export const shapeEnabledFlags = (
  rows: Array<{
    key: string;
    config: unknown;
    is_enabled?: boolean;
    category?: string | null;
    require_checklist?: boolean;
    evaluation_revision?: number | string | null;
  }>,
  compatibility: ReturnType<typeof readClientCompatibility>,
  context: FeatureFlagEvaluationContext = {},
): Record<string, PublicFlagEntry> => {
  const flags: Record<string, PublicFlagEntry> = {};
  for (const row of rows) {
    const config =
      row.config && typeof row.config === 'object' && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {};
    if (!isDynamicFeatureSupported(config, compatibility)) continue;
    // Financial, security and server-authoritative controls are never
    // client-facing marketing switches. Their state must stay enforced by
    // the owning backend service.
    if (isProtectedFeatureFlag(row)) continue;

    const evaluation = evaluateFeatureFlag({ ...row, config }, {
      ...context,
      clientType: context.clientType ?? compatibility.clientType,
      appVersionCode: context.appVersionCode ?? compatibility.appVersionCode,
      capabilities: context.capabilities ?? compatibility.capabilities,
    });
    if (!evaluation.enabled) continue;

    flags[row.key] = evaluation.variant
      ? { enabled: true, variant: evaluation.variant, evaluation_revision: evaluation.evaluationRevision }
      : { enabled: true, evaluation_revision: evaluation.evaluationRevision };
  }
  return flags;
};

const loadFlags = async (
  portal: 'web' | 'mobile',
): Promise<Array<{
  key: string;
  config: unknown;
  is_enabled: boolean;
  category?: string | null;
  require_checklist?: boolean;
  evaluation_revision?: number | string | null;
}>> => {
  const cacheKey = cacheKeyForPortal(portal);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed as Array<{
        key: string;
        config: unknown;
        is_enabled: boolean;
        category?: string | null;
        require_checklist?: boolean;
        evaluation_revision?: number | string | null;
      }>;
    }
  } catch {
    // Redis is an optimization only. The database remains the source of truth.
  }

  const result = await readDb.query<{
    key: string;
    config: unknown;
    is_enabled: boolean;
    category?: string | null;
    require_checklist?: boolean;
    evaluation_revision?: number | string | null;
  }>(
    'SELECT key, config, is_enabled, category, require_checklist, evaluation_revision FROM feature_flags ORDER BY key ASC',
  );

  const rows = result.rows;

  try {
    await redis.set(cacheKey, JSON.stringify(rows), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // Cache write failures must not change feature behavior.
  }

  return rows;
};

const requestHeader = (req: Request, name: string): string | null => {
  const raw = req.header(name);
  if (!raw) return null;
  const value = raw.trim();
  return /^[a-zA-Z0-9_-]{2,64}$/.test(value) ? value.toLowerCase() : null;
};

const evaluationContextFor = (
  req: Request,
  compatibility: ReturnType<typeof readClientCompatibility>,
): FeatureFlagEvaluationContext => ({
  actorId: req.user?.id ?? null,
  clientType: compatibility.clientType,
  appVersionCode: compatibility.appVersionCode,
  marketCode: requestHeader(req, 'x-market-code'),
  cityCode: requestHeader(req, 'x-city-code'),
  // This header is an experiment assignment only. It is deliberately never
  // used for authorization, pricing, payment or order-state decisions.
  cohort: requestHeader(req, 'x-feature-cohort'),
  capabilities: compatibility.capabilities,
});

const respondWithFlags = async (req: Request, res: Response, portal: 'web' | 'mobile') => {
  try {
    const compatibility = readClientCompatibility(req.headers, portal === 'web' ? 'web' : undefined);
    const clientType: SupportedClientType = portal === 'web'
      ? 'web'
      : compatibility.clientType && compatibility.clientType !== 'web'
        ? compatibility.clientType
        : 'customer';
    const context = evaluationContextFor(req, compatibility);
    const rows = await loadFlags(portal);
    const flags = shapeEnabledFlags(rows, compatibility, context);
    const evaluationRevisions = Object.fromEntries(
      rows.map((row) => [row.key, Number(row.evaluation_revision) > 0 ? Number(row.evaluation_revision) : 1]),
    );
    console.info(JSON.stringify({
      event: 'feature_flag_evaluation',
      client_type: clientType,
      enabled_count: Object.keys(flags).length,
      evaluation_revisions: evaluationRevisions,
    }));
    // Read-only + cache-friendly so clients can poll cheaply behind CDNs.
    res.setHeader('Cache-Control', `private, max-age=${CACHE_TTL_SECONDS}`);
    res.setHeader('Vary', 'X-App-Type, X-App-Version-Code, X-App-Schema-Version, X-App-Capabilities, X-Market-Code, X-City-Code, X-Feature-Cohort');
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
