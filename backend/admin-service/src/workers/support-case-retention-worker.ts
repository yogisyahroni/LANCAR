import fs from 'fs/promises';
import { db } from '../db';
import { resolvePrivateUploadPath } from '../security/uploadSecurity';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };

export type SupportCaseRetentionQueryable = {
  query<T = any>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
};

type ExpiredAttachment = {
  id: string;
  storage_key: string;
  cleanup_attempts: number;
};

let started = false;
let running = false;
const workerId = `${process.env.HOSTNAME || 'admin-service'}:${process.pid}:support-case-retention`;

const structuredLog = (
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
) => {
  console[level](JSON.stringify({ level, event, worker_id: workerId, ...fields }));
};

const boundedInt = (raw: string | undefined, fallback: number, max: number) => {
  const parsed = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

export type SupportCaseRetentionTickResult = {
  claimed: number;
  cleaned: number;
  failed: number;
};

export const runSupportCaseRetentionTick = async (
  queryable: SupportCaseRetentionQueryable = db,
): Promise<SupportCaseRetentionTickResult> => {
  const batchSize = boundedInt(process.env.SUPPORT_CASE_RETENTION_BATCH_SIZE, 50, 200);
  const claimed = await queryable.query<ExpiredAttachment>(
    `WITH ready AS (
       SELECT id
         FROM support_case_attachments
        WHERE expires_at <= NOW()
          AND retention_status IN ('active', 'cleanup_failed')
          AND cleanup_attempts < 8
        ORDER BY expires_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     UPDATE support_case_attachments attachment
        SET retention_status = 'cleanup_pending',
            cleanup_attempts = attachment.cleanup_attempts + 1,
            updated_at = NOW()
       FROM ready
      WHERE attachment.id = ready.id
     RETURNING attachment.id, attachment.storage_key, attachment.cleanup_attempts`,
    [batchSize],
  );

  let cleaned = 0;
  let failed = 0;
  for (const attachment of claimed.rows) {
    try {
      const absolutePath = resolvePrivateUploadPath(attachment.storage_key);
      if (!absolutePath) throw new Error('private attachment path rejected');
      await fs.unlink(absolutePath).catch((error: any) => {
        if (error?.code !== 'ENOENT') throw error;
      });
      await queryable.query(
        `UPDATE support_case_attachments
            SET retention_status = 'cleaned', cleaned_at = NOW(), last_cleanup_error = NULL, updated_at = NOW()
          WHERE id = $1`,
        [attachment.id],
      );
      cleaned += 1;
    } catch (error) {
      await queryable.query(
        `UPDATE support_case_attachments
            SET retention_status = 'cleanup_failed', last_cleanup_error = $2, updated_at = NOW()
          WHERE id = $1`,
        [attachment.id, error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)],
      );
      failed += 1;
      structuredLog('warn', 'support_case_attachment_cleanup_failed', {
        attachment_id: attachment.id,
        attempts: attachment.cleanup_attempts,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result = { claimed: claimed.rows.length, cleaned, failed };
  if (result.claimed > 0) structuredLog(failed > 0 ? 'warn' : 'info', 'support_case_retention_tick', result);
  return result;
};

export const startSupportCaseRetentionWorker = () => {
  if (started) return;
  started = true;
  if (process.env.SUPPORT_CASE_RETENTION_WORKER_ENABLED === 'false') {
    structuredLog('info', 'support_case_retention_worker_disabled', {});
    return;
  }
  const intervalMs = boundedInt(process.env.SUPPORT_CASE_RETENTION_INTERVAL_MS, 3600000, 86400000);
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSupportCaseRetentionTick();
    } catch (error) {
      structuredLog('error', 'support_case_retention_worker_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };
  setTimeout(tick, Math.min(intervalMs, 5000)).unref();
  setInterval(tick, intervalMs).unref();
  structuredLog('info', 'support_case_retention_worker_started', { interval_ms: intervalMs });
};
