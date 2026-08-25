import { db } from '../db';
import { sendBroadcast } from '../services/broadcastDelivery.service';

let started = false;
let running = false;

const workerId = `${process.env.HOSTNAME || 'admin-service'}:${process.pid}:broadcast-scheduler`;

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

const STUCK_SENDING_MINUTES = resolvePositiveInt(process.env.BROADCAST_STUCK_SENDING_MINUTES, 30);
const DUE_BATCH_LIMIT = resolvePositiveInt(process.env.BROADCAST_SCHEDULER_BATCH_SIZE, 10);

export const startBroadcastSchedulerWorker = () => {
  if (started) return;
  started = true;

  if (process.env.BROADCAST_SCHEDULER_ENABLED === 'false') {
    structuredLog('info', 'broadcast_scheduler_worker_disabled', {});
    return;
  }

  const intervalMs = Math.max(
    5000,
    resolvePositiveInt(process.env.BROADCAST_SCHEDULER_INTERVAL_MS, 60_000),
  );

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // Recovery: broadcasts stuck in 'sending' (crash mid-loop) are marked failed.
      const stuck = await db.query(
        `UPDATE broadcasts
         SET status = 'failed'
         WHERE status = 'sending'
           AND updated_at < NOW() - ($1::text || ' minutes')::interval
         RETURNING id`,
        [String(STUCK_SENDING_MINUTES)],
      );
      if (stuck.rowCount && stuck.rowCount > 0) {
        structuredLog('warn', 'broadcast_scheduler_stuck_sending_recovered', {
          recovered: stuck.rowCount,
        });
      }

      // Due scheduled broadcasts. sendBroadcast CAS-claims each row, so
      // multiple replicas never double-send the same broadcast.
      const due = await db.query<{ id: string }>(
        `SELECT id FROM broadcasts
         WHERE status = 'scheduled' AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT $1`,
        [DUE_BATCH_LIMIT],
      );

      for (const row of due.rows) {
        try {
          const result = await sendBroadcast(row.id);
          structuredLog(result.ok ? 'info' : 'warn', 'broadcast_scheduler_dispatch', {
            broadcast_id: row.id,
            ok: result.ok,
            reason: result.reason || null,
            sent_count: result.sent_count ?? null,
          });
        } catch (error: any) {
          structuredLog('error', 'broadcast_scheduler_send_error', {
            broadcast_id: row.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error: any) {
      structuredLog('error', 'broadcast_scheduler_worker_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  setTimeout(tick, Math.min(intervalMs, 10_000)).unref();
  setInterval(tick, intervalMs).unref();
  structuredLog('info', 'broadcast_scheduler_worker_started', {
    interval_ms: intervalMs,
    batch_size: DUE_BATCH_LIMIT,
    stuck_sending_minutes: STUCK_SENDING_MINUTES,
  });
};
