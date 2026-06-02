import { Request, Response } from 'express';
import { db, readDb } from '../db';

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const type = req.query.type as string;

    // Build the base query — courier diambil via correlated subquery dari leg PERTAMA
    // yang aktif untuk menghindari duplicate rows (1 order multi-leg = N baris jika JOIN langsung).
    let query = `
      SELECT 
        o.id, 
        o.model, 
        o.status, 
        o.total_price_idr as total_amount, 
        o.base_price_idr as base_fare,
        o.created_at,
        u.full_name as customer_name,
        u.phone_number as customer_phone,
        (SELECT cu.full_name 
         FROM order_legs ol2 
         JOIN courier_profiles cp2 ON cp2.id = ol2.courier_id
         JOIN users cu ON cu.id = cp2.user_id
         WHERE ol2.order_id = o.id 
         ORDER BY ol2.leg_number ASC LIMIT 1) as courier_name,
        (SELECT cu.phone_number 
         FROM order_legs ol2 
         JOIN courier_profiles cp2 ON cp2.id = ol2.courier_id
         JOIN users cu ON cu.id = cp2.user_id
         WHERE ol2.order_id = o.id 
         ORDER BY ol2.leg_number ASC LIMIT 1) as courier_phone
      FROM orders o
      LEFT JOIN users u ON o.customer_id = u.id
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
        SUM(total_price_idr) as total_revenue
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
      SELECT o.*, 
             o.total_price_idr as total_amount,
             o.base_price_idr as base_fare,
             u.full_name as customer_name, 
             u.email as customer_email,
             u.phone_number as customer_phone
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      WHERE o.id = $1
    `, [id]);

    if (orderRes.rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const eventsRes = await readDb.query(`
      SELECT id, order_id, user_id, event_type, description, metadata, created_at 
      FROM order_events 
      WHERE order_id = $1 
      ORDER BY created_at ASC
    `, [id]);

    const legsRes = await readDb.query(`
      SELECT ol.*, cu.full_name as courier_name, cu.phone_number as courier_phone
      FROM order_legs ol
      LEFT JOIN courier_profiles cp ON ol.courier_id = cp.id
      LEFT JOIN users cu ON cp.user_id = cu.id
      WHERE ol.order_id = $1
      ORDER BY ol.leg_number ASC
    `, [id]);

    const proofsRes = await readDb.query(`
      SELECT
        ps.id,
        ps.scan_type,
        CASE
          WHEN ps.scan_type IN ('pickup', 'pickup_scan') THEN 'Scan pickup'
          WHEN ps.scan_type = 'pickup_photo' THEN 'Foto barang pickup'
          WHEN ps.scan_type = 'pod' THEN 'Foto POD'
          WHEN ps.scan_type = 'pickup_cancellation' THEN 'Bukti pembatalan pickup'
          ELSE 'Bukti operasional'
        END AS proof_label,
        CASE
          WHEN ps.scan_type = 'pickup_cancellation' THEN 'cancellation'
          WHEN ps.scan_type = 'pod' THEN 'pod'
          WHEN ps.scan_type IN ('pickup', 'pickup_scan', 'pickup_photo') THEN 'pickup'
          ELSE 'operational'
        END AS proof_category,
        ps.photo_url,
        ps.image_urls,
        ps.override_reason,
        CASE
          WHEN ps.scan_type = 'pickup_cancellation' THEN SPLIT_PART(COALESCE(ps.override_reason, ''), ':', 1)
          ELSE NULL
        END AS reason_code,
        CASE
          WHEN ps.scan_type = 'pickup_cancellation' AND COALESCE(ps.override_reason, '') LIKE '%:%'
            THEN NULLIF(TRIM(REGEXP_REPLACE(ps.override_reason, '^[^:]+:\\s*', '')), '')
          ELSE NULL
        END AS reason_note,
        ps.latitude,
        ps.longitude,
        COALESCE(ps.scanned_at, ps.created_at) AS recorded_at,
        u.full_name AS submitted_by
      FROM package_scans ps
      LEFT JOIN users u ON u.id = ps.scanned_by
      WHERE ps.order_id = $1
      ORDER BY COALESCE(ps.scanned_at, ps.created_at) ASC
    `, [id]);

    const safetyEventsRes = await readDb.query(`
      SELECT id, event_type, severity, status, message, metadata, created_at
      FROM courier_safety_events
      WHERE order_id = $1
      ORDER BY created_at DESC
    `, [id]);

    const packagesRes = await readDb.query(`
      SELECT id AS package_id,
             package_index,
             package_code,
             description,
             size_tier,
             weight_kg,
             status,
             pickup_scan_verified_at,
             pickup_photo_verified_at,
             delivery_pod_verified_at,
             metadata,
             created_at,
             updated_at
      FROM order_packages
      WHERE order_id = $1
      ORDER BY package_index ASC
    `, [id]);

    const dispatchesRes = await readDb.query(`
      SELECT d.id,
             d.order_id,
             d.order_leg_id,
             d.courier_id,
             cu.full_name AS courier_name,
             cu.phone_number AS courier_phone,
             d.wave_number,
             d.rank_number,
             d.score,
             d.distance_m,
             d.rating_snapshot,
             d.acceptance_rate_snapshot,
             d.completion_rate_snapshot,
             d.status,
             d.offered_at,
             d.expires_at,
             d.responded_at,
             d.response_reason,
             d.metadata,
             d.created_at,
             d.updated_at
      FROM courier_offer_dispatches d
      LEFT JOIN users cu ON cu.id = d.courier_id
      WHERE d.order_id = $1
      ORDER BY d.wave_number ASC, d.rank_number ASC, d.created_at ASC
    `, [id]);

    const proofAttemptsRes = await readDb.query(`
      SELECT id,
             order_id,
             courier_id,
             proof_step,
             proof_status,
             rejection_reason,
             distance_m,
             radius_m,
             latitude,
             longitude,
             accuracy_m,
             spoof_risk,
             barcode_value,
             photo_url,
             service_code,
             face_verification_id,
             override_reason,
             manual_review_required,
             policy_snapshot,
             created_at
      FROM courier_proof_attempts
      WHERE order_id = $1
      ORDER BY created_at DESC
    `, [id]);

    const faceVerificationsRes = await readDb.query(`
      SELECT id,
             courier_id,
             order_id,
             verification_type,
             status,
             provider,
             provider_reference,
             liveness_score,
             image_url,
             failure_reason,
             metadata,
             created_at
      FROM courier_face_verifications
      WHERE order_id = $1
      ORDER BY created_at DESC
    `, [id]);

    res.json({
      ...orderRes.rows[0],
      events: eventsRes.rows,
      legs: legsRes.rows,
      proofs: proofsRes.rows,
      safety_events: safetyEventsRes.rows,
      packages: packagesRes.rows,
      dispatches: dispatchesRes.rows,
      proof_attempts: proofAttemptsRes.rows,
      face_verifications: faceVerificationsRes.rows
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

    await client.query(`
      UPDATE order_legs 
      SET courier_id = $1, status = 'assigned', updated_at = NOW()
      WHERE order_id = $2
    `, [courier_id, id]);

    const adminId = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(`
      INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
      VALUES ($1, $2, 'reassigned', $3, $4)
    `, [id, adminId, `Order reassigned to new courier. Reason: ${reason || 'Not specified'}`, JSON.stringify({ courier_id })]);

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

    await client.query(`
      INSERT INTO disputes (order_id, type, description, status, created_at)
      VALUES ($1, $2, $3, 'pending', NOW())
    `, [id, type || 'general', description]);

    const adminId = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(`
      INSERT INTO order_events (order_id, user_id, event_type, description)
      VALUES ($1, $2, 'flagged', $3)
    `, [id, adminId, `Order flagged: ${description}`]);

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
  const { customer_id, pickup_address, delivery_address, total_price_idr, model } = req.body;
  if (model && String(model).toLowerCase() !== 'p2p') {
    res.status(400).json({ error: 'Only p2p model is supported for new orders' });
    return;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO orders (customer_id, pickup_address, delivery_address, total_price_idr, model, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW()) RETURNING *
    `, [customer_id, pickup_address, delivery_address, total_price_idr, 'p2p']);

    const adminId = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(`
      INSERT INTO order_events (order_id, user_id, event_type, description)
      VALUES ($1, $2, 'created', 'Manual order created by admin')
    `, [result.rows[0].id, adminId]);

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
      SELECT o.id, o.status, o.model, o.total_price_idr, o.created_at, 
      u.full_name as customer
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      ORDER BY o.created_at DESC
    `);

    const csvRows = [
      ['Order ID', 'Status', 'Type', 'Amount', 'Date', 'Customer'].join(','),
      ...result.rows.map(r => [
        r.id, r.status, r.model, r.total_price_idr, r.created_at, `"${r.customer}"`
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders_export.csv');
    res.send(csvRows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
