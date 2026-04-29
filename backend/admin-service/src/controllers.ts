import { Request, Response } from 'express';
import { db } from './db';
import { redis } from './redis';

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
    const { key } = req.params;
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
  const { key } = req.params;
  const { new_enabled, reason, totp_code, checklist_data } = req.body;

  // Simulate TOTP check (In real world, verify totp_code)
  if (!totp_code) {
    res.status(403).json({ error: 'MFA/TOTP required' });
    return;
  }
  
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

    // Insert log
    await client.query(
      `INSERT INTO feature_flag_logs (flag_key, old_enabled, new_enabled, old_config, new_config, changed_by, reason) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [key, flag.is_enabled, new_enabled, flag.config, flag.config, 'super_admin_1', reason]
    );

    await client.query('COMMIT');
    
    // Invalidate Cache + Pub/Sub broadcast
    const cacheKey = `flag:${key}`;
    await redis.del(cacheKey);
    await redis.publish('flag:changed', JSON.stringify({ key, is_enabled: new_enabled, changed_at: new Date() }));

    res.json(updateRes.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const updateFlagConfig = async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params;
  const { config, reason, totp_code } = req.body;

  if (!totp_code) {
    res.status(403).json({ error: 'MFA/TOTP required' });
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
      [config, key]
    );

    await client.query(
      `INSERT INTO feature_flag_logs (flag_key, old_enabled, new_enabled, old_config, new_config, changed_by, reason) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [key, flag.is_enabled, flag.is_enabled, flag.config, config, 'super_admin_1', reason || 'Config update']
    );

    await client.query('COMMIT');

    const cacheKey = `flag:${key}`;
    await redis.del(cacheKey);
    await redis.publish('flag:changed', JSON.stringify({ key, is_enabled: flag.is_enabled, changed_at: new Date() }));

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
    const { key } = req.params;
    const result = await db.query('SELECT * FROM feature_flag_logs WHERE flag_key = $1 ORDER BY created_at DESC', [key]);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getThreeLegsReadiness = async (req: Request, res: Response) => {
  // Mock readiness logic
  res.json({
    gate: {
      sla_two_legs_rolling_4weeks: {
        week1: 85.2, week2: 86.1, week3: 88.7, week4: 89.1,
        all_above_93: false,
        current_avg: 87.3
      }
    },
    checklist: {
      courier_density: {
        "JAK-TIM": 28, "JAK-BAR": 22, "JAK-PST": 31,
        min_required: 30, zones_ready: ["JAK-PST"]
      },
      validated_meeting_points: { count: 4, required: 5 },
      daily_orders: { avg_30days: 187, required: 200 }
    },
    overall_ready: false,
    estimated_ready_in_weeks: 6,
    can_activate: false
  });
};
