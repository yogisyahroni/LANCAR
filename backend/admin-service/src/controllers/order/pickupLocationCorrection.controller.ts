import { Request, Response } from 'express';
import { db } from '../../db';
import { securityLog } from '../../security/logRedaction';
import { normalizeCoordinatePayload, validAddress } from './_shared';

const TERMINAL_OR_PICKED_UP = new Set(['picked_up', 'in_transit', 'delivered', 'failed', 'cancelled']);

const actorRole = (req: Request): 'customer' | 'courier' => {
  const role = String(req.user?.role || '').toLowerCase();
  return role.includes('courier') ? 'courier' : 'customer';
};

const orderAccessQuery = `
  SELECT o.id, o.customer_id, o.status, o.pickup_address,
         ST_Y(o.pickup_location::geometry) AS pickup_lat,
         ST_X(o.pickup_location::geometry) AS pickup_lng,
         EXISTS (
           SELECT 1 FROM order_legs ol
           WHERE ol.order_id = o.id AND ol.courier_id = $2 AND ol.status NOT IN ('delivered', 'failed', 'cancelled')
         ) AS is_assigned_courier
    FROM orders o
   WHERE o.id = $1
     AND (o.customer_id = $2 OR EXISTS (
       SELECT 1 FROM order_legs ol
       WHERE ol.order_id = o.id AND ol.courier_id = $2
     ))
   FOR UPDATE`;

export const listPickupLocationCorrections = async (req: Request, res: Response): Promise<void> => {
  const actorId = req.user?.id;
  if (!actorId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  try {
    const { rows } = await db.query(
      `SELECT id, order_id, suggested_by, suggested_by_role, previous_address, proposed_address,
              ST_Y(previous_location::geometry) AS previous_lat, ST_X(previous_location::geometry) AS previous_lng,
              ST_Y(proposed_location::geometry) AS proposed_lat, ST_X(proposed_location::geometry) AS proposed_lng,
              reason, status, accepted_by, accepted_at, route_recalculation_required, created_at, updated_at
         FROM pickup_location_corrections
        WHERE order_id = $1 AND EXISTS (
          SELECT 1 FROM orders o WHERE o.id = $1 AND (o.customer_id = $2 OR EXISTS (
            SELECT 1 FROM order_legs ol WHERE ol.order_id = o.id AND ol.courier_id = $2
          ))
        )
        ORDER BY created_at DESC`,
      [req.params.id, actorId],
    );
    res.json({ success: true, data: rows });
  } catch (error: any) {
    securityLog.error('Failed to list pickup location corrections', { error: error?.message });
    res.status(500).json({ success: false, error: 'Unable to load pickup corrections' });
  }
};

export const suggestPickupLocationCorrection = async (req: Request, res: Response): Promise<void> => {
  const actorId = req.user?.id;
  if (!actorId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  const proposed = normalizeCoordinatePayload(req.body?.location);
  const proposedAddress = typeof req.body?.address === 'string' ? req.body.address.trim().slice(0, 500) : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!proposed || !validAddress(proposedAddress) || !reason) {
    res.status(400).json({ success: false, code: 'ERR_PICKUP_CORRECTION_INVALID', error: 'Titik, alamat, dan alasan koreksi wajib valid.' });
    return;
  }
  try {
    const { rows } = await db.query(orderAccessQuery, [req.params.id, actorId]);
    const order = rows[0];
    if (!order) {
      res.status(404).json({ success: false, error: 'Order tidak ditemukan atau tidak dapat diakses.' });
      return;
    }
    if (TERMINAL_OR_PICKED_UP.has(String(order.status))) {
      res.status(409).json({ success: false, code: 'ERR_PICKUP_CORRECTION_LOCKED', error: 'Pickup tidak dapat dikoreksi setelah order berjalan.' });
      return;
    }
    const role = actorRole(req);
    if (role === 'courier' && !order.is_assigned_courier) {
      res.status(403).json({ success: false, error: 'Hanya kurir yang ditugaskan pada order yang dapat mengusulkan koreksi.' });
      return;
    }
    const { rows: correctionRows } = await db.query(
      `INSERT INTO pickup_location_corrections
         (order_id, suggested_by, suggested_by_role, previous_location, proposed_location, previous_address, proposed_address, reason)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
               ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8, $9, $10)
       RETURNING id, order_id, suggested_by_role, proposed_address, reason, status, route_recalculation_required, created_at`,
      [req.params.id, actorId, role, order.pickup_lng, order.pickup_lat, proposed.lng, proposed.lat, order.pickup_address, proposedAddress, reason],
    );
    res.status(201).json({ success: true, data: correctionRows[0], requires_customer_acceptance: role === 'courier' });
  } catch (error: any) {
    securityLog.error('Failed to suggest pickup location correction', { error: error?.message });
    res.status(500).json({ success: false, error: 'Unable to create pickup correction' });
  }
};

export const acceptPickupLocationCorrection = async (req: Request, res: Response): Promise<void> => {
  const actorId = req.user?.id;
  if (!actorId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT c.id, c.order_id, c.proposed_address, c.status,
              ST_Y(c.proposed_location::geometry) AS proposed_lat,
              ST_X(c.proposed_location::geometry) AS proposed_lng,
              o.customer_id, o.status AS order_status
         FROM pickup_location_corrections c
         JOIN orders o ON o.id = c.order_id
        WHERE c.id = $1 AND c.order_id = $2 AND o.customer_id = $3
        FOR UPDATE`,
      [req.params.correctionId, req.params.id, actorId],
    );
    const correction = rows[0];
    if (!correction) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Pickup correction not found' });
      return;
    }
    if (correction.status !== 'pending' || TERMINAL_OR_PICKED_UP.has(String(correction.order_status))) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'ERR_PICKUP_CORRECTION_LOCKED', error: 'Koreksi pickup sudah tidak dapat diterapkan.' });
      return;
    }
    const { rows: updatedOrders } = await client.query(
      `UPDATE orders
          SET pickup_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              pickup_address = $3,
              route_snapshot = '{}'::jsonb,
              route_provider = NULL,
              route_profile = NULL,
              route_distance_meters = NULL,
              route_duration_seconds = NULL,
              route_polyline = NULL,
              route_fallback_reason = 'pickup_location_corrected',
              updated_at = NOW()
        WHERE id = $4
      RETURNING id, pickup_address, ST_Y(pickup_location::geometry) AS pickup_lat, ST_X(pickup_location::geometry) AS pickup_lng`,
      [correction.proposed_lng, correction.proposed_lat, correction.proposed_address, correction.order_id],
    );
    await client.query(
      `UPDATE pickup_location_corrections
          SET status = 'accepted', accepted_by = $1, accepted_at = NOW(), updated_at = NOW()
        WHERE id = $2`,
      [actorId, correction.id],
    );
    await client.query('COMMIT');
    res.json({ success: true, data: updatedOrders[0], correction_id: correction.id, requires_requote: true, requires_reroute: true, route_snapshot_invalidated: true });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Failed to accept pickup location correction', { error: error?.message });
    res.status(500).json({ success: false, error: 'Unable to accept pickup correction' });
  } finally {
    client.release();
  }
};
