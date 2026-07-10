import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

const adminActorId = (req: Request) => getActorId(req);

export const getTaxRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT * FROM tax_rules 
      ORDER BY tax_type ASC, effective_from DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error fetching tax rules:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createTaxRule = async (req: Request, res: Response): Promise<void> => {
  const { code, name, tax_type, effective_rate_pct, statutory_rate_pct, dpp_formula, invoice_required, effective_from, effective_to } = req.body;
  
  if (!code || !name || !tax_type || !effective_rate_pct || !dpp_formula || !effective_from) {
    res.status(400).json({ success: false, error: 'Missing required fields' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO tax_rules (
        code, name, tax_type, effective_rate_pct, statutory_rate_pct, dpp_formula, invoice_required, effective_from, effective_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [code, name, tax_type, effective_rate_pct, statutory_rate_pct || effective_rate_pct, dpp_formula, invoice_required || false, effective_from, effective_to || null]
    );

    // Audit log
    await client.query(
      `INSERT INTO system_audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, 'CREATE', 'tax_rules', $2, $3, NOW())`,
      [adminActorId(req), result.rows[0].id, JSON.stringify(result.rows[0])]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Error creating tax rule:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const updateTaxRule = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;
  const { name, effective_rate_pct, statutory_rate_pct, dpp_formula, invoice_required, effective_from, effective_to } = req.body;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT * FROM tax_rules WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Tax rule not found' });
      return;
    }

    const result = await client.query(
      `UPDATE tax_rules SET
        name = COALESCE($1, name),
        effective_rate_pct = COALESCE($2, effective_rate_pct),
        statutory_rate_pct = COALESCE($3, statutory_rate_pct),
        dpp_formula = COALESCE($4, dpp_formula),
        invoice_required = COALESCE($5, invoice_required),
        effective_from = COALESCE($6, effective_from),
        effective_to = $7,
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name, effective_rate_pct, statutory_rate_pct, dpp_formula, invoice_required, effective_from, effective_to, id]
    );

    await client.query(
      `INSERT INTO system_audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, 'UPDATE', 'tax_rules', $2, $3, $4, NOW())`,
      [adminActorId(req), id, JSON.stringify(existing.rows[0]), JSON.stringify(result.rows[0])]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Error updating tax rule:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const getTaxDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const monthlySummary = await readDb.query(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        SUM(dpp_idr) as total_dpp_idr,
        SUM(ppn_idr) as total_ppn_idr,
        COUNT(id) as transaction_count
      FROM orders
      WHERE status = 'delivered' AND dpp_idr IS NOT NULL
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `);

    const efaktursRes = await readDb.query(`
      SELECT * FROM tax_efaktur_exports
      ORDER BY tax_period DESC, created_at DESC
      LIMIT 50
    `);

    const pphSummaryRes = await readDb.query(`
      SELECT 
        COALESCE(SUM(debit_idr), 0) as total_pph_withheld_idr
      FROM ledger_entries
      WHERE account_name ILIKE '%2105%' OR account_name ILIKE '%PPh%'
    `);

    const mismatchesRes = await readDb.query(`
      SELECT 
        id as order_id,
        tracking_number,
        dpp_idr,
        ppn_idr,
        ppn_rate_effective_pct,
        ROUND(dpp_idr * (COALESCE(ppn_rate_effective_pct, 11) / 100.0)) as expected_ppn_idr
      FROM orders
      WHERE status = 'delivered' 
        AND dpp_idr IS NOT NULL 
        AND ABS(ppn_idr - ROUND(dpp_idr * (COALESCE(ppn_rate_effective_pct, 11) / 100.0))) > 100
      LIMIT 50
    `);

    res.json({
      success: true,
      data: {
        monthlySummary: monthlySummary.rows,
        efakturs: efaktursRes.rows,
        pphWithholding: {
          totalWithheldIDR: Number(pphSummaryRes.rows[0]?.total_pph_withheld_idr || 0),
        },
        taxMismatches: mismatchesRes.rows,
      },
    });
  } catch (error: any) {
    securityLog.error('Error fetching tax dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const exportTaxPack = async (req: Request, res: Response): Promise<void> => {
  try {
    const { period } = req.query; // e.g. '2026-07'
    const params: any[] = [];
    let whereClause = "WHERE status = 'delivered' AND dpp_idr IS NOT NULL";
    if (period) {
      params.push(period);
      whereClause += ` AND TO_CHAR(created_at, 'YYYY-MM') = $1`;
    }

    const ordersRes = await readDb.query(`
      SELECT 
        id as order_id,
        tracking_number,
        tax_rule_code,
        dpp_idr,
        ppn_idr,
        ppn_rate_effective_pct,
        tax_invoice_status,
        created_at
      FROM orders
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT 5000
    `, params);

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '""';
      return `"${String(val).replace(/"/g, '""')}"`;
    };

    const headers = ['Order ID', 'Tracking Number', 'Tax Rule Code', 'DPP IDR', 'PPN IDR', 'Effective Rate Pct', 'Invoice Status', 'Created At'];
    const rows = ordersRes.rows.map(r => [
      escapeCSV(r.order_id),
      escapeCSV(r.tracking_number),
      escapeCSV(r.tax_rule_code),
      r.dpp_idr || 0,
      r.ppn_idr || 0,
      r.ppn_rate_effective_pct || 0,
      escapeCSV(r.tax_invoice_status),
      escapeCSV(r.created_at),
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tax_pack_${period || 'all'}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    securityLog.error('Error exporting tax pack:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
