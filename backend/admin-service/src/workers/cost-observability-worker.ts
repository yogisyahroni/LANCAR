import { db, readDb } from '../db';
import { enqueueOutboxEvent } from '../services/eventOutbox';
import {
  COST_OBSERVABILITY_VERSION,
  costAnomalyPolicyFromEnv,
  evaluateCostAnomalies,
  getCostUsageSnapshot,
} from '../services/costObservability';

let started = false;
let running = false;

const workerId = `${process.env.HOSTNAME || 'admin-service'}:${process.pid}:cost-observability`;

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

const alignedHour = (value: Date): Date => {
  const result = new Date(value);
  result.setUTCMinutes(0, 0, 0);
  return result;
};

export const evaluateCostObservability = async (now = new Date()) => {
  const end = alignedHour(now);
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  const previousStart = new Date(start.getTime() - 60 * 60 * 1000);
  const [current, previous] = await Promise.all([
    getCostUsageSnapshot(start, end, readDb),
    getCostUsageSnapshot(previousStart, start, readDb),
  ]);
  const anomalies = evaluateCostAnomalies(current, previous, costAnomalyPolicyFromEnv());

  for (const anomaly of anomalies) {
    await enqueueOutboxEvent(db, {
      aggregateType: 'finance_cost_observability',
      eventType: 'finance.cost.anomaly',
      eventVersion: 1,
      payload: {
        version: COST_OBSERVABILITY_VERSION,
        window_start: start.toISOString(),
        window_end: end.toISOString(),
        anomaly,
      },
      marketCode: 'id-jk',
      serviceName: 'admin-service',
      actorPseudonymousId: 'system',
      entityId: anomaly.unit_code,
      correlationId: `cost-observability:${start.toISOString()}`,
      traceId: `cost-observability:${start.toISOString()}`,
      piiClassification: 'internal',
      fieldPiiClassification: { payload: 'internal' },
      retentionClass: 'financial',
      dedupeKey: `finance.cost.anomaly:${anomaly.unit_code}:${start.toISOString()}`,
    });
  }

  return { window_start: start.toISOString(), window_end: end.toISOString(), anomalies: anomalies.length };
};

export const startCostObservabilityWorker = () => {
  if (started) return;
  started = true;

  if (process.env.COST_OBSERVABILITY_WORKER_ENABLED === 'false') {
    structuredLog('info', 'cost_observability_worker_disabled', {});
    return;
  }

  const intervalMs = Math.max(
    5 * 60 * 1000,
    resolvePositiveInt(process.env.COST_OBSERVABILITY_INTERVAL_MS, 15 * 60 * 1000),
  );

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await evaluateCostObservability();
      structuredLog(result.anomalies > 0 ? 'warn' : 'info', 'cost_observability_evaluated', result);
    } catch (error) {
      structuredLog('error', 'cost_observability_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  setTimeout(tick, Math.min(intervalMs, 10_000)).unref();
  setInterval(tick, intervalMs).unref();
  structuredLog('info', 'cost_observability_worker_started', { interval_ms: intervalMs });
};
