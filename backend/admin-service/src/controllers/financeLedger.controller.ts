import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

export const getLedgerEntries = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, accountName, journalType, referenceType } = req.query;

    let query = `
      SELECT 
        e.id as entry_id,
        j.id as journal_id,
        j.journal_type,
        j.reference_type,
        j.reference_id,
        j.reason,
        e.account_name,
        e.debit_idr,
        e.credit_idr,
        e.created_at
      FROM ledger_entries e
      JOIN ledger_journals j ON e.journal_id = j.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) {
      params.push(startDate);
      query += ` AND e.created_at >= $${params.length}::date`;
    }
    
    if (endDate) {
      params.push(endDate);
      query += ` AND e.created_at < ($${params.length}::date + interval '1 day')`;
    }

    if (accountName) {
      params.push(accountName);
      query += ` AND e.account_name = $${params.length}`;
    }

    if (journalType) {
      params.push(journalType);
      query += ` AND j.journal_type = $${params.length}`;
    }

    if (referenceType) {
      params.push(referenceType);
      query += ` AND j.reference_type = $${params.length}`;
    }

    query += ` ORDER BY e.created_at DESC LIMIT 500`;

    const result = await readDb.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    securityLog.error('Error fetching ledger entries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const exportLedgerCSV = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, accountName, journalType, referenceType } = req.query;

    let query = `
      SELECT 
        e.id as entry_id,
        j.id as journal_id,
        j.journal_type,
        j.reference_type,
        j.reference_id,
        j.reason,
        e.account_name,
        e.debit_idr,
        e.credit_idr,
        e.created_at
      FROM ledger_entries e
      JOIN ledger_journals j ON e.journal_id = j.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) {
      params.push(startDate);
      query += ` AND e.created_at >= $${params.length}::date`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND e.created_at < ($${params.length}::date + interval '1 day')`;
    }
    if (accountName) {
      params.push(accountName);
      query += ` AND e.account_name = $${params.length}`;
    }
    if (journalType) {
      params.push(journalType);
      query += ` AND j.journal_type = $${params.length}`;
    }
    if (referenceType) {
      params.push(referenceType);
      query += ` AND j.reference_type = $${params.length}`;
    }

    query += ` ORDER BY e.created_at DESC LIMIT 5000`;
    const result = await readDb.query(query, params);

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = ['Entry ID', 'Journal ID', 'Journal Type', 'Reference Type', 'Reference ID', 'Account Name', 'Debit IDR', 'Credit IDR', 'Reason', 'Created At'];
    const rows = result.rows.map(r => [
      escapeCSV(r.entry_id),
      escapeCSV(r.journal_id),
      escapeCSV(r.journal_type),
      escapeCSV(r.reference_type),
      escapeCSV(r.reference_id),
      escapeCSV(r.account_name),
      r.debit_idr || 0,
      r.credit_idr || 0,
      escapeCSV(r.reason),
      escapeCSV(r.created_at),
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ledger_export_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    securityLog.error('Error exporting ledger CSV:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getLedgerDrilldown = async (req: Request, res: Response): Promise<void> => {
  try {
    const { referenceType, referenceId } = req.params;
    let sourceData: any = null;

    if (referenceType === 'ORDER' || referenceType === 'ORDER_COMPLETED') {
      const orderRes = await readDb.query(`SELECT * FROM orders WHERE id = $1`, [referenceId]);
      sourceData = orderRes.rows[0] || null;
    } else if (referenceType === 'PAYMENT' || referenceType === 'PAYMENT_RECEIVED') {
      const payRes = await readDb.query(`SELECT * FROM payments WHERE id = $1`, [referenceId]);
      sourceData = payRes.rows[0] || null;
    } else if (referenceType.includes('SETTLEMENT')) {
      const stlRes = await readDb.query(`SELECT * FROM merchant_settlements WHERE id = $1`, [referenceId]);
      sourceData = stlRes.rows[0] || null;
    } else if (referenceType.includes('PAYOUT') || referenceType.includes('WITHDRAWAL')) {
      const poRes = await readDb.query(`SELECT * FROM courier_payouts WHERE id = $1`, [referenceId]);
      sourceData = poRes.rows[0] || null;
    }

    const journalsRes = await readDb.query(`
      SELECT 
        j.*,
        json_agg(e.*) as entries
      FROM ledger_journals j
      LEFT JOIN ledger_entries e ON j.id = e.journal_id
      WHERE j.reference_id = $1
      GROUP BY j.id
      ORDER BY j.created_at ASC
    `, [referenceId]);

    res.json({
      success: true,
      data: {
        referenceType,
        referenceId,
        sourceData,
        journals: journalsRes.rows,
      },
    });
  } catch (error: any) {
    securityLog.error('Error in ledger drilldown:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createManualAdjustment = async (req: Request, res: Response): Promise<void> => {
  const { journal_type, reference_type, reference_id, reason, entries } = req.body;
  if (!entries || !Array.isArray(entries) || entries.length < 2) {
    res.status(400).json({ success: false, error: 'At least two entries (debit/credit) are required' });
    return;
  }

  // Validate balanced
  const totalDebit = entries.reduce((acc: number, val: any) => acc + Number(val.debit_idr || 0), 0);
  const totalCredit = entries.reduce((acc: number, val: any) => acc + Number(val.credit_idr || 0), 0);
  if (totalDebit !== totalCredit) {
    res.status(400).json({ success: false, error: 'Debit and Credit must be balanced' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Security check: Check if current period is locked
    const currentPeriod = new Date().toISOString().slice(0, 7); // e.g. '2026-07'
    const periodCheck = await client.query(`
      SELECT status FROM accounting_periods WHERE period_code = $1
    `, [currentPeriod]);
    
    if (periodCheck.rows.length > 0 && periodCheck.rows[0].status === 'CLOSED') {
      await client.query('ROLLBACK');
      res.status(403).json({ success: false, error: 'Current accounting period is closed. Cannot make manual adjustments.' });
      return;
    }

    const actorId = getActorId(req);
    
    // Create Journal
    const journalRes = await client.query(`
      INSERT INTO ledger_journals (journal_type, reference_type, reference_id, reason, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `, [journal_type || 'MANUAL_ADJUSTMENT', reference_type || 'MANUAL', reference_id || 'N/A', reason]);
    
    const journalId = journalRes.rows[0].id;

    // Insert Entries
    for (const entry of entries) {
      await client.query(`
        INSERT INTO ledger_entries (journal_id, account_name, debit_idr, credit_idr, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [journalId, entry.account_name, entry.debit_idr || 0, entry.credit_idr || 0]);
    }

    // Audit log
    await client.query(`
      INSERT INTO system_audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
      VALUES ($1, 'MANUAL_LEDGER_ADJUSTMENT', 'ledger_journals', $2, $3, NOW())
    `, [actorId, journalId, JSON.stringify({ reason, totalDebit, entries })]);

    await client.query('COMMIT');
    res.json({ success: true, data: { journal_id: journalId } });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Error creating manual adjustment:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

