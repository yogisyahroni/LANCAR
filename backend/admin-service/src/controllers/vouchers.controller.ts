import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';
import { db, readDb } from '../db';

export const getVouchers = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query("SELECT * FROM vouchers ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (error: any) {
    securityLog.error('Error fetching vouchers:', error);
    securityLog.error('VOUCHER DELETE ERROR:', error); res.status(500).json({ error: error.message });
  }
};

export const getVoucherStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const activeResult = await readDb.query("SELECT COUNT(*) FROM vouchers WHERE is_active = true AND (valid_until IS NULL OR valid_until > NOW())");
    const claimsResult = await readDb.query("SELECT SUM(used_count) FROM vouchers");

    res.json({
      activeVouchers: parseInt(activeResult.rows[0].count),
      totalClaims: parseInt(claimsResult.rows[0].sum) || 0,
      revenueImpact: 0
    });
  } catch (error: any) {
    securityLog.error('Error fetching voucher stats:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getVoucherById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await readDb.query('SELECT * FROM vouchers WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Voucher not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createVoucher = async (req: Request, res: Response) => {
  const { code, name, type, value, max_discount_idr, min_order_idr, quota, valid_from, valid_until, applicable_models, reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO vouchers (code, name, type, value, max_discount_idr, min_order_idr, quota, valid_from, valid_until, applicable_models, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [code, name, type, value, max_discount_idr, min_order_idr, quota, valid_from, valid_until, applicable_models, req.user?.id]
    );

    const changedBy = getActorId(req);
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`voucher:${code}`, true, changedBy, reason || `Created voucher: ${name}`, JSON.stringify(result.rows[0]), 'marketing']
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const updateVoucher = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, is_active, quota, valid_until, reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE vouchers 
       SET name = COALESCE($1, name), 
           is_active = COALESCE($2, is_active), 
           quota = COALESCE($3, quota), 
           valid_until = COALESCE($4, valid_until),
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, is_active, quota, valid_until, id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Voucher not found' });
    }

    const changedBy = getActorId(req);
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`voucher:${result.rows[0].code}`, result.rows[0].is_active, changedBy, reason || `Updated voucher: ${name}`, JSON.stringify(result.rows[0]), 'marketing']
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const deleteVoucher = async (req: Request, res: Response) => {
  const { id } = req.params;
  const reason = req.body?.reason;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query('SELECT code, name FROM vouchers WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Voucher not found' });
    }
    const voucher = checkRes.rows[0];

    await client.query('DELETE FROM vouchers WHERE id = $1', [id]);

    const changedBy = getActorId(req);
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`voucher:${voucher.code}`, false, changedBy, reason || `Deleted voucher: ${voucher.name}`, '{}', 'marketing']
    );

    await client.query('COMMIT');
    res.json({ message: 'Voucher deleted successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '23503') {
      res.status(400).json({ error: 'Cannot delete voucher because it has been used. Please deactivate it instead.' });
    } else {
      res.status(500).json({ error: error.message });
    }
  } finally {
    client.release();
  }
};
