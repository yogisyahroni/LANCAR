import {
  evaluateFeatureFlag,
  isHighBlastRadiusFlag,
  isProtectedFeatureFlag,
  validateFeatureFlagChangeGovernance,
} from './featureFlagEvaluator';

describe('feature flag evaluator', () => {
  const baseContext = {
    actorId: 'customer-123',
    clientType: 'customer' as const,
    appVersionCode: 12,
    marketCode: 'id-jk',
    cityCode: 'jakarta-selatan',
    cohort: 'beta',
    capabilities: ['orders', 'food'],
  };

  it('supports on/off and bounded targeting conditions', () => {
    expect(evaluateFeatureFlag({ key: 'food', is_enabled: true, evaluation_revision: 7, config: {
      mode: 'on', market_codes: ['ID-JK'], city_codes: ['JAKARTA-SELATAN'], cohorts: ['beta'],
      min_app_version_code: 10, required_capabilities: ['food'], variant: 'v2',
    } }, baseContext)).toEqual({
      enabled: true, variant: 'v2', evaluationRevision: 7, reason: 'enabled',
    });
    expect(evaluateFeatureFlag({ key: 'food', is_enabled: true, config: { mode: 'off' } }, baseContext).enabled).toBe(false);
    expect(evaluateFeatureFlag({ key: 'food', is_enabled: true, config: { mode: 'on', cities: ['bandung'] } }, baseContext).reason).toBe('city_mismatch');
  });

  it('uses a stable actor bucket for percentage rollout and fails closed anonymously', () => {
    const flag = { key: 'experiment', is_enabled: true, evaluation_revision: 3, config: { rollout_pct: 50 } };
    const first = evaluateFeatureFlag(flag, baseContext);
    expect(evaluateFeatureFlag(flag, baseContext)).toEqual(first);
    expect(evaluateFeatureFlag(flag, { ...baseContext, actorId: null }).reason).toBe('actor_required_for_rollout');
  });

  it('identifies protected/high-blast flags', () => {
    expect(isProtectedFeatureFlag({ key: 'require_payment_gateway', category: 'feature' })).toBe(true);
    expect(isHighBlastRadiusFlag({ key: 'marketing_banner', category: 'feature', config: { high_blast_radius: true }, require_checklist: false })).toBe(true);
    expect(isHighBlastRadiusFlag({ key: 'safe_banner', category: 'feature', config: {}, require_checklist: false })).toBe(false);
  });

  it('requires elevated approval and a rollback plan for high-blast changes', () => {
    const flag = { key: 'pricing_override', category: 'pricing', config: {}, require_checklist: false };
    expect(validateFeatureFlagChangeGovernance(flag, 'ops_admin', 'disable and monitor')).toEqual({
      allowed: false,
      statusCode: 403,
      error: 'High-blast-radius flags require super_admin or ops_security approval',
    });
    expect(validateFeatureFlagChangeGovernance(flag, 'super_admin', 'too short')).toEqual({
      allowed: false,
      statusCode: 400,
      error: 'Rollback plan must be at least 20 characters for high-blast-radius flags',
    });
    expect(validateFeatureFlagChangeGovernance(flag, 'ops_security', 'disable, verify recovery, monitor')).toEqual({ allowed: true });
    expect(validateFeatureFlagChangeGovernance({ key: 'safe_banner', category: 'feature', config: {}, require_checklist: false }, 'ops_admin', null)).toEqual({ allowed: true });
  });
});
