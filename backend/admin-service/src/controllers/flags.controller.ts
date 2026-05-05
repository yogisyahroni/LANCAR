import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { redis } from '../redis';
import { sendEmailAlert, sendSlackAlert } from '../notifications';
import { validateFlagConfig } from '../validators';
import { getIO } from '../websocket';

export const exportAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT l.created_at, l.key, l.category, u.full_name as updated_by_name, l.change_reason, l.is_enabled
      FROM feature_flag_logs l
      LEFT JOIN users u ON l.updated_by = u.id
      ORDER BY l.created_at DESC
    `);

    const csvRows = [
      ['Timestamp', 'Entity/Key', 'Category', 'Changed By', 'Action', 'Reason'].join(','),
      ...result.rows.map(r => [
        r.created_at.toISOString(),
        r.key,
        r.category || 'general',
        r.updated_by_name || 'System',
        r.is_enabled ? 'ENABLED/UPDATED' : 'DISABLED',
        `"${(r.change_reason || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=system_audit_export.csv');
    res.send(csvRows);
  } catch (error: any) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({ error: error.message });
  }
};

export const exportMasaReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const result = await readDb.query(`
      SELECT o.id, o.created_at, o.total_price_idr, o.status,
             (o.total_price_idr * 0.11) as ppn_amount
      FROM orders o
      WHERE o.created_at >= $1 AND o.status = 'delivered'
      ORDER BY o.created_at ASC
    `, [startOfMonth]);

    const csvRows = [
      ['Order ID', 'Date', 'Gross Amount (IDR)', 'PPN (11%)', 'Status'].join(','),
      ...result.rows.map(r => [
        r.id,
        r.created_at.toISOString().split('T')[0],
        r.total_price_idr,
        r.ppn_amount,
        r.status
      ].join(','))
    ].join('\n');

    const totalPPN = result.rows.reduce((sum, r) => sum + parseFloat(r.ppn_amount), 0);
    const summary = `\nTOTAL PPN CURRENT MASA, , ,${totalPPN}, `;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=masa_ppn_report_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvRows + summary);
  } catch (error: any) {
    console.error('Error exporting masa report:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllFlags = async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string;
    let query = 'SELECT id, key, category, is_enabled, config, require_checklist, updated_at FROM feature_flags';
    const values: any[] = [];

    if (category) {
      query += ' WHERE category = $1';
      values.push(category);
    }

    query += ' ORDER BY key ASC';

    const result = await readDb.query(query, values);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getFlagByKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const key = req.params.key as string;
    const result = await readDb.query('SELECT * FROM feature_flags WHERE key = $1', [key]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Flag not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const toggleFlag = async (req: Request, res: Response): Promise<void> => {
  const key = req.params.key as string;
  const { new_enabled, reason, checklist_data } = req.body;

  if (!reason || reason.length < 10) {
    res.status(400).json({ error: 'Reason must be at least 10 characters' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const flagRes = await client.query('SELECT * FROM feature_flags WHERE key = $1', [key]);
    if (flagRes.rows.length === 0) {
      res.status(404).json({ error: 'Flag not found' });
      return;
    }
    const flag = flagRes.rows[0];

    if (key === 'model_three_legs' && new_enabled === true) {
      if (!checklist_data || !checklist_data.admin_manual_confirm) {
        res.status(422).json({ error: 'Checklist requirements not met for 3-Legs activation' });
        return;
      }
    }

    const updateRes = await client.query(
      'UPDATE feature_flags SET is_enabled = $1, updated_at = NOW() WHERE key = $2 RETURNING *',
      [new_enabled, key]
    );

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    if (!req.user?.id) {
      console.warn('[AuditLog] No user ID found in request for flag update! Using fallback.');
    }

    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [key, new_enabled, changedBy, reason, JSON.stringify(flag.config), flag.category || 'feature']
    );

    await client.query('COMMIT');

    const cacheKey = `flag:${key}`;
    await redis.del(cacheKey);
    await redis.publish('flag:changed', JSON.stringify({ key, is_enabled: new_enabled, changed_at: new Date() }));

    getIO().emit('flag:changed', { key, is_enabled: new_enabled, changed_at: new Date() });

    sendEmailAlert(key, flag.is_enabled, new_enabled, reason, changedBy).catch(console.error);
    sendSlackAlert(key, flag.is_enabled, new_enabled, reason, changedBy).catch(console.error);

    res.json(updateRes.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const updateFlagConfig = async (req: Request, res: Response): Promise<void> => {
  const key = req.params.key as string;
  const { config, reason } = req.body;

  if (typeof config === 'number' && isNaN(config)) {
    res.status(400).json({ error: 'Invalid config value: NaN' });
    return;
  }

  if (!reason || reason.length < 10) {
    res.status(400).json({ error: 'Reason must be at least 10 characters' });
    return;
  }

  let validConfig;
  try {
    validConfig = validateFlagConfig(config);
  } catch (error: any) {
    res.status(400).json({ error: 'Invalid configuration format', details: error.errors });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const flagRes = await client.query('SELECT * FROM feature_flags WHERE key = $1', [key]);
    if (flagRes.rows.length === 0) {
      res.status(404).json({ error: 'Flag not found' });
      return;
    }
    const flag = flagRes.rows[0];

    const updateRes = await client.query(
      'UPDATE feature_flags SET config = $1, updated_at = NOW() WHERE key = $2 RETURNING *',
      [validConfig, key]
    );

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';

    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [key, flag.is_enabled, changedBy, reason, JSON.stringify(validConfig), flag.category || 'feature']
    );

    await client.query('COMMIT');

    const cacheKey = `flag:${key}`;
    await redis.del(cacheKey);
    await redis.publish('flag:changed', JSON.stringify({ key, is_enabled: flag.is_enabled, changed_at: new Date() }));

    getIO().emit('flag:changed', { key, is_enabled: flag.is_enabled, config: validConfig, changed_at: new Date() });

    sendEmailAlert(key, flag.is_enabled, flag.is_enabled, reason, changedBy).catch(console.error);
    sendSlackAlert(key, flag.is_enabled, flag.is_enabled, reason, changedBy).catch(console.error);

    res.json(updateRes.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const getFlagLogs = async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const result = await readDb.query('SELECT * FROM feature_flag_logs WHERE flag_key = $1 ORDER BY created_at DESC', [key]);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllLogs = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT l.*, u.full_name as updated_by_name
      FROM feature_flag_logs l
      LEFT JOIN users u ON l.updated_by = u.id
      ORDER BY l.created_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createFlag = async (req: Request, res: Response): Promise<void> => {
  const { key, category, description, config, is_enabled, reason, require_checklist } = req.body;

  if (!key || !category) {
    res.status(400).json({ error: 'Key and Category are required' });
    return;
  }

  if (!reason || reason.length < 10) {
    res.status(400).json({ error: 'Reason must be at least 10 characters' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query('SELECT id FROM feature_flags WHERE key = $1', [key]);
    if (checkRes.rows.length > 0) {
      res.status(409).json({ error: 'Flag key already exists' });
      return;
    }

    const insertRes = await client.query(
      `INSERT INTO feature_flags (key, category, description, config, is_enabled, updated_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [key, category, description || '', config || {}, is_enabled || false]
    );

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';

    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, description, category, require_checklist) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [key, is_enabled || false, changedBy, reason, JSON.stringify(config || {}), description, category, require_checklist || false]
    );

    await client.query('COMMIT');

    await redis.del('flags:all');

    res.status(201).json(insertRes.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};
