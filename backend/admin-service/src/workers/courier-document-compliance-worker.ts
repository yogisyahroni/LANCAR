import { db } from '../db';
import { createNotification } from '../notifications';
import fs from 'fs';
import { resolvePrivateUploadPath } from '../security/uploadSecurity';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };

export type ComplianceQueryable = {
  query<T = any>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
};

type ExpiringDocument = {
  id: string;
  user_id: string;
  doc_type: string;
  expires_at: string;
  reminder_type: 'expiry_30d' | 'expiry_7d' | 'expiry_day';
};

type RetentionExpiredDocument = {
  id: string;
  storage_provider: string | null;
  storage_key: string | null;
};

let started = false;
let running = false;

const workerId = `${process.env.HOSTNAME || 'admin-service'}:${process.pid}:courier-document-compliance`;

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

export type ComplianceTickResult = {
  expired: number;
  retentionExpired: number;
  remindersSent: number;
  remindersFailed: number;
};

export const runCourierDocumentComplianceTick = async (
  queryable: ComplianceQueryable = db,
  now = new Date(),
): Promise<ComplianceTickResult> => {
  const today = now.toISOString().slice(0, 10);
  const expired = await queryable.query(
    `UPDATE courier_documents
     SET document_status = 'expired', is_verified = FALSE, updated_at = NOW()
     WHERE document_status = 'verified'
       AND expires_at < $1::date
       AND deleted_at IS NULL
     RETURNING id`,
    [today],
  );

  const retentionExpired = await queryable.query<RetentionExpiredDocument>(
    `WITH to_expire AS (
       SELECT id, storage_provider, storage_key
       FROM courier_documents
       WHERE retention_until < $1::date
         AND deleted_at IS NULL
       FOR UPDATE
     )
     UPDATE courier_documents cd
     SET document_status = 'retention_expired',
         is_verified = FALSE,
         deleted_at = NOW(),
         file_url = '',
         storage_key = NULL,
         updated_at = NOW()
     FROM to_expire
     WHERE cd.id = to_expire.id
     RETURNING cd.id, to_expire.storage_provider, to_expire.storage_key`,
    [today],
  );

  for (const document of retentionExpired.rows) {
    if (document.storage_provider !== 'private_filesystem' || !document.storage_key) continue;
    const absolutePath = resolvePrivateUploadPath(document.storage_key);
    if (!absolutePath) {
      structuredLog('warn', 'courier_document_retention_path_rejected', { document_id: document.id });
      continue;
    }
    try {
      fs.unlinkSync(absolutePath);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        structuredLog('warn', 'courier_document_retention_file_cleanup_failed', {
          document_id: document.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const expiring = await queryable.query<ExpiringDocument>(
    `SELECT
       cd.id,
       cp.user_id,
       cd.doc_type,
       cd.expires_at::text,
       CASE
         WHEN cd.expires_at = $1::date + 30 THEN 'expiry_30d'
         WHEN cd.expires_at = $1::date + 7 THEN 'expiry_7d'
         ELSE 'expiry_day'
       END AS reminder_type
     FROM courier_documents cd
     JOIN courier_profiles cp ON cp.id = cd.courier_id
     WHERE cd.document_status = 'verified'
       AND cd.deleted_at IS NULL
       AND cd.expires_at IN ($1::date + 30, $1::date + 7, $1::date)
     ORDER BY cd.expires_at ASC, cd.id ASC`,
    [today],
  );

  let remindersSent = 0;
  let remindersFailed = 0;

  for (const document of expiring.rows) {
    const claim = await queryable.query<{ id: string; status: string }>(
      `INSERT INTO courier_document_reverification_reminders (
         courier_document_id, user_id, reminder_type, scheduled_for
       )
       VALUES ($1, $2, $3, $4::date)
       ON CONFLICT (courier_document_id, reminder_type, scheduled_for)
       DO UPDATE SET
         status = CASE
           WHEN courier_document_reverification_reminders.status = 'failed'
            AND (courier_document_reverification_reminders.last_attempt_at IS NULL
                 OR courier_document_reverification_reminders.last_attempt_at < NOW() - INTERVAL '1 hour')
             THEN 'pending'
           ELSE courier_document_reverification_reminders.status
         END,
         updated_at = NOW()
       RETURNING id, status`,
      [document.id, document.user_id, document.reminder_type, document.expires_at],
    );
    const reminder = claim.rows[0];
    if (!reminder || reminder.status === 'sent') continue;

    await queryable.query(
      `UPDATE courier_document_reverification_reminders
       SET status = 'pending', attempts = attempts + 1, last_attempt_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [reminder.id],
    );

    try {
      const daysRemaining = document.reminder_type === 'expiry_30d'
        ? 30
        : document.reminder_type === 'expiry_7d' ? 7 : 0;
      await createNotification({
        user_id: document.user_id,
        title: 'Dokumen kurir perlu diperbarui',
        body: daysRemaining > 0
          ? `${document.doc_type.toUpperCase()} akan kedaluwarsa dalam ${daysRemaining} hari. Unggah dokumen terbaru untuk menjaga kelayakan akun.`
          : `${document.doc_type.toUpperCase()} kedaluwarsa hari ini. Perbarui dokumen sebelum menerima tugas baru.`,
        type: 'courier_document_reverification',
        category: 'system',
        priority: daysRemaining <= 7 ? 'high' : 'normal',
        deep_link: '/courier/documents',
        metadata: {
          courier_document_id: document.id,
          document_type: document.doc_type,
          expires_at: document.expires_at,
          reminder_type: document.reminder_type,
        },
      });
      await queryable.query(
        `UPDATE courier_document_reverification_reminders
         SET status = 'sent', sent_at = NOW(), last_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [reminder.id],
      );
      remindersSent += 1;
    } catch (error) {
      await queryable.query(
        `UPDATE courier_document_reverification_reminders
         SET status = 'failed', last_error = $2, updated_at = NOW()
         WHERE id = $1`,
        [reminder.id, error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)],
      );
      remindersFailed += 1;
      structuredLog('error', 'courier_document_reverification_failed', {
        document_id: document.id,
        reminder_type: document.reminder_type,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result = {
    expired: expired.rowCount || 0,
    retentionExpired: retentionExpired.rowCount || 0,
    remindersSent,
    remindersFailed,
  };
  if (result.expired || result.retentionExpired || result.remindersSent || result.remindersFailed) {
    structuredLog(result.remindersFailed ? 'warn' : 'info', 'courier_document_compliance_tick', result);
  }
  return result;
};

export const startCourierDocumentComplianceWorker = () => {
  if (started) return;
  started = true;

  if (process.env.COURIER_DOCUMENT_COMPLIANCE_WORKER_ENABLED === 'false') {
    structuredLog('info', 'courier_document_compliance_worker_disabled', {});
    return;
  }

  const intervalMs = Math.max(
    60_000,
    resolvePositiveInt(process.env.COURIER_DOCUMENT_COMPLIANCE_INTERVAL_MS, 60 * 60 * 1000),
  );

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runCourierDocumentComplianceTick();
    } catch (error) {
      structuredLog('error', 'courier_document_compliance_worker_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  setTimeout(tick, Math.min(intervalMs, 10_000)).unref();
  setInterval(tick, intervalMs).unref();
  structuredLog('info', 'courier_document_compliance_worker_started', { interval_ms: intervalMs });
};
