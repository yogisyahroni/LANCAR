import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { redis } from '../redis';
import { getIO } from '../websocket';

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
    await redis.setex(cacheKey, 300, JSON.stringify(data));
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

export const getLatestVersion = async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.query.type as string; // 'courier' or 'customer'
    if (!type || (type !== 'courier' && type !== 'customer')) {
      res.status(400).json({ error: 'Invalid app type' });
      return;
    }

    const versionKey = `mobile_${type}_version`;
    const result = await readDb.query(
      'SELECT value FROM system_configs WHERE key = $1',
      [versionKey]
    );

    const updateUrlResult = await readDb.query(
      'SELECT value FROM system_configs WHERE key = $1',
      ['mobile_update_url']
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Version info not found' });
      return;
    }

    res.json({
      ...result.rows[0].value,
      update_url: updateUrlResult.rows[0]?.value || 'https://github.com/yogisyahroni/LANCAR/releases'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};


export const updateSystemConfig = async (req: Request, res: Response): Promise<void> => {
  const key = req.params.key as string;
  const { value, description, category } = req.body;

  if (typeof value === 'number' && isNaN(value)) {
    console.error(`[updateSystemConfig] ERROR: Invalid config value (NaN) for key=${key}`);
    res.status(400).json({ error: 'Invalid config value: NaN' });
    return;
  }

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

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';

    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`config:${key}`, true, changedBy, `Updated system config: ${key}`, JSON.stringify(value), category || oldConfig.category || 'general']
    );

    await client.query('COMMIT');

    getIO().emit('config:changed', { key, value, updated_at: new Date() });

    res.json(updateRes.rows[0]);
  } catch (error: any) {
    console.error(`[updateSystemConfig] FATAL ERROR: ${error.message}`, error.stack);
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const getSystemHealth = async (req: Request, res: Response) => {
  try {
    // Cek koneksi DB secara aktual
    const dbStart = Date.now();
    await readDb.query('SELECT 1');
    const dbLatency = Date.now() - dbStart;

    // Cek koneksi Redis
    const redisStart = Date.now();
    await redis.ping();
    const redisLatency = Date.now() - redisStart;

    // Return sebagai object agar compatible dengan Dashboard.tsx
    res.json({
      api_gateway: 'UP',
      database: dbLatency < 100 ? 'UP' : 'DEGRADED',
      redis: redisLatency < 50 ? 'UP' : 'DEGRADED',
      storage: 'UP',
      components: [
        {
          label: 'API Gateway',
          version: 'v2.4.1',
          status: 'Stable',
          metrics: '~12ms avg'
        },
        {
          label: 'PostgreSQL',
          version: '17.6.1',
          status: dbLatency < 100 ? 'Healthy' : 'Degraded',
          metrics: `${dbLatency}ms`
        },
        {
          label: 'Redis Cache',
          version: '7.x',
          status: redisLatency < 50 ? 'Live' : 'Degraded',
          metrics: `${redisLatency}ms`
        },
        {
          label: 'WebSocket',
          version: 'Socket.io 4',
          status: 'Optimal',
          metrics: 'Active'
        }
      ]
    });
  } catch (error: any) {
    // Fallback object
    res.json({
      api_gateway: 'UP',
      database: 'DOWN',
      redis: 'DOWN',
      storage: 'UP',
      components: [
        { label: 'API Gateway', version: 'v2.4.1', status: 'Stable', metrics: 'OK' },
        { label: 'PostgreSQL', version: '17.x', status: 'Error', metrics: error.message?.substring(0, 20) },
        { label: 'Redis Cache', version: '7.x', status: 'Unknown', metrics: '---' },
        { label: 'WebSocket', version: 'Socket.io 4', status: 'Unknown', metrics: '---' }
      ]
    });
  }
};
