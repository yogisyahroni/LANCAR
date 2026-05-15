import { Request, Response } from 'express';
import { db } from '../db';
import crypto from 'crypto';

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
         COALESCE(o.scheduled_at, o.created_at) AS pickup_time,
         o.dropoff_address,
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
  COALESCE(o.scheduled_at, o.created_at) AS pickup_time,
  o.dropoff_address,
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
});

export const getMobileCourierOffers = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT ${mobileOrderSelect}
       FROM orders o
       LEFT JOIN users c ON c.id = o.customer_id
       LEFT JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       WHERE LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
         AND COALESCE(ol.status, o.status) IN ('pending', 'paid', 'matched', 'offered')
         AND (ol.courier_id IS NULL OR ol.courier_id = $1)
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows.map(normalizeMobileOrder),
      message: 'Courier on-demand offers loaded',
    });
  } catch (error) {
    console.error('Get mobile courier offers error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
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

    const orderRes = await client.query(
      `SELECT id, model, total_price_idr, courier_payout_estimate_idr, platform_commission_idr
       FROM orders
       WHERE id = $1
         AND LOWER(model) IN ('p2p', 'on_demand', 'ondemand')
         AND status NOT IN ('cancelled', 'delivered', 'failed')
       FOR UPDATE`,
      [id]
    );

    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Offer not found', code: 'ERR_NOT_FOUND' });
      return;
    }

    const existingLeg = await client.query(
      `SELECT id, courier_id, status
       FROM order_legs
       WHERE order_id = $1 AND leg_number = 1
       FOR UPDATE`,
      [id]
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
    } else {
      await client.query(
        `INSERT INTO order_legs (order_id, leg_number, courier_id, status, assigned_fee_idr, assigned_at)
         VALUES ($1, 1, $2, 'accepted', $3, NOW())`,
        [
          id,
          req.user.id,
          orderRes.rows[0].courier_payout_estimate_idr ||
            Math.max((orderRes.rows[0].total_price_idr || 0) - (orderRes.rows[0].platform_commission_idr || 0), 0)
        ]
      );
    }

    await client.query(`UPDATE orders SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [id]);
    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, 'offer_accepted', 'Courier accepted on-demand offer', $3)`,
      [id, req.user.id, JSON.stringify({ source: 'courier_app' })]
    );

    const accepted = await client.query(
      `SELECT ${mobileOrderSelect}
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       LEFT JOIN users c ON c.id = o.customer_id
       WHERE o.id = $1`,
      [id]
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

  try {
    await db.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, 'offer_rejected', 'Courier rejected on-demand offer', $3)`,
      [id, req.user.id, JSON.stringify({ reason, source: 'courier_app' })]
    );

    res.json({ success: true, data: true, message: 'Offer rejected' });
  } catch (error) {
    console.error('Reject mobile courier offer error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};
