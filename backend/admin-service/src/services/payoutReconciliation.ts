import { Request } from 'express';
import { db } from '../db';
import { writePayoutAuditEvent } from '../utils/payoutObservability';

type Queryable = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

type PoolLike = {
  connect: () => Promise<Queryable & { release: () => void }>;
};

type ReconciliationItem = {
  payout_request_id?: string | null;
  courier_id?: string | null;
  check_type:
    | 'ledger_vs_request'
    | 'request_vs_provider'
    | 'paid_amount_vs_ledger'
    | 'provider_latency_high'
    | 'pending_too_long'
    | 'webhook_missing';
  severity: 'info' | 'warning' | 'critical';
  expected_value?: string | null;
  actual_value?: string | null;
  details: Record<string, unknown>;
};

const configInt = async (client: Queryable, key: string, fallback: number) => {
  const result = await client.query(`SELECT (value #>> '{}') AS value FROM system_configs WHERE key = $1 LIMIT 1`, [key]);
  const parsed = Number(result.rows[0]?.value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

export const buildPayoutReconciliationItems = async (client: Queryable): Promise<ReconciliationItem[]> => {
  const [latencyMinutes, pendingMinutes, webhookMinutes] = await Promise.all([
    configInt(client, 'payout_provider_latency_alert_minutes', 30),
    configInt(client, 'payout_pending_too_long_minutes', 60),
    configInt(client, 'payout_webhook_missing_minutes', 20),
  ]);

  const [
    ledgerMismatch,
    providerMismatch,
    paidLedgerMismatch,
    providerLatency,
    pendingTooLong,
    webhookMissing,
  ] = await Promise.all([
    client.query(
      `SELECT
         pr.id AS payout_request_id,
         pr.courier_id,
         pr.amount_idr,
         COALESCE(SUM(CASE WHEN cel.direction = 'debit' THEN cel.amount_idr ELSE 0 END), 0)::int AS ledger_debit_idr
       FROM courier_payout_requests pr
       LEFT JOIN courier_earnings_ledger cel
         ON cel.payout_request_id = pr.id
        AND cel.transaction_type = 'payout_requested'
       WHERE pr.status NOT IN ('blocked', 'rejected', 'cancelled')
       GROUP BY pr.id
       HAVING COALESCE(SUM(CASE WHEN cel.direction = 'debit' THEN cel.amount_idr ELSE 0 END), 0)::int <> pr.amount_idr
       LIMIT 100`,
    ),
    client.query(
      `SELECT
         pr.id AS payout_request_id,
         pr.courier_id,
         pr.status AS request_status,
         d.provider_status,
         d.provider_reference
       FROM courier_payout_requests pr
       JOIN LATERAL (
         SELECT provider_status, provider_reference
         FROM courier_payout_dispatches
         WHERE payout_request_id = pr.id
         ORDER BY created_at DESC
         LIMIT 1
       ) d ON TRUE
       WHERE (d.provider_status = 'paid' AND pr.status <> 'paid')
          OR (d.provider_status = 'failed' AND pr.status <> 'failed')
          OR (d.provider_status = 'processing' AND pr.status NOT IN ('processing', 'paid', 'failed'))
       LIMIT 100`,
    ),
    client.query(
      `SELECT
         pr.id AS payout_request_id,
         pr.courier_id,
         pr.amount_idr,
         COALESCE(SUM(CASE WHEN cel.direction = 'debit' THEN cel.amount_idr ELSE 0 END), 0)::int AS ledger_debit_idr
       FROM courier_payout_requests pr
       LEFT JOIN courier_earnings_ledger cel
         ON cel.payout_request_id = pr.id
        AND cel.transaction_type = 'payout_requested'
       WHERE pr.status = 'paid'
       GROUP BY pr.id
       HAVING COALESCE(SUM(CASE WHEN cel.direction = 'debit' THEN cel.amount_idr ELSE 0 END), 0)::int <> pr.amount_idr
       LIMIT 100`,
    ),
    client.query(
      `SELECT
         pr.id AS payout_request_id,
         pr.courier_id,
         d.provider_reference,
         d.dispatched_at,
         EXTRACT(EPOCH FROM (NOW() - d.dispatched_at))/60 AS age_minutes
       FROM courier_payout_dispatches d
       JOIN courier_payout_requests pr ON pr.id = d.payout_request_id
       WHERE d.provider_status = 'processing'
         AND d.dispatched_at < NOW() - ($1::text || ' minutes')::interval
       ORDER BY d.dispatched_at ASC
       LIMIT 100`,
      [latencyMinutes],
    ),
    client.query(
      `SELECT id AS payout_request_id, courier_id, status, requested_at,
              EXTRACT(EPOCH FROM (NOW() - requested_at))/60 AS age_minutes
       FROM courier_payout_requests
       WHERE status IN ('requested', 'risk_screening', 'approved_auto', 'approved', 'processing')
         AND requested_at < NOW() - ($1::text || ' minutes')::interval
       ORDER BY requested_at ASC
       LIMIT 100`,
      [pendingMinutes],
    ),
    client.query(
      `SELECT
         pr.id AS payout_request_id,
         pr.courier_id,
         d.provider_name,
         d.provider_reference,
         d.dispatched_at
       FROM courier_payout_dispatches d
       JOIN courier_payout_requests pr ON pr.id = d.payout_request_id
       LEFT JOIN courier_payout_provider_webhook_events e
         ON e.provider_name = d.provider_name
        AND e.provider_reference = d.provider_reference
       WHERE d.provider_status = 'processing'
         AND d.dispatched_at < NOW() - ($1::text || ' minutes')::interval
         AND e.id IS NULL
       ORDER BY d.dispatched_at ASC
       LIMIT 100`,
      [webhookMinutes],
    ),
  ]);

  return [
    ...ledgerMismatch.rows.map((row) => ({
      payout_request_id: row.payout_request_id,
      courier_id: row.courier_id,
      check_type: 'ledger_vs_request' as const,
      severity: 'critical' as const,
      expected_value: String(row.amount_idr),
      actual_value: String(row.ledger_debit_idr),
      details: row,
    })),
    ...providerMismatch.rows.map((row) => ({
      payout_request_id: row.payout_request_id,
      courier_id: row.courier_id,
      check_type: 'request_vs_provider' as const,
      severity: 'critical' as const,
      expected_value: String(row.provider_status),
      actual_value: String(row.request_status),
      details: row,
    })),
    ...paidLedgerMismatch.rows.map((row) => ({
      payout_request_id: row.payout_request_id,
      courier_id: row.courier_id,
      check_type: 'paid_amount_vs_ledger' as const,
      severity: 'critical' as const,
      expected_value: String(row.amount_idr),
      actual_value: String(row.ledger_debit_idr),
      details: row,
    })),
    ...providerLatency.rows.map((row) => ({
      payout_request_id: row.payout_request_id,
      courier_id: row.courier_id,
      check_type: 'provider_latency_high' as const,
      severity: 'warning' as const,
      expected_value: `<=${latencyMinutes} minutes`,
      actual_value: `${Math.round(Number(row.age_minutes || 0))} minutes`,
      details: row,
    })),
    ...pendingTooLong.rows.map((row) => ({
      payout_request_id: row.payout_request_id,
      courier_id: row.courier_id,
      check_type: 'pending_too_long' as const,
      severity: 'warning' as const,
      expected_value: `<=${pendingMinutes} minutes`,
      actual_value: `${Math.round(Number(row.age_minutes || 0))} minutes`,
      details: row,
    })),
    ...webhookMissing.rows.map((row) => ({
      payout_request_id: row.payout_request_id,
      courier_id: row.courier_id,
      check_type: 'webhook_missing' as const,
      severity: 'warning' as const,
      expected_value: `webhook within ${webhookMinutes} minutes`,
      actual_value: 'missing',
      details: row,
    })),
  ];
};

export const runPayoutReconciliation = async (pool: PoolLike = db, req?: Request) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const run = await client.query(
      `INSERT INTO courier_payout_reconciliation_runs (status, created_by)
       VALUES ('running', $1)
       RETURNING *`,
      [req?.user?.id || null],
    );
    const runId = run.rows[0].id;
    const items = await buildPayoutReconciliationItems(client);

    for (const item of items) {
      await client.query(
        `INSERT INTO courier_payout_reconciliation_items (
           run_id,
           payout_request_id,
           courier_id,
           check_type,
           severity,
           expected_value,
           actual_value,
           details
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          runId,
          item.payout_request_id || null,
          item.courier_id || null,
          item.check_type,
          item.severity,
          item.expected_value || null,
          item.actual_value || null,
          JSON.stringify(item.details),
        ],
      );
    }

    const summary = {
      by_check_type: items.reduce<Record<string, number>>((acc, item) => {
        acc[item.check_type] = (acc[item.check_type] || 0) + 1;
        return acc;
      }, {}),
      by_severity: items.reduce<Record<string, number>>((acc, item) => {
        acc[item.severity] = (acc[item.severity] || 0) + 1;
        return acc;
      }, {}),
    };

    const updated = await client.query(
      `UPDATE courier_payout_reconciliation_runs
       SET status = 'completed',
           completed_at = NOW(),
           total_items = $1,
           mismatch_count = $2,
           alert_count = $3,
           summary = $4::jsonb
       WHERE id = $5
       RETURNING *`,
      [
        items.length,
        items.filter((item) => ['ledger_vs_request', 'request_vs_provider', 'paid_amount_vs_ledger'].includes(item.check_type)).length,
        items.filter((item) => ['provider_latency_high', 'pending_too_long', 'webhook_missing'].includes(item.check_type)).length,
        JSON.stringify(summary),
        runId,
      ],
    );

    await writePayoutAuditEvent(client, req, {
      eventType: 'payout_reconciliation_run',
      severity: items.some((item) => item.severity === 'critical') ? 'critical' : items.length > 0 ? 'warning' : 'info',
      actorRole: req?.user?.role || 'system',
      subjectType: 'courier_payout_reconciliation_run',
      subjectId: runId,
      metadata: { run_id: runId, total_items: items.length, summary },
    });

    await client.query('COMMIT');
    return { run: updated.rows[0], items };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const getPayoutOpsDashboard = async (client: Queryable) => {
  const [statusCounts, riskReasons, failedMonitor, latestRun, recentAlerts] = await Promise.all([
    client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'approved_auto')::int AS auto_approved_count,
         COUNT(*) FILTER (WHERE status IN ('risk_hold', 'manual_review', 'under_review'))::int AS manual_review_count,
         COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
         COUNT(*) FILTER (WHERE status = 'processing')::int AS processing_count
       FROM courier_payout_requests
       WHERE requested_at >= NOW() - INTERVAL '7 days'`,
    ),
    client.query(
      `SELECT reason, COUNT(*)::int AS count
       FROM courier_payout_risk_decisions rd
       CROSS JOIN LATERAL unnest(rd.reasons) AS reason
       WHERE rd.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY reason
       ORDER BY count DESC
       LIMIT 8`,
    ),
    client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '1 hour')::int AS failed_last_hour,
         COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '24 hours')::int AS failed_last_day,
         COUNT(*) FILTER (WHERE status = 'processing' AND processed_at < NOW() - INTERVAL '30 minutes')::int AS stale_processing
       FROM courier_payout_requests`,
    ),
    client.query(
      `SELECT r.*, COALESCE(json_agg(i.* ORDER BY i.created_at DESC) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
       FROM courier_payout_reconciliation_runs r
       LEFT JOIN courier_payout_reconciliation_items i ON i.run_id = r.id
       GROUP BY r.id
       ORDER BY r.created_at DESC
       LIMIT 1`,
    ),
    client.query(
      `SELECT event_type, severity, metadata, created_at
       FROM courier_payout_security_events
       WHERE event_type IN ('observability_alert', 'saldo_mismatch_detected', 'payout_reconciliation_run')
       ORDER BY created_at DESC
       LIMIT 10`,
    ),
  ]);

  return {
    status_counts: statusCounts.rows[0] || {},
    risk_reason_breakdown: riskReasons.rows,
    failed_monitor: failedMonitor.rows[0] || {},
    reconciliation: latestRun.rows[0] || null,
    alerts: recentAlerts.rows,
  };
};
