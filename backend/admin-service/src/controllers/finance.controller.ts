import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { applyProviderCallback, dispatchApprovedPayouts, sha256Hex, verifyProviderWebhookSignature } from '../services/payoutProviderDispatcher';
import { getPayoutOpsDashboard, runPayoutReconciliation } from '../services/payoutReconciliation';
import { activePayoutStatuses, decoratePayoutRequest } from '../services/payoutStatusPolicy';
import { evaluatePayoutAlerts, writePayoutAuditEvent } from '../utils/payoutObservability';
import { insertWebhookAuditEvent, updateWebhookAuditEvent } from '../security/webhookSecurity';

const adminActorId = (req: Request) => req.user?.id || '9b6a89d7-ab83-4df9-86fa-dd714ea50be0';

const writeFinanceAudit = async (
  client: any,
  key: string,
  actorId: string,
  reason: string,
  config: Record<string, unknown>,
) => {
  await client.query(
    `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category)
     VALUES ($1::varchar, $2::boolean, $3::uuid, $4::text, $5::jsonb, $6::varchar)`,
    [key, true, actorId, reason, JSON.stringify(config), 'finance']
  );
};

const writeCourierPayoutFinanceAudit = async (
  client: any,
  req: Request,
  event: {
    eventType: 'account_status_changed' | 'request_status_changed' | 'payout_review_action';
    courierId: string;
    payoutRequestId?: string | null;
    subjectType: string;
    subjectId: string;
    oldStatus: string;
    newStatus: string;
    reason?: string | null;
    reference?: string | null;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  },
) => {
  await writePayoutAuditEvent(client, req, {
    courierId: event.courierId,
    payoutRequestId: event.payoutRequestId || null,
    eventType: event.eventType,
    severity: event.newStatus === 'failed' || event.newStatus === 'suspended' ? 'warning' : 'info',
    actorId: adminActorId(req),
    actorRole: req.user?.role || 'admin',
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    oldStatus: event.oldStatus,
    newStatus: event.newStatus,
    metadata: {
      reason: event.reason || null,
      reference: event.reference || null,
      before: event.before,
      after: event.after,
    },
  });
};

export const getFinancialStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const revenueQuery = `
      SELECT 
        COALESCE(SUM(amount_idr) FILTER (WHERE paid_at >= NOW() - INTERVAL '30 days'), 0) as current_revenue,
        COALESCE(SUM(amount_idr) FILTER (WHERE paid_at >= NOW() - INTERVAL '60 days' AND paid_at < NOW() - INTERVAL '30 days'), 0) as prev_revenue,
        COALESCE(SUM(ppn_amount_idr) FILTER (WHERE paid_at >= NOW() - INTERVAL '30 days'), 0) as current_ppn
      FROM payments
      WHERE status = 'paid'
    `;
    const revResult = await readDb.query(revenueQuery);
    const currentRevenue = parseInt(revResult.rows[0].current_revenue);
    const prevRevenue = parseInt(revResult.rows[0].prev_revenue);
    const currentPpn = parseInt(revResult.rows[0].current_ppn);

    const costQuery = `
      SELECT 
        COALESCE(SUM(net_idr) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) as current_cost,
        COALESCE(SUM(net_idr) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'), 0) as prev_cost
      FROM payout_records
      WHERE disbursement_status = 'completed'
    `;
    const costResult = await readDb.query(costQuery);
    const currentCost = parseInt(costResult.rows[0].current_cost);
    const prevCost = parseInt(costResult.rows[0].prev_cost);

    const currentProfit = currentRevenue - currentCost;
    const prevProfit = prevRevenue - prevCost;

    const calcChange = (current: number, prev: number) => {
      if (prev === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - prev) / prev) * 100);
    };

    const revChange = calcChange(currentRevenue, prevRevenue);
    const costChange = calcChange(currentCost, prevCost);
    const profitChange = calcChange(currentProfit, prevProfit);

    const modelBreakdown = await readDb.query(`
      SELECT model, COUNT(*) as count, SUM(total_price_idr) as revenue
      FROM orders
      WHERE status = 'delivered' AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY model
    `);

    const weatherReserveResult = await readDb.query(`
      SELECT COALESCE(SUM(weather_reserve_idr), 0) as total_reserve
      FROM payments
      WHERE status = 'paid'
    `);

    const burnTimeSeries = await readDb.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        SUM(net_idr) as daily_total
      FROM payout_records
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    res.json({
      stats: [
        { label: 'Gross Revenue', value: currentRevenue, change: `${revChange >= 0 ? '+' : ''}${revChange}%`, up: revChange >= 0 },
        { label: 'Net Profit', value: currentProfit, change: `${profitChange >= 0 ? '+' : ''}${profitChange}%`, up: profitChange >= 0 },
        { label: 'Operational Cost', value: currentCost, change: `${costChange >= 0 ? '+' : ''}${costChange}%`, up: costChange < 0 },
      ],
      model_breakdown: modelBreakdown.rows.map(row => ({
        name: row.model.toUpperCase(),
        model: row.model,
        value: parseInt(row.revenue),
        count: parseInt(row.count),
        revenue: parseInt(row.revenue),
        percentage: Math.round((parseInt(row.revenue) / (currentRevenue || 1)) * 100) || 0
      })),
      emergency_fund: parseInt(weatherReserveResult.rows[0].total_reserve),
      ppn_total: currentPpn,
      burn_time_series: burnTimeSeries.rows.map(row => ({
        date: row.date,
        amount: parseInt(row.daily_total)
      })),
      unit_economics: [
        {
          label: 'Avg Order Value',
          value: Math.round(currentRevenue / (modelBreakdown.rows.reduce((acc: number, r: any) => acc + parseInt(r.count), 0) || 1)) || 0,
          status: currentRevenue > 50000 ? 'Healthy' : 'Low'
        },
        {
          label: 'Profit Margin',
          value: Math.round((currentProfit / (currentRevenue || 1)) * 100),
          status: (currentProfit / (currentRevenue || 1)) > 0.15 ? 'Healthy' : 'Critical'
        },
      ]
    });
  } catch (error: any) {
    console.error('Error fetching financial stats:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getPayouts = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT p.*, u.full_name as courier_name, u.phone_number as courier_phone
      FROM payout_records p
      JOIN users u ON p.courier_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching payouts:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCourierPayoutAccounts = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const params: string[] = [];
    let statusFilter = '';

    if (status && status !== 'all') {
      params.push(status);
      statusFilter = `WHERE cpa.status = $${params.length}`;
    }

    const result = await readDb.query(
      `SELECT
         cpa.id,
         cpa.courier_id,
         cpa.courier_profile_id,
         u.full_name AS courier_name,
         u.phone_number AS courier_phone,
         cp.application_channel,
         cpa.bank_code,
         ('**** ' || cpa.account_number_last4) AS account_number,
         cpa.account_name,
         cpa.status,
         cpa.is_primary,
         cpa.verified_at,
         cpa.rejected_reason,
         cpa.suspended_reason,
         cpa.created_at,
         cpa.updated_at
       FROM courier_payout_accounts cpa
       JOIN users u ON u.id = cpa.courier_id
       LEFT JOIN courier_profiles cp ON cp.id = cpa.courier_profile_id
       ${statusFilter}
       ORDER BY
         CASE cpa.status
           WHEN 'pending_review' THEN 1
           WHEN 'verified' THEN 2
           WHEN 'suspended' THEN 3
           ELSE 4
         END,
         cpa.created_at DESC
       LIMIT 200`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Error fetching courier payout accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCourierPayoutAccountStatus = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { status, reason } = req.body || {};

  if (!['verified', 'rejected', 'suspended', 'pending_review'].includes(status)) {
    res.status(400).json({ success: false, error: 'Invalid payout account status' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const actorId = adminActorId(req);
    const existing = await client.query(
      `SELECT *
       FROM courier_payout_accounts
       WHERE id = $1::uuid
       FOR UPDATE`,
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Payout account not found' });
      return;
    }

    const current = existing.rows[0];
    const result = await client.query(
      `UPDATE courier_payout_accounts
       SET status = $1::varchar,
           verified_by = CASE WHEN $1::text = 'verified' THEN $2::uuid ELSE verified_by END,
           verified_at = CASE WHEN $1::text = 'verified' THEN NOW() ELSE verified_at END,
           rejected_reason = CASE WHEN $1::text = 'rejected' THEN $3::text ELSE NULL END,
           suspended_reason = CASE WHEN $1::text = 'suspended' THEN $3::text ELSE NULL END,
           updated_at = NOW()
       WHERE id = $4::uuid
       RETURNING *`,
      [status, actorId, reason || null, id]
    );

    await writeFinanceAudit(
      client,
      `courier_payout_account:${id}`,
      actorId,
      reason || `Updated payout account status to ${status}`,
      { before: current, after: result.rows[0] }
    );

    await writeCourierPayoutFinanceAudit(
      client,
      req,
      {
        eventType: 'account_status_changed',
        courierId: result.rows[0].courier_id,
        subjectType: 'courier_payout_account',
        subjectId: id,
        oldStatus: current.status,
        newStatus: result.rows[0].status,
        reason: reason || null,
        before: current,
        after: result.rows[0],
      }
    );

    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error updating courier payout account:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const getCourierPayoutRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const params: string[] = [];
    let statusFilter = '';

    if (status && status !== 'all') {
      params.push(status);
      statusFilter = `WHERE pr.status = $${params.length}`;
    }

    const result = await readDb.query(
      `SELECT
         pr.id,
         pr.request_number,
         pr.courier_id,
         u.full_name AS courier_name,
         u.phone_number AS courier_phone,
         cp.application_channel,
         pr.amount_idr,
         pr.fee_idr,
         pr.net_amount_idr,
         pr.status,
         pr.destination_snapshot,
         pr.risk_snapshot,
         pr.provider_name,
         pr.provider_reference,
         pr.provider_payload_hash,
         pr.provider_response_hash,
         rd.decision AS risk_decision,
         rd.risk_level,
         rd.risk_score,
         rd.reasons AS risk_reasons,
         rd.rule_hits AS risk_rule_hits,
         d.provider_status,
         d.request_payload_hash AS dispatch_payload_hash,
         d.response_hash AS dispatch_response_hash,
         d.dispatched_at,
         d.completed_at,
         pr.failure_reason,
         pr.requested_at,
         pr.reviewed_at,
         pr.processed_at,
         pr.paid_at
       FROM courier_payout_requests pr
       JOIN users u ON u.id = pr.courier_id
       LEFT JOIN courier_profiles cp ON cp.user_id = pr.courier_id
       LEFT JOIN LATERAL (
         SELECT decision, risk_level, risk_score, reasons, rule_hits
         FROM courier_payout_risk_decisions
         WHERE payout_request_id = pr.id
         ORDER BY created_at DESC
         LIMIT 1
       ) rd ON TRUE
       LEFT JOIN LATERAL (
         SELECT provider_status, request_payload_hash, response_hash, dispatched_at, completed_at
         FROM courier_payout_dispatches
         WHERE payout_request_id = pr.id
         ORDER BY created_at DESC
         LIMIT 1
       ) d ON TRUE
       ${statusFilter}
       ORDER BY
         CASE pr.status
           WHEN 'risk_screening' THEN 1
           WHEN 'risk_hold' THEN 2
           WHEN 'manual_review' THEN 3
           WHEN 'under_review' THEN 4
           WHEN 'approved_auto' THEN 5
           WHEN 'approved' THEN 6
           WHEN 'processing' THEN 7
           WHEN 'failed' THEN 8
           WHEN 'rejected' THEN 9
           WHEN 'blocked' THEN 10
           ELSE 11
         END,
         pr.requested_at DESC
       LIMIT 200`,
      params
    );

    res.json({
      success: true,
      data: result.rows.map((row) => decoratePayoutRequest(row)),
      meta: {
        active_count: result.rows.filter((row) => activePayoutStatuses.includes(row.status)).length,
        auto_approved_count: result.rows.filter((row) => row.status === 'approved_auto' || row.risk_decision === 'auto_approved').length,
        manual_review_count: result.rows.filter((row) => ['risk_hold', 'manual_review', 'under_review'].includes(row.status) || row.risk_decision === 'manual_review').length,
        blocked_count: result.rows.filter((row) => row.status === 'blocked' || row.risk_decision === 'blocked').length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching courier payout requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCourierPayoutRequestStatus = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { status, reference, reason } = req.body || {};

  if (!['risk_hold', 'manual_review', 'under_review', 'approved', 'processing', 'paid', 'failed', 'rejected', 'blocked', 'cancelled'].includes(status)) {
    res.status(400).json({ success: false, error: 'Invalid payout request status' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const actorId = adminActorId(req);
    const existing = await client.query(
      `SELECT *
       FROM courier_payout_requests
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Payout request not found' });
      return;
    }

    const current = existing.rows[0];
    const terminalStatuses = ['paid', 'failed', 'rejected', 'blocked', 'cancelled'];
    if (terminalStatuses.includes(current.status) && current.status !== status) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Terminal payout request cannot be changed' });
      return;
    }

    const allowedTransitions: Record<string, string[]> = {
      requested: ['under_review', 'approved', 'processing', 'paid', 'failed', 'rejected', 'cancelled'],
      risk_screening: ['risk_hold', 'manual_review', 'approved', 'processing', 'paid', 'failed', 'rejected', 'blocked', 'cancelled'],
      approved_auto: ['processing', 'paid', 'failed', 'cancelled'],
      risk_hold: ['manual_review', 'under_review', 'approved', 'failed', 'rejected', 'blocked', 'cancelled'],
      manual_review: ['under_review', 'approved', 'failed', 'rejected', 'blocked', 'cancelled'],
      under_review: ['approved', 'processing', 'paid', 'failed', 'rejected', 'blocked', 'cancelled'],
      approved: ['processing', 'paid', 'failed', 'cancelled'],
      processing: ['paid', 'failed'],
      paid: ['paid'],
      failed: ['failed'],
      rejected: ['rejected'],
      blocked: ['blocked'],
      cancelled: ['cancelled'],
    };

    if (!allowedTransitions[current.status]?.includes(status)) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: `Invalid payout transition ${current.status} -> ${status}` });
      return;
    }

    const result = await client.query(
      `UPDATE courier_payout_requests
       SET status = $1::varchar,
           reviewed_by = CASE WHEN $1::text IN ('risk_hold', 'manual_review', 'under_review', 'approved', 'rejected', 'blocked') THEN $2::uuid ELSE reviewed_by END,
           reviewed_at = CASE WHEN $1::text IN ('risk_hold', 'manual_review', 'under_review', 'approved', 'rejected', 'blocked') THEN NOW() ELSE reviewed_at END,
           processed_by = CASE WHEN $1::text IN ('processing', 'paid', 'failed') THEN $2::uuid ELSE processed_by END,
           processed_at = CASE WHEN $1::text IN ('processing', 'paid', 'failed') THEN NOW() ELSE processed_at END,
           paid_at = CASE WHEN $1::text = 'paid' THEN NOW() ELSE paid_at END,
           failure_reason = CASE WHEN $1::text IN ('failed', 'rejected', 'blocked', 'cancelled') THEN $3::text ELSE failure_reason END,
           risk_snapshot = risk_snapshot || $4::jsonb,
           updated_at = NOW()
       WHERE id = $5::uuid
       RETURNING *`,
      [
        status,
        actorId,
        reason || null,
        JSON.stringify({ admin_reference: reference || null, admin_reason: reason || null }),
        id,
      ]
    );

    if (['failed', 'rejected', 'blocked', 'cancelled'].includes(status)) {
      const reversalExists = await client.query(
        `SELECT 1
         FROM courier_earnings_ledger
         WHERE payout_request_id = $1
           AND transaction_type = 'payout_failed'
         LIMIT 1`,
        [id]
      );

      if (reversalExists.rows.length === 0) {
        const reversalDescription = status === 'failed'
          ? 'Pencairan gagal, saldo dikembalikan'
          : 'Pencairan dibatalkan, saldo dikembalikan';

        await client.query(
          `INSERT INTO courier_earnings_ledger (
             courier_id,
             source,
             direction,
             amount_idr,
             settlement_status,
             transaction_type,
             payout_request_id,
             description,
             metadata
           ) VALUES ($1, 'payout', 'credit', $2, 'available', 'payout_failed', $3, $4, $5)`,
          [
            current.courier_id,
            current.amount_idr,
            id,
            reversalDescription,
            JSON.stringify({ previous_status: current.status, new_status: status, reason: reason || null }),
          ]
        );
      }
    }

    await writeFinanceAudit(
      client,
      `courier_payout_request:${id}`,
      actorId,
      reason || `Updated courier payout request to ${status}`,
      { before: current, after: result.rows[0], reference: reference || null }
    );

    await writeCourierPayoutFinanceAudit(
      client,
      req,
      {
        eventType: 'request_status_changed',
        courierId: result.rows[0].courier_id,
        payoutRequestId: id,
        subjectType: 'courier_payout_request',
        subjectId: id,
        oldStatus: current.status,
        newStatus: result.rows[0].status,
        reason: reason || null,
        reference: reference || null,
        before: current,
        after: result.rows[0],
      }
    );

    await evaluatePayoutAlerts(client);

    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error updating courier payout request:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const getCourierPayoutReviewQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT
        pr.id,
        pr.request_number,
        pr.courier_id,
        u.full_name AS courier_name,
        u.phone_number AS courier_phone,
        cp.application_channel,
        pr.amount_idr,
        pr.fee_idr,
        pr.net_amount_idr,
        pr.status,
        pr.destination_snapshot,
        pr.risk_snapshot,
        pr.review_metadata,
        pr.requested_at,
        pr.reviewed_at,
        rd.decision AS risk_decision,
        rd.risk_level,
        COALESCE(rd.risk_score, 0) AS risk_score,
        COALESCE(rd.reasons, ARRAY[]::text[]) AS risk_reasons,
        rd.rule_hits AS risk_rule_hits,
        rd.device_id,
        rd.ip_address::text AS ip_address,
        rd.user_agent,
        (
          CASE pr.status
            WHEN 'blocked' THEN 1000
            WHEN 'risk_hold' THEN 800
            WHEN 'manual_review' THEN 700
            ELSE 600
          END
          + COALESCE(rd.risk_score, 0) * 10
          + CASE WHEN pr.amount_idr >= 1000000 THEN 100 WHEN pr.amount_idr >= 500000 THEN 50 ELSE 0 END
          + LEAST(EXTRACT(EPOCH FROM (NOW() - pr.requested_at)) / 3600, 72)::int
        ) AS priority_score
      FROM courier_payout_requests pr
      JOIN users u ON u.id = pr.courier_id
      LEFT JOIN courier_profiles cp ON cp.user_id = pr.courier_id
      LEFT JOIN LATERAL (
        SELECT decision, risk_level, risk_score, reasons, rule_hits, device_id, ip_address, user_agent
        FROM courier_payout_risk_decisions
        WHERE payout_request_id = pr.id
        ORDER BY created_at DESC
        LIMIT 1
      ) rd ON TRUE
      WHERE pr.status IN ('risk_hold', 'manual_review', 'under_review', 'blocked')
      ORDER BY priority_score DESC, pr.requested_at ASC
      LIMIT 100
    `);

    res.json({
      success: true,
      data: result.rows.map((row) => ({
        ...decoratePayoutRequest(row),
        priority_score: Number(row.priority_score || 0),
        device_id: row.device_id,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
      })),
      meta: {
        total: result.rows.length,
        critical_count: result.rows.filter((row) => row.status === 'blocked' || row.risk_level === 'critical').length,
        high_count: result.rows.filter((row) => row.risk_level === 'high').length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching courier payout review queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getCourierPayoutRequestDetail = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);

  try {
    const requestResult = await readDb.query(
      `SELECT
         pr.*,
         u.full_name AS courier_name,
         u.phone_number AS courier_phone,
         cp.application_channel,
         cpa.bank_code AS current_bank_code,
         ('**** ' || cpa.account_number_last4) AS current_account_number,
         cpa.account_name AS current_account_name,
         cpa.status AS payout_account_status,
         rd.decision AS risk_decision,
         rd.risk_level,
         rd.risk_score,
         rd.reasons AS risk_reasons,
         rd.rule_hits AS risk_rule_hits,
         rd.input_snapshot AS risk_input_snapshot,
         rd.device_id,
         rd.ip_address::text AS ip_address,
         rd.user_agent,
         rd.created_at AS risk_created_at
       FROM courier_payout_requests pr
       JOIN users u ON u.id = pr.courier_id
       LEFT JOIN courier_profiles cp ON cp.user_id = pr.courier_id
       LEFT JOIN courier_payout_accounts cpa ON cpa.id = pr.payout_account_id
       LEFT JOIN LATERAL (
         SELECT *
         FROM courier_payout_risk_decisions
         WHERE payout_request_id = pr.id
         ORDER BY created_at DESC
         LIMIT 1
       ) rd ON TRUE
       WHERE pr.id = $1::uuid`,
      [id]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Payout request not found' });
      return;
    }

    const request = requestResult.rows[0];

    const [ledgerSources, payoutHistory, securityEvents] = await Promise.all([
      readDb.query(
        `SELECT
           id,
           order_id,
           source,
           direction,
           amount_idr,
           settlement_status,
           transaction_type,
           payout_request_id,
           description,
           metadata,
           created_at
         FROM courier_earnings_ledger
         WHERE payout_request_id = $1::uuid
            OR (courier_id = $2::uuid AND direction = 'credit' AND settlement_status = 'available')
         ORDER BY
           CASE WHEN payout_request_id = $1::uuid THEN 0 ELSE 1 END,
           created_at DESC
         LIMIT 50`,
        [id, request.courier_id]
      ),
      readDb.query(
        `SELECT
           id,
           request_number,
           amount_idr,
           fee_idr,
           net_amount_idr,
           status,
           provider_name,
           provider_reference,
           failure_reason,
           requested_at,
           reviewed_at,
           processed_at,
           paid_at
         FROM courier_payout_requests
         WHERE courier_id = $1::uuid
         ORDER BY requested_at DESC
         LIMIT 20`,
        [request.courier_id]
      ),
      readDb.query(
        `SELECT
           id,
           event_type,
           severity,
           actor_id,
           actor_role,
           subject_type,
           old_status,
           new_status,
           ip_address::text AS ip_address,
           user_agent,
           device_id,
           metadata,
           created_at
         FROM courier_payout_security_events
         WHERE payout_request_id = $1::uuid
            OR courier_id = $2::uuid
         ORDER BY created_at DESC
         LIMIT 30`,
        [id, request.courier_id]
      ),
    ]);

    res.json({
      success: true,
      data: {
        request: decoratePayoutRequest(request),
        risk: {
          decision: request.risk_decision,
          level: request.risk_level,
          score: request.risk_score,
          reasons: request.risk_reasons || [],
          rule_hits: request.risk_rule_hits || [],
          input_snapshot: request.risk_input_snapshot || {},
          device_id: request.device_id,
          ip_address: request.ip_address,
          user_agent: request.user_agent,
          created_at: request.risk_created_at,
        },
        payout_account: {
          bank_code: request.current_bank_code || request.destination_snapshot?.bank_code,
          account_number: request.current_account_number || `**** ${request.destination_snapshot?.account_number_last4 || ''}`.trim(),
          account_name: request.current_account_name || request.destination_snapshot?.account_name,
          status: request.payout_account_status,
        },
        ledger_sources: ledgerSources.rows,
        payout_history: payoutHistory.rows,
        security_events: securityEvents.rows,
      },
    });
  } catch (error: any) {
    console.error('Error fetching courier payout request detail:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const reviewCourierPayoutRequestAction = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { action, reason } = req.body || {};

  if (!['approve', 'reject', 'request_more_verification', 'suspend_payout_account'].includes(action)) {
    res.status(400).json({ success: false, error: 'Invalid payout review action' });
    return;
  }

  if (!reason || String(reason).trim().length < 8) {
    res.status(400).json({ success: false, error: 'Review reason is required' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const actorId = adminActorId(req);
    const existing = await client.query(
      `SELECT pr.*, cpa.id AS account_id, cpa.status AS account_status
       FROM courier_payout_requests pr
       LEFT JOIN courier_payout_accounts cpa ON cpa.id = pr.payout_account_id
       WHERE pr.id = $1::uuid
       FOR UPDATE OF pr`,
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Payout request not found' });
      return;
    }

    const current = existing.rows[0];
    const terminalStatuses = ['paid', 'failed', 'rejected', 'cancelled'];
    if (terminalStatuses.includes(current.status)) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Terminal payout request cannot be reviewed' });
      return;
    }

    if (action === 'approve' && current.status === 'blocked') {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Blocked payout requires a new request after verification' });
      return;
    }

    const actionStatus: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      request_more_verification: 'under_review',
      suspend_payout_account: 'risk_hold',
    };

    if (action === 'suspend_payout_account' && current.account_id) {
      await client.query(
        `UPDATE courier_payout_accounts
         SET status = 'suspended',
             suspended_reason = $1::text,
             updated_at = NOW()
         WHERE id = $2::uuid`,
        [reason, current.account_id]
      );
    }

    const reviewPatch = {
      last_action: action,
      last_reason: reason,
      last_actor_id: actorId,
      last_action_at: new Date().toISOString(),
      totp_required: true,
    };

    const nextStatus = actionStatus[action];
    const updated = await client.query(
      `UPDATE courier_payout_requests
       SET status = $1::varchar,
           reviewed_by = $2::uuid,
           reviewed_at = NOW(),
           failure_reason = CASE WHEN $1::text IN ('rejected', 'blocked') THEN $3::text ELSE failure_reason END,
           review_metadata = review_metadata || $4::jsonb,
           risk_snapshot = risk_snapshot || $5::jsonb,
           updated_at = NOW()
       WHERE id = $6::uuid
       RETURNING *`,
      [
        nextStatus,
        actorId,
        reason,
        JSON.stringify(reviewPatch),
        JSON.stringify({ admin_review_action: action, admin_review_reason: reason }),
        id,
      ]
    );

    if (action === 'reject' || action === 'suspend_payout_account') {
      const reversalExists = await client.query(
        `SELECT 1
         FROM courier_earnings_ledger
         WHERE payout_request_id = $1::uuid
           AND transaction_type = 'payout_failed'
         LIMIT 1`,
        [id]
      );

      if (reversalExists.rows.length === 0) {
        await client.query(
          `INSERT INTO courier_earnings_ledger (
             courier_id,
             source,
             direction,
             amount_idr,
             settlement_status,
             transaction_type,
             payout_request_id,
             description,
             metadata
           ) VALUES ($1, 'payout', 'credit', $2, 'available', 'payout_failed', $3, $4, $5)`,
          [
            current.courier_id,
            current.amount_idr,
            id,
            action === 'reject'
              ? 'Pencairan ditolak admin, saldo dikembalikan'
              : 'Rekening pencairan disuspend, saldo dikembalikan',
            JSON.stringify({ action, previous_status: current.status, new_status: nextStatus, reason }),
          ]
        );
      }
    }

    await writeFinanceAudit(
      client,
      `courier_payout_review:${id}`,
      actorId,
      reason,
      { action, before: current, after: updated.rows[0] }
    );

    await writeCourierPayoutFinanceAudit(client, req, {
      eventType: 'payout_review_action',
      courierId: current.courier_id,
      payoutRequestId: id,
      subjectType: 'courier_payout_request',
      subjectId: id,
      oldStatus: current.status,
      newStatus: updated.rows[0].status,
      reason,
      reference: action,
      before: current,
      after: updated.rows[0],
    });

    if (action === 'suspend_payout_account' && current.account_id) {
      await writeCourierPayoutFinanceAudit(client, req, {
        eventType: 'account_status_changed',
        courierId: current.courier_id,
        payoutRequestId: id,
        subjectType: 'courier_payout_account',
        subjectId: current.account_id,
        oldStatus: current.account_status || 'unknown',
        newStatus: 'suspended',
        reason,
        reference: action,
        before: { id: current.account_id, status: current.account_status },
        after: { id: current.account_id, status: 'suspended' },
      });
    }

    await evaluatePayoutAlerts(client);
    await client.query('COMMIT');
    res.json({ success: true, data: decoratePayoutRequest(updated.rows[0]) });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error reviewing courier payout request:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const updatePayoutStatus = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status, reference, reason } = req.body;

  if (!['processing', 'completed', 'failed'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const updateQuery = `
      UPDATE payout_records 
      SET 
        disbursement_status = $1, 
        disbursement_ref = COALESCE($2, disbursement_ref),
        disbursed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE disbursed_at END,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;
    const result = await client.query(updateQuery, [status, reference, id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Payout record not found' });
      return;
    }

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`payout:${id}`, status === 'completed', changedBy, reason || `Updated payout status to ${status}`, JSON.stringify(result.rows[0]), 'finance']
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error updating payout status:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const batchReleasePayouts = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE payout_records 
      SET 
        disbursement_status = 'completed', 
        disbursed_at = NOW(),
        updated_at = NOW()
      WHERE disbursement_status = 'pending'
      RETURNING id
    `);

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['payout:batch_release', true, changedBy, `Batch released ${result.rows.length} payouts`, JSON.stringify({ count: result.rows.length }), 'finance']
    );

    await client.query('COMMIT');
    res.json({ success: true, count: result.rows.length });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error batch releasing payouts:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const runCourierPayoutDispatcher = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await dispatchApprovedPayouts(db, req);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error running courier payout dispatcher:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const runCourierPayoutReconciliation = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await runPayoutReconciliation(db, req);
    await evaluatePayoutAlerts(db);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error running courier payout reconciliation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getCourierPayoutOpsDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await getPayoutOpsDashboard(readDb);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error fetching courier payout ops dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const handleCourierPayoutProviderWebhook = async (req: Request, res: Response): Promise<void> => {
  const rawBody = (req as any).rawBody as Buffer | undefined;
  const bodyBuffer = rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const signature = String(
    req.headers['x-tembus-signature'] ||
      req.headers['x-lancar-signature'] ||
      req.headers['x-provider-signature'] ||
      '',
  );
  const secret = process.env.PAYOUT_PROVIDER_WEBHOOK_SECRET || '';
  const providerName = String(req.body?.provider || req.body?.provider_name || process.env.PAYOUT_PROVIDER_NAME || 'stub');
  const eventId = String(req.body?.event_id || req.body?.id || '');
  const providerReference = String(req.body?.provider_reference || req.body?.reference || '');
  const providerStatus = String(req.body?.status || '').toLowerCase();

  if (!verifyProviderWebhookSignature(bodyBuffer, signature, secret)) {
    await insertWebhookAuditEvent(db, req, {
      providerName,
      providerEventId: eventId || null,
      providerReference: providerReference || null,
      eventType: providerStatus || null,
      verificationStatus: signature ? 'invalid' : 'missing_signature',
      processingStatus: 'failed',
      payload: req.body || {},
      rawBody: bodyBuffer,
      signature: signature || null,
      errorCode: signature ? 'invalid_signature' : 'missing_signature',
    });
    await writePayoutAuditEvent(db, req, {
      eventType: 'payout_provider_signature_failed',
      severity: 'critical',
      actorRole: 'provider',
      subjectType: 'courier_payout_provider_webhook',
      metadata: {
        provider_name: providerName,
        provider_reference: providerReference || null,
        payload_hash: sha256Hex(bodyBuffer),
      },
    });
    res.status(401).json({ success: false, error: 'Invalid webhook request' });
    return;
  }

  if (!eventId || !providerReference || !['processing', 'paid', 'failed'].includes(providerStatus)) {
    await insertWebhookAuditEvent(db, req, {
      providerName,
      providerEventId: eventId || null,
      providerReference: providerReference || null,
      eventType: providerStatus || null,
      verificationStatus: 'invalid_payload',
      processingStatus: 'failed',
      payload: req.body || {},
      rawBody: bodyBuffer,
      signature: signature || null,
      errorCode: 'invalid_payload',
    });
    res.status(400).json({ success: false, error: 'Invalid webhook request' });
    return;
  }

  const client = await db.connect();
  let auditEventId: string | null = null;
  try {
    await client.query('BEGIN');
    const payloadHash = sha256Hex(bodyBuffer);
    const signatureHash = sha256Hex(signature);

    const auditInsert = await insertWebhookAuditEvent(client, req, {
      providerName,
      providerEventId: eventId,
      providerReference,
      eventType: providerStatus,
      verificationStatus: 'valid',
      processingStatus: 'received',
      payload: req.body || {},
      rawBody: bodyBuffer,
      signature,
    });

    if (auditInsert.duplicate) {
      await client.query('ROLLBACK');
      res.json({ success: true, duplicate: true });
      return;
    }
    auditEventId = auditInsert.id;

    const eventResult = await client.query(
      `INSERT INTO courier_payout_provider_webhook_events (
         provider_name,
         provider_event_id,
         provider_reference,
         payload_hash,
         signature_hash,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider_name, provider_event_id) DO NOTHING
       RETURNING id`,
      [providerName, eventId, providerReference, payloadHash, signatureHash, providerStatus],
    );

    if (eventResult.rows.length === 0) {
      await updateWebhookAuditEvent(client, auditEventId, 'duplicate');
      await client.query('COMMIT');
      res.json({ success: true, duplicate: true });
      return;
    }

    const result = await applyProviderCallback(client, {
      providerName,
      providerReference,
      providerStatus: providerStatus as any,
      response: req.body || {},
      failureReason: req.body?.failure_reason || req.body?.reason || null,
      req,
    });

    await client.query(
      `UPDATE courier_payout_provider_webhook_events
       SET processed_at = NOW()
       WHERE provider_name = $1
         AND provider_event_id = $2`,
      [providerName, eventId],
    );
    await updateWebhookAuditEvent(client, auditEventId, 'processed');

    await evaluatePayoutAlerts(client);
    await client.query('COMMIT');
    res.json({ success: true, data: result });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error handling payout provider webhook:', error);
    if (auditEventId) {
      await updateWebhookAuditEvent(db, auditEventId, 'failed', 'processing_failed').catch(() => undefined);
    }
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  } finally {
    client.release();
  }
};

export const exportPayouts = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT p.id, u.full_name as courier_name, u.phone_number as courier_phone,
             p.net_idr, p.disbursement_status, p.disbursement_ref,
             p.created_at, p.disbursement_at
      FROM payout_records p
      JOIN users u ON p.courier_id = u.id
      ORDER BY p.created_at DESC
    `);

    const csvRows = [
      ['Payout ID', 'Courier', 'Phone', 'Amount (IDR)', 'Status', 'Reference', 'Created At', 'Disbursed At'].join(','),
      ...result.rows.map(r => [
        r.id,
        `"${r.courier_name}"`,
        r.courier_phone || '',
        r.net_idr,
        r.disbursement_status,
        r.disbursement_ref || '',
        new Date(r.created_at).toISOString().split('T')[0],
        r.disbursement_at ? new Date(r.disbursement_at).toISOString().split('T')[0] : ''
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=payouts_export.csv');
    res.send(csvRows);
  } catch (error: any) {
    console.error('Error exporting payouts:', error);
    res.status(500).json({ error: error.message });
  }
};

export const exportCourierPayoutRiskAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT
        pr.request_number,
        pr.status,
        pr.provider_name,
        pr.provider_reference,
        u.full_name AS courier_name,
        pr.amount_idr,
        rd.decision,
        rd.risk_level,
        rd.risk_score,
        array_to_string(rd.reasons, ' | ') AS reasons,
        rd.device_id,
        rd.ip_address::text AS ip_address,
        rd.created_at
      FROM courier_payout_risk_decisions rd
      JOIN courier_payout_requests pr ON pr.id = rd.payout_request_id
      JOIN users u ON u.id = rd.courier_id
      ORDER BY rd.created_at DESC
      LIMIT 5000
    `);

    const csvRows = [
      ['Request Number', 'Status', 'Provider', 'Provider Reference', 'Courier', 'Amount', 'Decision', 'Risk Level', 'Risk Score', 'Reasons', 'Device ID', 'IP Address', 'Created At'].join(','),
      ...result.rows.map((row) => [
        row.request_number,
        row.status,
        row.provider_name || '',
        row.provider_reference || '',
        `"${String(row.courier_name || '').replace(/"/g, '""')}"`,
        row.amount_idr,
        row.decision,
        row.risk_level,
        row.risk_score,
        `"${String(row.reasons || '').replace(/"/g, '""')}"`,
        row.device_id || '',
        row.ip_address || '',
        new Date(row.created_at).toISOString(),
      ].join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=courier_payout_risk_audit.csv');
    res.send(csvRows);
  } catch (error: any) {
    console.error('Error exporting courier payout risk audit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const topUpEmergencyFund = async (req: Request, res: Response): Promise<void> => {
  const { amount, reason } = req.body;

  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const configKey = 'emergency_fund_base';
    const checkRes = await client.query('SELECT value FROM system_configs WHERE key = $1', [configKey]);

    let currentBase = 0;
    if (checkRes.rows.length > 0) {
      currentBase = parseInt(JSON.parse(checkRes.rows[0].value)) || 0;
    }

    const newBase = currentBase + amount;

    await client.query(
      `INSERT INTO system_configs (key, value, description, category, updated_at)
       VALUES ($1, $2, $3, 'finance', NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [configKey, JSON.stringify(newBase), 'Base emergency fund balance']
    );

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['finance:emergency_fund_topup', true, changedBy, reason || `Top up emergency fund by ${amount}`, JSON.stringify({ amount, newTotal: newBase }), 'finance']
    );

    await client.query('COMMIT');
    res.json({ success: true, newTotal: newBase });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error topping up emergency fund:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const getFinancialSummary = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT 
        COALESCE(SUM(amount_idr), 0) as gross_revenue,
        COALESCE(SUM(amount_idr) * 0.25, 0) as net_profit, 
        COALESCE(SUM(amount_idr) * 0.75, 0) as operational_cost
      FROM payments
      WHERE status = 'paid'
    `);
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getRevenueBreakdown = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT model as name, SUM(total_price_idr) as value
      FROM orders
      WHERE status = 'delivered'
      GROUP BY model
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCostBreakdown = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      WITH settled_orders AS (
        SELECT
          COALESCE(SUM(courier_payout_estimate_idr), 0)::bigint AS courier_payouts
        FROM orders
        WHERE status IN ('delivered', 'completed')
      ),
      paid_payments AS (
        SELECT
          COALESCE(SUM(mdr_amount_idr + ppn_amount_idr), 0)::bigint AS payment_processing,
          COALESCE(SUM(weather_reserve_idr), 0)::bigint AS weather_reserve,
          COALESCE(SUM(insurance_reserve_idr), 0)::bigint AS insurance_reserve
        FROM payments
        WHERE status IN ('paid', 'settled', 'success')
      )
      SELECT 'Courier Payouts' AS name, courier_payouts AS value FROM settled_orders
      UNION ALL
      SELECT 'Payment Processing' AS name, payment_processing AS value FROM paid_payments
      UNION ALL
      SELECT 'Weather Reserve' AS name, weather_reserve AS value FROM paid_payments
      UNION ALL
      SELECT 'Insurance Reserve' AS name, insurance_reserve AS value FROM paid_payments
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getEmergencyFund = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query("SELECT value FROM system_configs WHERE key = 'emergency_fund'");
    res.json(result.rows[0] || { value: 0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
