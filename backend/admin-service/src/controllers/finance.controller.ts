import { Request, Response } from 'express';
import { db, readDb } from '../db';

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
