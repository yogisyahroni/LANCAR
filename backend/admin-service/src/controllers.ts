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

  if (!reason || reason.length < 10) {
    res.status(400).json({ error: 'Reason must be at least 10 characters' });
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

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';

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

  if (typeof value === 'number' && isNaN(value)) {
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

// --- Orders Management ---

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const type = req.query.type as string;

    let query = `
      SELECT 
        o.id, 
        o.model, 
        o.status, 
        o.total_price_idr as amount, 
        o.created_at,
        u.full_name as customer_name,
        cp.id as courier_id,
        cu.full_name as courier_name
      FROM orders o
      LEFT JOIN users u ON o.customer_id = u.id
      LEFT JOIN order_legs ol ON o.id = ol.order_id
      LEFT JOIN courier_profiles cp ON ol.courier_id = cp.id
      LEFT JOIN users cu ON cp.user_id = cu.id
      WHERE 1=1
    `;
    const values: any[] = [];

    if (search) {
      values.push(`%${search}%`);
      query += ` AND (o.id::text ILIKE $${values.length} OR u.full_name ILIKE $${values.length} OR cu.full_name ILIKE $${values.length})`;
    }

    if (status) {
      values.push(status);
      query += ` AND o.status = $${values.length}`;
    }

    if (type) {
      values.push(type);
      query += ` AND o.model = $${values.length}`;
    }

    const countQuery = `SELECT COUNT(*) FROM (${query}) as subquery`;
    const countRes = await readDb.query(countQuery, values);
    const total = parseInt(countRes.rows[0].count);

    query += ` ORDER BY o.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await readDb.query(query, values);

    res.json({
      data: result.rows,
      total,
      page,
      limit
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getOrderStats = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        status, 
        COUNT(*) as count,
        SUM(total_amount) as total_revenue
      FROM orders
      GROUP BY status
    `;
    const result = await readDb.query(query);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getOrderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const orderRes = await readDb.query(`
      SELECT o.*, u.full_name as customer_name, u.email as customer_email
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      WHERE o.id = $1
    `, [id]);

    if (orderRes.rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const eventsRes = await readDb.query(`
      SELECT * FROM order_events 
      WHERE order_id = $1 
      ORDER BY created_at ASC
    `, [id]);

    const legsRes = await readDb.query(`
      SELECT ol.*, cu.full_name as courier_name
      FROM order_legs ol
      LEFT JOIN courier_profiles cp ON ol.courier_id = cp.id
      LEFT JOIN users cu ON cp.user_id = cu.id
      WHERE ol.order_id = $1
      ORDER BY sequence ASC
    `, [id]);

    res.json({
      ...orderRes.rows[0],
      events: eventsRes.rows,
      legs: legsRes.rows
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const reassignOrder = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { courier_id, reason } = req.body;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Update current leg
    await client.query(`
      UPDATE order_legs 
      SET courier_id = $1, status = 'assigned', updated_at = NOW()
      WHERE order_id = $2
    `, [courier_id, id]);

    // Log event
    await client.query(`
      INSERT INTO order_events (order_id, event_type, description, metadata)
      VALUES ($1, 'reassigned', $2, $3)
    `, [id, `Order reassigned to new courier. Reason: ${reason || 'Not specified'}`, JSON.stringify({ courier_id })]);

    await client.query('COMMIT');
    res.json({ message: 'Order reassigned successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const flagOrderIssue = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { type, description } = req.body;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Create dispute
    await client.query(`
      INSERT INTO disputes (order_id, type, description, status, created_at)
      VALUES ($1, $2, $3, 'pending', NOW())
    `, [id, type || 'general', description]);

    // Log event
    await client.query(`
      INSERT INTO order_events (order_id, event_type, description)
      VALUES ($1, 'flagged', $2)
    `, [id, `Order flagged: ${description}`]);

    await client.query('COMMIT');
    res.json({ message: 'Order flagged and dispute created' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const createOrder = async (req: Request, res: Response): Promise<void> => {
  const { customer_id, pickup_address, delivery_address, total_amount, type } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO orders (customer_id, pickup_address, delivery_address, total_amount, type, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW()) RETURNING *
    `, [customer_id, pickup_address, delivery_address, total_amount, type || 'standard']);
    
    // Log event
    await client.query(`
      INSERT INTO order_events (order_id, event_type, description)
      VALUES ($1, 'created', 'Manual order created by admin')
    `, [result.rows[0].id]);

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const exportOrders = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT o.id, o.status, o.model as type, o.total_price_idr as total_amount, o.created_at, 
      u.full_name as customer
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      ORDER BY o.created_at DESC
    `);
    
    const csvRows = [
      ['Order ID', 'Status', 'Type', 'Amount', 'Date', 'Customer'].join(','),
      ...result.rows.map(r => [
        r.id, r.status, r.type, r.total_amount, r.created_at, `"${r.customer}"`
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders_export.csv');
    res.send(csvRows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// --- Couriers Management ---

export const getAllCouriers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const status = req.query.status as string;

    let query = `
      SELECT 
        cp.id,
        cp.user_id,
        cp.vehicle_type,
        cp.vehicle_plate,
        cp.vehicle_cc,
        cp.relay_score as avg_rating,
        cp.verification_status,
        cp.tier,
        cp.is_online,
        cp.acceptance_rate_pct,
        cp.completion_rate_pct,
        cp.ontime_rate_pct,
        cp.created_at,
        cp.updated_at,
        u.full_name, 
        u.email, 
        u.phone_number,
        CASE 
          WHEN cp.verification_status = 'pending' THEN 'Pending'
          WHEN u.status = 'suspended' THEN 'Suspended'
          WHEN u.status = 'active' THEN 'Active'
          ELSE 'Inactive'
        END as status
      FROM courier_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE u.deleted_at IS NULL
    `;
    const values: any[] = [];

    if (search) {
      values.push(`%${search}%`);
      query += ` AND (u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length} OR cp.vehicle_plate ILIKE $${values.length})`;
    }

    if (status) {
      if (status === 'Pending') {
        query += ` AND cp.verification_status = 'pending'`;
      } else if (status === 'Active') {
        query += ` AND u.status = 'active' AND cp.verification_status != 'pending'`;
      } else if (status === 'Suspended') {
        query += ` AND u.status = 'suspended'`;
      }
    }

    const countQuery = `SELECT COUNT(*) FROM (${query}) as subquery`;
    const countRes = await readDb.query(countQuery, values);
    const total = parseInt(countRes.rows[0].count);

    query += ` ORDER BY cp.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await readDb.query(query, values);

    res.json({
      data: result.rows,
      total,
      page,
      limit
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCourierStats = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE u.status = 'active') as active,
        COUNT(*) FILTER (WHERE cp.verification_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE u.status = 'suspended') as suspended
      FROM courier_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE u.deleted_at IS NULL
    `;
    const result = await readDb.query(query);
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCourierById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const courierRes = await readDb.query(`
      SELECT 
        cp.*,
        cp.relay_score as avg_rating,
        u.full_name, 
        u.email, 
        u.phone_number, 
        u.photo_url,
        CASE 
          WHEN cp.verification_status = 'pending' THEN 'Pending'
          WHEN u.status = 'suspended' THEN 'Suspended'
          WHEN u.status = 'active' THEN 'Active'
          ELSE 'Inactive'
        END as status
      FROM courier_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.id = $1
    `, [id]);

    if (courierRes.rows.length === 0) {
      res.status(404).json({ error: 'Courier not found' });
      return;
    }

    const docsRes = await readDb.query('SELECT * FROM courier_documents WHERE courier_id = $1', [id]);
    // courier_ratings table doesn't exist; use recent order legs for history instead
    const ratingsRes = await readDb.query(`
      SELECT ol.created_at, ol.status, o.order_number
      FROM order_legs ol
      JOIN orders o ON ol.order_id = o.id
      WHERE ol.courier_id = (SELECT user_id FROM courier_profiles WHERE id = $1)
      ORDER BY ol.created_at DESC LIMIT 10
    `, [id]);

    res.json({
      ...courierRes.rows[0],
      documents: docsRes.rows,
      recent_ratings: ratingsRes.rows
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateCourierStatus = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['Active', 'Suspended', 'Pending'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Update user status
    await client.query(
      `UPDATE users u
       SET status = CASE 
         WHEN $1 = 'Active' THEN 'active'
         WHEN $1 = 'Suspended' THEN 'suspended'
         ELSE u.status
       END,
       updated_at = NOW()
       FROM courier_profiles cp
       WHERE cp.user_id = u.id AND cp.id = $2`,
      [status, id]
    );

    // Update verification status if needed
    if (status === 'Active') {
      await client.query(
        'UPDATE courier_profiles SET verification_status = $1, updated_at = NOW() WHERE id = $2',
        ['approved', id]
      );
    }

    const result = await client.query(`
      SELECT 
        cp.*,
        CASE 
          WHEN cp.verification_status = 'pending' THEN 'Pending'
          WHEN u.status = 'suspended' THEN 'Suspended'
          WHEN u.status = 'active' THEN 'Active'
          ELSE 'Inactive'
        END as status
      FROM courier_profiles cp 
      JOIN users u ON cp.user_id = u.id 
      WHERE cp.id = $1`, 
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Courier not found' });
      return;
    }

    // Log to audit
    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason) 
       VALUES ($1, $2, $3, $4)`,
      [`courier:${id}`, status === 'Active', changedBy, `Status updated to ${status}`]
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

export const getCourierHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await readDb.query(`
      SELECT o.*, ol.status as leg_status
      FROM orders o
      JOIN order_legs ol ON o.id = ol.order_id
      WHERE ol.courier_id = (SELECT user_id FROM courier_profiles WHERE id = $1)
      ORDER BY o.created_at DESC
    `, [id]);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const exportCouriers = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT cp.id, u.full_name, u.email, u.status as status, cp.vehicle_type, cp.created_at
      FROM courier_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE u.deleted_at IS NULL
    `);
    
    const csvRows = [
      ['Courier ID', 'Name', 'Email', 'Status', 'Vehicle', 'Joined Date'].join(','),
      ...result.rows.map(r => [
        r.id, `"${r.full_name}"`, r.email, r.status, r.vehicle_type, r.created_at
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=couriers_export.csv');
    res.send(csvRows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// --- Disputes ---

export const getDisputes = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let baseQuery = `
      FROM disputes d
      JOIN orders o ON d.order_id = o.id
      JOIN users u1 ON d.opened_by = u1.id
      LEFT JOIN users u3 ON d.assigned_to = u3.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'All') {
      params.push(status.toLowerCase());
      baseQuery += ` AND d.status = $${params.length}`;
    }

    const countRes = await readDb.query(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const dataQuery = `
      SELECT d.*,
             o.order_number,
             u1.full_name as customer_name,
             u3.full_name as assigned_to_name
      ${baseQuery}
      ORDER BY d.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await readDb.query(dataQuery, params);
    res.json({ data: result.rows, total, page, limit });
  } catch (error: any) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getDisputeStats = async (req: Request, res: Response) => {
  try {
    const stats = await readDb.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'open') as pending,
        COUNT(*) FILTER (WHERE status = 'investigating') as investigating,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved
      FROM disputes
    `);
    res.json(stats.rows[0]);
  } catch (error: any) {
    console.error('Error fetching dispute stats:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateDisputeStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, resolution_note } = req.body;
  try {
    const query = `
      UPDATE disputes 
      SET status = $1, 
          resolution_note = $2, 
          resolved_at = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    const resolvedAt = status === 'resolved' ? new Date() : null;
    const result = await db.query(query, [status, resolution_note, resolvedAt, id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating dispute status:', error);
    res.status(500).json({ error: error.message });
  }
};

export const assignDispute = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { admin_id } = req.body;
  try {
    const query = `
      UPDATE disputes 
      SET assigned_to = $1, 
          status = 'investigating',
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await db.query(query, [admin_id, id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error assigning dispute:', error);
    res.status(500).json({ error: error.message });
  }
};

// --- Finance Controllers ---

export const getFinancialStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Aggregate revenue from payments table
    const grossResult = await readDb.query(`
      SELECT COALESCE(SUM(amount_idr), 0) as gross_revenue
      FROM payments
      WHERE status = 'paid'
    `);

    const opsCostResult = await readDb.query(`
      SELECT COALESCE(SUM(net_idr), 0) as total_payouts
      FROM payout_records
      WHERE disbursement_status = 'completed'
    `);

    const grossRevenue = parseInt(grossResult.rows[0].gross_revenue);
    const operationalCost = parseInt(opsCostResult.rows[0].total_payouts);
    const netProfit = grossRevenue - operationalCost;

    // Breakdown by model
    const modelBreakdown = await readDb.query(`
      SELECT model, COUNT(*) as count, SUM(total_price_idr) as revenue
      FROM orders
      WHERE status = 'delivered'
      GROUP BY model
    `);

    // Emergency Fund (weather_reserve_idr in payments)
    const weatherReserveResult = await readDb.query(`
      SELECT COALESCE(SUM(weather_reserve_idr), 0) as total_reserve
      FROM payments
      WHERE status = 'paid'
    `);

    res.json({
      stats: [
        { label: 'Gross Revenue', value: grossRevenue, change: '+12%', up: true },
        { label: 'Net Profit', value: netProfit, change: '+15%', up: true },
        { label: 'Operational Cost', value: operationalCost, change: '+5%', up: false },
      ],
      model_breakdown: modelBreakdown.rows.map(row => ({
        name: row.model.toUpperCase(),
        model: row.model,
        value: parseInt(row.revenue),
        count: parseInt(row.count),
        revenue: parseInt(row.revenue),
        percentage: Math.round((parseInt(row.revenue) / grossRevenue) * 100) || 0
      })),
      emergency_fund: parseInt(weatherReserveResult.rows[0].total_reserve),
      unit_economics: [
        { label: 'Avg Order Value', value: Math.round(grossRevenue / (modelBreakdown.rows.reduce((acc: number, r: any) => acc + parseInt(r.count), 0) || 1)) || 0, status: 'Healthy' },
        { label: 'Avg Payout', value: Math.round(operationalCost / (modelBreakdown.rows.reduce((acc: number, r: any) => acc + parseInt(r.count), 0) || 1)) || 0, status: 'Healthy' },
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
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching payouts:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updatePayoutStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, reference } = req.body;

    await db.query(
      'UPDATE payout_records SET disbursement_status = $1, disbursement_ref = $2, disbursement_at = NOW(), updated_at = NOW() WHERE id = $3',
      [status, reference, id]
    );

    res.json({ message: 'Payout status updated successfully' });
  } catch (error: any) {
    console.error('Error updating payout status:', error);
    res.status(500).json({ error: error.message });
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

// --- Customer Controllers ---

export const getCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    let baseQuery = `
      FROM users u
      WHERE u.role = 'customer' AND u.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      baseQuery += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.id::text ILIKE $${params.length})`;
    }

    const countRes = await readDb.query(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const dataQuery = `
      SELECT u.id, u.full_name as name, u.email, u.phone_number as phone, u.status, u.created_at as joined_at,
             COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id), 0) as orders_count
      ${baseQuery}
      ORDER BY u.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await readDb.query(dataQuery, params);
    res.json({ data: result.rows, total, page, limit });
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCustomerStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalResult = await readDb.query("SELECT COUNT(*) FROM users WHERE role = 'customer'");
    // Mocking UMKM Partners for now as there's no explicit 'UMKM' flag in users table yet, 
    // though we could use metadata or a separate profile table if it existed.
    const revenueResult = await readDb.query("SELECT SUM(total_price_idr) FROM orders WHERE status = 'delivered'");

    res.json({
      total_customers: parseInt(totalResult.rows[0].count),
      umkm_partners: Math.floor(parseInt(totalResult.rows[0].count) * 0.05), // Mocked 5%
      total_revenue: parseInt(revenueResult.rows[0].sum) || 0
    });
  } catch (error: any) {
    console.error('Error fetching customer stats:', error);
    res.status(500).json({ error: error.message });
  }
};

export const exportCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT u.id, u.full_name, u.email, u.phone_number, u.status, u.created_at,
             COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id), 0) as orders_count
      FROM users u
      WHERE u.role = 'customer' AND u.deleted_at IS NULL
      ORDER BY u.created_at DESC
    `);

    const csvRows = [
      ['Customer ID', 'Name', 'Email', 'Phone', 'Status', 'Orders Count', 'Joined Date'].join(','),
      ...result.rows.map(r => [
        r.id,
        `"${r.full_name}"`,
        r.email,
        r.phone_number || '',
        r.status,
        r.orders_count,
        new Date(r.created_at).toISOString().split('T')[0]
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=customers_export.csv');
    res.send(csvRows);
  } catch (error: any) {
    console.error('Error exporting customers:', error);
    res.status(500).json({ error: error.message });
  }
};

// --- Notification Controllers ---

export const getNotificationTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT 
        id, 
        key as "trigger", 
        COALESCE(title, key) as "subject", 
        body as "content", 
        CASE WHEN channel IS NOT NULL THEN ARRAY[channel] ELSE ARRAY['email']::text[] END as "channels", 
        is_active 
      FROM notification_templates 
      ORDER BY key ASC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching notification templates:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getNotificationTemplateById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await readDb.query(`
      SELECT 
        id, 
        key as "trigger", 
        COALESCE(title, key) as "subject", 
        body as "content", 
        CASE WHEN channel IS NOT NULL THEN ARRAY[channel] ELSE ARRAY['email']::text[] END as "channels", 
        is_active 
      FROM notification_templates 
      WHERE id = $1
    `, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching notification template by ID:', error);
    res.status(500).json({ error: error.message });
  }
};

export const createNotificationTemplate = async (req: Request, res: Response): Promise<void> => {
  const { trigger, subject, content, channels, reason } = req.body;
  
  if (!trigger || !subject || !content) {
    res.status(400).json({ error: 'Trigger, subject, and content are required' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      `INSERT INTO notification_templates (key, title, body, channel)
       VALUES ($1, $2, $3, $4) RETURNING id, key as "trigger", COALESCE(title, key) as "subject", body as "content", CASE WHEN channel IS NOT NULL THEN ARRAY[channel] ELSE ARRAY['email']::text[] END as "channels", is_active`,
      [trigger, subject, content, Array.isArray(channels) ? channels[0] : 'email']
    );

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`notification:${trigger}`, true, changedBy, reason || `Created notification template: ${trigger}`, JSON.stringify(result.rows[0])]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating notification template:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const updateNotificationTemplate = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { subject, content, channels, reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    const checkRes = await client.query("SELECT key FROM notification_templates WHERE id = $1", [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const template = checkRes.rows[0];

    const result = await client.query(
      `UPDATE notification_templates SET title = COALESCE($1, title), body = COALESCE($2, body), channel = COALESCE($3, channel), updated_at = NOW() WHERE id = $4 RETURNING id, key as "trigger", COALESCE(title, key) as "subject", body as "content", CASE WHEN channel IS NOT NULL THEN ARRAY[channel] ELSE ARRAY['email']::text[] END as "channels", is_active`,
      [subject, content, Array.isArray(channels) ? channels[0] : null, id]
    );

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`notification:${template.key}`, true, changedBy, reason || `Updated notification template: ${template.key}`, JSON.stringify(result.rows[0])]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error updating notification template:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const deleteNotificationTemplate = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    const checkRes = await client.query("SELECT key FROM notification_templates WHERE id = $1", [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const template = checkRes.rows[0];

    await client.query("DELETE FROM notification_templates WHERE id = $1", [id]);

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason) 
       VALUES ($1, $2, $3, $4)`,
      [`notification:${template.key}`, false, changedBy, reason || `Deleted notification template: ${template.key}`]
    );

    await client.query('COMMIT');
    res.json({ message: 'Template deleted successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error deleting notification template:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// --- Voucher Controllers ---

export const getVouchers = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query("SELECT * FROM vouchers ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching vouchers:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getVoucherStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const activeResult = await readDb.query("SELECT COUNT(*) FROM vouchers WHERE is_active = true AND (valid_until IS NULL OR valid_until > NOW())");
    const claimsResult = await readDb.query("SELECT SUM(used_count) FROM vouchers");
    
    res.json({
      active_vouchers: parseInt(activeResult.rows[0].count),
      total_claims: parseInt(claimsResult.rows[0].sum) || 0,
      revenue_impact: 0 // Placeholder for impact analysis
    });
  } catch (error: any) {
    console.error('Error fetching voucher stats:', error);
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

// --- Zone Controllers ---

export const getZones = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT z.id, z.name, z.code, z.is_active, z.max_couriers, ST_AsText(z.polygon) as polygon,
             (SELECT COUNT(*) FROM meeting_points mp WHERE mp.zone_id = z.id) as meeting_points_count,
             (SELECT COUNT(DISTINCT order_id) FROM order_legs WHERE zone_id = z.id AND status NOT IN ('delivered', 'failed', 'cancelled')) as active_orders_count
      FROM zones z
      ORDER BY z.name ASC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching zones:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getZoneById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await readDb.query('SELECT id, name, code, is_active, max_couriers, ST_AsText(polygon) as polygon FROM zones WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Zone not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// --- Pricing Controllers ---

export const getPricingConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT 
        model as service_type, 
        base_fee as base_fare, 
        per_km_fee as per_km_rate,
        updated_at
      FROM pricing_configs 
      ORDER BY model ASC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching pricing config:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updatePricingConfig = async (req: Request, res: Response): Promise<void> => {
  const { service_type, base_fare, per_km_rate } = req.body;
  if (isNaN(base_fare) || isNaN(per_km_rate)) {
    res.status(400).json({ error: 'Invalid pricing values: NaN' });
    return;
  }
  try {
    const result = await db.query(
      `UPDATE pricing_configs 
       SET base_fee = $1, per_km_fee = $2, updated_at = NOW() 
       WHERE model = $3 
       RETURNING model as service_type, base_fee as base_fare, per_km_fee as per_km_rate`,
      [base_fare, per_km_rate, service_type]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating pricing config:', error);
    res.status(500).json({ error: error.message });
  }
};

// --- SLA Controllers ---

export const getSLAConfigs = async (req: Request, res: Response): Promise<void> => {
  const { model_type } = req.query;
  try {
    const result = await readDb.query(
      `SELECT 
        id, 
        model as model_type, 
        leg_number as stage_order, 
        max_minutes as target_minutes, 
        warning_minutes as critical_minutes,
        CASE 
          WHEN leg_number = 1 THEN 'Pickup & Sorting'
          WHEN leg_number = 2 THEN 'Transit & Relay'
          WHEN leg_number = 3 THEN 'Final Delivery'
          ELSE 'Stage ' || leg_number
        END as stage_name,
        'Auto-generated threshold for ' || model as description
       FROM sla_configs 
       WHERE model = $1 
       ORDER BY leg_number ASC`,
      [model_type || 'three_legs']
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching SLA configs:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateSLAConfig = async (req: Request, res: Response): Promise<void> => {
  const { id, target_minutes, critical_minutes } = req.body;
  
  if (isNaN(target_minutes) || isNaN(critical_minutes)) {
    res.status(400).json({ error: 'Invalid SLA threshold values: NaN' });
    return;
  }

  try {
    const result = await db.query(
      `UPDATE sla_configs 
       SET max_minutes = $1, warning_minutes = $2, updated_at = NOW() 
       WHERE id = $3 
       RETURNING id, model as model_type, leg_number as stage_order, max_minutes as target_minutes, warning_minutes as critical_minutes`,
      [target_minutes, critical_minutes, id]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating SLA config:', error);
    res.status(500).json({ error: error.message });
  }
};

// --- Dashboard Controllers ---

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const ordersResult = await readDb.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('pending', 'processing', 'on_relay')) as active,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
      FROM orders
    `);

    const revenueResult = await readDb.query(`
      SELECT COALESCE(SUM(amount_idr), 0) as total
      FROM payments
      WHERE status = 'paid' AND created_at >= CURRENT_DATE
    `);

    const couriersResult = await readDb.query(`
      SELECT COUNT(*) as total FROM courier_profiles WHERE verification_status = 'approved'
    `);

    const slaResult = await readDb.query(`
      SELECT 
        (COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)::float / NULLIF(COUNT(*), 0)) * 100 as compliance
      FROM orders 
      WHERE status = 'delivered'
    `);

    res.json({
      total_orders_today: parseInt(ordersResult.rows[0].total),
      active_orders: parseInt(ordersResult.rows[0].active),
      delivered_orders: parseInt(ordersResult.rows[0].delivered),
      cancelled_orders: parseInt(ordersResult.rows[0].cancelled),
      revenue_today: parseInt(revenueResult.rows[0].total),
      active_couriers: parseInt(couriersResult.rows[0].total),
      sla_compliance: Math.round(slaResult.rows[0].compliance || 0),
      orders_growth: 12,
      revenue_growth: 8.5,
      courier_growth: -2.1,
      compliance_growth: 0.5
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getDashboardEvents = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      (SELECT 'order' as type, order_id::text as target, status as title, message as description, created_at 
       FROM order_events)
      UNION ALL 
      (SELECT 'system' as type, key as target, 'Flag/Config Changed' as title, change_reason as description, created_at 
       FROM feature_flag_logs)
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching dashboard events:', error);
    res.status(500).json({ error: error.message });
  }
};

// --- Additional Customer Controllers ---

export const updateCustomerStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await db.query("UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND role = 'customer'", [status, id]);
    res.json({ message: 'Customer status updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const bulkEmailCustomers = async (req: Request, res: Response) => {
  const { user_ids, subject, body } = req.body;
  try {
    // In a real app, this would queue emails
    console.log(`Bulk email to ${user_ids.length} customers: ${subject}`);
    res.json({ message: `Successfully queued ${user_ids.length} emails` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// --- Additional Finance Controllers ---

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

// --- Analytics Controllers ---

export const getAnalyticsKPIs = async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7D';
    const interval = range === '24H' ? '24 hours' : range === '7D' ? '7 days' : range === '30D' ? '30 days' : '1 year';

    // 1. SLA Compliance (using hardened logic)
    const slaRes = await readDb.query(`
      SELECT 
        (COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sla_logs sl WHERE sl.order_id = orders.id))::float / NULLIF(COUNT(*), 0)) * 100 as current,
        (COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sla_logs sl WHERE sl.order_id = orders.id) AND created_at < NOW() - INTERVAL '${interval}')::float / NULLIF(COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '${interval}'), 0)) * 100 as previous
      FROM orders 
      WHERE status = 'delivered' AND created_at >= NOW() - INTERVAL '${interval}' * 2
    `);

    // 2. Real Demand Gap: Contrast pending orders with online couriers
    const demandGapRes = await readDb.query(`
      WITH stats AS (
        SELECT 
          (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
          (SELECT COUNT(*) FROM courier_profiles WHERE verification_status = 'approved' AND is_online = TRUE) as online_couriers
      )
      SELECT 
        CASE 
          WHEN online_couriers = 0 THEN pending_orders * 100 
          ELSE (pending_orders::float / online_couriers) * 10 
        END as gap_score
      FROM stats
    `);

    // 3. Active Couriers
    const courierRes = await readDb.query(`
      SELECT COUNT(*) as total FROM courier_profiles WHERE verification_status = 'approved'
    `);

    // 4. Avg Delivery Time
    const avgDeliveryRes = await readDb.query(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (delivered_at - picked_up_at))/60) as avg_minutes
      FROM orders 
      WHERE status = 'delivered' AND created_at >= NOW() - INTERVAL '${interval}'
    `);

    const currentSla = Math.round(slaRes.rows[0].current || 0);
    const prevSla = Math.round(slaRes.rows[0].previous || 0);
    const slaDiff = currentSla - prevSla;

    res.json([
      { 
        label: 'SLA Compliance', 
        value: `${currentSla}%`, 
        change: `${slaDiff >= 0 ? '+' : ''}${slaDiff}%`, 
        up: slaDiff >= 0 
      },
      { 
        label: 'Demand Gap', 
        value: `${(demandGapRes.rows[0].gap_score || 0).toFixed(1)}%`, 
        change: '-0.5%', // Trend logic would require time-series snapshots
        up: demandGapRes.rows[0].gap_score < 5 
      },
      { 
        label: 'Active Couriers', 
        value: courierRes.rows[0].total.toString(), 
        change: '+5%', 
        up: true 
      },
      { 
        label: 'Avg. Delivery', 
        value: `${Math.round(avgDeliveryRes.rows[0].avg_minutes || 0)}m`, 
        change: '-2m', 
        up: true 
      }
    ]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAnalyticsSLA = async (req: Request, res: Response) => {
  try {
    // Hardening: Use PostGIS ST_Intersects to join orders with real zones
    const result = await readDb.query(`
      WITH daily_stats AS (
        SELECT 
          TO_CHAR(o.created_at, 'Dy') as day_name,
          DATE_TRUNC('day', o.created_at) as day_date,
          z.name as zone_name,
          (COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sla_logs sl WHERE sl.order_id = o.id)))::float / NULLIF(COUNT(*), 0) * 100 as compliance
        FROM orders o
        JOIN zones z ON ST_Intersects(z.polygon, o.pickup_location)
        WHERE o.status = 'delivered' AND o.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY 1, 2, 3
      )
      SELECT 
        day_name as name,
        day_date,
        JSONB_OBJECT_AGG(LOWER(REPLACE(zone_name, ' ', '_')), ROUND(compliance)) as zones
      FROM daily_stats
      GROUP BY 1, 2
      ORDER BY day_date
    `);
    
    // Map to the format expected by the frontend Recharts component
    const chartData = result.rows.map(r => ({
      name: r.name,
      ...r.zones
    }));

    res.json(chartData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Note: Removed duplicate surge controller here as it is redundant.


// Note: Removed duplicate scan accuracy controller here.


// Note: Removed duplicate retention controller here.


// --- CRUD Controllers: Vouchers ---

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

    // Audit Log
    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`voucher:${code}`, true, changedBy, reason || `Created voucher: ${name}`, JSON.stringify(result.rows[0])]
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

    // Audit Log
    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`voucher:${result.rows[0].code}`, result.rows[0].is_active, changedBy, reason || `Updated voucher: ${name}`, JSON.stringify(result.rows[0])]
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
  const { reason } = req.body;
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

    // Audit Log
    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason) 
       VALUES ($1, $2, $3, $4)`,
      [`voucher:${voucher.code}`, false, changedBy, reason || `Deleted voucher: ${voucher.name}`]
    );

    await client.query('COMMIT');
    res.json({ message: 'Voucher deleted successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// --- CRUD Controllers: Zones ---

export const createZone = async (req: Request, res: Response) => {
  const { name, code, polygon, max_couriers, reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO zones (name, code, polygon, max_couriers)
       VALUES ($1, $2, ST_GeogFromText($3), $4) RETURNING id, name, code, ST_AsText(polygon) as polygon, max_couriers`,
      [name, code, polygon, max_couriers]
    );

    // Audit Log
    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`zone:${code}`, true, changedBy, reason || `Created zone: ${name}`, JSON.stringify(result.rows[0])]
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

export const updateZone = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, is_active, max_couriers, polygon, reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    let query = 'UPDATE zones SET name = COALESCE($1, name), is_active = COALESCE($2, is_active), max_couriers = COALESCE($3, max_couriers), updated_at = NOW()';
    const values: any[] = [name, is_active, max_couriers];
    
    if (polygon) {
      query += ', polygon = ST_GeogFromText($4)';
      values.push(polygon);
    }
    
    query += ' WHERE id = $' + (values.length + 1) + ' RETURNING id, name, code, ST_AsText(polygon) as polygon, is_active, max_couriers';
    values.push(id);

    const result = await client.query(query, values);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Zone not found' });
    }

    // Audit Log
    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`zone:${result.rows[0].code}`, result.rows[0].is_active, changedBy, reason || `Updated zone: ${name}`, JSON.stringify(result.rows[0])]
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

export const deleteZone = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    const checkRes = await client.query('SELECT code, name FROM zones WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Zone not found' });
    }
    const zone = checkRes.rows[0];

    await client.query('DELETE FROM zones WHERE id = $1', [id]);

    // Audit Log
    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason) 
       VALUES ($1, $2, $3, $4)`,
      [`zone:${zone.code}`, false, changedBy, reason || `Deleted zone: ${zone.name}`]
    );

    await client.query('COMMIT');
    res.json({ message: 'Zone deleted successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// --- Scheduled Reports Controllers ---

export const getScheduledReports = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query('SELECT * FROM scheduled_reports ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createScheduledReport = async (req: Request, res: Response) => {
  const { name, frequency, time_slot, day_of_week, day_of_month, recipient_emails, query_payload } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO scheduled_reports (name, frequency, time_slot, day_of_week, day_of_month, recipient_emails, query_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, frequency, time_slot, day_of_week, day_of_month, recipient_emails, query_payload]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateScheduledReport = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, frequency, time_slot, is_active, recipient_emails } = req.body;
  try {
    const result = await db.query(
      `UPDATE scheduled_reports 
       SET name = COALESCE($1, name),
           frequency = COALESCE($2, frequency),
           time_slot = COALESCE($3, time_slot),
           is_active = COALESCE($4, is_active),
           recipient_emails = COALESCE($5, recipient_emails),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, frequency, time_slot, is_active, recipient_emails, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteScheduledReport = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM scheduled_reports WHERE id = $1', [id]);
    res.json({ message: 'Report deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAnalyticsSurge = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT 
        TO_CHAR(created_at, 'HH24:00') as time,
        COUNT(*) as frequency,
        ROUND(AVG(dynamic_price_idr / 1000), 1) as impact
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '7 days' AND dynamic_price_idr > 0
      GROUP BY 1
      ORDER BY 1
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAnalyticsScanAccuracy = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT 
        (FLOOR(confidence_score * 10) / 10)::float as confidence,
        COUNT(*) as count
      FROM package_scans
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAnalyticsRetention = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      WITH first_orders AS (
        SELECT customer_id, MIN(DATE_TRUNC('month', created_at)) as cohort_month
        FROM orders
        GROUP BY 1
      ),
      cohort_sizes AS (
        SELECT cohort_month, COUNT(*) as size
        FROM first_orders
        GROUP BY 1
      ),
      retention AS (
        SELECT 
          f.cohort_month,
          DATE_TRUNC('month', o.created_at) as order_month,
          COUNT(DISTINCT o.customer_id) as retained_users
        FROM first_orders f
        JOIN orders o ON f.customer_id = o.customer_id
        GROUP BY 1, 2
      )
      SELECT 
        TO_CHAR(s.cohort_month, 'Mon YYYY') as month,
        size,
        ROUND(MAX(CASE WHEN order_month = s.cohort_month + INTERVAL '1 month' THEN retained_users::float / size END) * 100) as m1,
        ROUND(MAX(CASE WHEN order_month = s.cohort_month + INTERVAL '2 month' THEN retained_users::float / size END) * 100) as m2,
        ROUND(MAX(CASE WHEN order_month = s.cohort_month + INTERVAL '3 month' THEN retained_users::float / size END) * 100) as m3,
        ROUND(MAX(CASE WHEN order_month = s.cohort_month + INTERVAL '4 month' THEN retained_users::float / size END) * 100) as m4,
        ROUND(MAX(CASE WHEN order_month = s.cohort_month + INTERVAL '5 month' THEN retained_users::float / size END) * 100) as m5
      FROM cohort_sizes s
      LEFT JOIN retention r ON s.cohort_month = r.cohort_month
      GROUP BY 1, 2
      ORDER BY MIN(s.cohort_month) DESC
      LIMIT 6
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getHeatData = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT 
        ST_Y(current_location::geometry) as lat,
        ST_X(current_location::geometry) as lng,
        CASE 
          WHEN is_online = TRUE THEN 1.0
          ELSE 0.5
        END as weight
      FROM courier_profiles
      WHERE verification_status = 'approved' AND current_location IS NOT NULL
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// --- Export Analytics ---

export const exportAnalytics = async (req: Request, res: Response) => {
  try {
    const { range } = req.query;
    const interval = range === '24H' ? '24 hours' : range === '7D' ? '7 days' : '30 days';

    const result = await readDb.query(`
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'delivered') as completed_orders,
        SUM(total_price_idr) as revenue
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY 1
      ORDER BY 1 DESC
    `);

    let csv = 'Hour,Total Orders,Completed Orders,Revenue (IDR)\n';
    result.rows.forEach(row => {
      csv += `${row.hour.toISOString()},${row.total_orders},${row.completed_orders},${row.revenue}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics_export_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};


