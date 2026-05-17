import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { evaluatePayoutAlerts, writePayoutAuditEvent } from '../utils/payoutObservability';

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
    eventType: 'account_status_changed' | 'request_status_changed';
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
         pr.failure_reason,
         pr.requested_at,
         pr.reviewed_at,
         pr.processed_at,
         pr.paid_at
       FROM courier_payout_requests pr
       JOIN users u ON u.id = pr.courier_id
       LEFT JOIN courier_profiles cp ON cp.user_id = pr.courier_id
       ${statusFilter}
       ORDER BY
         CASE pr.status
           WHEN 'requested' THEN 1
           WHEN 'under_review' THEN 2
           WHEN 'approved' THEN 3
           WHEN 'processing' THEN 4
           WHEN 'failed' THEN 5
           WHEN 'rejected' THEN 6
           ELSE 7
         END,
         pr.requested_at DESC
       LIMIT 200`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Error fetching courier payout requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCourierPayoutRequestStatus = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { status, reference, reason } = req.body || {};

  if (!['under_review', 'approved', 'processing', 'paid', 'failed', 'rejected', 'cancelled'].includes(status)) {
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
    const terminalStatuses = ['paid', 'failed', 'rejected', 'cancelled'];
    if (terminalStatuses.includes(current.status) && current.status !== status) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Terminal payout request cannot be changed' });
      return;
    }

    const allowedTransitions: Record<string, string[]> = {
      requested: ['under_review', 'approved', 'processing', 'paid', 'failed', 'rejected', 'cancelled'],
      under_review: ['approved', 'processing', 'paid', 'failed', 'rejected', 'cancelled'],
      approved: ['processing', 'paid', 'failed', 'cancelled'],
      processing: ['paid', 'failed'],
      paid: ['paid'],
      failed: ['failed'],
      rejected: ['rejected'],
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
           reviewed_by = CASE WHEN $1::text IN ('under_review', 'approved', 'rejected') THEN $2::uuid ELSE reviewed_by END,
           reviewed_at = CASE WHEN $1::text IN ('under_review', 'approved', 'rejected') THEN NOW() ELSE reviewed_at END,
           processed_by = CASE WHEN $1::text IN ('processing', 'paid', 'failed') THEN $2::uuid ELSE processed_by END,
           processed_at = CASE WHEN $1::text IN ('processing', 'paid', 'failed') THEN NOW() ELSE processed_at END,
           paid_at = CASE WHEN $1::text = 'paid' THEN NOW() ELSE paid_at END,
           failure_reason = CASE WHEN $1::text IN ('failed', 'rejected', 'cancelled') THEN $3::text ELSE failure_reason END,
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

    if (['failed', 'rejected', 'cancelled'].includes(status)) {
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
    res.json([
      { name: 'Courier Payouts', value: 75000000 },
      { name: 'Insurance', value: 5000000 },
      { name: 'Infrastructure', value: 12000000 },
      { name: 'Marketing', value: 8000000 }
    ]);
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
