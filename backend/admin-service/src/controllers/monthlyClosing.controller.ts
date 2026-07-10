import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

export const getAccountingPeriods = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT * FROM accounting_periods
      ORDER BY period_code DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error fetching accounting periods:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const lockAccountingPeriod = async (req: Request, res: Response): Promise<void> => {
  const { period_code, closing_notes } = req.body;
  if (!period_code) {
    res.status(400).json({ success: false, error: 'period_code is required (e.g. 2026-06)' });
    return;
  }

  const actorId = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const upsertRes = await client.query(`
      INSERT INTO accounting_periods (period_code, status, locked_at, locked_by, closing_notes, updated_at)
      VALUES ($1, 'CLOSED', NOW(), $2, $3, NOW())
      ON CONFLICT (period_code)
      DO UPDATE SET status = 'CLOSED', locked_at = NOW(), locked_by = $2, closing_notes = $3, updated_at = NOW()
      RETURNING *
    `, [period_code, actorId, closing_notes || 'Monthly period locked by admin']);

    await client.query(`
      INSERT INTO system_audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
      VALUES ($1, 'LOCK_PERIOD', 'accounting_periods', $2, $3, NOW())
    `, [actorId, period_code, JSON.stringify(upsertRes.rows[0])]);

    await client.query('COMMIT');
    res.json({ success: true, data: upsertRes.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Error locking accounting period:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const generateProfitAndLoss = async (req: Request, res: Response): Promise<void> => {
  try {
    const { period_code } = req.query;
    let periodFilter = '';
    const params: any[] = [];

    if (period_code) {
      params.push(period_code);
      periodFilter = `AND TO_CHAR(e.created_at, 'YYYY-MM') = $1`;
    }

    const result = await readDb.query(`
      SELECT 
        e.account_name,
        COALESCE(SUM(e.credit_idr), 0) as total_credit,
        COALESCE(SUM(e.debit_idr), 0) as total_debit
      FROM ledger_entries e
      WHERE 1=1 ${periodFilter}
      GROUP BY e.account_name
      ORDER BY e.account_name ASC
    `, params);

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalExpenses = 0;

    const breakdown = result.rows.map(row => {
      const netCredit = Number(row.total_credit) - Number(row.total_debit);
      const name = row.account_name || '';

      if (name.startsWith('4') || name.toLowerCase().includes('pendapatan') || name.toLowerCase().includes('revenue')) {
        totalRevenue += netCredit;
      } else if (name.startsWith('5') || name.toLowerCase().includes('beban pokok') || name.toLowerCase().includes('cogs')) {
        totalCogs += Number(row.total_debit) - Number(row.total_credit);
      } else if (name.startsWith('6') || name.toLowerCase().includes('beban') || name.toLowerCase().includes('expense')) {
        totalExpenses += Number(row.total_debit) - Number(row.total_credit);
      }

      return {
        accountName: row.account_name,
        totalCredit: Number(row.total_credit),
        totalDebit: Number(row.total_debit),
      };
    });

    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit - totalExpenses;

    res.json({
      success: true,
      data: {
        periodCode: period_code || 'ALL',
        breakdown,
        summary: {
          totalRevenue,
          totalCogs,
          grossProfit,
          totalExpenses,
          netProfit,
        },
      },
    });
  } catch (error: any) {
    securityLog.error('Error generating Profit and Loss:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const generateTrialBalance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { period_code } = req.query;
    let periodFilter = '';
    const params: any[] = [];

    if (period_code) {
      params.push(period_code);
      periodFilter = `AND TO_CHAR(e.created_at, 'YYYY-MM') = $1`;
    }

    const result = await readDb.query(`
      SELECT 
        e.account_name,
        COALESCE(SUM(e.debit_idr), 0) as debit_idr,
        COALESCE(SUM(e.credit_idr), 0) as credit_idr
      FROM ledger_entries e
      WHERE 1=1 ${periodFilter}
      GROUP BY e.account_name
      ORDER BY e.account_name ASC
    `, params);

    let totalDebit = 0;
    let totalCredit = 0;

    const rows = result.rows.map(row => {
      const d = Number(row.debit_idr);
      const c = Number(row.credit_idr);
      totalDebit += d;
      totalCredit += c;
      return {
        accountName: row.account_name,
        debitIDR: d,
        creditIDR: c,
      };
    });

    res.json({
      success: true,
      data: {
        periodCode: period_code || 'ALL',
        rows,
        totalDebit,
        totalCredit,
        isBalanced: totalDebit === totalCredit,
      },
    });
  } catch (error: any) {
    securityLog.error('Error generating Trial Balance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const exportClosingReportCSV = async (req: Request, res: Response): Promise<void> => {
  try {
    const { period_code } = req.query;
    let periodFilter = '';
    const params: any[] = [];

    if (period_code) {
      params.push(period_code);
      periodFilter = `AND TO_CHAR(e.created_at, 'YYYY-MM') = $1`;
    }

    const result = await readDb.query(`
      SELECT 
        e.account_name,
        COALESCE(SUM(e.debit_idr), 0) as debit_idr,
        COALESCE(SUM(e.credit_idr), 0) as credit_idr
      FROM ledger_entries e
      WHERE 1=1 ${periodFilter}
      GROUP BY e.account_name
      ORDER BY e.account_name ASC
    `, params);

    const escapeCSV = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
    const headers = ['Account Name', 'Total Debit IDR', 'Total Credit IDR'];
    const rows = result.rows.map(r => [
      escapeCSV(r.account_name),
      Number(r.debit_idr),
      Number(r.credit_idr),
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="closing_report_${period_code || 'all'}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    securityLog.error('Error exporting closing report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const generateCashLiabilityReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { period_code } = req.query;
    let periodFilter = '';
    const params: any[] = [];
    if (period_code) {
      params.push(period_code);
      periodFilter = `AND TO_CHAR(e.created_at, 'YYYY-MM') = $1`;
    }
    const result = await readDb.query(`
      SELECT 
        e.account_name,
        COALESCE(SUM(e.debit_idr), 0) as debit_idr,
        COALESCE(SUM(e.credit_idr), 0) as credit_idr
      FROM ledger_entries e
      WHERE (e.account_name LIKE '1%' OR e.account_name LIKE '2%')
      ${periodFilter}
      GROUP BY e.account_name
      ORDER BY e.account_name ASC
    `, params);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error generating cash liability report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const generateTaxSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { period_code } = req.query;
    let periodFilter = '';
    const params: any[] = [];
    if (period_code) {
      params.push(period_code);
      periodFilter = `AND TO_CHAR(created_at, 'YYYY-MM') = $1`;
    }
    const result = await readDb.query(`
      SELECT 
        tax_type,
        COUNT(id) as transaction_count,
        COALESCE(SUM(tax_amount), 0) as total_tax
      FROM payment_tax_snapshots
      WHERE 1=1 ${periodFilter}
      GROUP BY tax_type
    `, params);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error generating tax summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const generateSettlementOutstanding = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT 
        status,
        COUNT(id) as total_settlements,
        COALESCE(SUM(total_amount_idr), 0) as total_amount
      FROM merchant_settlements
      WHERE status IN ('PENDING', 'PROCESSING', 'FAILED')
      GROUP BY status
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error generating settlement outstanding report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
