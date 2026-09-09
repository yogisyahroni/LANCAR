import { NextFunction, Request, Response } from 'express';
import { db } from '../db';
import { securityLog } from '../security/logRedaction';

export const EXPERIENCE_PERMISSIONS = {
  read: 'experience.read',
  draftWrite: 'experience.draft.write',
  assetWrite: 'experience.asset.write',
  targetingWrite: 'experience.targeting.write',
  guardrailWrite: 'experience.guardrail.write',
  featureFlagWrite: 'experience.feature_flag.write',
  killSwitchExecute: 'experience.kill_switch.execute',
  submitApproval: 'experience.submit_approval',
  approve: 'experience.approve',
  publish: 'experience.publish',
  rollback: 'experience.rollback',
  globalPublish: 'experience.global.publish',
  versionPolicyWrite: 'experience.version_policy.write',
} as const;

export type ExperiencePermission = (typeof EXPERIENCE_PERMISSIONS)[keyof typeof EXPERIENCE_PERMISSIONS];
type ExperienceSurface = '*' | 'customer_android' | 'customer_web' | 'merchant_android' | 'courier_android';
type TargetKind = 'query' | 'body' | 'manifest' | 'manifest-body' | 'global' | 'mobile-policy';

type Target = {
  marketCode: string;
  surface: ExperienceSurface;
  manifestId?: string;
};

type AuthorizationOptions = {
  target?: TargetKind;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MARKET_CODE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const SURFACES = new Set<ExperienceSurface>([
  '*', 'customer_android', 'customer_web', 'merchant_android', 'courier_android',
]);

const stringValue = (value: unknown): string | undefined => {
  if (Array.isArray(value) || typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
};

const requestId = (req: Request, res: Response) =>
  (res.locals.requestId as string | undefined)
  || (typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null);

const correlationId = (req: Request, res: Response) =>
  (res.locals.correlationId as string | undefined)
  || (typeof req.headers['x-correlation-id'] === 'string' ? req.headers['x-correlation-id'] : null);

const targetFromValues = (marketCode: unknown, surface: unknown, manifestId?: string): Target | null => {
  const market = stringValue(marketCode);
  const normalizedSurface = (stringValue(surface) || '*') as ExperienceSurface;
  if ((!market || (market !== '*' && !MARKET_CODE.test(market))) || !SURFACES.has(normalizedSurface)) return null;
  if (market === '*' && normalizedSurface !== '*') return null;
  return { marketCode: market, surface: normalizedSurface, ...(manifestId ? { manifestId } : {}) };
};

const manifestTarget = async (manifestId: string): Promise<Target | null> => {
  if (!UUID.test(manifestId)) return null;
  const result = await db.query<{ market_code: string; surface: ExperienceSurface }>(
    `SELECT market_code, surface
       FROM experience_manifest_revisions
      WHERE manifest_id = $1
      ORDER BY revision DESC
      LIMIT 1`,
    [manifestId],
  );
  const row = result.rows[0];
  return row ? targetFromValues(row.market_code, row.surface, manifestId) : null;
};

const resolveTarget = async (req: Request, kind: TargetKind): Promise<Target | null> => {
  if (kind === 'global') return { marketCode: '*', surface: '*' };

  if (kind === 'manifest') {
    const manifestId = stringValue(req.params?.manifestId);
    return manifestId ? manifestTarget(manifestId) : null;
  }

  if (kind === 'mobile-policy') {
    return targetFromValues(req.params?.marketCode || req.query?.market_code, '*');
  }

  const source = kind === 'body' ? req.body : req.query;
  const body = source && typeof source === 'object' && !Array.isArray(source)
    ? source as Record<string, unknown>
    : {};
  return targetFromValues(
    body.market_code || body.marketCode || req.params?.marketCode,
    body.surface || req.query?.surface,
  );
};

const resolveTargets = async (req: Request, kind: TargetKind): Promise<Target[]> => {
  if (kind !== 'manifest-body') {
    const target = await resolveTarget(req, kind);
    return target ? [target] : [];
  }

  const manifestId = stringValue(req.params?.manifestId);
  const current = manifestId ? await manifestTarget(manifestId) : null;
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
  const requested = targetFromValues(body.market_code || body.marketCode, body.surface, manifestId || undefined);
  return [current, requested].filter((target): target is Target => Boolean(target));
};

const denied = async (
  req: Request,
  res: Response,
  permission: ExperiencePermission,
  reasonCode: string,
  message: string,
  target: Target | null,
): Promise<void> => {
  const payload = {
    request_id: requestId(req, res),
    correlation_id: correlationId(req, res),
    method: req.method,
    path: req.originalUrl || req.url,
    actor_role: req.user?.role || null,
    permission,
    reason_code: reasonCode,
    market_code: target?.marketCode || null,
    surface: target?.surface || null,
  };

  // audit_logs requires a UUID actor. Gateway/session auth always supplies one
  // in real requests; invalid test identities still get a structured security
  // log rather than a fabricated database audit row.
  if (req.user?.id && UUID.test(req.user.id)) {
    try {
      await db.query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          req.user.id,
          `experience.authorization.denied.${reasonCode.toLowerCase()}`,
          target?.manifestId && UUID.test(target.manifestId) ? target.manifestId : null,
          JSON.stringify(payload),
        ],
      );
    } catch (error) {
      securityLog.error('Failed to write denied Experience authorization audit', {
        request_id: requestId(req, res),
        correlation_id: correlationId(req, res),
        error,
      });
    }
  }

  securityLog.warn('Experience authorization denied', payload);
  res.status(reasonCode === 'EXPERIENCE_AUTHORIZATION_UNAVAILABLE' ? 503 : 403).json({
    success: false,
    code: 'EXPERIENCE_AUTHORIZATION_DENIED',
    reason_code: reasonCode,
    message,
    permission,
    market_code: target?.marketCode || null,
    surface: target?.surface || null,
    request_id: requestId(req, res),
    correlation_id: correlationId(req, res),
  });
};

export const requireExperienceAccess = (
  permission: ExperiencePermission,
  options: AuthorizationOptions = {},
) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let target: Target | null = null;
  try {
    const targets = await resolveTargets(req, options.target || 'query');
    target = targets[0] || null;
    if (targets.length === 0) {
      await denied(
        req, res, permission, 'EXPERIENCE_SCOPE_REQUIRED',
        'An explicit valid market and surface scope is required for this Experience action', target,
      );
      return;
    }

    const permissionResult = await db.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
          WHERE rp.role = $1 AND p.name = $2
       ) AS allowed`,
      [req.user?.role, permission],
    );
    if (!permissionResult.rows[0]?.allowed) {
      await denied(req, res, permission, 'EXPERIENCE_PERMISSION_REQUIRED', `Permission '${permission}' is required`, target);
      return;
    }

    for (const candidate of targets) {
      const scopeResult = await db.query<{ allowed: boolean }>(
        `SELECT EXISTS (
         SELECT 1
           FROM experience_admin_scope_grants
          WHERE ((principal_type = 'user' AND principal_value = $1)
             OR (principal_type = 'role' AND principal_value = $2))
            AND (
              ($3 = '*' AND market_code = '*')
              OR ($3 <> '*' AND market_code IN ($3, '*'))
            )
            AND (
              ($4 = '*' AND surface = '*')
              OR ($4 <> '*' AND surface IN ($4, '*'))
            )
         ) AS allowed`,
        [req.user?.id, req.user?.role, candidate.marketCode, candidate.surface],
      );
      if (!scopeResult.rows[0]?.allowed) {
        await denied(
          req, res, permission, candidate.marketCode === '*' ? 'EXPERIENCE_GLOBAL_SCOPE_REQUIRED' : 'EXPERIENCE_SCOPE_DENIED',
          candidate.marketCode === '*'
            ? 'Explicit global Experience scope is required for this action'
            : `Experience scope '${candidate.marketCode}/${candidate.surface}' is not assigned to this operator`,
          candidate,
        );
        return;
      }
    }

    next();
  } catch (error) {
    securityLog.error('Experience authorization check failed closed', {
      request_id: requestId(req, res),
      correlation_id: correlationId(req, res),
      permission,
      error,
    });
    await denied(
      req, res, permission, 'EXPERIENCE_AUTHORIZATION_UNAVAILABLE',
      'Experience authorization is temporarily unavailable', target,
    );
  }
};
