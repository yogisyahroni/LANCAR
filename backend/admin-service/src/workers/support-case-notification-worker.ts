import { db } from '../db';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };

export type SupportCaseNotificationQueryable = {
  query<T = any>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
};

type SupportCaseNotificationRow = {
  id: string;
  case_id: string;
  case_event_id: string;
  recipient_id: string;
  order_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  case_number: string;
  market_code: string;
  priority: string;
  attempts: number;
};

let started = false;
let running = false;

const workerId = `${process.env.HOSTNAME || 'admin-service'}:${process.pid}:support-case-notification`;

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

const supportPriority = (priority: string) => {
  if (priority === 'urgent') return 'critical';
  if (priority === 'high') return 'high';
  return 'normal';
};

export const supportCaseNotificationCopy = (eventType: string, caseNumber: string, toStatus?: string | null) => {
  if (eventType === 'created') {
    return {
      title: 'Laporan bantuan diterima',
      body: `Laporan ${caseNumber} sudah diterima dan sedang ditinjau.`,
    };
  }
  if (eventType === 'financial_action_succeeded') {
    return {
      title: 'Pembaruan pengembalian dana',
      body: `Ada pembaruan finansial untuk laporan ${caseNumber}.`,
    };
  }
  if (eventType === 'financial_action_failed') {
    return {
      title: 'Pembaruan laporan bantuan',
      body: `Penyelesaian finansial untuk laporan ${caseNumber} belum berhasil dan sedang ditinjau.`,
    };
  }
  if (eventType === 'reopened') {
    return {
      title: 'Laporan dibuka kembali',
      body: `Laporan ${caseNumber} dibuka kembali untuk peninjauan lanjutan.`,
    };
  }
  if (toStatus === 'resolved' || toStatus === 'closed' || eventType === 'resolve') {
    return {
      title: 'Laporan diselesaikan',
      body: `Laporan ${caseNumber} sudah diperbarui sebagai selesai.`,
    };
  }
  if (eventType === 'request_more_info' || toStatus === 'pending_customer') {
    return {
      title: 'Informasi laporan perlu diperbarui',
      body: `Ada permintaan informasi tambahan untuk laporan ${caseNumber}.`,
    };
  }
  return {
    title: 'Pembaruan laporan bantuan',
    body: `Ada pembaruan pada laporan ${caseNumber}.`,
  };
};

const sendCommunicationEvent = async (row: SupportCaseNotificationRow) => {
  const copy = supportCaseNotificationCopy(
    row.event_type,
    row.case_number,
    typeof row.payload?.to_status === 'string' ? row.payload.to_status : null,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), boundedInt(process.env.SUPPORT_CASE_NOTIFICATION_TIMEOUT_MS, 10000, 30000));
  try {
    const baseUrl = process.env.ORDER_SERVICE_URL || 'http://order-service:8083';
    const response = await fetch(`${baseUrl}/api/v1/internal/communications/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': process.env.INTERNAL_API_KEY || '',
      },
      body: JSON.stringify({
        event_id: row.id,
        semantic_type: 'support_case.updated',
        recipient_id: row.recipient_id,
        market_code: row.market_code || 'id-jk',
        locale: 'id-ID',
        category: 'support',
        priority: supportPriority(row.priority),
        entity_type: 'support_case',
        entity_id: row.case_id,
        order_id: row.order_id,
        template_key: 'support_case.update.v1',
        template_version: 1,
        correlation_id: `support-case:${row.case_id}:${row.case_event_id}`,
        payload: {
          title: copy.title,
          body: copy.body,
          case_number: row.case_number,
          event_type: row.event_type,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`order-service communication returned HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
};

export type SupportCaseNotificationTickResult = {
  processed: number;
  sent: number;
  retried: number;
  dead: number;
};

export const runSupportCaseNotificationTick = async (
  queryable: SupportCaseNotificationQueryable = db,
  currentWorkerId = workerId,
): Promise<SupportCaseNotificationTickResult> => {
  const batchSize = boundedInt(process.env.SUPPORT_CASE_NOTIFICATION_BATCH_SIZE, 50, 200);
  const maxAttempts = boundedInt(process.env.SUPPORT_CASE_NOTIFICATION_MAX_ATTEMPTS, 8, 20);
  const ready = await queryable.query<SupportCaseNotificationRow>(
    `WITH ready AS (
       SELECT id
         FROM support_case_notification_outbox
        WHERE status IN ('pending', 'retry')
          AND available_at <= NOW()
          AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '2 minutes')
        ORDER BY available_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     UPDATE support_case_notification_outbox outbox
        SET locked_at = NOW(), locked_by = $2, attempts = outbox.attempts + 1, updated_at = NOW()
       FROM ready
      WHERE outbox.id = ready.id
     RETURNING outbox.id, outbox.case_id, outbox.case_event_id, outbox.recipient_id,
               outbox.order_id, outbox.event_type, outbox.payload, outbox.attempts,
               (SELECT case_number FROM support_cases WHERE id = outbox.case_id) AS case_number,
               (SELECT market_code FROM support_cases WHERE id = outbox.case_id) AS market_code,
               (SELECT priority FROM support_cases WHERE id = outbox.case_id) AS priority`,
    [batchSize, currentWorkerId],
  );

  let sent = 0;
  let retried = 0;
  let dead = 0;
  for (const row of ready.rows) {
    try {
      await sendCommunicationEvent(row);
      await queryable.query(
        `UPDATE support_case_notification_outbox
            SET status = 'sent', sent_at = NOW(), locked_at = NULL, locked_by = NULL,
                last_error = NULL, updated_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
      sent += 1;
    } catch (error) {
      const terminal = row.attempts >= maxAttempts;
      const backoffSeconds = Math.min(900, Math.max(5, 2 ** Math.min(row.attempts, 8)));
      await queryable.query(
        `UPDATE support_case_notification_outbox
            SET status = $2,
                available_at = CASE WHEN $2 = 'dead' THEN available_at ELSE NOW() + ($3::text || ' seconds')::interval END,
                locked_at = NULL, locked_by = NULL, last_error = $4, updated_at = NOW()
          WHERE id = $1`,
        [
          row.id,
          terminal ? 'dead' : 'retry',
          backoffSeconds,
          error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        ],
      );
      if (terminal) dead += 1;
      else retried += 1;
      structuredLog(terminal ? 'error' : 'warn', 'support_case_notification_failed', {
        outbox_id: row.id,
        case_id: row.case_id,
        recipient_id: row.recipient_id,
        attempts: row.attempts,
        terminal,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result = { processed: ready.rows.length, sent, retried, dead };
  if (result.processed > 0) structuredLog(dead > 0 ? 'warn' : 'info', 'support_case_notification_tick', result);
  return result;
};

export const startSupportCaseNotificationWorker = () => {
  if (started) return;
  started = true;
  if (process.env.SUPPORT_CASE_NOTIFICATION_WORKER_ENABLED === 'false') {
    structuredLog('info', 'support_case_notification_worker_disabled', {});
    return;
  }
  const intervalMs = boundedInt(process.env.SUPPORT_CASE_NOTIFICATION_INTERVAL_MS, 1000, 300000);
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSupportCaseNotificationTick();
    } catch (error) {
      structuredLog('error', 'support_case_notification_worker_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };
  setTimeout(tick, Math.min(intervalMs, 5000)).unref();
  setInterval(tick, intervalMs).unref();
  structuredLog('info', 'support_case_notification_worker_started', { interval_ms: intervalMs });
};
