import { Request, Response } from 'express';
import { db, readDb } from './db';
import { redis } from './redis';
import { sendEmailAlert, sendSlackAlert } from './notifications';
import { validateFlagConfig } from './validators';
import { getIO } from './websocket';

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

  if (!reason || reason.length < 50) {
    res.status(400).json({ error: 'Reason must be at least 50 characters' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    // Check existing
    const flagRes = await client.query('SELECT * FROM feature_flags WHERE key = $1', [key]);
    if (flagRes.rows.length === 0) {
      res.status(404).json({ error: 'Flag not found' });
      return;
    }
    const flag = flagRes.rows[0];

    // Check checklist for model_three_legs
    if (key === 'model_three_legs' && new_enabled === true) {
      if (!checklist_data || !checklist_data.admin_manual_confirm) {
        res.status(422).json({ error: 'Checklist requirements not met for 3-Legs activation' });
        return;
      }
    }

    // Update flag
    const updateRes = await client.query(
      'UPDATE feature_flags SET is_enabled = $1, updated_at = NOW() WHERE key = $2 RETURNING *',
      [new_enabled, key]
    );

    const changedBy = req.user?.id || 'super_admin_1';

    // Insert log
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config) 
       VALUES ($1, $2, $3, $4, $5)`,
      [key, new_enabled, changedBy, reason, JSON.stringify(flag.config)]
    );

    await client.query('COMMIT');
    
    const cacheKey = `flag:${key}`;
    await redis.del(cacheKey);
    await redis.publish('flag:changed', JSON.stringify({ key, is_enabled: new_enabled, changed_at: new Date() }));
    
    // Emit to Dashboard via WebSocket
    getIO().emit('flag:changed', { key, is_enabled: new_enabled, changed_at: new Date() });

    // Send notifications asynchronously
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

  if (!reason || reason.length < 50) {
    res.status(400).json({ error: 'Reason must be at least 50 characters' });
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

    const changedBy = req.user?.id || 'super_admin_1';

    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config) 
       VALUES ($1, $2, $3, $4, $5)`,
      [key, flag.is_enabled, changedBy, reason, JSON.stringify(validConfig)]
    );

    await client.query('COMMIT');

    const cacheKey = `flag:${key}`;
    await redis.del(cacheKey);
    await redis.publish('flag:changed', JSON.stringify({ key, is_enabled: flag.is_enabled, changed_at: new Date() }));

    // Emit to Dashboard via WebSocket
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
    const result = await readDb.query('SELECT * FROM feature_flag_logs ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getThreeLegsReadiness = async (req: Request, res: Response): Promise<void> => {
  try {
    const cacheKey = 'readiness:three_legs';
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }

    const result = await readDb.query('SELECT readiness_data, overall_ready, estimated_ready_in_weeks, can_activate, last_updated FROM mv_readiness_three_legs LIMIT 1');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Readiness data not found in materialized view' });
      return;
    }

    const data = result.rows[0];
    await redis.setex(cacheKey, 300, JSON.stringify(data)); // Cache for 5 mins
    res.json(data);
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

  if (!reason || reason.length < 50) {
    res.status(400).json({ error: 'Reason must be at least 50 characters' });
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

    const changedBy = req.user?.id || 'super_admin_1';

    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, description, category, require_checklist) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [key, is_enabled || false, changedBy, reason, JSON.stringify(config || {}), description, category, require_checklist || false]
    );

    await client.query('COMMIT');
    
    // Clear global cache
    await redis.del('flags:all');
    
    res.status(201).json(insertRes.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const getSystemConfigs = async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string;
    let query = 'SELECT key, value, description, category, updated_at FROM system_configs';
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

export const updateSystemConfig = async (req: Request, res: Response): Promise<void> => {
  const key = req.params.key as string;
  const { value, description, category } = req.body;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    const checkRes = await client.query('SELECT * FROM system_configs WHERE key = $1', [key]);
    if (checkRes.rows.length === 0) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }
    const oldConfig = checkRes.rows[0];

    const updateRes = await client.query(
      `UPDATE system_configs 
       SET value = $1, description = COALESCE($2, description), category = COALESCE($3, category), updated_at = NOW() 
       WHERE key = $4 RETURNING *`,
      [JSON.stringify(value), description, category, key]
    );

    const changedBy = req.user?.id || 'super_admin_1';

    // Log to audit logs (using feature_flag_logs for now as a generic audit log)
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`config:${key}`, true, changedBy, `Updated system config: ${key}`, JSON.stringify(value)]
    );

    await client.query('COMMIT');
    
    // Broadcast change
    getIO().emit('config:changed', { key, value, updated_at: new Date() });

    res.json(updateRes.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const getAllAdmins = async (req: any, res: any) => {
  const client = await db.connect();
  try {
    const adminRoles = ['ops_admin', 'finance_admin', 'cs_agent', 'zone_manager', 'super_admin'];
    const { rows } = await client.query(
      `SELECT id, full_name, email, role, status, photo_url, created_at, last_login_at 
       FROM users 
       WHERE role = ANY($1) AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [adminRoles]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const deleteAdmin = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    // Soft delete
    const result = await client.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND role != \'super_admin\' RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Admin not found or cannot delete super_admin' });
      return;
    }

    await client.query('COMMIT');
    res.json({ message: 'Admin deleted successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const inviteAdmin = async (req: Request, res: Response) => {
  const { email, full_name, role, phone_number } = req.body;
  if (!full_name || !phone_number || !role) {
    res.status(400).json({ error: 'Full name, phone number, and role are required' });
    return;
  }

  try {
    const result = await db.query(
      'INSERT INTO users (email, full_name, role, phone_number, status) VALUES ($1, $2, $3, $4, \'active\') RETURNING id, email, full_name, role, phone_number',
      [email || null, full_name, role, phone_number]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getSystemHealth = async (req: Request, res: Response) => {
  try {
    // In a real app, this would query various services
    // For now, return dynamic looking data
    res.json([
      { label: 'Courier App', version: 'v2.4.12', status: 'Stable', metrics: '99.9% Uptime' },
      { label: 'API Gateway', version: 'v3.0.1-rc', status: 'Live', metrics: '45ms Latency' },
      { label: 'DB Cluster', version: 'PostgreSQL 15', status: 'Healthy', metrics: '12% CPU Load' },
      { label: 'Redis Cache', version: 'v7.0.0', status: 'Optimal', metrics: '98% Hit Rate' },
    ]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
