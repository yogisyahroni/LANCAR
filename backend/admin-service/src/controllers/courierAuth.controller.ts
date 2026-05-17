import { Request, Response } from 'express';
import { db } from '../db';
import { createNotification } from '../notifications';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

type CourierLoginRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string;
  status: string;
  pin_hash: string | null;
  vehicle_type: string | null;
  photo_url: string | null;
};

const isValidCourierPassword = (password: string, pinHash: string | null) => {
  if (!pinHash) return false;

  // Local seed data currently stores placeholder hashes. Keep this compatibility
  // narrow so seeded couriers can be tested without weakening real hashes.
  if (pinHash === 'hashed_pin') {
    return password === 'kurir123' || password === '123456' || password === pinHash;
  }

  return password === pinHash;
};

const base64Url = (value: string) =>
  Buffer.from(value)
    .toString('base64url');

const signCourierJwt = (userId: string) => {
  const secret = process.env.JWT_SECRET || 'lancar_secret_key_change_me';
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (7 * 24 * 60 * 60);

  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    user_id: userId,
    role: 'courier',
    iat: now,
    nbf: now,
    exp: expiresAt,
  }));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return {
    token: `${header}.${payload}.${signature}`,
    expiresAt: new Date(expiresAt * 1000),
  };
};

export const loginCourier = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Username and password are required',
      code: 'ERR_BAD_REQUEST',
    });
    return;
  }

  try {
    const result = await db.query<CourierLoginRow>(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.phone_number,
         u.status,
         u.pin_hash,
         cp.vehicle_type,
         u.photo_url
       FROM users u
       LEFT JOIN courier_profiles cp ON cp.user_id = u.id
       WHERE u.role = 'courier'
         AND (u.email = $1 OR u.phone_number = $1)
       LIMIT 1`,
      [username]
    );

    const courier = result.rows[0];
    if (!courier || courier.status !== 'active' || !isValidCourierPassword(password, courier.pin_hash)) {
      res.status(401).json({
        success: false,
        data: null,
        message: 'Username atau password salah',
        code: 'ERR_INVALID_CREDENTIALS',
      });
      return;
    }

    const { token, expiresAt } = signCourierJwt(courier.id);

    await db.query(
      `INSERT INTO user_sessions (user_id, refresh_token, device_id, device_info, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        courier.id,
        token,
        req.headers['x-device-id'] || 'courier-android',
        JSON.stringify({
          user_agent: req.headers['user-agent'] || null,
          ip: req.ip,
        }),
        expiresAt,
      ]
    );

    res.json({
      success: true,
      data: {
        token,
        courier_id: courier.id,
        name: courier.full_name,
        phone: courier.phone_number,
        vehicle_type: courier.vehicle_type,
        profile_photo_url: courier.photo_url,
      },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Courier login error:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Internal Server Error',
      code: 'ERR_INTERNAL_SERVER',
    });
  }
};

export const getMobileCourierProfile = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({
      success: false,
      data: null,
      message: 'Unauthorized',
      code: 'ERR_UNAUTHORIZED',
    });
    return;
  }

  try {
    const result = await db.query(
      `SELECT
         u.id,
         u.full_name,
         u.phone_number,
         u.photo_url,
         cp.vehicle_type,
         cp.application_channel,
         cp.is_online,
         COUNT(ol.id)::int AS total_deliveries,
         COUNT(ol.id) FILTER (WHERE ol.updated_at::date = CURRENT_DATE)::int AS today_deliveries,
         COALESCE(SUM(ol.assigned_fee_idr) FILTER (WHERE ol.status = 'delivered'), 0)::int AS total_earnings_idr,
         COALESCE(SUM(ol.assigned_fee_idr) FILTER (WHERE ol.status = 'delivered' AND ol.updated_at::date = CURRENT_DATE), 0)::int AS today_earnings_idr
       FROM users u
       LEFT JOIN courier_profiles cp ON cp.user_id = u.id
       LEFT JOIN order_legs ol ON ol.courier_id = u.id AND ol.status = 'delivered'
       WHERE u.id = $1 AND u.role = 'courier'
       GROUP BY u.id, u.full_name, u.phone_number, u.photo_url, cp.vehicle_type, cp.application_channel, cp.is_online`,
      [req.user.id]
    );

    const courier = result.rows[0];
    if (!courier) {
      res.status(404).json({
        success: false,
        data: null,
        message: 'Courier not found',
        code: 'ERR_NOT_FOUND',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        courier_id: courier.id,
        name: courier.full_name,
        phone: courier.phone_number,
        vehicle_type: courier.vehicle_type,
        application_channel: courier.application_channel || 'on_demand',
        status: courier.is_online ? 'online' : 'offline',
        profile_photo_url: courier.photo_url,
        total_deliveries: courier.total_deliveries,
        today_deliveries: courier.today_deliveries,
        total_earnings_idr: courier.total_earnings_idr,
        today_earnings_idr: courier.today_earnings_idr,
      },
      message: 'Courier profile loaded',
    });
  } catch (error) {
    console.error('Get mobile courier profile error:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Internal Server Error',
      code: 'ERR_INTERNAL_SERVER',
    });
  }
};

export const updateMobileCourierDuty = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({
      success: false,
      data: null,
      message: 'Unauthorized',
      code: 'ERR_UNAUTHORIZED',
    });
    return;
  }

  const online = req.body?.online === true;
  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);
  const accuracy = req.body?.accuracy === undefined ? null : Number(req.body.accuracy);

  if (online && (!Number.isFinite(latitude) || !Number.isFinite(longitude))) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Lokasi perangkat belum tersedia. Aktifkan GPS dan coba lagi untuk mulai On Duty.',
      code: 'ERR_LOCATION_REQUIRED',
    });
    return;
  }

  if (online && (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Koordinat lokasi tidak valid. Perbarui lokasi perangkat dan coba lagi.',
      code: 'ERR_INVALID_LOCATION',
    });
    return;
  }

  try {
    const courierRes = await db.query(
      `SELECT cp.id, cp.user_id
       FROM courier_profiles cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.user_id = $1 AND u.role = 'courier' AND u.status = 'active'
       LIMIT 1`,
      [req.user.id]
    );

    const courier = courierRes.rows[0];
    if (!courier) {
      res.status(404).json({
        success: false,
        data: null,
        message: 'Courier not found',
        code: 'ERR_NOT_FOUND',
      });
      return;
    }

    let zone: { id: string; name: string; code: string } | null = null;

    if (online) {
      const zoneRes = await db.query(
        `SELECT id, name, code
         FROM zones
         WHERE is_active = TRUE
           AND ST_Covers(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
         ORDER BY updated_at DESC
         LIMIT 1`,
        [longitude, latitude]
      );

      zone = zoneRes.rows[0] || null;
      if (!zone) {
        const activeZoneRes = await db.query(`SELECT COUNT(*)::int AS total FROM zones WHERE is_active = TRUE`);
        const activeZoneCount = activeZoneRes.rows[0]?.total || 0;
        res.status(409).json({
          success: false,
          data: {
            status: 'offline',
            zone_available: activeZoneCount > 0,
          },
          message: activeZoneCount > 0
            ? 'Lokasi Anda berada di luar zona operasional aktif. Silakan masuk ke area layanan LANCAR untuk mulai On Duty.'
            : 'Area operasional belum tersedia. Status On Duty belum dapat diaktifkan saat ini.',
          code: activeZoneCount > 0 ? 'ERR_OUTSIDE_ACTIVE_ZONE' : 'ERR_NO_ACTIVE_ZONE',
        });
        return;
      }

      await db.query(
        `UPDATE courier_profiles
         SET is_online = TRUE,
             current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             current_zone_id = $3,
             last_location_at = NOW(),
             updated_at = NOW()
         WHERE id = $4`,
        [longitude, latitude, zone.id, courier.id]
      );
    } else {
      await db.query(
        `UPDATE courier_profiles
         SET is_online = FALSE,
             updated_at = NOW()
         WHERE id = $1`,
        [courier.id]
      );
    }

    const profileRes = await db.query(
      `SELECT
         u.id,
         u.full_name,
         u.phone_number,
         u.photo_url,
         cp.vehicle_type,
         cp.application_channel,
         cp.is_online,
         z.id AS current_zone_id,
         z.name AS current_zone_name,
         z.code AS current_zone_code,
         COUNT(ol.id)::int AS total_deliveries,
         COUNT(ol.id) FILTER (WHERE ol.updated_at::date = CURRENT_DATE)::int AS today_deliveries,
         COALESCE(SUM(ol.assigned_fee_idr) FILTER (WHERE ol.status = 'delivered'), 0)::int AS total_earnings_idr,
         COALESCE(SUM(ol.assigned_fee_idr) FILTER (WHERE ol.status = 'delivered' AND ol.updated_at::date = CURRENT_DATE), 0)::int AS today_earnings_idr
       FROM users u
       LEFT JOIN courier_profiles cp ON cp.user_id = u.id
       LEFT JOIN zones z ON z.id = cp.current_zone_id
       LEFT JOIN order_legs ol ON ol.courier_id = u.id AND ol.status = 'delivered'
       WHERE u.id = $1 AND u.role = 'courier'
       GROUP BY u.id, u.full_name, u.phone_number, u.photo_url, cp.vehicle_type, cp.application_channel, cp.is_online, z.id, z.name, z.code`,
      [req.user.id]
    );

    const profile = profileRes.rows[0];
    res.json({
      success: true,
      data: {
        courier_id: profile.id,
        name: profile.full_name,
        phone: profile.phone_number,
        vehicle_type: profile.vehicle_type,
        application_channel: profile.application_channel || 'on_demand',
        status: profile.is_online ? 'online' : 'offline',
        profile_photo_url: profile.photo_url,
        total_deliveries: profile.total_deliveries,
        today_deliveries: profile.today_deliveries,
        total_earnings_idr: profile.total_earnings_idr,
        today_earnings_idr: profile.today_earnings_idr,
        current_zone: profile.current_zone_id ? {
          id: profile.current_zone_id,
          name: profile.current_zone_name,
          code: profile.current_zone_code,
        } : null,
        location_accuracy_m: Number.isFinite(accuracy) ? accuracy : null,
      },
      message: online
        ? `On Duty aktif di ${zone?.name || profile.current_zone_name}`
        : 'Status Off Duty berhasil diperbarui',
    });
  } catch (error) {
    console.error('Update mobile courier duty error:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Internal Server Error',
      code: 'ERR_INTERNAL_SERVER',
    });
  }
};

export const getMobileCourierOrders = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({
      success: false,
      data: null,
      message: 'Unauthorized',
      code: 'ERR_UNAUTHORIZED',
    });
    return;
  }

  try {
    const result = await db.query(
      `SELECT DISTINCT ON (o.id)
         o.id AS order_id,
         o.model,
         ol.leg_number,
         CASE
           WHEN LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand') THEN 'on_demand'
           WHEN ol.leg_number = 1 THEN 'pickup'
           ELSE 'delivery'
         END AS workflow_role,
         o.pickup_address,
         ST_Y(o.pickup_location::geometry)::float8 AS pickup_latitude,
         ST_X(o.pickup_location::geometry)::float8 AS pickup_longitude,
         COALESCE(o.scheduled_at, o.created_at) AS pickup_time,
         o.dropoff_address,
         ST_Y(o.dropoff_location::geometry)::float8 AS drop_latitude,
         ST_X(o.dropoff_location::geometry)::float8 AS drop_longitude,
         COALESCE(o.distance_km, 0)::text AS distance,
         COALESCE(ol.assigned_fee_idr, o.total_price_idr, 0)::text AS fee,
         COALESCE(c.full_name, 'Customer') AS customer_name,
         COALESCE(ol.status, o.status) AS status,
         (EXTRACT(EPOCH FROM o.created_at) * 1000)::bigint AS created_at,
         (EXTRACT(EPOCH FROM GREATEST(o.updated_at, ol.updated_at)) * 1000)::bigint AS updated_at,
         o.recipient_phone_masked AS customer_phone
       FROM order_legs ol
       JOIN orders o ON o.id = ol.order_id
       LEFT JOIN users c ON c.id = o.customer_id
       WHERE ol.courier_id = $1
       ORDER BY o.id, o.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows
        .map((order) => ({
          ...order,
          created_at: Number(order.created_at),
          updated_at: Number(order.updated_at),
        }))
        .sort((a, b) => b.created_at - a.created_at),
      message: 'Courier orders loaded',
    });
  } catch (error) {
    console.error('Get mobile courier orders error:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Internal Server Error',
      code: 'ERR_INTERNAL_SERVER',
    });
  }
};

const mobileOrderSelect = `
  o.id AS order_id,
  o.model,
  ol.leg_number,
  CASE
    WHEN LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand') THEN 'on_demand'
    WHEN ol.leg_number = 1 THEN 'pickup'
    ELSE 'delivery'
  END AS workflow_role,
  o.pickup_address,
  ST_Y(o.pickup_location::geometry)::float8 AS pickup_latitude,
  ST_X(o.pickup_location::geometry)::float8 AS pickup_longitude,
  COALESCE(o.scheduled_at, o.created_at) AS pickup_time,
  o.dropoff_address,
  ST_Y(o.dropoff_location::geometry)::float8 AS drop_latitude,
  ST_X(o.dropoff_location::geometry)::float8 AS drop_longitude,
  COALESCE(o.distance_km, 0)::text AS distance,
  COALESCE(
    NULLIF(ol.assigned_fee_idr, 0),
    NULLIF(o.courier_payout_estimate_idr, 0),
    GREATEST(o.total_price_idr - o.platform_commission_idr, 0),
    0
  )::text AS fee,
  COALESCE(o.courier_payout_estimate_idr, 0)::int AS courier_payout_estimate_idr,
  COALESCE(o.total_price_idr, 0)::int AS customer_price_idr,
  COALESCE(o.platform_commission_idr, 0)::int AS platform_commission_idr,
  o.service_code,
  COALESCE(c.full_name, 'Customer') AS customer_name,
  COALESCE(ol.status, o.status) AS status,
  (EXTRACT(EPOCH FROM o.created_at) * 1000)::bigint AS created_at,
  (EXTRACT(EPOCH FROM GREATEST(o.updated_at, COALESCE(ol.updated_at, o.updated_at))) * 1000)::bigint AS updated_at,
  o.recipient_phone_masked AS customer_phone
`;

const normalizeMobileOrder = (order: any) => ({
  ...order,
  created_at: Number(order.created_at),
  updated_at: Number(order.updated_at),
  offer_expires_at: order.offer_expires_at ? Number(order.offer_expires_at) : null,
  offer_ttl_seconds: order.offer_ttl_seconds ? Number(order.offer_ttl_seconds) : null,
});

const ON_DEMAND_OFFER_TTL_SECONDS = 15;
const ON_DEMAND_OPEN_ORDER_STATUSES = ['pending', 'pending_payment', 'paid', 'matched', 'offered', 'dispatching'];

type CreatedDispatchOffer = {
  dispatch_id: string;
  order_id: string;
  courier_id: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  distance: string | null;
  fee: string | null;
  customer_name: string | null;
  expires_at: Date;
};

const expireStaleOnDemandOffers = async (client: any): Promise<CreatedDispatchOffer[]> => {
  const expired = await client.query(
    `UPDATE courier_offer_dispatches d
     SET status = 'expired',
         responded_at = COALESCE(responded_at, NOW()),
         response_reason = COALESCE(response_reason, 'ttl_expired'),
         updated_at = NOW()
     WHERE d.status = 'offered'
       AND d.expires_at <= NOW()
     RETURNING d.order_id`
  );

  const createdOffers: CreatedDispatchOffer[] = [];
  const orderIds = [...new Set<string>(expired.rows.map((row: any) => String(row.order_id)))];
  for (const orderId of orderIds) {
    const created = await dispatchNextOnDemandCourier(client, orderId);
    if (created) createdOffers.push(created);
  }
  return createdOffers;
};

const dispatchNextOnDemandCourier = async (client: any, orderId: string): Promise<CreatedDispatchOffer | null> => {
  const activeOffer = await client.query(
    `SELECT id
     FROM courier_offer_dispatches
     WHERE order_id = $1
       AND status = 'offered'
       AND expires_at > NOW()
     LIMIT 1`,
    [orderId]
  );
  if (activeOffer.rows.length > 0) return null;

  const accepted = await client.query(
    `SELECT id
     FROM courier_offer_dispatches
     WHERE order_id = $1
       AND status = 'accepted'
     LIMIT 1`,
    [orderId]
  );
  if (accepted.rows.length > 0) return null;

  const candidate = await client.query(
    `WITH active_jobs AS (
       SELECT courier_id, COUNT(*)::int AS active_count
       FROM order_legs
       WHERE courier_id IS NOT NULL
         AND status NOT IN ('delivered', 'failed', 'cancelled', 'rejected')
       GROUP BY courier_id
     ),
     candidate AS (
       SELECT
         cp.user_id AS courier_id,
         cp.current_zone_id AS zone_id,
         COALESCE(ST_Distance(cp.current_location, o.pickup_location)::int, 0) AS distance_m,
         COALESCE(cp.avg_partner_rating, cp.relay_score, 5.00)::numeric(3,2) AS rating_snapshot,
         COALESCE(cp.acceptance_rate_pct, 100)::int AS acceptance_rate_snapshot,
         COALESCE(cp.completion_rate_pct, 100)::int AS completion_rate_snapshot,
         o.pickup_address,
         o.dropoff_address,
         COALESCE(o.distance_km, 0)::text AS distance,
         COALESCE(NULLIF(o.courier_payout_estimate_idr, 0), GREATEST(o.total_price_idr - o.platform_commission_idr, 0), 0)::text AS fee,
         COALESCE(u.full_name, 'Customer') AS customer_name
       FROM orders o
       JOIN courier_profiles cp ON cp.application_channel = 'on_demand'
        AND cp.verification_status = 'approved'
        AND cp.is_online = TRUE
        AND cp.current_zone_id IS NOT NULL
        AND cp.current_location IS NOT NULL
        AND cp.last_location_at >= NOW() - INTERVAL '10 minutes'
       JOIN zones z ON z.id = cp.current_zone_id
        AND z.is_active = TRUE
        AND ST_Covers(z.polygon, o.pickup_location)
       LEFT JOIN users u ON u.id = o.customer_id
       LEFT JOIN active_jobs aj ON aj.courier_id = cp.user_id
       WHERE o.id = $1
        AND LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
        AND o.status = ANY($2::text[])
        AND (o.pickup_location IS NULL OR ST_Covers(z.polygon, o.pickup_location))
        AND COALESCE(aj.active_count, 0) = 0
        AND NOT EXISTS (
          SELECT 1
          FROM courier_offer_dispatches d
          WHERE d.order_id = o.id
            AND d.courier_id = cp.user_id
        )
     ),
     scored AS (
       SELECT *,
         (
           (1000.0 / GREATEST(distance_m, 100)) * 60.0 +
           (rating_snapshot / 5.0) * 25.0 +
           completion_rate_snapshot * 0.10 +
           acceptance_rate_snapshot * 0.05
         )::numeric(10,4) AS score
       FROM candidate
     )
     SELECT *
     FROM scored
     ORDER BY score DESC, distance_m ASC, rating_snapshot DESC
     LIMIT 1`,
    [orderId, ON_DEMAND_OPEN_ORDER_STATUSES]
  );

  const nextCourier = candidate.rows[0];
  if (!nextCourier) return null;

  const rank = await client.query(
    `SELECT COALESCE(MAX(rank_number), 0) + 1 AS next_rank
     FROM courier_offer_dispatches
     WHERE order_id = $1`,
    [orderId]
  );

  const inserted = await client.query(
    `INSERT INTO courier_offer_dispatches (
       order_id,
       courier_id,
       zone_id,
       rank_number,
       score,
       distance_m,
       rating_snapshot,
       acceptance_rate_snapshot,
       completion_rate_snapshot,
       expires_at,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + ($10::text || ' seconds')::interval, $11)
     ON CONFLICT (order_id, courier_id) DO NOTHING
     RETURNING id, expires_at`,
    [
      orderId,
      nextCourier.courier_id,
      nextCourier.zone_id,
      Number(rank.rows[0]?.next_rank || 1),
      nextCourier.score,
      nextCourier.distance_m,
      nextCourier.rating_snapshot,
      nextCourier.acceptance_rate_snapshot,
      nextCourier.completion_rate_snapshot,
      ON_DEMAND_OFFER_TTL_SECONDS,
      JSON.stringify({ source: 'dispatch_engine_v1' }),
    ]
  );

  const dispatch = inserted.rows[0];
  if (!dispatch) return null;

  await client.query(
    `UPDATE orders
     SET status = CASE
           WHEN status IN ('pending', 'pending_payment', 'paid', 'matched', 'offered') THEN 'dispatching'
           ELSE status
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [orderId]
  );

  await client.query(
    `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
     VALUES ($1, $2, 'offer_dispatched', 'On-demand offer dispatched to ranked courier', $3)`,
    [
      orderId,
      nextCourier.courier_id,
      JSON.stringify({
        dispatch_id: dispatch.id,
        ttl_seconds: ON_DEMAND_OFFER_TTL_SECONDS,
        rank_number: Number(rank.rows[0]?.next_rank || 1),
        score: Number(nextCourier.score || 0),
      }),
    ]
  );

  return {
    dispatch_id: dispatch.id,
    order_id: orderId,
    courier_id: nextCourier.courier_id,
    pickup_address: nextCourier.pickup_address,
    dropoff_address: nextCourier.dropoff_address,
    distance: nextCourier.distance,
    fee: nextCourier.fee,
    customer_name: nextCourier.customer_name,
    expires_at: dispatch.expires_at,
  };
};

const advanceOnDemandDispatchQueue = async (client: any, limit = 25): Promise<CreatedDispatchOffer[]> => {
  const createdOffers = await expireStaleOnDemandOffers(client);

  const orders = await client.query(
    `SELECT o.id
     FROM orders o
     WHERE LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
       AND o.status = ANY($1::text[])
       AND NOT EXISTS (
         SELECT 1
         FROM courier_offer_dispatches d
         WHERE d.order_id = o.id
           AND d.status IN ('offered', 'accepted')
       )
     ORDER BY o.created_at ASC
     LIMIT $2
     FOR UPDATE SKIP LOCKED`,
    [ON_DEMAND_OPEN_ORDER_STATUSES, limit]
  );

  for (const order of orders.rows) {
    const created = await dispatchNextOnDemandCourier(client, order.id);
    if (created) createdOffers.push(created);
  }

  return createdOffers;
};

const notifyOnDemandOffers = async (offers: CreatedDispatchOffer[]) => {
  for (const offer of offers) {
    try {
      await createNotification({
        user_id: offer.courier_id,
        title: 'Pekerjaan On Demand Baru',
        body: `Terima dalam ${ON_DEMAND_OFFER_TTL_SECONDS} detik untuk mulai pickup.`,
        type: 'on_demand_offer',
        order_id: offer.order_id,
        deep_link: `lancar://orders/${offer.order_id}`,
        metadata: {
          dispatch_id: offer.dispatch_id,
          order_id: offer.order_id,
          pickup_address: offer.pickup_address || '',
          drop_address: offer.dropoff_address || '',
          distance: offer.distance || '',
          fee: offer.fee || '',
          customer_name: offer.customer_name || '',
          model: 'p2p',
          workflow_role: 'on_demand',
          offer_expires_at: new Date(offer.expires_at).getTime().toString(),
          offer_ttl_seconds: ON_DEMAND_OFFER_TTL_SECONDS.toString(),
          title: 'Pekerjaan On Demand Baru',
          body: `Terima dalam ${ON_DEMAND_OFFER_TTL_SECONDS} detik untuk mulai pickup.`,
        },
      });
    } catch (error) {
      console.warn('Failed to notify on-demand courier offer:', error);
    }
  }
};

export const getMobileCourierOffers = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const client = await db.connect();
  let createdOffers: CreatedDispatchOffer[] = [];
  try {
    await client.query('BEGIN');
    createdOffers = await advanceOnDemandDispatchQueue(client);

    const result = await client.query(
      `SELECT ${mobileOrderSelect},
         d.id AS dispatch_id,
         (EXTRACT(EPOCH FROM d.expires_at) * 1000)::bigint AS offer_expires_at,
         GREATEST(CEIL(EXTRACT(EPOCH FROM (d.expires_at - NOW()))), 0)::int AS offer_ttl_seconds
       FROM orders o
       JOIN courier_offer_dispatches d ON d.order_id = o.id
         AND d.courier_id = $1
         AND d.status = 'offered'
         AND d.expires_at > NOW()
       LEFT JOIN users c ON c.id = o.customer_id
       LEFT JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       ORDER BY d.expires_at ASC
       LIMIT 1`,
      [req.user.id]
    );

    await client.query('COMMIT');
    await notifyOnDemandOffers(createdOffers);

    res.json({
      success: true,
      data: result.rows.map(normalizeMobileOrder),
      message: 'Courier on-demand offers loaded',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Get mobile courier offers error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

export const acceptMobileCourierOffer = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const { id } = req.params;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    await expireStaleOnDemandOffers(client);

    const dispatchRes = await client.query(
      `SELECT
         d.id AS dispatch_id,
         d.order_id,
         d.courier_id,
         d.status AS dispatch_status,
         d.expires_at,
         d.zone_id,
         o.model,
         o.total_price_idr,
         o.courier_payout_estimate_idr,
         o.platform_commission_idr,
         o.pickup_location
       FROM courier_offer_dispatches d
       JOIN orders o ON o.id = d.order_id
       WHERE (d.id = $1 OR d.order_id = $1)
         AND d.courier_id = $2
       ORDER BY CASE WHEN d.id = $1 THEN 0 ELSE 1 END, d.created_at DESC
       LIMIT 1
       FOR UPDATE OF d`,
      [id, req.user.id]
    );

    const dispatch = dispatchRes.rows[0];
    if (!dispatch) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Offer not found', code: 'ERR_NOT_FOUND' });
      return;
    }

    if (dispatch.dispatch_status !== 'offered' || new Date(dispatch.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: null,
        message: 'Offer sudah kedaluwarsa. Sistem akan mengalihkan ke kurir berikutnya.',
        code: 'ERR_OFFER_EXPIRED',
      });
      return;
    }

    const courierEligibility = await client.query(
      `SELECT cp.id, cp.current_zone_id, z.name AS zone_name
       FROM courier_profiles cp
       JOIN zones z ON z.id = cp.current_zone_id AND z.is_active = TRUE
       WHERE cp.user_id = $1
         AND cp.application_channel = 'on_demand'
         AND cp.verification_status = 'approved'
         AND cp.is_online = TRUE
         AND cp.current_zone_id = $2
       LIMIT 1`,
      [req.user.id, dispatch.zone_id]
    );

    if (courierEligibility.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        data: null,
        message: 'Kurir harus On Duty di zona aktif yang sama untuk menerima pekerjaan on-demand.',
        code: 'ERR_COURIER_NOT_ELIGIBLE',
      });
      return;
    }

    await client.query(
      `SELECT id
       FROM orders
       WHERE id = $1
         AND LOWER(model) IN ('p2p', 'on_demand', 'ondemand')
         AND status NOT IN ('cancelled', 'delivered', 'failed')
       FOR UPDATE`,
      [dispatch.order_id]
    );

    const existingLeg = await client.query(
      `SELECT id, courier_id, status
       FROM order_legs
       WHERE order_id = $1 AND leg_number = 1
       FOR UPDATE`,
      [dispatch.order_id]
    );

    const leg = existingLeg.rows[0];
    if (leg?.courier_id && leg.courier_id !== req.user.id) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, data: null, message: 'Offer already taken', code: 'ERR_OFFER_TAKEN' });
      return;
    }

    if (leg) {
      await client.query(
        `UPDATE order_legs
         SET courier_id = $1, status = 'accepted', assigned_at = COALESCE(assigned_at, NOW()), updated_at = NOW()
         WHERE id = $2`,
        [req.user.id, leg.id]
      );
      await client.query(
        `UPDATE courier_offer_dispatches
         SET order_leg_id = $1
         WHERE id = $2`,
        [leg.id, dispatch.dispatch_id]
      );
    } else {
      const createdLeg = await client.query(
        `INSERT INTO order_legs (order_id, leg_number, courier_id, status, assigned_fee_idr, assigned_at)
         VALUES ($1, 1, $2, 'accepted', $3, NOW())
         ON CONFLICT (order_id, leg_number) DO UPDATE
           SET courier_id = EXCLUDED.courier_id,
               status = 'accepted',
               assigned_fee_idr = EXCLUDED.assigned_fee_idr,
               assigned_at = COALESCE(order_legs.assigned_at, NOW()),
               updated_at = NOW()
         RETURNING id`,
        [
          dispatch.order_id,
          req.user.id,
          dispatch.courier_payout_estimate_idr ||
            Math.max((dispatch.total_price_idr || 0) - (dispatch.platform_commission_idr || 0), 0)
        ]
      );
      await client.query(
        `UPDATE courier_offer_dispatches
         SET order_leg_id = $1
         WHERE id = $2`,
        [createdLeg.rows[0].id, dispatch.dispatch_id]
      );
    }

    await client.query(
      `UPDATE courier_offer_dispatches
       SET status = 'accepted',
           responded_at = NOW(),
           response_reason = 'accepted_by_courier',
           updated_at = NOW()
       WHERE id = $1`,
      [dispatch.dispatch_id]
    );
    await client.query(
      `UPDATE courier_offer_dispatches
       SET status = 'lost',
           responded_at = COALESCE(responded_at, NOW()),
           response_reason = 'accepted_by_another_courier',
           updated_at = NOW()
       WHERE order_id = $1
         AND id <> $2
         AND status = 'offered'`,
      [dispatch.order_id, dispatch.dispatch_id]
    );

    await client.query(`UPDATE orders SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [dispatch.order_id]);
    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, 'offer_accepted', 'Courier accepted on-demand offer', $3)`,
      [dispatch.order_id, req.user.id, JSON.stringify({ source: 'courier_app', dispatch_id: dispatch.dispatch_id })]
    );

    const accepted = await client.query(
      `SELECT ${mobileOrderSelect},
         NULL::uuid AS dispatch_id,
         NULL::bigint AS offer_expires_at,
         NULL::int AS offer_ttl_seconds
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       LEFT JOIN users c ON c.id = o.customer_id
       WHERE o.id = $1`,
      [dispatch.order_id]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: normalizeMobileOrder(accepted.rows[0]), message: 'Offer accepted' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Accept mobile courier offer error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

export const rejectMobileCourierOffer = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const { id } = req.params;
  const reason = req.body?.reason || 'courier_rejected';
  const client = await db.connect();
  let createdOffers: CreatedDispatchOffer[] = [];

  try {
    await client.query('BEGIN');
    createdOffers = await expireStaleOnDemandOffers(client);

    const rejected = await client.query(
      `UPDATE courier_offer_dispatches d
       SET status = 'rejected',
           responded_at = NOW(),
           response_reason = $3,
           updated_at = NOW()
       WHERE (d.id = $1 OR d.order_id = $1)
         AND d.courier_id = $2
         AND d.status = 'offered'
       RETURNING d.id, d.order_id`,
      [id, req.user.id, reason]
    );

    const dispatch = rejected.rows[0];
    if (!dispatch) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Offer not found', code: 'ERR_NOT_FOUND' });
      return;
    }

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, 'offer_rejected', 'Courier rejected on-demand offer', $3)`,
      [dispatch.order_id, req.user.id, JSON.stringify({ reason, source: 'courier_app', dispatch_id: dispatch.id })]
    );

    const nextOffer = await dispatchNextOnDemandCourier(client, dispatch.order_id);
    if (nextOffer) createdOffers.push(nextOffer);

    await client.query('COMMIT');
    await notifyOnDemandOffers(createdOffers);

    res.json({ success: true, data: true, message: 'Offer rejected' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reject mobile courier offer error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

const ON_DEMAND_GEOFENCE_RADIUS_M = Number(process.env.ON_DEMAND_GEOFENCE_RADIUS_M || 150);
const ON_DEMAND_MAX_ACCURACY_M = Number(process.env.ON_DEMAND_MAX_ACCURACY_M || 100);

const parseCoordinate = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const verifyOnDemandStep = async ({
  req,
  res,
  orderId,
  step,
  latitude,
  longitude,
  accuracy,
  barcodeValue,
  photoUrl,
}: {
  req: Request;
  res: Response;
  orderId: string;
  step: 'pickup' | 'delivery';
  latitude: number;
  longitude: number;
  accuracy: number | null;
  barcodeValue?: string | null;
  photoUrl?: string | null;
}) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  if (accuracy != null && accuracy > ON_DEMAND_MAX_ACCURACY_M) {
    res.status(422).json({
      success: false,
      data: null,
      message: 'Akurasi lokasi belum cukup. Tunggu beberapa detik lalu coba lagi.',
      code: 'ERR_LOCATION_ACCURACY_LOW',
    });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT
         o.id,
         o.status,
         o.model,
         ol.id AS leg_id,
         ol.status AS leg_status,
         ST_Distance(
           CASE WHEN $2 = 'pickup' THEN o.pickup_location ELSE o.dropoff_location END,
           ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
         )::int AS distance_m
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       JOIN courier_profiles cp ON cp.user_id = ol.courier_id
       WHERE o.id = $1
         AND ol.courier_id = $5
         AND cp.application_channel = 'on_demand'
         AND LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
       LIMIT 1
       FOR UPDATE OF o, ol`,
      [orderId, step, longitude, latitude, req.user.id]
    );

    const order = orderRes.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        data: null,
        message: 'Order on-demand tidak ditemukan untuk kurir ini.',
        code: 'ERR_ORDER_NOT_FOUND',
      });
      return;
    }

    const distanceM = Number(order.distance_m || 0);
    if (distanceM > ON_DEMAND_GEOFENCE_RADIUS_M) {
      await client.query('ROLLBACK');
      res.status(422).json({
        success: false,
        data: { distance_m: distanceM, radius_m: ON_DEMAND_GEOFENCE_RADIUS_M },
        message: step === 'pickup'
          ? 'Anda belum berada di titik pickup. Dekati lokasi pengambilan untuk melanjutkan.'
          : 'Anda belum berada di titik tujuan. Penyelesaian paket hanya bisa dilakukan di lokasi penerima.',
        code: 'ERR_OUTSIDE_GEOFENCE',
      });
      return;
    }

    const currentStatus = String(order.status || '').toLowerCase();
    if (step === 'pickup' && ['delivered', 'completed', 'cancelled', 'failed'].includes(currentStatus)) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, data: null, message: 'Order ini sudah tidak bisa diverifikasi pickup.', code: 'ERR_INVALID_STATUS' });
      return;
    }
    if (step === 'delivery' && !['picked_up', 'in_transit'].includes(currentStatus)) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: null,
        message: 'Verifikasi pickup harus selesai sebelum POD dikirim.',
        code: 'ERR_PICKUP_REQUIRED',
      });
      return;
    }

    const scanType = step === 'pickup' ? 'pickup' : 'pod';
    const scanRes = await client.query(
      `INSERT INTO package_scans (
         order_id,
         scanned_by,
         scanned_by_role,
         scan_type,
         image_urls,
         photo_url,
         latitude,
         longitude,
         location_accuracy_m,
         scan_location,
         override_reason
       )
       VALUES (
         $1,
         $2,
         'courier',
         $3,
         CASE WHEN $4::text IS NULL THEN NULL ELSE ARRAY[$4::text] END,
         $4,
         $5,
         $6,
         $7,
         ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography,
         $8
       )
       RETURNING id, COALESCE(scanned_at, created_at, NOW()) AS recorded_at`,
      [
        orderId,
        req.user.id,
        scanType,
        photoUrl || null,
        latitude,
        longitude,
        accuracy,
        barcodeValue ? `barcode:${barcodeValue}` : null,
      ]
    );

    const nextStatus = step === 'pickup' ? 'in_transit' : 'delivered';
    await client.query(
      `UPDATE orders
       SET status = $2,
           picked_up_at = CASE WHEN $2 = 'in_transit' THEN COALESCE(picked_up_at, NOW()) ELSE picked_up_at END,
           delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [orderId, nextStatus]
    );

    await client.query(
      `UPDATE order_legs
       SET status = $2,
           started_at = CASE WHEN $2 = 'in_transit' THEN COALESCE(started_at, NOW()) ELSE started_at END,
           completed_at = CASE WHEN $2 = 'delivered' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [order.leg_id, nextStatus]
    );

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        orderId,
        req.user.id,
        step === 'pickup' ? 'pickup_verified' : 'pod_verified',
        step === 'pickup' ? 'Courier verified on-demand pickup at geofence' : 'Courier verified on-demand delivery POD at geofence',
        JSON.stringify({ distance_m: distanceM, accuracy_m: accuracy, barcode_value: barcodeValue || null, photo_url: photoUrl || null }),
      ]
    );

    await client.query('COMMIT');
    res.json({
      success: true,
      data: {
        scan_id: scanRes.rows[0]?.id,
        order_id: orderId,
        status: nextStatus,
        scan_type: scanType,
        distance_m: distanceM,
        recorded_at: scanRes.rows[0]?.recorded_at || new Date().toISOString(),
      },
      message: step === 'pickup' ? 'Pickup berhasil diverifikasi.' : 'Pengiriman berhasil diselesaikan.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Verify on-demand courier step error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

export const scanMobileCourierOrder = async (req: Request, res: Response) => {
  const orderId = String(req.body?.order_id || req.body?.orderId || '');
  const scanType = String(req.body?.scan_type || req.body?.scanType || 'pickup').toLowerCase();
  const latitude = parseCoordinate(req.body?.latitude);
  const longitude = parseCoordinate(req.body?.longitude);
  const accuracy = parseCoordinate(req.body?.accuracy);

  if (!orderId || latitude == null || longitude == null) {
    res.status(400).json({ success: false, data: null, message: 'Order dan lokasi wajib dikirim.', code: 'ERR_BAD_REQUEST' });
    return;
  }

  await verifyOnDemandStep({
    req,
    res,
    orderId,
    step: scanType === 'delivery' || scanType === 'pod' ? 'delivery' : 'pickup',
    latitude,
    longitude,
    accuracy,
    barcodeValue: req.body?.barcode_value || req.body?.barcodeValue || null,
  });
};

export const uploadMobileCourierPod = async (req: Request, res: Response) => {
  const orderId = String(req.body?.order_id || req.body?.orderId || '');
  const latitude = parseCoordinate(req.body?.latitude);
  const longitude = parseCoordinate(req.body?.longitude);
  const accuracy = parseCoordinate(req.body?.accuracy);

  if (!orderId || latitude == null || longitude == null || !req.file) {
    res.status(400).json({ success: false, data: null, message: 'Order, lokasi, dan foto POD wajib dikirim.', code: 'ERR_BAD_REQUEST' });
    return;
  }

  const ext = path.extname(req.file.originalname || '') || '.jpg';
  const filename = `${crypto.randomUUID()}${ext}`;
  const uploadDir = path.join(process.cwd(), 'public/uploads/pod');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);

  const proofType = String(req.body?.proof_type || req.body?.proofType || 'delivery').toLowerCase();

  await verifyOnDemandStep({
    req,
    res,
    orderId,
    step: proofType === 'pickup' ? 'pickup' : 'delivery',
    latitude,
    longitude,
    accuracy,
    barcodeValue: req.body?.barcode_value || req.body?.barcodeValue || null,
    photoUrl: `/uploads/pod/${filename}`,
  });
};
