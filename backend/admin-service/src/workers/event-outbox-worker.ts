import { lockReadyOutboxEvents, markOutboxPublished, markOutboxRetry } from '../services/eventOutbox';
import { publishOutboxEvent } from '../services/rabbitMqPublisher';

let started = false;
let running = false;

const workerId = `${process.env.HOSTNAME || 'admin-service'}:${process.pid}:event-outbox`;

const structuredLog = (
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
) => {
  console[level](JSON.stringify({ level, event, worker_id: workerId, ...fields }));
};

export const startEventOutboxWorker = () => {
  if (started) return;
  started = true;

  if (process.env.EVENT_OUTBOX_WORKER_ENABLED === 'false') {
    structuredLog('info', 'event_outbox_worker_disabled', {});
    return;
  }

  const intervalMs = Number.parseInt(process.env.EVENT_OUTBOX_INTERVAL_MS || '1000', 10);
  const batchSize = Number.parseInt(process.env.EVENT_OUTBOX_BATCH_SIZE || '100', 10);

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const rows = await lockReadyOutboxEvents(workerId, batchSize);
      for (const row of rows) {
        try {
          await publishOutboxEvent(row);
          await markOutboxPublished(row.id);
        } catch (error: any) {
          await markOutboxRetry(
            row.id,
            error instanceof Error ? error.message : String(error),
            row.attempts,
          );
          structuredLog('error', 'event_outbox_publish_failed', {
            outbox_id: row.id,
            event_type: row.event_type,
            attempts: row.attempts,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (rows.length > 0) {
        structuredLog('info', 'event_outbox_worker_processed', {
          processed: rows.length,
        });
      }
    } catch (error: any) {
      structuredLog('error', 'event_outbox_worker_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  setTimeout(tick, Math.min(intervalMs, 5000)).unref();
  setInterval(tick, Math.max(250, intervalMs)).unref();
  structuredLog('info', 'event_outbox_worker_started', {
    interval_ms: intervalMs,
    batch_size: batchSize,
  });
};
