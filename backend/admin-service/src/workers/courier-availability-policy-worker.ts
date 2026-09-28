import { db } from '../db';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };

export type AvailabilityPolicyQueryable = {
  query<T = any>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
};

export type AvailabilityPolicyTickResult = {
  staleAfterSeconds: number;
  transitioned: number;
};

let started = false;
let running = false;

const workerId = `${process.env.HOSTNAME || 'admin-service'}:${process.pid}:courier-availability-policy`;
const DEFAULT_COURIER_PRESENCE_STALE_AFTER_SECONDS = 600;

const structuredLog = (
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
) => {
  console[level](JSON.stringify({ level, event, worker_id: workerId, ...fields }));
};

const resolvePositiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveConfiguredStaleAfterSeconds = async (
  queryable: AvailabilityPolicyQueryable,
): Promise<number> => {
  const envOverride = process.env.COURIER_AVAILABILITY_STALE_AFTER_SECONDS;
  if (envOverride) {
    return resolvePositiveInt(envOverride, DEFAULT_COURIER_PRESENCE_STALE_AFTER_SECONDS);
  }

  try {
    const result = await queryable.query<{ stale_after_seconds: number }>(
      'SELECT courier_presence_stale_after_seconds()::int AS stale_after_seconds',
    );
    return resolvePositiveInt(
      String(result.rows[0]?.stale_after_seconds || ''),
      DEFAULT_COURIER_PRESENCE_STALE_AFTER_SECONDS,
    );
  } catch (error) {
    structuredLog('warn', 'courier_availability_config_read_failed', {
      message: error instanceof Error ? error.message : String(error),
      fallback_stale_after_seconds: DEFAULT_COURIER_PRESENCE_STALE_AFTER_SECONDS,
    });
    return DEFAULT_COURIER_PRESENCE_STALE_AFTER_SECONDS;
  }
};

export const runCourierAvailabilityPolicyTick = async (
  queryable: AvailabilityPolicyQueryable = db,
  staleAfterSeconds?: number,
): Promise<AvailabilityPolicyTickResult> => {
  const effectiveStaleAfterSeconds = staleAfterSeconds && staleAfterSeconds > 0
    ? staleAfterSeconds
    : await resolveConfiguredStaleAfterSeconds(queryable);
  const result = await queryable.query<{ transitioned: number }>(
    'SELECT mark_stale_couriers_unavailable($1)::int AS transitioned',
    [effectiveStaleAfterSeconds],
  );
  const transitioned = Number(result.rows[0]?.transitioned || 0);
  if (transitioned > 0) {
    structuredLog('warn', 'courier_availability_stale_transition', {
      transitioned,
      stale_after_seconds: effectiveStaleAfterSeconds,
    });
  }
  return { staleAfterSeconds: effectiveStaleAfterSeconds, transitioned };
};

export const startCourierAvailabilityPolicyWorker = () => {
  if (started) return;
  started = true;

  if (process.env.COURIER_AVAILABILITY_POLICY_WORKER_ENABLED === 'false') {
    structuredLog('info', 'courier_availability_policy_worker_disabled', {});
    return;
  }

  const intervalMs = Math.max(
    15_000,
    resolvePositiveInt(process.env.COURIER_AVAILABILITY_POLICY_INTERVAL_MS, 30_000),
  );

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runCourierAvailabilityPolicyTick();
    } catch (error) {
      structuredLog('error', 'courier_availability_policy_worker_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  setTimeout(tick, Math.min(intervalMs, 10_000)).unref();
  setInterval(tick, intervalMs).unref();
  structuredLog('info', 'courier_availability_policy_worker_started', {
    interval_ms: intervalMs,
    stale_after_seconds_source: process.env.COURIER_AVAILABILITY_STALE_AFTER_SECONDS
      ? 'env_override'
      : 'system_configs',
  });
};
