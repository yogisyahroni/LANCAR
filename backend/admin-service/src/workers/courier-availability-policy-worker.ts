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

export const runCourierAvailabilityPolicyTick = async (
  queryable: AvailabilityPolicyQueryable = db,
  staleAfterSeconds = resolvePositiveInt(process.env.COURIER_AVAILABILITY_STALE_AFTER_SECONDS, 120),
): Promise<AvailabilityPolicyTickResult> => {
  const result = await queryable.query<{ transitioned: number }>(
    'SELECT mark_stale_couriers_unavailable($1)::int AS transitioned',
    [staleAfterSeconds],
  );
  const transitioned = Number(result.rows[0]?.transitioned || 0);
  if (transitioned > 0) {
    structuredLog('warn', 'courier_availability_stale_transition', {
      transitioned,
      stale_after_seconds: staleAfterSeconds,
    });
  }
  return { staleAfterSeconds, transitioned };
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
    stale_after_seconds: resolvePositiveInt(process.env.COURIER_AVAILABILITY_STALE_AFTER_SECONDS, 120),
  });
};
