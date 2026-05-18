import { Request } from 'express';

type Queryable = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

type PayoutSeverity = 'info' | 'warning' | 'critical';

export type PayoutAuditEvent = {
  courierId?: string | null;
  payoutRequestId?: string | null;
  eventType: string;
  severity?: PayoutSeverity;
  actorId?: string | null;
  actorRole?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  metadata?: Record<string, unknown>;
};

const normalizeIp = (req?: Request): string | null => {
  if (!req) return null;
  const forwardedFor = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor || req.socket.remoteAddress || null;
  if (!raw) return null;
  return String(raw).split(',')[0].trim().replace('::ffff:', '') || null;
};

const getDeviceId = (req?: Request): string | null => {
  if (!req) return null;
  const value = req.headers['x-device-id'] || req.headers['x-client-device-id'];
  return Array.isArray(value) ? value[0] : value ? String(value) : null;
};

export const payoutStructuredLog = (
  level: 'info' | 'warn' | 'error',
  event: string,
  payload: Record<string, unknown>,
) => {
  const line = {
    timestamp: new Date().toISOString(),
    service: 'admin-service',
    domain: 'courier_payout',
    event,
    ...payload,
  };

  const message = JSON.stringify(line);
  if (level === 'error') {
    console.error(message);
  } else if (level === 'warn') {
    console.warn(message);
  } else {
    console.log(message);
  }
};

export const writePayoutAuditEvent = async (
  client: Queryable,
  req: Request | undefined,
  event: PayoutAuditEvent,
) => {
  const actorId = event.actorId ?? req?.user?.id ?? null;
  const actorRole = event.actorRole ?? req?.user?.role ?? null;
  const severity = event.severity || 'info';
  const metadata = event.metadata || {};

  try {
    await client.query(
      `INSERT INTO courier_payout_security_events (
         courier_id,
         payout_request_id,
         event_type,
         severity,
         actor_id,
         actor_role,
         subject_type,
         subject_id,
         old_status,
         new_status,
         ip_address,
         user_agent,
         device_id,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULLIF($11, '')::inet, $12, $13, $14)`,
      [
        event.courierId || null,
        event.payoutRequestId || null,
        event.eventType,
        severity,
        actorId,
        actorRole,
        event.subjectType || null,
        event.subjectId || null,
        event.oldStatus || null,
        event.newStatus || null,
        normalizeIp(req),
        req?.headers['user-agent'] || null,
        getDeviceId(req),
        JSON.stringify(metadata),
      ],
    );

    payoutStructuredLog(severity === 'critical' ? 'error' : severity === 'warning' ? 'warn' : 'info', event.eventType, {
      actor_id: actorId,
      actor_role: actorRole,
      courier_id: event.courierId || null,
      payout_request_id: event.payoutRequestId || null,
      subject_type: event.subjectType || null,
      subject_id: event.subjectId || null,
      old_status: event.oldStatus || null,
      new_status: event.newStatus || null,
      severity,
      metadata,
    });
  } catch (error) {
    console.warn('Failed to write payout audit event:', error);
  }
};

const shouldEmitAlert = async (client: Queryable, alertType: string) => {
  const result = await client.query(
    `SELECT 1
     FROM courier_payout_security_events
     WHERE event_type = 'observability_alert'
       AND metadata->>'alert_type' = $1
       AND created_at >= NOW() - INTERVAL '15 minutes'
     LIMIT 1`,
    [alertType],
  );
  return result.rows.length === 0;
};

export const evaluatePayoutAlerts = async (client: Queryable) => {
  const failedThreshold = Number(process.env.PAYOUT_FAILED_ALERT_THRESHOLD || 5);
  const burstThreshold = Number(process.env.PAYOUT_REQUEST_BURST_THRESHOLD || 5);
  const providerLatencyMinutes = Number(process.env.PAYOUT_PROVIDER_LATENCY_ALERT_MINUTES || 30);
  const pendingTooLongMinutes = Number(process.env.PAYOUT_PENDING_TOO_LONG_MINUTES || 60);
  const webhookMissingMinutes = Number(process.env.PAYOUT_WEBHOOK_MISSING_MINUTES || 20);

  try {
    const [failed, burst, negative, providerLatency, pendingTooLong, webhookMissing] = await Promise.all([
      client.query(
        `SELECT COUNT(*)::int AS count
         FROM courier_payout_requests
         WHERE status IN ('failed', 'rejected')
           AND updated_at >= NOW() - INTERVAL '1 hour'`,
      ),
      client.query(
        `SELECT courier_id, COUNT(*)::int AS count
         FROM courier_payout_requests
         WHERE requested_at >= NOW() - INTERVAL '10 minutes'
         GROUP BY courier_id
         HAVING COUNT(*) >= $1
         ORDER BY count DESC
         LIMIT 5`,
        [burstThreshold],
      ),
      client.query(
        `SELECT courier_id,
                COALESCE(SUM(CASE
                  WHEN direction = 'credit' AND settlement_status = 'available' THEN amount_idr
                  WHEN direction = 'debit' AND settlement_status IN ('requested', 'processing', 'paid') THEN -amount_idr
                  ELSE 0
                END), 0)::int AS available_balance_idr
         FROM courier_earnings_ledger
         GROUP BY courier_id
         HAVING COALESCE(SUM(CASE
           WHEN direction = 'credit' AND settlement_status = 'available' THEN amount_idr
           WHEN direction = 'debit' AND settlement_status IN ('requested', 'processing', 'paid') THEN -amount_idr
           ELSE 0
         END), 0) < 0
         LIMIT 5`,
      ),
      client.query(
        `SELECT COUNT(*)::int AS count
         FROM courier_payout_dispatches
         WHERE provider_status = 'processing'
           AND dispatched_at < NOW() - ($1::text || ' minutes')::interval`,
        [providerLatencyMinutes],
      ),
      client.query(
        `SELECT COUNT(*)::int AS count
         FROM courier_payout_requests
         WHERE status IN ('requested', 'risk_screening', 'approved_auto', 'approved', 'processing')
           AND requested_at < NOW() - ($1::text || ' minutes')::interval`,
        [pendingTooLongMinutes],
      ),
      client.query(
        `SELECT COUNT(*)::int AS count
         FROM courier_payout_dispatches d
         LEFT JOIN courier_payout_provider_webhook_events e
           ON e.provider_name = d.provider_name
          AND e.provider_reference = d.provider_reference
         WHERE d.provider_status = 'processing'
           AND d.dispatched_at < NOW() - ($1::text || ' minutes')::interval
           AND e.id IS NULL`,
        [webhookMissingMinutes],
      ),
    ]);

    const failedCount = Number(failed.rows[0]?.count || 0);
    if (failedCount >= failedThreshold && await shouldEmitAlert(client, 'failed_payout_spike')) {
      await writePayoutAuditEvent(client, undefined, {
        eventType: 'observability_alert',
        severity: 'critical',
        subjectType: 'courier_payout_requests',
        metadata: { alert_type: 'failed_payout_spike', failed_count_last_hour: failedCount, threshold: failedThreshold },
      });
    }

    if (burst.rows.length > 0 && await shouldEmitAlert(client, 'abnormal_request_burst')) {
      await writePayoutAuditEvent(client, undefined, {
        eventType: 'observability_alert',
        severity: 'warning',
        courierId: burst.rows[0].courier_id,
        subjectType: 'courier_payout_requests',
        metadata: { alert_type: 'abnormal_request_burst', couriers: burst.rows, threshold: burstThreshold },
      });
    }

    if (negative.rows.length > 0 && await shouldEmitAlert(client, 'saldo_mismatch')) {
      await writePayoutAuditEvent(client, undefined, {
        eventType: 'saldo_mismatch_detected',
        severity: 'critical',
        courierId: negative.rows[0].courier_id,
        subjectType: 'courier_earnings_ledger',
        metadata: { alert_type: 'saldo_mismatch', balances: negative.rows },
      });
    }

    const providerLatencyCount = Number(providerLatency.rows[0]?.count || 0);
    if (providerLatencyCount > 0 && await shouldEmitAlert(client, 'provider_latency_high')) {
      await writePayoutAuditEvent(client, undefined, {
        eventType: 'observability_alert',
        severity: 'warning',
        subjectType: 'courier_payout_dispatches',
        metadata: { alert_type: 'provider_latency_high', count: providerLatencyCount, threshold_minutes: providerLatencyMinutes },
      });
    }

    const pendingTooLongCount = Number(pendingTooLong.rows[0]?.count || 0);
    if (pendingTooLongCount > 0 && await shouldEmitAlert(client, 'pending_too_long')) {
      await writePayoutAuditEvent(client, undefined, {
        eventType: 'observability_alert',
        severity: 'warning',
        subjectType: 'courier_payout_requests',
        metadata: { alert_type: 'pending_too_long', count: pendingTooLongCount, threshold_minutes: pendingTooLongMinutes },
      });
    }

    const webhookMissingCount = Number(webhookMissing.rows[0]?.count || 0);
    if (webhookMissingCount > 0 && await shouldEmitAlert(client, 'webhook_missing')) {
      await writePayoutAuditEvent(client, undefined, {
        eventType: 'observability_alert',
        severity: 'warning',
        subjectType: 'courier_payout_provider_webhook_events',
        metadata: { alert_type: 'webhook_missing', count: webhookMissingCount, threshold_minutes: webhookMissingMinutes },
      });
    }
  } catch (error) {
    payoutStructuredLog('warn', 'observability_check_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
