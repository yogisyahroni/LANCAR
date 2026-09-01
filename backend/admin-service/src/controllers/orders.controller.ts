import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';

const STUCK_REASON_SQL = `
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM courier_proof_attempts cpa
      WHERE cpa.order_id = o.id
        AND cpa.proof_status = 'rejected'
        AND cpa.created_at >= NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1
          FROM courier_proof_attempts accepted_cpa
          WHERE accepted_cpa.order_id = cpa.order_id
            AND accepted_cpa.proof_step = cpa.proof_step
            AND accepted_cpa.proof_status = 'accepted'
            AND accepted_cpa.created_at > cpa.created_at
        )
    ) THEN 'proof_failed'
    WHEN LOWER(o.status) IN ('delivered', 'completed')
      AND (o.merchant_id IS NOT NULL OR o.service_sub_type = 'food_delivery')
      AND COALESCE(o.delivered_at, o.updated_at, o.created_at) < NOW() - INTERVAL '15 minutes'
      AND NOT EXISTS (
        SELECT 1
        FROM merchant_settlements ms
        WHERE ms.order_id = o.id
      ) THEN 'settlement_missing'
    WHEN LOWER(o.status) IN ('accepted', 'assigned', 'going_to_pickup', 'pickup_pending', 'picking_up')
      AND COALESCE((
        SELECT MAX(COALESCE(d.responded_at, d.offered_at, d.created_at))
        FROM courier_offer_dispatches d
        WHERE d.order_id = o.id
          AND d.status = 'accepted'
      ), o.assigned_at, o.updated_at, o.created_at) < NOW() - INTERVAL '20 minutes'
      AND o.picked_up_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM order_events oe
        WHERE oe.order_id = o.id
          AND oe.event_type IN ('arrived', 'courier_arrived', 'driver_arrived', 'pickup_arrived')
      ) THEN 'accepted_no_arrival'
    WHEN LOWER(o.status) IN ('picked_up', 'in_transit', 'in_progress', 'service_started', 'loading', 'unloading')
      AND COALESCE(o.picked_up_at, (
        SELECT MAX(COALESCE(ol.started_at, ol.updated_at, ol.created_at))
        FROM order_legs ol
        WHERE ol.order_id = o.id
          AND LOWER(ol.status) IN ('picked_up', 'in_transit', 'in_progress')
      ), o.updated_at, o.created_at) < NOW() - INTERVAL '60 minutes'
      AND (
        o.service_sub_type IS NULL
        OR o.service_sub_type NOT IN ('tambal_ban_motor', 'tambal_ban_mobil', 'towing_motor', 'towing_mobil')
        OR (
          o.service_sub_type IN ('tambal_ban_motor', 'tambal_ban_mobil')
          AND NOT EXISTS (
            SELECT 1
            FROM tambal_ban_reports tr
            WHERE tr.order_id = o.id
              AND tr.completed_at IS NOT NULL
          )
        )
        OR (
          o.service_sub_type IN ('towing_motor', 'towing_mobil')
          AND NOT EXISTS (
            SELECT 1
            FROM towing_reports twr
            WHERE twr.order_id = o.id
              AND twr.completed_at IS NOT NULL
          )
        )
      ) THEN 'service_started_no_completion'
    WHEN LOWER(o.status) IN ('paid', 'matched', 'dispatching', 'offered', 'searching', 'pending_assignment', 'no_courier_found')
      AND NOT EXISTS (
        SELECT 1
        FROM courier_offer_dispatches accepted_dispatch
        WHERE accepted_dispatch.order_id = o.id
          AND accepted_dispatch.status = 'accepted'
      )
      AND EXISTS (
        SELECT 1
        FROM courier_offer_dispatches expired_dispatch
        WHERE expired_dispatch.order_id = o.id
          AND (
            expired_dispatch.status = 'expired'
            OR (expired_dispatch.status = 'offered' AND expired_dispatch.expires_at < NOW())
          )
      ) THEN 'offered_expired'
    WHEN LOWER(o.status) IN ('paid', 'matched', 'dispatching', 'searching', 'pending_assignment')
      AND COALESCE(o.updated_at, o.created_at) < NOW() - INTERVAL '5 minutes'
      AND NOT EXISTS (
        SELECT 1
        FROM courier_offer_dispatches d
        WHERE d.order_id = o.id
      ) THEN 'paid_no_dispatch'
    ELSE NULL
  END
`;

const STUCK_SINCE_SQL = `
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM courier_proof_attempts cpa
      WHERE cpa.order_id = o.id
        AND cpa.proof_status = 'rejected'
        AND cpa.created_at >= NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1
          FROM courier_proof_attempts accepted_cpa
          WHERE accepted_cpa.order_id = cpa.order_id
            AND accepted_cpa.proof_step = cpa.proof_step
            AND accepted_cpa.proof_status = 'accepted'
            AND accepted_cpa.created_at > cpa.created_at
        )
    ) THEN (
      SELECT MAX(cpa.created_at)
      FROM courier_proof_attempts cpa
      WHERE cpa.order_id = o.id
        AND cpa.proof_status = 'rejected'
    )
    WHEN LOWER(o.status) IN ('delivered', 'completed')
      AND (o.merchant_id IS NOT NULL OR o.service_sub_type = 'food_delivery')
      AND NOT EXISTS (SELECT 1 FROM merchant_settlements ms WHERE ms.order_id = o.id)
      THEN COALESCE(o.delivered_at, o.updated_at, o.created_at)
    WHEN LOWER(o.status) IN ('accepted', 'assigned', 'going_to_pickup', 'pickup_pending', 'picking_up')
      THEN COALESCE((
        SELECT MAX(COALESCE(d.responded_at, d.offered_at, d.created_at))
        FROM courier_offer_dispatches d
        WHERE d.order_id = o.id
          AND d.status = 'accepted'
      ), o.assigned_at, o.updated_at, o.created_at)
    WHEN LOWER(o.status) IN ('picked_up', 'in_transit', 'in_progress', 'service_started', 'loading', 'unloading')
      THEN COALESCE(o.picked_up_at, (
        SELECT MAX(COALESCE(ol.started_at, ol.updated_at, ol.created_at))
        FROM order_legs ol
        WHERE ol.order_id = o.id
      ), o.updated_at, o.created_at)
    WHEN EXISTS (
      SELECT 1
      FROM courier_offer_dispatches expired_dispatch
      WHERE expired_dispatch.order_id = o.id
        AND (
          expired_dispatch.status = 'expired'
          OR (expired_dispatch.status = 'offered' AND expired_dispatch.expires_at < NOW())
        )
    ) THEN (
      SELECT MAX(expired_dispatch.expires_at)
      FROM courier_offer_dispatches expired_dispatch
      WHERE expired_dispatch.order_id = o.id
        AND (
          expired_dispatch.status = 'expired'
          OR (expired_dispatch.status = 'offered' AND expired_dispatch.expires_at < NOW())
        )
    )
    ELSE COALESCE(o.updated_at, o.created_at)
  END
`;

const STUCK_REASON_FILTERS = new Set([
  'paid_no_dispatch',
  'offered_expired',
  'accepted_no_arrival',
  'service_started_no_completion',
  'proof_failed',
  'settlement_missing',
]);

const STUCK_LABEL_SQL = `
  CASE stuck_reason
    WHEN 'paid_no_dispatch' THEN 'Paid, belum masuk dispatch'
    WHEN 'offered_expired' THEN 'Offer expired, perlu re-offer'
    WHEN 'accepted_no_arrival' THEN 'Accepted, kurir belum tiba'
    WHEN 'service_started_no_completion' THEN 'Service jalan, belum selesai'
    WHEN 'proof_failed' THEN 'Proof gagal / perlu review'
    WHEN 'settlement_missing' THEN 'Settlement belum terbentuk'
    ELSE NULL
  END
`;

const STUCK_SEVERITY_SQL = `
  CASE stuck_reason
    WHEN 'proof_failed' THEN 'critical'
    WHEN 'settlement_missing' THEN 'critical'
    WHEN 'accepted_no_arrival' THEN 'warning'
    WHEN 'service_started_no_completion' THEN 'warning'
    WHEN 'offered_expired' THEN 'warning'
    WHEN 'paid_no_dispatch' THEN 'warning'
    ELSE NULL
  END
`;

const getOrderStuckDiagnostics = async (orderId: string) => {
  const result = await readDb.query(`
    WITH order_base AS (
      SELECT
        o.id,
        ${STUCK_REASON_SQL} AS stuck_reason,
        ${STUCK_SINCE_SQL} AS stuck_since
      FROM orders o
      WHERE o.id = $1
    )
    SELECT
      stuck_reason,
      ${STUCK_LABEL_SQL} AS stuck_label,
      ${STUCK_SEVERITY_SQL} AS stuck_severity,
      stuck_since
    FROM order_base
  `, [orderId]);

  return result.rows[0] || {
    stuck_reason: null,
    stuck_label: null,
    stuck_severity: null,
    stuck_since: null,
  };
};

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const type = req.query.type as string;
    const stuck = String(req.query.stuck || '').trim();
    const service = String(req.query.service || '').trim();
    const subtype = String(req.query.subtype || '').trim();
    const provider = String(req.query.provider || '').trim();
    const merchant = String(req.query.merchant || '').trim();
    const courier = String(req.query.courier || '').trim();
    const paymentState = String(req.query.payment_state || '').trim();

    // Build the base query — courier diambil via correlated subquery dari leg PERTAMA
    // yang aktif untuk menghindari duplicate rows (1 order multi-leg = N baris jika JOIN langsung).
    let query = `
      WITH order_base AS (
      SELECT 
        o.id, 
        o.order_number,
        o.model, 
        o.service_category,
        o.service_code,
        o.service_sub_type,
        o.merchant_id,
        o.logistics_provider,
        o.status, 
        o.total_price_idr as total_amount, 
        o.base_price_idr as base_fare,
        o.platform_fee_idr as platform_fee,
        o.created_at,
        -- AUDIT-FIX: kirim scheduled_at (UTC ISO) supaya badge "Terjadwal"
        -- di dashboard benar-benar tampil (sebelumnya tidak di-SELECT →
        -- badge mati permanen).
        to_char(o.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as scheduled_at,
        COALESCE((SELECT p.status FROM payments p WHERE p.order_id = o.id ORDER BY p.updated_at DESC LIMIT 1), 'unrecorded') AS payment_status,
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
        ,
        ${STUCK_REASON_SQL} AS stuck_reason,
        ${STUCK_SINCE_SQL} AS stuck_since
      FROM orders o
      LEFT JOIN users u ON o.customer_id = u.id
      WHERE 1=1
    `;
    const values: any[] = [];

    if (search) {
      values.push(`%${search}%`);
      // AUDIT-FIX: cu.full_name sebelumnya pakai alias yang tidak ada di
      // FROM (JOIN pakai `u`) → SQL error kalau admin pakai search.
      query += ` AND (o.id::text ILIKE $${values.length} OR u.full_name ILIKE $${values.length} OR o.order_number ILIKE $${values.length})`;
    }

    if (status) {
      values.push(status);
      query += ` AND o.status = $${values.length}`;
    }

    if (type) {
      values.push(type);
      query += ` AND o.model = $${values.length}`;
    }

    if (service) {
      values.push(`%${service}%`);
      query += ` AND (o.service_category ILIKE $${values.length} OR o.service_code ILIKE $${values.length})`;
    }

    if (subtype) {
      values.push(`%${subtype}%`);
      query += ` AND o.service_sub_type ILIKE $${values.length}`;
    }

    if (provider) {
      values.push(`%${provider}%`);
      query += ` AND (o.logistics_provider ILIKE $${values.length} OR EXISTS (
        SELECT 1
        FROM carrier_event_inbox cei_filter
        WHERE cei_filter.awb_number = o.awb_number
          AND cei_filter.provider ILIKE $${values.length}
      ))`;
    }

    if (merchant) {
      values.push(`%${merchant}%`);
      query += ` AND (o.merchant_id::text ILIKE $${values.length} OR EXISTS (
        SELECT 1 FROM merchants m WHERE m.id = o.merchant_id AND m.nama_toko ILIKE $${values.length}
      ))`;
    }

    if (courier) {
      values.push(`%${courier}%`);
      query += ` AND EXISTS (
        SELECT 1
        FROM order_legs ol_filter
        LEFT JOIN courier_profiles cp_filter ON cp_filter.id = ol_filter.courier_id
        LEFT JOIN users cu_filter ON cu_filter.id = cp_filter.user_id
        WHERE ol_filter.order_id = o.id
          AND (ol_filter.courier_id::text ILIKE $${values.length} OR cu_filter.full_name ILIKE $${values.length})
      )`;
    }

    if (paymentState) {
      values.push(paymentState);
      query += ` AND EXISTS (
        SELECT 1 FROM payments p_filter
        WHERE p_filter.order_id = o.id AND (
          LOWER(p_filter.status) = LOWER($${values.length})
          OR (LOWER($${values.length}) = 'refunded' AND EXISTS (
            SELECT 1 FROM refunds r_filter
            WHERE r_filter.order_id = o.id AND LOWER(r_filter.status) IN ('pending', 'processing', 'completed')
          ))
        )
      )`;
    }

    query += `
      ),
      order_diag AS (
        SELECT
          order_base.*,
          ${STUCK_LABEL_SQL} AS stuck_label,
          ${STUCK_SEVERITY_SQL} AS stuck_severity
        FROM order_base
      )
      SELECT *
      FROM order_diag
      WHERE 1=1
    `;

    if (stuck === 'risk' || stuck === 'any') {
      query += ' AND stuck_reason IS NOT NULL';
    } else if (STUCK_REASON_FILTERS.has(stuck)) {
      values.push(stuck);
      query += ` AND stuck_reason = $${values.length}`;
    }

    const countQuery = `SELECT COUNT(*) FROM (${query}) as subquery`;
    // Keep the count query's parameter snapshot immutable while pagination
    // values are appended for the data query below.
    const countRes = await readDb.query(countQuery, [...values]);
    const total = parseInt(countRes.rows[0].count);

    query += ` ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
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

/** Read-only command-centre feed: active orders with the latest trusted position. */
export const getLiveActiveOrders = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT o.id,
             o.order_number,
             o.status,
             o.service_category,
             COALESCE(
               ST_Y(latest_location.location::geometry),
               ST_Y(COALESCE(o.pickup_location, o.dropoff_location)::geometry)
             )::float8 AS latitude,
             COALESCE(
               ST_X(latest_location.location::geometry),
               ST_X(COALESCE(o.pickup_location, o.dropoff_location)::geometry)
             )::float8 AS longitude,
             latest_location.recorded_at AS last_location_at,
             courier.full_name AS courier_name
      FROM orders o
      LEFT JOIN LATERAL (
        SELECT ol.courier_id
        FROM order_legs ol
        WHERE ol.order_id = o.id
          AND ol.courier_id IS NOT NULL
        ORDER BY ol.leg_number ASC
        LIMIT 1
      ) assigned_leg ON TRUE
      LEFT JOIN courier_profiles cp ON cp.id = assigned_leg.courier_id
      LEFT JOIN users courier ON courier.id = cp.user_id
      LEFT JOIN LATERAL (
        SELECT cl.location, cl.recorded_at
        FROM courier_locations cl
        WHERE cl.order_id = o.id
          AND cl.courier_id = assigned_leg.courier_id
          AND COALESCE(cl.is_spoofed, FALSE) = FALSE
        ORDER BY cl.recorded_at DESC
        LIMIT 1
      ) latest_location ON TRUE
      WHERE LOWER(COALESCE(o.status, '')) NOT IN ('delivered', 'completed', 'cancelled', 'rejected', 'failed')
        AND COALESCE(o.pickup_location, o.dropoff_location) IS NOT NULL
      ORDER BY o.updated_at DESC
      LIMIT 500
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error fetching live active orders:', error);
    res.status(500).json({ success: false, data: [], error: 'Live active orders unavailable' });
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
    const id = String(req.params.id || '');
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

    // Evidence viewer: expose the trusted GPS breadcrumb for dispute review.
    // Spoofed points are intentionally excluded; the viewer must never imply
    // that rejected telemetry is a valid courier trail.
    const gpsTrailRes = await readDb.query(`
      SELECT id,
             ST_Y(location::geometry)::float8 AS latitude,
             ST_X(location::geometry)::float8 AS longitude,
             accuracy_m,
             speed_kmh,
             heading_deg,
             recorded_at
      FROM courier_locations
      WHERE order_id = $1
        AND location IS NOT NULL
        AND COALESCE(is_spoofed, FALSE) = FALSE
      ORDER BY recorded_at ASC
      LIMIT 500
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

    const tambalBanReportsRes = await readDb.query(`
      SELECT *
      FROM tambal_ban_reports
      WHERE order_id = $1
    `, [id]);

    const towingReportsRes = await readDb.query(`
      SELECT *
      FROM towing_reports
      WHERE order_id = $1
    `, [id]);

    // FB-110: rincian food (item pesanan + merchant) untuk investigasi CS.
    const foodItemsRes = await readDb.query(`
      SELECT foi.menu_item_id,
             foi.item_name,
             foi.item_price,
             foi.quantity,
             foi.notes,
             foi.subtotal,
             foi.created_at,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'variant_name', foiv.variant_name,
                 'option_name', foiv.option_name,
                 'price_delta', foiv.price_delta
               ) ORDER BY foiv.id)
               FROM food_order_item_variants foiv
               WHERE foiv.order_item_id = foi.id
             ), '[]'::jsonb) AS variants
      FROM food_order_items foi
      WHERE foi.order_id = $1
      ORDER BY foi.created_at ASC
    `, [id]);

    const foodMerchantRes = await readDb.query(`
      SELECT m.id AS merchant_id,
             m.nama_toko AS merchant_name,
             m.alamat AS merchant_address,
             o.merchant_accepted_at,
             o.food_ready_at
      FROM orders o
      LEFT JOIN merchants m ON m.id = o.merchant_id
      WHERE o.id = $1
    `, [id]);

    const paymentsRes = await readDb.query(`
      SELECT id, payment_number, provider, method, status, amount_idr,
             provider_reference, paid_at, expires_at, created_at, updated_at
      FROM payments
      WHERE order_id = $1
      ORDER BY created_at ASC
    `, [id]);

    const refundsRes = await readDb.query(`
      SELECT id, payment_id, amount_idr, reason, status, refund_percentage,
             gateway_ref, processed_at, created_at, updated_at
      FROM refunds
      WHERE order_id = $1
      ORDER BY created_at ASC
    `, [id]);

    // Raw provider payloads are intentionally returned only from this
    // authenticated admin endpoint. Customer-facing order APIs never select
    // carrier_event_inbox.raw_payload.
    const carrierEventsRes = await readDb.query(`
      SELECT cei.id, cei.provider, cei.event_id, cei.awb_number,
             cei.canonical_status, cei.raw_status, cei.raw_code,
             cei.raw_description, cei.raw_location, cei.occurred_at,
             cei.received_at, cei.created_at, cei.provider_status,
             cei.raw_payload
      FROM carrier_event_inbox cei
      WHERE cei.awb_number = (SELECT awb_number FROM orders WHERE id = $1)
      ORDER BY cei.received_at ASC
    `, [id]);
    const stuckDiagnostics = await getOrderStuckDiagnostics(id);

    res.json({
      ...orderRes.rows[0],
      ...stuckDiagnostics,
      events: eventsRes.rows,
      legs: legsRes.rows,
      proofs: proofsRes.rows,
      gps_trail: gpsTrailRes.rows,
      safety_events: safetyEventsRes.rows,
      packages: packagesRes.rows,
      dispatches: dispatchesRes.rows,
      proof_attempts: proofAttemptsRes.rows,
      face_verifications: faceVerificationsRes.rows,
      tambal_ban_report: tambalBanReportsRes.rows.length > 0 ? tambalBanReportsRes.rows[0] : null,
      towing_report: towingReportsRes.rows.length > 0 ? towingReportsRes.rows[0] : null,
      food_items: foodItemsRes.rows,
      food_merchant: foodMerchantRes.rows.length > 0 ? foodMerchantRes.rows[0] : null,
      payments: paymentsRes.rows,
      refunds: refundsRes.rows,
      carrier_events: carrierEventsRes.rows
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

    const adminId = getActorId(req);
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

    const adminId = getActorId(req);
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

    const adminId = getActorId(req);
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
