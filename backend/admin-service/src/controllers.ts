import { Request, Response } from 'express';
import { db } from './db';
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
    
    const result = await db.query(query, values);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getFlagByKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const key = req.params.key as string;
    const result = await db.query('SELECT * FROM feature_flags WHERE key = $1', [key]);
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
      `INSERT INTO feature_flag_logs (flag_key, old_enabled, new_enabled, old_config, new_config, changed_by, reason) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [key, flag.is_enabled, new_enabled, flag.config, flag.config, changedBy, reason]
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
      `INSERT INTO feature_flag_logs (flag_key, old_enabled, new_enabled, old_config, new_config, changed_by, reason) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [key, flag.is_enabled, flag.is_enabled, flag.config, validConfig, changedBy, reason || 'Config update']
    );

    await client.query('COMMIT');

    const cacheKey = `flag:${key}`;
    await redis.del(cacheKey);
    await redis.publish('flag:changed', JSON.stringify({ key, is_enabled: flag.is_enabled, changed_at: new Date() }));

    // Emit to Dashboard via WebSocket
    getIO().emit('flag:changed', { key, is_enabled: flag.is_enabled, config: validConfig, changed_at: new Date() });

    sendEmailAlert(key, flag.is_enabled, flag.is_enabled, reason || 'Config update', changedBy).catch(console.error);
    sendSlackAlert(key, flag.is_enabled, flag.is_enabled, reason || 'Config update', changedBy).catch(console.error);

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
    const result = await db.query('SELECT * FROM feature_flag_logs WHERE flag_key = $1 ORDER BY created_at DESC', [key]);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllLogs = async (req: Request, res: Response) => {
  try {
    const result = await db.query('SELECT * FROM feature_flag_logs ORDER BY created_at DESC LIMIT 100');
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

    const result = await db.query('SELECT readiness_data, overall_ready, estimated_ready_in_weeks, can_activate, last_updated FROM mv_readiness_three_legs LIMIT 1');
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
  const { key, category, description, config, is_enabled } = req.body;

  if (!key || !category) {
    res.status(400).json({ error: 'Key and Category are required' });
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
      `INSERT INTO feature_flag_logs (flag_key, old_enabled, new_enabled, old_config, new_config, changed_by, reason) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [key, false, is_enabled || false, {}, config || {}, changedBy, 'Flag creation']
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
