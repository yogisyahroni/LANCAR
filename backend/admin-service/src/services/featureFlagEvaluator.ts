import { createHash } from 'crypto';
import type { SupportedClientType } from './clientCompatibility';

export type FeatureFlagEvaluationContext = {
  actorId?: string | null;
  clientType?: SupportedClientType | null;
  appVersionCode?: number | null;
  marketCode?: string | null;
  cityCode?: string | null;
  cohort?: string | null;
  capabilities?: string[];
};

export type EvaluatableFeatureFlag = {
  key: string;
  is_enabled?: boolean;
  config?: unknown;
  category?: string | null;
  require_checklist?: boolean;
  evaluation_revision?: number | string | null;
};

export type FeatureFlagEvaluation = {
  enabled: boolean;
  variant?: string;
  evaluationRevision: number;
  reason: string;
};

export type FeatureFlagChangeGovernance = {
  allowed: boolean;
  statusCode?: 400 | 403;
  error?: string;
};

const PROTECTED_FLAG_KEYS = new Set([
  'require_payment_gateway',
  'dynamic_pricing_peak_hour',
  'dynamic_pricing_demand_supply',
  'multi_zone_courier',
  'model_p2p',
  'model_two_legs',
  'model_three_legs',
  'three_legs_relay',
]);

const PROTECTED_CATEGORIES = new Set([
  'authorization',
  'financial',
  'payment',
  'pricing',
  'risk',
  'routing',
  'security',
  'settlement',
  'system',
]);

const HIGH_BLAST_ROLES = new Set(['super_admin', 'ops_security']);
export const MIN_ROLLBACK_PLAN_LENGTH = 20;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const normalize = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized : null;
};

const configuredValues = (config: Record<string, unknown>, keys: string[]): string[] | null => {
  const key = keys.find((candidate) => Object.prototype.hasOwnProperty.call(config, candidate));
  if (!key) return null;
  const raw = config[key];
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return values.map(normalize).filter((value): value is string => Boolean(value)).slice(0, 100);
};

const matchesConfiguredValues = (
  config: Record<string, unknown>,
  keys: string[],
  actual: string | null,
): boolean => {
  const configured = configuredValues(config, keys);
  if (!configured) return true;
  return Boolean(actual && (configured.includes('*') || configured.includes(actual.toLowerCase())));
};

const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
};

const integerValue = (value: unknown): number | null => {
  const parsed = numberValue(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
};

const revisionValue = (value: unknown): number => {
  const revision = integerValue(value);
  return revision !== null && revision > 0 ? revision : 1;
};

const stableBucket = (key: string, actorId: string): number => {
  const digest = createHash('sha256').update(`${key}:${actorId}`).digest();
  const value = digest.readUInt32BE(0);
  return (value / 0x1_0000_0000) * 100;
};

const matchesContext = (
  config: Record<string, unknown>,
  context: FeatureFlagEvaluationContext,
): string | null => {
  if (!matchesConfiguredValues(config, ['client_types', 'clientTypes'], context.clientType ?? null)) {
    return 'client_type_mismatch';
  }
  if (!matchesConfiguredValues(config, ['market_codes', 'markets', 'market_code'], context.marketCode ?? null)) {
    return 'market_mismatch';
  }
  if (!matchesConfiguredValues(config, ['city_codes', 'cities', 'city_code'], context.cityCode ?? null)) {
    return 'city_mismatch';
  }
  if (!matchesConfiguredValues(config, ['cohorts', 'cohort'], context.cohort ?? null)) {
    return 'cohort_mismatch';
  }

  const minimumVersion = integerValue(config.min_app_version_code);
  if (minimumVersion !== null && (context.appVersionCode ?? 0) < minimumVersion) {
    return 'minimum_app_version_not_met';
  }
  const maximumVersion = integerValue(config.max_app_version_code);
  if (maximumVersion !== null && (context.appVersionCode ?? Number.MAX_SAFE_INTEGER) > maximumVersion) {
    return 'maximum_app_version_exceeded';
  }

  const requiredCapabilities = configuredValues(config, ['required_capabilities']);
  if (requiredCapabilities && !requiredCapabilities.every((capability) =>
    (context.capabilities ?? []).map((value) => value.toLowerCase()).includes(capability))) {
    return 'required_capability_missing';
  }

  return null;
};

export const isProtectedFeatureFlag = (flag: Pick<EvaluatableFeatureFlag, 'key' | 'category'>): boolean =>
  PROTECTED_FLAG_KEYS.has(flag.key) || PROTECTED_CATEGORIES.has((flag.category || '').trim().toLowerCase());

export const isHighBlastRadiusFlag = (
  flag: Pick<EvaluatableFeatureFlag, 'key' | 'category' | 'config' | 'require_checklist'>,
): boolean => {
  const config = asRecord(flag.config);
  return Boolean(
    flag.require_checklist ||
    config.high_blast_radius === true ||
    isProtectedFeatureFlag(flag),
  );
};

export const hasElevatedFeatureFlagRole = (role: unknown): boolean =>
  typeof role === 'string' && HIGH_BLAST_ROLES.has(role);

export const validateFeatureFlagChangeGovernance = (
  flag: Pick<EvaluatableFeatureFlag, 'key' | 'category' | 'config' | 'require_checklist'>,
  role: unknown,
  rollbackPlan: unknown,
): FeatureFlagChangeGovernance => {
  if (!isHighBlastRadiusFlag(flag)) return { allowed: true };

  if (!hasElevatedFeatureFlagRole(role)) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'High-blast-radius flags require super_admin or ops_security approval',
    };
  }

  if (typeof rollbackPlan !== 'string' || rollbackPlan.trim().length < MIN_ROLLBACK_PLAN_LENGTH) {
    return {
      allowed: false,
      statusCode: 400,
      error: `Rollback plan must be at least ${MIN_ROLLBACK_PLAN_LENGTH} characters for high-blast-radius flags`,
    };
  }

  return { allowed: true };
};

export const evaluateFeatureFlag = (
  flag: EvaluatableFeatureFlag,
  context: FeatureFlagEvaluationContext = {},
): FeatureFlagEvaluation => {
  const revision = revisionValue(flag.evaluation_revision);
  if (flag.is_enabled === false) {
    return { enabled: false, evaluationRevision: revision, reason: 'flag_off' };
  }

  const config = asRecord(flag.config);
  const contextMismatch = matchesContext(config, context);
  if (contextMismatch) {
    return { enabled: false, evaluationRevision: revision, reason: contextMismatch };
  }

  const mode = normalize(config.mode) || (Object.prototype.hasOwnProperty.call(config, 'rollout_pct') ? 'percentage' : 'on');
  if (mode === 'off') {
    return { enabled: false, evaluationRevision: revision, reason: 'config_off' };
  }
  if (mode !== 'on' && mode !== 'percentage') {
    return { enabled: false, evaluationRevision: revision, reason: 'invalid_mode' };
  }

  if (mode === 'percentage') {
    const rollout = numberValue(config.rollout_pct);
    if (rollout === null || rollout < 0 || rollout > 100) {
      return { enabled: false, evaluationRevision: revision, reason: 'invalid_rollout' };
    }
    if (rollout <= 0) return { enabled: false, evaluationRevision: revision, reason: 'rollout_excluded' };
    if (rollout < 100 && !context.actorId) {
      return { enabled: false, evaluationRevision: revision, reason: 'actor_required_for_rollout' };
    }
    if (rollout < 100 && stableBucket(flag.key, context.actorId as string) >= rollout) {
      return { enabled: false, evaluationRevision: revision, reason: 'rollout_excluded' };
    }
  }

  const variant = typeof config.variant === 'string' && config.variant.trim()
    ? config.variant.trim()
    : undefined;
  return {
    enabled: true,
    ...(variant ? { variant } : {}),
    evaluationRevision: revision,
    reason: mode === 'percentage' ? 'rollout_included' : 'enabled',
  };
};
