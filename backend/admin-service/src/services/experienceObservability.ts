import { db, readDb } from '../db';
import { rollbackExperienceManifest } from './experienceConfig';

export const EXPERIENCE_TELEMETRY_EVENT_TYPES = [
  'impression',
  'click',
  'dismiss',
  'manifest_fetch_success',
  'manifest_fetch_failure',
  'manifest_cache_hit',
  'manifest_parse_failure',
  'manifest_schema_fallback',
  'section_render_failure',
  'asset_broken',
  'deeplink_failure',
  'startup_regression',
  'network_regression',
] as const;

export type ExperienceTelemetryEventType = (typeof EXPERIENCE_TELEMETRY_EVENT_TYPES)[number];

export const EXPERIENCE_RELIABILITY_EVENTS = new Set<ExperienceTelemetryEventType>([
  'manifest_fetch_success',
  'manifest_fetch_failure',
  'manifest_cache_hit',
  'manifest_parse_failure',
  'manifest_schema_fallback',
  'section_render_failure',
  'asset_broken',
  'deeplink_failure',
  'startup_regression',
  'network_regression',
]);

export const EXPERIENCE_MARKETING_EVENTS = new Set<ExperienceTelemetryEventType>([
  'impression',
  'click',
  'dismiss',
]);

export const EXPERIENCE_GUARDRAIL_MIN_EVENTS = 20;
export const EXPERIENCE_GUARDRAIL_MAX_FAILURE_RATE_PCT = 10;
export const EXPERIENCE_GUARDRAIL_WINDOW_HOURS = 1;
export const EXPERIENCE_GUARDRAIL_POLICY_KEY = 'experience_guardrail_policy';

export type ExperienceGuardrailPolicy = {
  version: number;
  min_events: number;
  max_failure_rate_pct: number;
  window_hours: number;
  marketing_metrics_excluded: true;
  updated_at: string | null;
  updated_by: string | null;
};

type ExperienceGuardrailPolicyValue = Omit<ExperienceGuardrailPolicy, 'updated_at' | 'updated_by'>;

const DEFAULT_EXPERIENCE_GUARDRAIL_POLICY: ExperienceGuardrailPolicyValue = {
  version: 1,
  min_events: EXPERIENCE_GUARDRAIL_MIN_EVENTS,
  max_failure_rate_pct: EXPERIENCE_GUARDRAIL_MAX_FAILURE_RATE_PCT,
  window_hours: EXPERIENCE_GUARDRAIL_WINDOW_HOURS,
  marketing_metrics_excluded: true,
};

const RELIABILITY_FAILURE_EVENTS = [
  'manifest_fetch_failure',
  'manifest_parse_failure',
  'manifest_schema_fallback',
  'section_render_failure',
  'asset_broken',
  'deeplink_failure',
  'startup_regression',
  'network_regression',
];

const RELIABILITY_TOTAL_EVENTS = [
  'manifest_fetch_success',
  'manifest_cache_hit',
  ...RELIABILITY_FAILURE_EVENTS,
];

const MARKETING_EVENT_TYPES = ['impression', 'click', 'dismiss'];

type QueryResult<T> = { rows: T[] };
type Queryable = { query: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<QueryResult<T>> };

export type ExperienceTelemetryInput = {
  eventId: string;
  eventType: ExperienceTelemetryEventType;
  manifestId?: string | null;
  manifestRevision: number;
  surface: 'customer_android' | 'customer_web';
  component: string;
  campaignId: string;
  sectionId: string;
  marketCode: string;
  appVersion: string;
  latencyMs?: number | null;
  cacheHit?: boolean;
  errorCode?: string | null;
};

export type ExperienceObservabilityFilters = {
  from: Date;
  to: Date;
  manifestId?: string;
  revision?: number;
  marketCode?: string;
  surface?: string;
  appVersion?: string;
};

export type ExperienceObservabilitySummary = {
  window: { from: string; to: string };
  filters: Omit<ExperienceObservabilityFilters, 'from' | 'to'>;
  summary: {
    total_events: number;
    fetch_success: number;
    fetch_failure: number;
    cache_hit: number;
    parse_failure: number;
    schema_fallback: number;
    section_render_failure: number;
    broken_asset: number;
    deeplink_failure: number;
    startup_regression: number;
    network_regression: number;
    reliability_total: number;
    reliability_failures: number;
    reliability_failure_rate_pct: number;
    fetch_latency_avg_ms: number;
    fetch_latency_p95_ms: number;
    impressions: number;
    clicks: number;
    dismissals: number;
  };
  breakdown: Array<{
    manifest_id: string;
    manifest_revision: number;
    market_code: string;
    app_version: string;
    total_events: number;
    reliability_total: number;
    reliability_failures: number;
    reliability_failure_rate_pct: number;
    impressions: number;
    clicks: number;
    dismissals: number;
    fetch_latency_avg_ms: number;
    rollback_target_revision: number | null;
  }>;
  guardrail_policy: ExperienceGuardrailPolicy;
};

const numberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rounded = (value: unknown, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(numberValue(value) * factor) / factor;
};

const filtersFor = (filters: ExperienceObservabilityFilters) => {
  const predicates = [
    `aggregate_type IN ('experience_banner', 'experience_runtime')`,
    `event_type LIKE 'experience.%'`,
    `status <> 'dead'`,
    'occurred_at >= $1',
    'occurred_at < $2',
  ];
  const values: unknown[] = [filters.from, filters.to];
  const add = (predicate: string, value: unknown) => {
    values.push(value);
    predicates.push(predicate.replace('?', `$${values.length}`));
  };
  if (filters.manifestId) add("payload->>'manifest_id' = ?", filters.manifestId);
  if (filters.revision != null) add("NULLIF(payload->>'manifest_revision', '')::integer = ?", filters.revision);
  if (filters.marketCode) add('market_code = ?', filters.marketCode);
  if (filters.surface) add("COALESCE(headers->>'source', payload->>'surface') = ?", filters.surface);
  if (filters.appVersion) add("COALESCE(headers->>'app_version', payload->>'app_version', 'unknown') = ?", filters.appVersion);
  return { where: predicates.join(' AND '), values };
};

const scopedEvents = (where: string) => `
  WITH scoped AS (
    SELECT
      COALESCE(payload->>'event_type', split_part(event_type, '.', 3)) AS metric,
      NULLIF(payload->>'manifest_id', '') AS manifest_id,
      COALESCE(NULLIF(payload->>'manifest_revision', '')::integer, 0) AS manifest_revision,
      market_code,
      COALESCE(headers->>'source', payload->>'surface', 'unknown') AS surface,
      COALESCE(headers->>'app_version', payload->>'app_version', 'unknown') AS app_version,
      COALESCE(NULLIF(payload->>'latency_ms', '')::numeric, 0) AS latency_ms
    FROM event_outbox
    WHERE ${where}
  )`;

const metricCount = (metric: string) => `COUNT(*) FILTER (WHERE metric = '${metric}')`;
const metricList = (metrics: string[]) => metrics.map((metric) => `'${metric}'`).join(', ');

const policyNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  integer = false,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) return fallback;
  return parsed;
};

const policyValue = (value: unknown): ExperienceGuardrailPolicyValue => {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    version: policyNumber(source.version, DEFAULT_EXPERIENCE_GUARDRAIL_POLICY.version, 1, 1_000_000, true),
    min_events: policyNumber(source.min_events, DEFAULT_EXPERIENCE_GUARDRAIL_POLICY.min_events, 1, 1_000_000, true),
    max_failure_rate_pct: policyNumber(source.max_failure_rate_pct, DEFAULT_EXPERIENCE_GUARDRAIL_POLICY.max_failure_rate_pct, 0, 100),
    window_hours: policyNumber(source.window_hours, DEFAULT_EXPERIENCE_GUARDRAIL_POLICY.window_hours, 1, 168),
    // Marketing performance must never be able to suppress a reliability alert.
    marketing_metrics_excluded: true,
  };
};

export const getExperienceGuardrailPolicy = async (
  queryable: Queryable = readDb,
): Promise<ExperienceGuardrailPolicy> => {
  const result = await queryable.query<{
    value: unknown;
    updated_at?: string | Date | null;
    updated_by?: string | null;
  }>(
    'SELECT value, updated_at, updated_by FROM system_configs WHERE key = $1 LIMIT 1',
    [EXPERIENCE_GUARDRAIL_POLICY_KEY],
  );
  const row = result.rows[0];
  const value = policyValue(row?.value);
  return {
    ...value,
    updated_at: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    updated_by: row?.updated_by ? String(row.updated_by) : null,
  };
};

export const updateExperienceGuardrailPolicy = async (
  input: unknown,
  actorId: string,
): Promise<ExperienceGuardrailPolicy> => {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const minEvents = Number(source.min_events);
  const maxFailureRatePct = Number(source.max_failure_rate_pct);
  const windowHours = Number(source.window_hours);
  if (!Number.isInteger(minEvents) || minEvents < 1 || minEvents > 1_000_000) throw new Error('min_events is invalid');
  if (!Number.isFinite(maxFailureRatePct) || maxFailureRatePct < 0 || maxFailureRatePct > 100) throw new Error('max_failure_rate_pct is invalid');
  if (!Number.isFinite(windowHours) || windowHours < 1 || windowHours > 168) throw new Error('window_hours is invalid');

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query<{ value: unknown; updated_at?: string | Date | null; updated_by?: string | null }>(
      'SELECT value, updated_at, updated_by FROM system_configs WHERE key = $1 FOR UPDATE',
      [EXPERIENCE_GUARDRAIL_POLICY_KEY],
    );
    const current = policyValue(currentResult.rows[0]?.value);
    const next: ExperienceGuardrailPolicyValue = {
      version: current.version + 1,
      min_events: minEvents,
      max_failure_rate_pct: maxFailureRatePct,
      window_hours: windowHours,
      marketing_metrics_excluded: true,
    };
    const updatedResult = await client.query<{ value: unknown; updated_at?: string | Date | null; updated_by?: string | null }>(
      `UPDATE system_configs
          SET value = $1::jsonb, updated_by = $2, updated_at = NOW()
        WHERE key = $3
        RETURNING value, updated_at, updated_by`,
      [JSON.stringify(next), actorId, EXPERIENCE_GUARDRAIL_POLICY_KEY],
    );
    if (!updatedResult.rows[0]) throw new Error('Experience guardrail policy is not configured');
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'experience.guardrail_policy.updated', NULL, $2)`,
      [actorId, JSON.stringify({
        key: EXPERIENCE_GUARDRAIL_POLICY_KEY,
        before: current,
        after: next,
        marketing_metrics_excluded: true,
      })],
    );
    await client.query('COMMIT');
    const updated = updatedResult.rows[0];
    return {
      ...next,
      updated_at: updated.updated_at ? new Date(updated.updated_at).toISOString() : null,
      updated_by: updated.updated_by ? String(updated.updated_by) : actorId,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const summaryQuery = (where: string) => `${scopedEvents(where)}
  SELECT
    COUNT(*) AS total_events,
    ${metricCount('manifest_fetch_success')} AS fetch_success,
    ${metricCount('manifest_fetch_failure')} AS fetch_failure,
    ${metricCount('manifest_cache_hit')} AS cache_hit,
    ${metricCount('manifest_parse_failure')} AS parse_failure,
    ${metricCount('manifest_schema_fallback')} AS schema_fallback,
    ${metricCount('section_render_failure')} AS section_render_failure,
    ${metricCount('asset_broken')} AS broken_asset,
    ${metricCount('deeplink_failure')} AS deeplink_failure,
    ${metricCount('startup_regression')} AS startup_regression,
    ${metricCount('network_regression')} AS network_regression,
    COUNT(*) FILTER (WHERE metric IN (${metricList(RELIABILITY_TOTAL_EVENTS)})) AS reliability_total,
    COUNT(*) FILTER (WHERE metric IN (${metricList(RELIABILITY_FAILURE_EVENTS)})) AS reliability_failures,
    COALESCE(AVG(latency_ms) FILTER (WHERE metric = 'manifest_fetch_success'), 0) AS fetch_latency_avg_ms,
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE metric = 'manifest_fetch_success'), 0) AS fetch_latency_p95_ms,
    ${metricCount('impression')} AS impressions,
    ${metricCount('click')} AS clicks,
    ${metricCount('dismiss')} AS dismissals,
    COUNT(*) FILTER (WHERE metric IN (${metricList(MARKETING_EVENT_TYPES)})) AS marketing_events
  FROM scoped`;

const breakdownQuery = (where: string) => `${scopedEvents(where)}
  SELECT
    COALESCE(manifest_id, 'unknown') AS manifest_id,
    manifest_revision,
    market_code,
    app_version,
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE metric IN (${metricList(RELIABILITY_TOTAL_EVENTS)})) AS reliability_total,
    COUNT(*) FILTER (WHERE metric IN (${metricList(RELIABILITY_FAILURE_EVENTS)})) AS reliability_failures,
    COUNT(*) FILTER (WHERE metric = 'impression') AS impressions,
    COUNT(*) FILTER (WHERE metric = 'click') AS clicks,
    COUNT(*) FILTER (WHERE metric = 'dismiss') AS dismissals,
    COALESCE(AVG(latency_ms) FILTER (WHERE metric = 'manifest_fetch_success'), 0) AS fetch_latency_avg_ms,
    (
      SELECT MAX(previous.revision)
        FROM experience_manifest_revisions previous
       WHERE previous.manifest_id = scoped.manifest_id
         AND previous.revision < scoped.manifest_revision
         AND previous.state IN ('superseded', 'rolled_back')
         AND previous.market_code = scoped.market_code
         AND previous.surface = scoped.surface
         AND previous.kill_switch_active = FALSE
    ) AS rollback_target_revision
  FROM scoped
  GROUP BY manifest_id, manifest_revision, market_code, surface, app_version
  ORDER BY reliability_failures DESC, total_events DESC, manifest_id, manifest_revision
  LIMIT 500`;

const failureRate = (total: number, failures: number): number =>
  total > 0 ? rounded((failures / total) * 100) : 0;

export const getExperienceObservability = async (
  filters: ExperienceObservabilityFilters,
  queryable: Queryable = readDb,
): Promise<ExperienceObservabilitySummary> => {
  const { where, values } = filtersFor(filters);
  const [summaryResult, breakdownResult, guardrailPolicy] = await Promise.all([
    queryable.query<Record<string, unknown>>(summaryQuery(where), values),
    queryable.query<Record<string, unknown>>(breakdownQuery(where), values),
    getExperienceGuardrailPolicy(queryable),
  ]);
  const row = summaryResult.rows[0] || {};
  const total = numberValue(row.reliability_total);
  const failures = numberValue(row.reliability_failures);
  return {
    window: { from: filters.from.toISOString(), to: filters.to.toISOString() },
    filters: {
      ...(filters.manifestId ? { manifestId: filters.manifestId } : {}),
      ...(filters.revision != null ? { revision: filters.revision } : {}),
      ...(filters.marketCode ? { marketCode: filters.marketCode } : {}),
      ...(filters.surface ? { surface: filters.surface } : {}),
      ...(filters.appVersion ? { appVersion: filters.appVersion } : {}),
    },
    summary: {
      total_events: numberValue(row.total_events),
      fetch_success: numberValue(row.fetch_success),
      fetch_failure: numberValue(row.fetch_failure),
      cache_hit: numberValue(row.cache_hit),
      parse_failure: numberValue(row.parse_failure),
      schema_fallback: numberValue(row.schema_fallback),
      section_render_failure: numberValue(row.section_render_failure),
      broken_asset: numberValue(row.broken_asset),
      deeplink_failure: numberValue(row.deeplink_failure),
      startup_regression: numberValue(row.startup_regression),
      network_regression: numberValue(row.network_regression),
      reliability_total: total,
      reliability_failures: failures,
      reliability_failure_rate_pct: failureRate(total, failures),
      fetch_latency_avg_ms: rounded(row.fetch_latency_avg_ms),
      fetch_latency_p95_ms: rounded(row.fetch_latency_p95_ms),
      impressions: numberValue(row.impressions),
      clicks: numberValue(row.clicks),
      dismissals: numberValue(row.dismissals),
    },
    breakdown: breakdownResult.rows.map((breakdown) => {
      const breakdownTotal = numberValue(breakdown.reliability_total);
      const breakdownFailures = numberValue(breakdown.reliability_failures);
      return {
        manifest_id: String(breakdown.manifest_id),
        manifest_revision: numberValue(breakdown.manifest_revision),
        market_code: String(breakdown.market_code),
        app_version: String(breakdown.app_version),
        total_events: numberValue(breakdown.total_events),
        reliability_total: breakdownTotal,
        reliability_failures: breakdownFailures,
        reliability_failure_rate_pct: failureRate(breakdownTotal, breakdownFailures),
        impressions: numberValue(breakdown.impressions),
        clicks: numberValue(breakdown.clicks),
        dismissals: numberValue(breakdown.dismissals),
        fetch_latency_avg_ms: rounded(breakdown.fetch_latency_avg_ms),
        rollback_target_revision: breakdown.rollback_target_revision == null ? null : numberValue(breakdown.rollback_target_revision),
      };
    }),
    guardrail_policy: guardrailPolicy,
  };
};

export type ExperienceGuardrailEvaluation = {
  manifest_id: string;
  revision: number;
  evaluated: boolean;
  tripped: boolean;
  reliability_total: number;
  reliability_failures: number;
  failure_rate_pct: number;
  policy_version: number;
  min_events: number;
  max_failure_rate_pct: number;
  window_hours: number;
  action: 'none' | 'manual_rollback_required' | 'auto_rollback';
  rollback_target_revision: number | null;
  rolled_back_revision: number | null;
  reason: string | null;
};

const SYSTEM_GUARDRAIL_ACTOR = '00000000-0000-4000-8000-000000000000';

export const isReliabilityTelemetry = (eventType: ExperienceTelemetryEventType): boolean =>
  EXPERIENCE_RELIABILITY_EVENTS.has(eventType);

export const evaluateExperienceGuardrail = async (
  manifestId: string,
  correlationId: string | null,
  queryable: Queryable = db,
): Promise<ExperienceGuardrailEvaluation> => {
  const policy = await getExperienceGuardrailPolicy(queryable);
  const currentResult = await queryable.query<{
    manifest_id: string;
    revision: number;
    requires_approval: boolean;
    previous_revision: number | null;
  }>(
    `SELECT current.manifest_id,
            current.revision,
            current.requires_approval,
            (SELECT MAX(previous.revision)
               FROM experience_manifest_revisions previous
              WHERE previous.manifest_id = current.manifest_id
                AND previous.revision < current.revision
                AND previous.state IN ('superseded', 'rolled_back')) AS previous_revision
       FROM experience_manifest_revisions current
      WHERE current.manifest_id = $1
        AND current.state = 'published'
      LIMIT 1`,
    [manifestId],
  );
  const current = currentResult.rows[0];
  if (!current) {
    return {
      manifest_id: manifestId,
      revision: 0,
      evaluated: false,
      tripped: false,
      reliability_total: 0,
      reliability_failures: 0,
      failure_rate_pct: 0,
      policy_version: policy.version,
      min_events: policy.min_events,
      max_failure_rate_pct: policy.max_failure_rate_pct,
      window_hours: policy.window_hours,
      action: 'none',
      rollback_target_revision: null,
      rolled_back_revision: null,
      reason: 'no_published_revision',
    };
  }

  const eventResult = await queryable.query<{ reliability_total: number; reliability_failures: number }>(
    `WITH scoped AS (
       SELECT COALESCE(payload->>'event_type', split_part(event_type, '.', 3)) AS metric
         FROM event_outbox
        WHERE aggregate_type IN ('experience_banner', 'experience_runtime')
          AND event_type LIKE 'experience.%'
          AND status <> 'dead'
          AND occurred_at >= NOW() - ($3 * INTERVAL '1 hour')
          AND payload->>'manifest_id' = $1
          AND NULLIF(payload->>'manifest_revision', '')::integer = $2
     )
     SELECT COUNT(*) FILTER (WHERE metric IN (${metricList(RELIABILITY_TOTAL_EVENTS)})) AS reliability_total,
            COUNT(*) FILTER (WHERE metric IN (${metricList(RELIABILITY_FAILURE_EVENTS)})) AS reliability_failures
       FROM scoped`,
    [manifestId, current.revision, policy.window_hours],
  );
  const reliabilityTotal = numberValue(eventResult.rows[0]?.reliability_total);
  const reliabilityFailures = numberValue(eventResult.rows[0]?.reliability_failures);
  const rate = failureRate(reliabilityTotal, reliabilityFailures);
  const tripped = reliabilityTotal >= policy.min_events
    && rate >= policy.max_failure_rate_pct;
  const base = {
    manifest_id: manifestId,
    revision: Number(current.revision),
    evaluated: true,
    tripped,
    reliability_total: reliabilityTotal,
    reliability_failures: reliabilityFailures,
    failure_rate_pct: rate,
    policy_version: policy.version,
    min_events: policy.min_events,
    max_failure_rate_pct: policy.max_failure_rate_pct,
    window_hours: policy.window_hours,
    rollback_target_revision: current.previous_revision == null ? null : Number(current.previous_revision),
    rolled_back_revision: null,
    action: 'none' as const,
    reason: tripped ? `Reliability failure rate ${rate}% exceeded ${policy.max_failure_rate_pct}%` : null,
  };
  if (!tripped) return base;
  if (current.previous_revision == null) {
    return { ...base, action: 'manual_rollback_required', reason: `${base.reason}; no historical revision is available` };
  }
  if (!current.requires_approval) {
    return { ...base, action: 'manual_rollback_required' };
  }

  const rolledBack = await rollbackExperienceManifest(
    manifestId,
    current.previous_revision,
    SYSTEM_GUARDRAIL_ACTOR,
    `${base.reason}; automated high-impact guardrail rollback`,
    correlationId,
  );
  return {
    ...base,
    action: 'auto_rollback',
    rolled_back_revision: rolledBack.revision,
  };
};
