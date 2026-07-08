import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import { db } from '../db';
import { createNotification } from '../notifications';
import crypto from 'crypto';
import { evaluateCourierPayoutRisk } from '../services/payoutRiskEngine';
import { decoratePayoutRequest, payoutMobileMessage } from '../services/payoutStatusPolicy';
import { evaluatePayoutAlerts, writePayoutAuditEvent } from '../utils/payoutObservability';
import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../services/onDemandRealtime';
import { evaluateOnDemandRealtimeAlerts } from '../services/realtimeObservability';
import { buildMapsRouteEtaSnapshot } from '../services/mapsProviderConfig';
import { isFeatureFlagEnabled } from '../services/featureFlags';
import { saveSecureUploadBuffer } from '../security/uploadSecurity';
import {
  AuthProtectionError,
  assertAuthAttemptAllowed,
  getRequestIpAddress,
  recordAuthFailure,
  recordAuthSuccess,
  sendAuthProtectionError,
} from '../security/bruteForceProtection';

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

const COURIER_LOGIN_OTP_REQUIRED_FLAG = 'courier_login_otp_required';
const PLACEHOLDER_SEEDED_PIN_HASH = 'hashed_pin';

const getDevelopmentSeedCourierPin = () => {
  if (process.env.NODE_ENV === 'production') return null;

  const seedPin = process.env.DEV_SEEDED_COURIER_PIN?.trim();
  if (!seedPin || seedPin.length < 6) return null;

  return seedPin;
};

const isValidCourierPassword = (password: string, pinHash: string | null) => {
  if (!pinHash) return false;

  // Local seed data currently stores placeholder hashes. Keep this compatibility
  // narrow so seeded couriers can be tested without weakening real hashes.
  if (pinHash === PLACEHOLDER_SEEDED_PIN_HASH) {
    return password === getDevelopmentSeedCourierPin();
  }

  return password === pinHash;
};

const base64Url = (value: string) =>
  Buffer.from(value)
    .toString('base64url');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
};

const signCourierJwt = (userId: string) => {
  const secret = getJwtSecret();
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

const normalizeDeviceId = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const hashDeviceId = (deviceId: string) =>
  `sha256:${crypto.createHash('sha256').update(deviceId).digest('hex')}`;

const buildCourierDeviceContext = (req: Request) => {
  const bodyDeviceInfo = req.body?.device_info && typeof req.body.device_info === 'object'
    ? req.body.device_info
    : {};

  return {
    ...bodyDeviceInfo,
    user_agent: req.headers['user-agent'] || null,
    ip: req.ip,
    platform: 'android',
  };
};

const getCourierByIdentity = async (identity: string) => {
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
    [identity]
  );
  return result.rows[0];
};

const isTrustedCourierDevice = async (courierId: string, deviceIdHash: string) => {
  if (!deviceIdHash) return false;
  const result = await db.query<{ trusted: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM auth_trusted_devices
       WHERE user_id = $1
         AND user_role = 'courier'
         AND device_id_hash = $2
         AND revoked_at IS NULL
     ) AS trusted`,
    [courierId, deviceIdHash]
  );
  return result.rows[0]?.trusted === true;
};

const trustCourierDevice = async (
  courierId: string,
  deviceIdHash: string,
  deviceInfo: Record<string, unknown>
) => {
  if (!deviceIdHash) return;
  await db.query(
    `INSERT INTO auth_trusted_devices (
       user_id,
       user_role,
       device_id_hash,
       device_info,
       trusted_at,
       last_seen_at,
       created_at,
       updated_at
     )
     VALUES ($1, 'courier', $2, $3::jsonb, NOW(), NOW(), NOW(), NOW())
     ON CONFLICT (user_id, user_role, device_id_hash)
     DO UPDATE SET
       device_info = EXCLUDED.device_info,
       revoked_at = NULL,
       last_seen_at = NOW(),
       updated_at = NOW()`,
    [courierId, deviceIdHash, JSON.stringify(deviceInfo)]
  );
};

const touchCourierTrustedDevice = async (courierId: string, deviceIdHash: string) => {
  if (!deviceIdHash) return;
  await db.query(
    `UPDATE auth_trusted_devices
     SET last_seen_at = NOW(), updated_at = NOW()
     WHERE user_id = $1
       AND user_role = 'courier'
       AND device_id_hash = $2
       AND revoked_at IS NULL`,
    [courierId, deviceIdHash]
  );
};

const hashOtpRecipient = (recipient: string) =>
  crypto.createHash('sha256').update(recipient.trim().toLowerCase()).digest('hex');

const defaultCourierLoginOtpRequired = () => {
  const environment = (process.env.ENVIRONMENT || process.env.NODE_ENV || '').trim().toLowerCase();
  return environment !== 'development' && environment !== 'test';
};

const isCourierLoginOtpRequired = async () => {
  return isFeatureFlagEnabled(COURIER_LOGIN_OTP_REQUIRED_FLAG, defaultCourierLoginOtpRequired());
};

const sendCourierOtp = async (recipient: string) => {
  const code = String(crypto.randomInt(100000, 1000000));
  await db.query(
    `INSERT INTO otp_logs (phone_number, code, expires_at, is_used, created_at)
     VALUES ($1, $2, NOW() + INTERVAL '5 minutes', false, NOW())`,
    [recipient, code]
  );
  console.info(JSON.stringify({
    event: 'courier_otp_issued',
    recipient_hash: hashOtpRecipient(recipient),
    expires_in_seconds: 300,
  }));
};

const verifyCourierOtpCode = async (recipient: string, code: string) => {
  const result = await db.query<{ id: string; is_used: boolean; expires_at: Date }>(
    `SELECT id, is_used, expires_at
     FROM otp_logs
     WHERE phone_number = $1 AND code = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [recipient, code]
  );
  const otp = result.rows[0];
  if (!otp || otp.is_used || new Date(otp.expires_at).getTime() < Date.now()) {
    return false;
  }

  await db.query(`UPDATE otp_logs SET is_used = true WHERE id = $1`, [otp.id]);
  return true;
};

const issueCourierLoginSession = async (
  courier: CourierLoginRow,
  deviceId: string,
  deviceInfo: Record<string, unknown>
) => {
  const { token, expiresAt } = signCourierJwt(courier.id);
  const deviceIdHash = hashDeviceId(deviceId);

  await db.query(
    `INSERT INTO user_sessions (user_id, refresh_token, device_id, device_info, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      courier.id,
      token,
      deviceId,
      JSON.stringify(deviceInfo),
      expiresAt,
    ]
  );
  await trustCourierDevice(courier.id, deviceIdHash, deviceInfo);

  return {
    token,
    courier_id: courier.id,
    name: courier.full_name,
    phone: courier.phone_number,
    vehicle_type: courier.vehicle_type,
    profile_photo_url: courier.photo_url,
  };
};

export const loginCourier = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const deviceId = normalizeDeviceId(req.body?.device_id || req.headers['x-device-id']);
  const ipAddress = getRequestIpAddress(req);

  if (!username || !password) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Username and password are required',
      code: 'ERR_BAD_REQUEST',
    });
    return;
  }
  if (!deviceId) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Device ID is required',
      code: 'ERR_DEVICE_REQUIRED',
    });
    return;
  }

  try {
    await assertAuthAttemptAllowed({
      scope: 'courier_login',
      identifier: normalizedUsername,
      ipAddress,
    });

    const courier = await getCourierByIdentity(normalizedUsername);
    if (!courier || courier.status !== 'active' || !isValidCourierPassword(password, courier.pin_hash)) {
      await recordAuthFailure({
        scope: 'courier_login',
        identifier: normalizedUsername,
        ipAddress,
        reason: !courier || courier.status !== 'active' ? 'invalid_courier' : 'invalid_password',
      });
      res.status(401).json({
        success: false,
        data: null,
        message: 'Username atau password salah',
        code: 'ERR_INVALID_CREDENTIALS',
      });
      return;
    }

    await recordAuthSuccess({
      scope: 'courier_login',
      identifier: normalizedUsername,
      ipAddress,
    });

    const deviceIdHash = hashDeviceId(deviceId);
    const deviceInfo = buildCourierDeviceContext(req);
    const [isTrusted, isOtpRequired] = await Promise.all([
      isTrustedCourierDevice(courier.id, deviceIdHash),
      isCourierLoginOtpRequired(),
    ]);

    if (!isTrusted && isOtpRequired) {
      const recipient = courier.email || courier.phone_number;
      await sendCourierOtp(recipient);
      res.json({
        success: true,
        data: {
          requires_otp: true,
          otp_reason: 'new_device',
          courier_id: courier.id,
          name: courier.full_name,
          phone: courier.phone_number,
          vehicle_type: courier.vehicle_type,
          profile_photo_url: courier.photo_url,
        },
        message: 'Kode OTP dikirim untuk verifikasi perangkat baru',
      });
      return;
    }

    if (isTrusted) {
      await touchCourierTrustedDevice(courier.id, deviceIdHash);
    }

    const loginData = await issueCourierLoginSession(courier, deviceId, deviceInfo);

    res.json({
      success: true,
      data: {
        ...loginData,
        requires_otp: false,
        otp_policy: isOtpRequired ? 'trusted_device' : 'disabled_by_feature_flag',
      },
      message: 'Login successful',
    });
  } catch (error) {
    if (error instanceof AuthProtectionError) {
      sendAuthProtectionError(res, error);
      return;
    }

    securityLog.error('Courier login error:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Internal Server Error',
      code: 'ERR_INTERNAL_SERVER',
    });
  }
};

export const verifyCourierLoginOtp = async (req: Request, res: Response) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const normalizedUsername = username.toLowerCase();
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const deviceId = normalizeDeviceId(req.body?.device_id || req.headers['x-device-id']);
  const ipAddress = getRequestIpAddress(req);

  if (!username || !code || !deviceId) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Username, OTP, and device ID are required',
      code: 'ERR_BAD_REQUEST',
    });
    return;
  }

  try {
    await assertAuthAttemptAllowed({
      scope: 'courier_otp_verify',
      identifier: normalizedUsername,
      ipAddress,
    });

    const courier = await getCourierByIdentity(normalizedUsername);
    if (!courier || courier.status !== 'active') {
      await recordAuthFailure({
        scope: 'courier_otp_verify',
        identifier: normalizedUsername,
        ipAddress,
        reason: 'invalid_courier',
      });
      res.status(401).json({
        success: false,
        data: null,
        message: 'Akun kurir tidak valid',
        code: 'ERR_INVALID_COURIER',
      });
      return;
    }

    const recipient = courier.email || courier.phone_number;
    const isValidOtp = await verifyCourierOtpCode(recipient, code);
    if (!isValidOtp) {
      await recordAuthFailure({
        scope: 'courier_otp_verify',
        identifier: normalizedUsername,
        ipAddress,
        reason: 'invalid_otp',
      });
      res.status(401).json({
        success: false,
        data: null,
        message: 'Kode OTP tidak valid atau sudah kedaluwarsa',
        code: 'ERR_INVALID_OTP',
      });
      return;
    }

    await recordAuthSuccess({
      scope: 'courier_otp_verify',
      identifier: normalizedUsername,
      ipAddress,
    });

    const loginData = await issueCourierLoginSession(courier, deviceId, buildCourierDeviceContext(req));
    res.json({
      success: true,
      data: loginData,
      message: 'Perangkat terverifikasi',
    });
  } catch (error) {
    if (error instanceof AuthProtectionError) {
      sendAuthProtectionError(res, error);
      return;
    }

    securityLog.error('Courier OTP verification error:', error);
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
         cp.max_weight_capacity_kg,
         cp.max_packages_capacity,
         COUNT(ol.id)::int AS total_deliveries,
         COUNT(ol.id) FILTER (WHERE ol.updated_at::date = CURRENT_DATE)::int AS today_deliveries,
         COALESCE(SUM(ol.assigned_fee_idr) FILTER (WHERE ol.status = 'delivered'), 0)::int AS total_earnings_idr,
         COALESCE(SUM(ol.assigned_fee_idr) FILTER (WHERE ol.status = 'delivered' AND ol.updated_at::date = CURRENT_DATE), 0)::int AS today_earnings_idr
       FROM users u
       LEFT JOIN courier_profiles cp ON cp.user_id = u.id
       LEFT JOIN order_legs ol ON ol.courier_id = u.id AND ol.status = 'delivered'
       WHERE u.id = $1 AND u.role = 'courier'
       GROUP BY u.id, u.full_name, u.phone_number, u.photo_url, cp.vehicle_type, cp.application_channel, cp.is_online, cp.max_weight_capacity_kg, cp.max_packages_capacity`,
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
        max_weight_capacity_kg: courier.max_weight_capacity_kg,
        max_packages_capacity: courier.max_packages_capacity,
      },
      message: 'Courier profile loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier profile error:', error);
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
      `SELECT cp.id, cp.user_id, u.photo_url, u.profile_photo_locked_at
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

    if (online && (!courier.photo_url || !courier.profile_photo_locked_at)) {
      res.status(403).json({
        success: false,
        data: null,
        message: 'Anda belum melengkapi foto profil kurir. Tunggu sampai kami menghubungi Anda untuk ambil foto dan jaket operasional di Basecamp kami.',
        code: 'ERR_PHOTO_REQUIRED',
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
            ? 'Lokasi Anda berada di luar zona operasional aktif. Silakan masuk ke area layanan TEMBUS untuk mulai On Duty.'
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
    securityLog.error('Update mobile courier duty error:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Internal Server Error',
      code: 'ERR_INTERNAL_SERVER',
    });
  }
};

export const updateMobileCourierCapacity = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({
      success: false,
      data: null,
      message: 'Unauthorized',
      code: 'ERR_UNAUTHORIZED',
    });
    return;
  }

  const maxWeight = req.body?.max_weight_capacity_kg ? Number(req.body.max_weight_capacity_kg) : null;
  const maxPackages = req.body?.max_packages_capacity ? Number(req.body.max_packages_capacity) : null;

  try {
    const courierRes = await db.query(
      `SELECT cp.id
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

    await db.query(
      `UPDATE courier_profiles
       SET max_weight_capacity_kg = $1,
           max_packages_capacity = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [maxWeight, maxPackages, courier.id]
    );

    res.json({
      success: true,
      data: {
        max_weight_capacity_kg: maxWeight,
        max_packages_capacity: maxPackages
      },
      message: 'Kapasitas maksimal berhasil diperbarui',
    });
  } catch (error) {
    securityLog.error('Update mobile courier capacity error:', error);
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
         o.batch_id,
         o.sequence_no,
         ol.leg_number,
         CASE
           WHEN COALESCE(dsp.service_category, '') = 'on_demand' THEN 'on_demand'
           WHEN LOWER(o.model) = 'p2p' THEN 'regular'
           WHEN ol.leg_number = 1 THEN 'pickup'
           ELSE 'delivery'
         END AS workflow_role,
         o.pickup_address,
         ST_Y(o.pickup_location::geometry)::float8 AS pickup_latitude,
         ST_X(o.pickup_location::geometry)::float8 AS pickup_longitude,
         COALESCE(o.scheduled_at, o.created_at) AS pickup_time,
         o.dropoff_address AS drop_address,
         ST_Y(o.dropoff_location::geometry)::float8 AS drop_latitude,
         ST_X(o.dropoff_location::geometry)::float8 AS drop_longitude,
          COALESCE(
            NULLIF(o.route_snapshot->>'distance_km', '')::numeric,
            CASE
              WHEN COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0) > 0
              THEN ROUND(COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int)::numeric / 1000.0, 2)
              ELSE NULL
            END,
            o.distance_km,
            0
          )::text AS distance,
          COALESCE(ol.assigned_fee_idr, o.total_price_idr, 0)::text AS fee,
          COALESCE(o.courier_payout_estimate_idr, 0)::int AS courier_payout_estimate_idr,
          COALESCE(o.total_price_idr, 0)::int AS customer_price_idr,
          COALESCE(o.platform_commission_idr, 0)::int AS platform_commission_idr,
          o.service_code,
          o.route_snapshot,
          o.route_provider,
          o.route_profile,
          COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0)::int AS route_distance_meters,
          COALESCE(o.route_duration_seconds, NULLIF(o.route_snapshot->>'duration_seconds', '')::int, 0)::int AS route_duration_seconds,
          o.route_polyline,
          o.route_fallback_reason,
          NULLIF(o.route_snapshot->>'vehicle_type', '') AS route_vehicle_type,
          COALESCE(dsp.name, o.service_snapshot->>'service_name', o.service_code, 'TEMBUS Service') AS service_name,
         COALESCE(dsp.service_category, 'network') AS service_category,
         COALESCE(dsp.service_family, 'regular') AS service_family,
         COALESCE(dsp.route_model, o.model, 'p2p') AS service_route_model,
         COALESCE(dsp.max_eta_minutes, 0)::int AS service_max_eta_minutes,
         COALESCE(
           NULLIF(o.package_details->>'package_count', '')::int,
           NULLIF((SELECT COUNT(*) FROM order_packages op WHERE op.order_id = o.id), 0),
           1
         )::int AS package_count,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'id', op.id,
             'package_index', op.package_index,
             'package_code', op.package_code,
             'description', op.description,
             'size_tier', op.size_tier,
             'weight_kg', op.weight_kg,
             'status', op.status,
             'pickup_scan_verified_at', op.pickup_scan_verified_at,
             'pickup_photo_verified_at', op.pickup_photo_verified_at,
             'delivery_pod_verified_at', op.delivery_pod_verified_at
           ) ORDER BY op.package_index)
           FROM order_packages op
           WHERE op.order_id = o.id
         ), '[]'::jsonb) AS packages,
         COALESCE(dsp.max_packages_per_order, 1)::int AS service_max_packages_per_order,
         COALESCE(dsp.max_active_orders_regular, 3)::int AS service_max_active_orders_regular,
         COALESCE(dsp.max_active_orders_on_demand, 1)::int AS service_max_active_orders_on_demand,
         COALESCE(dsp.face_verification_required, TRUE) AS service_face_verification_required,
         COALESCE(dsp.proof_geofence_radius_m, 10)::int AS service_proof_geofence_radius_m,
         COALESCE(dsp.proof_min_accuracy_m, 50)::int AS service_proof_min_accuracy_m,
         COALESCE(dsp.failed_delivery_policy, 'must_deliver') AS service_failed_delivery_policy,
         COALESCE(dsp.pod_label, 'POD') AS service_pod_label,
         NULLIF(COALESCE(o.package_details->>'description', o.customer_notes, o.pickup_notes, ''), '') AS item_description,
         NULLIF(o.package_details->>'length_cm', '')::float8 AS length,
         NULLIF(o.package_details->>'width_cm', '')::float8 AS width,
         NULLIF(o.package_details->>'height_cm', '')::float8 AS height,
         NULLIF(o.package_details->>'weight_kg', '')::float8 AS weight,
         COALESCE(c.full_name, 'Customer') AS customer_name,
         COALESCE(ol.status, o.status) AS status,
         (EXTRACT(EPOCH FROM o.created_at) * 1000)::bigint AS created_at,
         (EXTRACT(EPOCH FROM GREATEST(o.updated_at, ol.updated_at)) * 1000)::bigint AS updated_at,
         NULL::text AS customer_phone,
         CASE
           WHEN LOWER(COALESCE(ol.status, o.status)) IN ('picked_up', 'in_transit') THEN 'recipient'
           ELSE 'customer'
         END AS primary_contact_target,
         jsonb_build_object(
           'customer', jsonb_build_object('label', 'Customer', 'available', o.customer_id IS NOT NULL),
           'recipient', jsonb_build_object(
             'label', 'Penerima',
             'available', LOWER(COALESCE(ol.status, o.status)) IN ('picked_up', 'in_transit')
           ),
           'support', jsonb_build_object('label', 'Support', 'available', TRUE),
           'raw_phone_exposed', FALSE
         ) AS communication_targets,
         EXISTS (
           SELECT 1 FROM package_scans ps
           WHERE ps.order_id = o.id
             AND ps.scan_type IN ('pickup_scan', 'pickup')
         ) AS pickup_scan_verified,
         EXISTS (
           SELECT 1 FROM package_scans ps
           WHERE ps.order_id = o.id
             AND ps.scan_type IN ('pickup_photo')
         ) AS pickup_photo_verified
       FROM order_legs ol
       JOIN orders o ON o.id = ol.order_id
       LEFT JOIN delivery_service_products dsp ON dsp.code = o.service_code
       LEFT JOIN users c ON c.id = o.customer_id
       WHERE ol.courier_id = $1
       ORDER BY o.id, o.sequence_no ASC NULLS FIRST, o.created_at ASC
       LIMIT 100`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows
        .map(normalizeMobileOrder)
        .sort((a, b) => {
          if (a.sequence_no !== b.sequence_no) {
            return (a.sequence_no ?? 999) - (b.sequence_no ?? 999);
          }
          return b.created_at - a.created_at;
        }),
      message: 'Courier orders loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier orders error:', error);
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
  o.batch_id,
  o.sequence_no,
  ol.leg_number,
  CASE
    WHEN COALESCE(dsp.service_category, '') = 'on_demand' THEN 'on_demand'
    WHEN LOWER(o.model) = 'p2p' THEN 'regular'
    WHEN ol.leg_number = 1 THEN 'pickup'
    ELSE 'delivery'
  END AS workflow_role,
  o.pickup_address,
  ST_Y(o.pickup_location::geometry)::float8 AS pickup_latitude,
  ST_X(o.pickup_location::geometry)::float8 AS pickup_longitude,
  COALESCE(o.scheduled_at, o.created_at) AS pickup_time,
  o.dropoff_address AS drop_address,
  ST_Y(o.dropoff_location::geometry)::float8 AS drop_latitude,
  ST_X(o.dropoff_location::geometry)::float8 AS drop_longitude,
  COALESCE(
    NULLIF(o.route_snapshot->>'distance_km', '')::numeric,
    CASE
      WHEN COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0) > 0
      THEN ROUND(COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int)::numeric / 1000.0, 2)
      ELSE NULL
    END,
    o.distance_km,
    0
  )::text AS distance,
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
  o.route_snapshot,
  o.route_provider,
  o.route_profile,
  COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0)::int AS route_distance_meters,
  COALESCE(o.route_duration_seconds, NULLIF(o.route_snapshot->>'duration_seconds', '')::int, 0)::int AS route_duration_seconds,
  o.route_polyline,
  o.route_fallback_reason,
  NULLIF(o.route_snapshot->>'vehicle_type', '') AS route_vehicle_type,
  COALESCE(dsp.name, o.service_snapshot->>'service_name', o.service_code, 'TEMBUS On Demand') AS service_name,
  COALESCE(dsp.service_category, 'on_demand') AS service_category,
  COALESCE(dsp.service_family, 'regular') AS service_family,
  COALESCE(dsp.route_model, o.model, 'p2p') AS service_route_model,
  COALESCE(dsp.max_eta_minutes, 0)::int AS service_max_eta_minutes,
  COALESCE(
    NULLIF(o.package_details->>'package_count', '')::int,
    NULLIF((SELECT COUNT(*) FROM order_packages op WHERE op.order_id = o.id), 0),
    1
  )::int AS package_count,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', op.id,
      'package_index', op.package_index,
      'package_code', op.package_code,
      'description', op.description,
      'size_tier', op.size_tier,
      'weight_kg', op.weight_kg,
      'status', op.status,
      'pickup_scan_verified_at', op.pickup_scan_verified_at,
      'pickup_photo_verified_at', op.pickup_photo_verified_at,
      'delivery_pod_verified_at', op.delivery_pod_verified_at
    ) ORDER BY op.package_index)
    FROM order_packages op
    WHERE op.order_id = o.id
  ), '[]'::jsonb) AS packages,
  COALESCE(dsp.max_packages_per_order, 1)::int AS service_max_packages_per_order,
  COALESCE(dsp.max_active_orders_regular, 3)::int AS service_max_active_orders_regular,
  COALESCE(dsp.max_active_orders_on_demand, 1)::int AS service_max_active_orders_on_demand,
  COALESCE(dsp.face_verification_required, TRUE) AS service_face_verification_required,
  COALESCE(dsp.proof_geofence_radius_m, 10)::int AS service_proof_geofence_radius_m,
  COALESCE(dsp.proof_min_accuracy_m, 50)::int AS service_proof_min_accuracy_m,
  COALESCE(dsp.failed_delivery_policy, 'must_deliver') AS service_failed_delivery_policy,
  COALESCE(dsp.pod_label, 'POD') AS service_pod_label,
  NULLIF(COALESCE(o.package_details->>'description', o.customer_notes, o.pickup_notes, ''), '') AS item_description,
  NULLIF(o.package_details->>'length_cm', '')::float8 AS length,
  NULLIF(o.package_details->>'width_cm', '')::float8 AS width,
  NULLIF(o.package_details->>'height_cm', '')::float8 AS height,
  NULLIF(o.package_details->>'weight_kg', '')::float8 AS weight,
  COALESCE(c.full_name, 'Customer') AS customer_name,
  COALESCE(ol.status, o.status) AS status,
  (EXTRACT(EPOCH FROM o.created_at) * 1000)::bigint AS created_at,
  (EXTRACT(EPOCH FROM GREATEST(o.updated_at, COALESCE(ol.updated_at, o.updated_at))) * 1000)::bigint AS updated_at,
  NULL::text AS customer_phone,
  CASE
    WHEN LOWER(COALESCE(ol.status, o.status)) IN ('picked_up', 'in_transit') THEN 'recipient'
    ELSE 'customer'
  END AS primary_contact_target,
  jsonb_build_object(
    'customer', jsonb_build_object('label', 'Customer', 'available', o.customer_id IS NOT NULL),
    'recipient', jsonb_build_object(
      'label', 'Penerima',
      'available', LOWER(COALESCE(ol.status, o.status)) IN ('picked_up', 'in_transit')
    ),
    'support', jsonb_build_object('label', 'Support', 'available', TRUE),
    'raw_phone_exposed', FALSE
  ) AS communication_targets,
  EXISTS (
    SELECT 1 FROM package_scans ps
    WHERE ps.order_id = o.id
      AND ps.scan_type IN ('pickup_scan', 'pickup')
  ) AS pickup_scan_verified,
  EXISTS (
    SELECT 1 FROM package_scans ps
    WHERE ps.order_id = o.id
      AND ps.scan_type IN ('pickup_photo')
  ) AS pickup_photo_verified
`;

const normalizeMobileOrder = (order: any) => {
  const routeContract = routeContractFromOrder(order);
  return {
    ...order,
    distance: routeContract.distance_km > 0 ? String(routeContract.distance_km) : order.distance,
    route_snapshot: routeContract.snapshot,
    route_provider: routeContract.provider,
    route_profile: routeContract.route_profile,
    route_polyline: routeContract.route_polyline,
    route_distance_meters: routeContract.distance_meters,
    route_duration_seconds: routeContract.duration_seconds,
    route_vehicle_type: routeContract.vehicle_type,
    eta_minutes: routeContract.eta_minutes,
    route_snapshot_hash: routeContract.snapshot_hash,
    route_snapshot_version: routeContract.snapshot_version,
    route_version: routeContract.route_version,
    created_at: Number(order.created_at),
    updated_at: Number(order.updated_at),
    offer_expires_at: order.offer_expires_at ? Number(order.offer_expires_at) : null,
    offer_ttl_seconds: order.offer_ttl_seconds ? Number(order.offer_ttl_seconds) : null,
  };
};

const normalizeOfferMobileOrder = (order: any) => ({
  ...normalizeMobileOrder(order),
  drop_address: 'Alamat tujuan dibuka setelah pekerjaan diterima',
});

export const getMobileCourierOnDemandServices = async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT
         code,
         name,
         description,
         service_family,
         service_category,
         route_model,
         batching_allowed,
         max_packages_per_order,
         max_active_orders_regular,
         max_active_orders_on_demand,
         same_customer_batching_required,
         allow_new_offer_while_pickup,
         allow_new_offer_while_delivery,
         max_pickup_detour_km::float8 AS max_pickup_detour_km,
         max_delivery_detour_km::float8 AS max_delivery_detour_km,
         max_direction_deviation_degrees,
         assignment_radius_pickup_km::float8 AS assignment_radius_pickup_km,
         assignment_radius_delivery_km::float8 AS assignment_radius_delivery_km,
         traffic_aware_assignment,
         proof_geofence_radius_m,
         proof_min_accuracy_m,
         proof_gps_override_policy,
         face_verification_required,
         regular_max_reschedule_attempts,
         failed_delivery_policy,
         pod_label,
         max_eta_minutes,
         max_distance_km::float8 AS max_distance_km,
         max_weight_kg::float8 AS max_weight_kg,
         vehicle_types,
         display_order
       FROM delivery_service_products
       WHERE is_enabled = TRUE
         AND service_category = 'on_demand'
       ORDER BY display_order ASC, name ASC`
    );

    res.json({
      success: true,
      data: result.rows,
      message: 'On-demand services loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier on-demand services error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

const publicBaseUrl = () =>
  process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

const getRequestIp = (req: Request) =>
  (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
  || req.socket.remoteAddress
  || null;

const getDeviceId = (req: Request) =>
  (req.headers['x-device-id'] as string | undefined)
  || (req.headers['x-client-device-id'] as string | undefined)
  || null;

const logPayoutSecurityEvent = async (
  req: Request,
  eventType: string,
  severity: 'info' | 'warning' | 'critical',
  metadata: Record<string, unknown> = {},
  payoutRequestId?: string | null,
) => {
  if (!req.user?.id) return;

  await writePayoutAuditEvent(db, req, {
    courierId: req.user.id,
    payoutRequestId: payoutRequestId || null,
    eventType,
    severity,
    actorId: req.user.id,
    actorRole: req.user.role || 'courier',
    subjectType: payoutRequestId ? 'courier_payout_request' : 'courier_payout',
    subjectId: payoutRequestId || null,
    metadata,
  });
};

const getCourierPayoutPolicy = async () => {
  const result = await db.query(
    `SELECT key, (value #>> '{}') AS value
     FROM system_configs
     WHERE key IN (
       'payout_min_amount_idr',
       'payout_daily_limit_idr',
       'payout_account_cooldown_hours',
       'payout_max_pending_requests'
     )`
  );

  const values = Object.fromEntries(result.rows.map((row) => [row.key, Number(row.value)]));
  return {
    min_amount_idr: Number.isFinite(values.payout_min_amount_idr) ? values.payout_min_amount_idr : 25000,
    daily_limit_idr: Number.isFinite(values.payout_daily_limit_idr) ? values.payout_daily_limit_idr : 1000000,
    account_cooldown_hours: Number.isFinite(values.payout_account_cooldown_hours) ? values.payout_account_cooldown_hours : 24,
    max_pending_requests: Number.isFinite(values.payout_max_pending_requests) ? values.payout_max_pending_requests : 2,
  };
};

const toRad = (value: number) => value * Math.PI / 180;

const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const radiusKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const startLat = toRad(aLat);
  const endLat = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
};

const parseJsonObject = (value: unknown): Record<string, any> | null => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const routeContractFromOrder = (order: any) => {
  const snapshot = parseJsonObject(order.route_snapshot);
  const snapshotDistanceMeters = toFiniteNumber(snapshot?.distance_meters, 0);
  const storedDistanceMeters = toFiniteNumber(order.route_distance_meters, 0);
  const distanceMeters = storedDistanceMeters > 0 ? storedDistanceMeters : snapshotDistanceMeters;
  const distanceKm = distanceMeters > 0
    ? Number((distanceMeters / 1000).toFixed(2))
    : toFiniteNumber(snapshot?.distance_km, toFiniteNumber(order.distance, 0));
  const durationSeconds = toFiniteNumber(order.route_duration_seconds, toFiniteNumber(snapshot?.duration_seconds, 0));
  const etaMinutes = toFiniteNumber(snapshot?.eta_minutes, durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : 0);

  return {
    snapshot,
    provider: order.route_provider || snapshot?.provider || null,
    route_profile: order.route_profile || snapshot?.route_profile || null,
    route_polyline: order.route_polyline || snapshot?.route_polyline || null,
    vehicle_type: order.route_vehicle_type || snapshot?.vehicle_type || null,
    service_code: order.service_code || snapshot?.service_code || null,
    distance_km: distanceKm,
    distance_meters: distanceMeters,
    duration_seconds: durationSeconds,
    eta_minutes: etaMinutes,
    snapshot_version: snapshot?.snapshot_version || null,
    route_version: snapshot?.route_version || null,
    snapshot_hash: snapshot?.snapshot_hash || null,
    fallback_reason: order.route_fallback_reason || snapshot?.fallback_reason || null,
  };
};

const parseLatLng = (row: any) => ({
  pickup_latitude: Number(row.pickup_latitude),
  pickup_longitude: Number(row.pickup_longitude),
  drop_latitude: Number(row.drop_latitude),
  drop_longitude: Number(row.drop_longitude),
});

const notifyAdminOps = async (payload: {
  title: string;
  body: string;
  type: string;
  order_id?: string;
  metadata?: any;
}) => {
  const admins = await db.query(
    `SELECT id
     FROM users
     WHERE role IN ('admin', 'super_admin')
       AND status = 'active'
     LIMIT 25`
  );

  await Promise.all(admins.rows.map((admin: any) => createNotification({
    user_id: admin.id,
    title: payload.title,
    body: payload.body,
    type: payload.type,
    order_id: payload.order_id,
    deep_link: payload.order_id ? `/admin/orders/${payload.order_id}` : '/admin/couriers',
    metadata: payload.metadata,
  })));
};

const MOBILE_COURIER_SAFETY_EVENT_TYPES = new Set([
  'sos',
  'support_request',
  'recipient_unavailable',
  'address_not_found',
  'package_issue',
  'return_required',
  'failed_delivery',
  'route_issue',
]);

const MOBILE_COURIER_SAFETY_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

const normalizeSafetyEventType = (value: unknown) =>
  String(value || 'support_request')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, '_')
    .slice(0, 40);

const sanitizeSafetyMessage = (value: unknown): string | null => {
  const message = String(value || '')
    .replace(/[<>{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return message || null;
};

export const createMobileCourierSafetyEvent = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const eventType = normalizeSafetyEventType(req.body?.event_type || req.body?.eventType || 'support_request');
  if (!MOBILE_COURIER_SAFETY_EVENT_TYPES.has(eventType)) {
    res.status(400).json({ success: false, data: null, message: 'Jenis laporan tidak valid.', code: 'ERR_INVALID_EVENT_TYPE' });
    return;
  }

  const requestedSeverity = String(req.body?.severity || (eventType === 'sos' ? 'critical' : 'medium')).trim().toLowerCase();
  const severity = MOBILE_COURIER_SAFETY_SEVERITIES.has(requestedSeverity) ? requestedSeverity : 'medium';
  const orderId = req.body?.order_id || req.body?.orderId
    ? String(req.body?.order_id || req.body?.orderId).trim().slice(0, 100)
    : null;
  const latitude = parseCoordinate(req.body?.latitude);
  const longitude = parseCoordinate(req.body?.longitude);
  const accuracy = parseCoordinate(req.body?.accuracy);
  const message = sanitizeSafetyMessage(req.body?.message);

  try {
    if (orderId) {
      const ownership = await db.query(
        `SELECT 1
         FROM order_legs
         WHERE order_id = $1
           AND courier_id = $2
         LIMIT 1`,
        [orderId, req.user.id]
      );

      if (ownership.rows.length === 0) {
        res.status(403).json({ success: false, data: null, message: 'Order tidak tersedia untuk akun kurir ini.', code: 'ERR_ORDER_FORBIDDEN' });
        return;
      }
    }

    const uploadedPhoto = req.file ? saveSecureUploadBuffer(req.file, 'safety-events') : null;

    const result = await db.query(
      `INSERT INTO courier_safety_events (
         order_id, courier_id, event_type, severity, latitude, longitude, accuracy_m, message, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, status, created_at`,
      [
        orderId,
        req.user.id,
        eventType,
        severity,
        latitude,
        longitude,
        accuracy,
        message,
        JSON.stringify({
          source: 'courier_app',
          app_surface: 'on_demand_active_job',
          photo_url: uploadedPhoto?.fileUrl || null,
          photo_checksum_sha256: req.file?.checksumSha256 || null,
          photo_mime_type: req.file?.detectedMimeType || null,
        }),
      ]
    );

    await notifyAdminOps({
      title: eventType === 'sos' ? 'SOS Kurir On Demand' : 'Laporan Keamanan Kurir',
      body: message || (eventType === 'sos' ? 'Kurir membutuhkan bantuan segera.' : 'Kurir mengirim laporan operasional.'),
      type: 'courier_safety_event',
      order_id: orderId || undefined,
      metadata: {
        event_id: result.rows[0].id,
        event_type: eventType,
        severity,
        courier_id: req.user.id,
        latitude,
        longitude,
        photo_url: uploadedPhoto?.fileUrl || null,
      },
    });

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        created_at: result.rows[0].created_at,
      },
      message: eventType === 'sos'
        ? 'SOS terkirim. Tim operasional sedang memantau lokasi Anda.'
        : 'Laporan terkirim ke tim operasional.',
    });
  } catch (error) {
    securityLog.error('Create mobile courier safety event error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const createMobileCourierTripShare = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const orderId = String(req.body?.order_id || req.body?.orderId || '');
  if (!orderId) {
    res.status(400).json({ success: false, data: null, message: 'Order wajib dikirim.', code: 'ERR_BAD_REQUEST' });
    return;
  }

  try {
    const access = await db.query(
      `SELECT o.id
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.courier_id = $2
       WHERE o.id = $1
         AND LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
         AND o.status NOT IN ('delivered', 'cancelled', 'failed')
       LIMIT 1`,
      [orderId, req.user.id]
    );
    if (access.rows.length === 0) {
      res.status(404).json({ success: false, data: null, message: 'Order aktif tidak ditemukan untuk share trip.', code: 'ERR_ORDER_NOT_FOUND' });
      return;
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO trip_share_tokens (order_id, courier_id, token_hash, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token_hash) DO NOTHING`,
      [orderId, req.user.id, sha256(token), expiresAt, JSON.stringify({ source: 'courier_app' })]
    );

    res.json({
      success: true,
      data: {
        url: `${publicBaseUrl()}/track/${token}`,
        expires_at: expiresAt.toISOString(),
      },
      message: 'Link live trip dibuat.',
    });
  } catch (error) {
    securityLog.error('Create mobile courier trip share error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const getPublicTripShare = async (req: Request, res: Response) => {
  const token = String(req.params.token || '');
  if (!token) {
    res.status(404).json({ success: false, data: null, message: 'Tracking link tidak ditemukan.', code: 'ERR_NOT_FOUND' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT
         o.id AS order_id,
         o.order_number,
         o.status,
         o.pickup_address,
         o.dropoff_address AS drop_address,
         ST_Y(o.pickup_location::geometry)::float8 AS pickup_latitude,
         ST_X(o.pickup_location::geometry)::float8 AS pickup_longitude,
         ST_Y(o.dropoff_location::geometry)::float8 AS drop_latitude,
         ST_X(o.dropoff_location::geometry)::float8 AS drop_longitude,
         u.full_name AS courier_name,
         ST_Y(cp.current_location::geometry)::float8 AS courier_latitude,
         ST_X(cp.current_location::geometry)::float8 AS courier_longitude,
         cp.last_location_at,
         tst.expires_at
       FROM trip_share_tokens tst
       JOIN orders o ON o.id = tst.order_id
       JOIN users u ON u.id = tst.courier_id
       LEFT JOIN courier_profiles cp ON cp.user_id = tst.courier_id
       WHERE tst.token_hash = $1
         AND tst.revoked_at IS NULL
         AND tst.expires_at > NOW()
       LIMIT 1`,
      [sha256(token)]
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ success: false, data: null, message: 'Tracking link sudah berakhir atau tidak aktif.', code: 'ERR_NOT_FOUND' });
      return;
    }

    res.json({ success: true, data: row, message: 'Trip tracking loaded' });
  } catch (error) {
    securityLog.error('Get public trip share error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const getMobileCourierHotspots = async (_req: Request, res: Response) => {
  try {
    await db.query('SELECT refresh_courier_hotspot_rollups()');
    const result = await db.query(
      `SELECT
         chr.zone_id AS id,
         chr.zone_name AS name,
         z.code,
         chr.active_orders AS pending_orders,
         chr.latitude,
         chr.longitude,
         chr.demand_score,
         chr.recent_orders,
         chr.refreshed_at,
         CASE
           WHEN chr.demand_score >= 70 THEN 'high'
           WHEN chr.demand_score >= 30 THEN 'medium'
           ELSE 'low'
         END AS intensity
       FROM courier_hotspot_rollups chr
       JOIN zones z ON z.id = chr.zone_id
       WHERE z.is_active = TRUE
       ORDER BY chr.demand_score DESC, chr.active_orders DESC, chr.zone_name ASC
       LIMIT 12`
    );

    res.json({ success: true, data: result.rows, message: 'On-demand hotspots loaded' });
  } catch (error) {
    securityLog.error('Get mobile courier hotspots error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const getMobileCourierEarningsLedger = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT
         cel.id,
         cel.order_id,
         o.order_number,
         cel.source,
         COALESCE(cel.transaction_type, 'earning_credit') AS transaction_type,
         cel.direction,
         cel.amount_idr,
         cel.settlement_status,
         cel.description,
         cel.created_at
       FROM courier_earnings_ledger cel
       LEFT JOIN orders o ON o.id = cel.order_id
       WHERE cel.courier_id = $1
       ORDER BY cel.created_at DESC
       LIMIT 40`,
      [req.user.id]
    );

    const summary = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_idr ELSE -amount_idr END), 0)::int AS total_balance_idr,
         COALESCE(SUM(CASE
           WHEN settlement_status = 'available' AND direction = 'credit' THEN amount_idr
           WHEN settlement_status IN ('requested', 'processing', 'paid') AND direction = 'debit' THEN -amount_idr
           ELSE 0
         END), 0)::int AS available_balance_idr,
         COALESCE(SUM(CASE
           WHEN settlement_status = 'pending' AND direction = 'credit' THEN amount_idr
           WHEN settlement_status IN ('requested', 'processing') AND direction = 'debit' THEN amount_idr
           ELSE 0
         END), 0)::int AS pending_balance_idr
       FROM courier_earnings_ledger
       WHERE courier_id = $1`,
      [req.user.id]
    );
    const payoutAccount = await db.query(
      `WITH verified_account AS (
         SELECT
           bank_code,
           ('**** ' || account_number_last4) AS account_number,
           account_name,
           status,
           verified_at
         FROM courier_payout_accounts
         WHERE courier_id = $1
           AND is_primary = TRUE
         ORDER BY
           CASE status
             WHEN 'verified' THEN 1
             WHEN 'pending_review' THEN 2
             WHEN 'suspended' THEN 3
             ELSE 4
           END,
           verified_at DESC NULLS LAST,
           created_at DESC
         LIMIT 1
       ), legacy_account AS (
         SELECT
           bank_code,
           CASE
             WHEN bank_account_number IS NULL THEN NULL
             ELSE '**** ' || right(regexp_replace(bank_account_number, '\\D', '', 'g'), 4)
           END AS account_number,
           bank_account_name AS account_name,
           CASE
             WHEN bank_code IS NOT NULL AND bank_account_number IS NOT NULL AND bank_account_name IS NOT NULL THEN 'pending_review'
             ELSE NULL
           END AS status,
           NULL::timestamptz AS verified_at
         FROM courier_profiles
         WHERE user_id = $1
         LIMIT 1
       )
       SELECT * FROM verified_account
       UNION ALL
       SELECT * FROM legacy_account
       WHERE NOT EXISTS (SELECT 1 FROM verified_account)
       LIMIT 1`,
      [req.user.id]
    );
    const summaryRow = summary.rows[0] || {
      total_balance_idr: 0,
      available_balance_idr: 0,
      pending_balance_idr: 0,
    };

    res.json({
      success: true,
      data: {
        summary: {
          ...summaryRow,
          payout_account: payoutAccount.rows[0] || null,
        },
        transactions: result.rows,
      },
      message: 'Courier earnings ledger loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier earnings ledger error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const getMobileCourierPayoutSummary = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const policy = await getCourierPayoutPolicy();
    const [balance, account, activeRequests, dailyRequested] = await Promise.all([
      db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_idr ELSE -amount_idr END), 0)::int AS total_balance_idr,
           COALESCE(SUM(
             CASE
               WHEN cel.direction = 'credit'
                 AND cel.settlement_status = 'available'
                 AND NOT EXISTS (
                   SELECT 1 FROM disputes d
                   WHERE d.order_id = cel.order_id
                     AND d.status IN ('open', 'investigating', 'pending')
                 )
               THEN cel.amount_idr
               WHEN cel.direction = 'debit'
                 AND cel.settlement_status IN ('requested', 'processing', 'paid')
               THEN -cel.amount_idr
               ELSE 0
             END
           ), 0)::int AS available_balance_idr,
           COALESCE(SUM(CASE
             WHEN settlement_status = 'pending' AND direction = 'credit' THEN amount_idr
             WHEN settlement_status IN ('requested', 'processing') AND direction = 'debit' THEN amount_idr
             ELSE 0
           END), 0)::int AS pending_balance_idr
         FROM courier_earnings_ledger cel
         WHERE cel.courier_id = $1`,
        [req.user.id]
      ),
      db.query(
        `SELECT
           id,
           bank_code,
           ('**** ' || account_number_last4) AS account_number,
           account_name,
           status,
           verified_at,
           created_at
         FROM courier_payout_accounts
         WHERE courier_id = $1
           AND is_primary = TRUE
         ORDER BY
           CASE status
             WHEN 'verified' THEN 1
             WHEN 'pending_review' THEN 2
             WHEN 'suspended' THEN 3
             ELSE 4
           END,
           verified_at DESC NULLS LAST,
           created_at DESC
         LIMIT 1`,
        [req.user.id]
      ),
      db.query(
        `SELECT COUNT(*)::int AS active_request_count
         FROM courier_payout_requests
         WHERE courier_id = $1
           AND status IN ('requested', 'risk_screening', 'approved_auto', 'risk_hold', 'manual_review', 'under_review', 'approved', 'processing')`,
        [req.user.id]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount_idr), 0)::int AS requested_today_idr
         FROM courier_payout_requests
         WHERE courier_id = $1
           AND requested_at >= date_trunc('day', NOW())
           AND status NOT IN ('failed', 'rejected', 'blocked', 'cancelled')`,
        [req.user.id]
      ),
    ]);

    const balanceRow = balance.rows[0] || {};
    const accountRow = account.rows[0] || null;
    const activeRequestCount = Number(activeRequests.rows[0]?.active_request_count || 0);
    const requestedToday = Number(dailyRequested.rows[0]?.requested_today_idr || 0);
    const availableBalance = Number(balanceRow.available_balance_idr || 0);

    const eligibilityReasons: string[] = [];
    if (!accountRow || accountRow.status !== 'verified') {
      eligibilityReasons.push('Rekening pencairan belum terverifikasi.');
    }
    if (availableBalance < policy.min_amount_idr) {
      eligibilityReasons.push(`Saldo tersedia belum mencapai minimum Rp${policy.min_amount_idr.toLocaleString('id-ID')}.`);
    }
    if (activeRequestCount >= policy.max_pending_requests) {
      eligibilityReasons.push('Masih ada pengajuan pencairan aktif yang perlu diselesaikan.');
    }
    if (requestedToday >= policy.daily_limit_idr) {
      eligibilityReasons.push('Limit pencairan harian sudah tercapai.');
    }

    await logPayoutSecurityEvent(req, 'summary_viewed', 'info');

    res.json({
      success: true,
      data: {
        summary: {
          total_balance_idr: Number(balanceRow.total_balance_idr || 0),
          available_balance_idr: availableBalance,
          pending_balance_idr: Number(balanceRow.pending_balance_idr || 0),
          requested_today_idr: requestedToday,
          active_request_count: activeRequestCount,
        },
        payout_account: accountRow,
        policy,
        eligibility: {
          can_request: eligibilityReasons.length === 0,
          reasons: eligibilityReasons,
          max_requestable_idr: Math.max(0, Math.min(availableBalance, policy.daily_limit_idr - requestedToday)),
        },
      },
      message: 'Courier payout summary loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier payout summary error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const getMobileCourierPayoutRequests = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT
         pr.id,
         pr.request_number,
         pr.amount_idr,
         pr.fee_idr,
         pr.net_amount_idr,
         pr.status,
         pr.destination_snapshot,
         pr.risk_snapshot,
         pr.failure_reason,
         pr.requested_at,
         pr.reviewed_at,
         pr.processed_at,
         pr.paid_at
       FROM courier_payout_requests pr
       WHERE pr.courier_id = $1
       ORDER BY pr.requested_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    await logPayoutSecurityEvent(req, 'request_list_viewed', 'info');

    res.json({
      success: true,
      data: result.rows.map((row) => decoratePayoutRequest(row)),
      message: 'Courier payout requests loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier payout requests error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const createMobileCourierPayoutRequest = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const amountIdr = Number(req.body?.amount_idr ?? req.body?.amount);
  const transactionPin = String(req.body?.transaction_pin || req.body?.pin || '');
  const idempotencyKey = String(req.headers['x-idempotency-key'] || req.body?.idempotency_key || '').trim();

  if (!Number.isInteger(amountIdr) || amountIdr <= 0) {
    res.status(400).json({ success: false, data: null, message: 'Nominal pencairan tidak valid.', code: 'ERR_INVALID_AMOUNT' });
    return;
  }

  if (!transactionPin) {
    res.status(400).json({ success: false, data: null, message: 'PIN transaksi wajib diisi.', code: 'ERR_STEP_UP_REQUIRED' });
    return;
  }

  if (idempotencyKey.length < 12) {
    res.status(400).json({ success: false, data: null, message: 'Idempotency key wajib dikirim untuk pencairan.', code: 'ERR_IDEMPOTENCY_REQUIRED' });
    return;
  }

  try {
    const courier = await db.query(
      `SELECT id, role, status, pin_hash
       FROM users
       WHERE id = $1
         AND role = 'courier'
       LIMIT 1`,
      [req.user.id]
    );

    const courierRow = courier.rows[0];
    if (!courierRow || courierRow.status !== 'active' || !isValidCourierPassword(transactionPin, courierRow.pin_hash)) {
      await logPayoutSecurityEvent(req, 'step_up_failed', 'warning', { amount_idr: amountIdr });
      res.status(403).json({
        success: false,
        data: null,
        message: 'Verifikasi PIN transaksi gagal.',
        code: 'ERR_STEP_UP_FAILED',
      });
      return;
    }

    const client = await db.connect();
    let requestRow: any;
    let riskResult: Awaited<ReturnType<typeof evaluateCourierPayoutRisk>> | null = null;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT payout_request_id, status, available_balance_idr
         FROM request_courier_payout($1, $2, $3)`,
        [req.user.id, amountIdr, idempotencyKey]
      );
      requestRow = result.rows[0];
      riskResult = await evaluateCourierPayoutRisk(client, req, requestRow.payout_request_id);
      await client.query('COMMIT');
    } catch (riskError) {
      await client.query('ROLLBACK');
      throw riskError;
    } finally {
      client.release();
    }

    const detail = await db.query(
      `SELECT
         pr.id,
         pr.request_number,
         pr.amount_idr,
         pr.fee_idr,
         pr.net_amount_idr,
         pr.status,
         pr.destination_snapshot,
         pr.risk_snapshot,
         pr.requested_at,
         rd.decision AS risk_decision,
         rd.risk_level,
         rd.risk_score,
         rd.reasons AS risk_reasons
       FROM courier_payout_requests pr
       LEFT JOIN LATERAL (
         SELECT decision, risk_level, risk_score, reasons
         FROM courier_payout_risk_decisions
         WHERE payout_request_id = pr.id
         ORDER BY created_at DESC
         LIMIT 1
       ) rd ON TRUE
       WHERE pr.id = $1
         AND pr.courier_id = $2
       LIMIT 1`,
      [requestRow.payout_request_id, req.user.id]
    );

    await logPayoutSecurityEvent(
      req,
      'request_created',
      'info',
      {
        amount_idr: amountIdr,
        idempotency_key_hash: sha256(idempotencyKey),
        risk_decision: riskResult?.decision?.decision || null,
        risk_score: riskResult?.decision?.risk_score ?? null,
      },
      requestRow.payout_request_id
    );
    await evaluatePayoutAlerts(db);

    const decoratedRequest = detail.rows[0] ? decoratePayoutRequest(detail.rows[0]) : null;

    res.status(201).json({
      success: true,
      data: {
        request: decoratedRequest,
        available_balance_idr: Number(requestRow.available_balance_idr || 0),
        risk_decision: riskResult?.decision || null,
      },
      message: payoutMobileMessage(decoratedRequest?.status || requestRow.status),
    });
  } catch (error: any) {
    const message = String(error?.message || 'Payout request failed');
    await logPayoutSecurityEvent(req, 'request_blocked', 'warning', {
      amount_idr: amountIdr,
      reason: message,
    });
    await evaluatePayoutAlerts(db);

    const knownPolicyError = /minimum|Verified payout account|cooldown|Too many|Daily payout|Insufficient|Idempotency/i.test(message);
    res.status(knownPolicyError ? 422 : 500).json({
      success: false,
      data: null,
      message: knownPolicyError ? message : 'Internal Server Error',
      code: knownPolicyError ? 'ERR_PAYOUT_POLICY_BLOCKED' : 'ERR_INTERNAL_SERVER',
    });
  }
};

export const getMobileCourierRoutePreview = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const orderId = String(req.params.orderId || req.params.id || '');
  try {
    const result = await db.query(
      `SELECT
         o.id,
         ST_Y(o.pickup_location::geometry)::float8 AS pickup_latitude,
         ST_X(o.pickup_location::geometry)::float8 AS pickup_longitude,
         ST_Y(o.dropoff_location::geometry)::float8 AS drop_latitude,
          ST_X(o.dropoff_location::geometry)::float8 AS drop_longitude,
          COALESCE(o.distance_km, 0)::float8 AS stored_distance_km,
          o.service_code,
          o.route_snapshot,
          o.route_provider,
          o.route_profile,
          o.route_distance_meters,
          o.route_duration_seconds,
          o.route_polyline,
          o.route_fallback_reason,
          NULLIF(o.route_snapshot->>'vehicle_type', '') AS route_vehicle_type
        FROM orders o
       LEFT JOIN order_legs ol ON ol.order_id = o.id
       WHERE o.id = $1
         AND (ol.courier_id = $2 OR o.status IN ('pending', 'pending_payment', 'paid', 'matched', 'dispatching', 'offered'))
       LIMIT 1`,
      [orderId, req.user.id]
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ success: false, data: null, message: 'Route order tidak ditemukan.', code: 'ERR_NOT_FOUND' });
      return;
    }

    const coords = parseLatLng(row);
    let routeSnapshot = parseJsonObject(row.route_snapshot);
    if (!routeSnapshot || (!routeSnapshot.distance_meters && !routeSnapshot.distance_km)) {
      routeSnapshot = await buildMapsRouteEtaSnapshot(
        { latitude: coords.pickup_latitude, longitude: coords.pickup_longitude },
        { latitude: coords.drop_latitude, longitude: coords.drop_longitude },
        'courier_mobile',
        {
          serviceCode: row.service_code || null,
          vehicleType: row.route_vehicle_type || null,
          routeProfile: row.route_profile || null,
        }
      );
      routeSnapshot = {
        ...routeSnapshot,
        source: 'legacy_order_route_preview_recalculation',
      };
    }
    const routeContract = routeContractFromOrder({ ...row, route_snapshot: routeSnapshot });
    const distanceKm = routeContract.distance_km > 0
      ? routeContract.distance_km
      : Number(row.stored_distance_km || 0) > 0
        ? Number(row.stored_distance_km)
        : haversineKm(coords.pickup_latitude, coords.pickup_longitude, coords.drop_latitude, coords.drop_longitude);
    const etaMinutes = routeContract.eta_minutes || Math.max(8, Math.ceil(distanceKm / 22 * 60));
    const fallbackPolyline = [
      { latitude: coords.pickup_latitude, longitude: coords.pickup_longitude },
      { latitude: coords.drop_latitude, longitude: coords.drop_longitude },
    ];
    const legacyPolyline = routeContract.fallback_reason ? fallbackPolyline : [];

    await db.query(
      `INSERT INTO courier_route_snapshots (
         order_id, courier_id, distance_km, eta_minutes, polyline, provider,
         route_snapshot, route_profile, route_distance_meters, route_duration_seconds,
         route_polyline, route_fallback_reason
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)`,
      [
        orderId,
        req.user.id,
        distanceKm.toFixed(2),
        etaMinutes,
        JSON.stringify(legacyPolyline),
        routeContract.provider,
        JSON.stringify(routeSnapshot),
        routeContract.route_profile,
        routeContract.distance_meters,
        routeContract.duration_seconds,
        routeContract.route_polyline,
        routeContract.fallback_reason || null,
      ]
    );

    res.json({
      success: true,
      data: {
        order_id: orderId,
        distance_km: Number(distanceKm.toFixed(2)),
        eta_minutes: etaMinutes,
        provider: routeContract.provider,
        route_snapshot: routeSnapshot,
        route_polyline: routeContract.route_polyline,
        route_profile: routeContract.route_profile,
        vehicle_type: routeContract.vehicle_type,
        route_snapshot_hash: routeContract.snapshot_hash,
        route_version: routeContract.route_version,
        fallback_reason: routeContract.fallback_reason || null,
        polyline: legacyPolyline,
      },
      message: 'Route preview loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier route preview error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const getMobileCourierActiveRoutePlan = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT
         cp.user_id AS courier_id,
         ST_Y(cp.current_location::geometry)::float8 AS courier_latitude,
         ST_X(cp.current_location::geometry)::float8 AS courier_longitude,
         o.id AS order_id,
         o.order_number,
         COALESCE(ol.status, o.status) AS status,
         o.service_code,
         COALESCE(dsp.traffic_aware_assignment, TRUE) AS traffic_aware_assignment,
         COALESCE(dsp.max_pickup_detour_km, 1)::float8 AS max_pickup_detour_km,
         COALESCE(dsp.max_delivery_detour_km, 2)::float8 AS max_delivery_detour_km,
         ST_Y(o.pickup_location::geometry)::float8 AS pickup_latitude,
         ST_X(o.pickup_location::geometry)::float8 AS pickup_longitude,
         ST_Y(o.dropoff_location::geometry)::float8 AS drop_latitude,
         ST_X(o.dropoff_location::geometry)::float8 AS drop_longitude,
         o.pickup_address,
         o.dropoff_address,
         NULLIF(o.route_snapshot->>'vehicle_type', '') AS route_vehicle_type,
         o.route_profile,
         COALESCE((SELECT COUNT(*) FROM order_packages op WHERE op.order_id = o.id), 1)::int AS package_count
       FROM courier_profiles cp
       JOIN order_legs ol ON ol.courier_id = cp.user_id
       JOIN orders o ON o.id = ol.order_id
       LEFT JOIN delivery_service_products dsp ON dsp.code = o.service_code
       WHERE cp.user_id = $1
         AND cp.current_location IS NOT NULL
         AND COALESCE(ol.status, o.status) NOT IN ('delivered', 'completed', 'failed', 'cancelled', 'rejected', 'return_required')
       ORDER BY o.created_at ASC
       LIMIT 20`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      res.json({
        success: true,
        data: {
          courier_location: null,
          stops: [],
          segments: [],
          total_distance_km: 0,
          total_eta_minutes: 0,
          traffic_aware: true,
        },
        message: 'Tidak ada route aktif.',
      });
      return;
    }

    const first = result.rows[0];
    const courierLocation = {
      latitude: Number(first.courier_latitude),
      longitude: Number(first.courier_longitude),
    };
    const stops = result.rows.flatMap((row: any) => {
      const status = String(row.status || '').toLowerCase();
      const orderStops: any[] = [];
      if (!['picked_up', 'in_transit'].includes(status)) {
        orderStops.push({
          order_id: row.order_id,
          order_number: row.order_number,
          stop_type: 'pickup',
          address: row.pickup_address,
          latitude: Number(row.pickup_latitude),
          longitude: Number(row.pickup_longitude),
          service_code: row.service_code,
          package_count: Number(row.package_count || 1),
          detour_limit_km: Number(row.max_pickup_detour_km || 0),
        });
      }
      orderStops.push({
        order_id: row.order_id,
        order_number: row.order_number,
        stop_type: 'dropoff',
        address: row.dropoff_address,
        latitude: Number(row.drop_latitude),
        longitude: Number(row.drop_longitude),
        service_code: row.service_code,
        package_count: Number(row.package_count || 1),
        detour_limit_km: Number(row.max_delivery_detour_km || 0),
      });
      return orderStops;
    }).sort((a: any, b: any) => {
      const aDistance = haversineKm(courierLocation.latitude, courierLocation.longitude, a.latitude, a.longitude);
      const bDistance = haversineKm(courierLocation.latitude, courierLocation.longitude, b.latitude, b.longitude);
      if (a.stop_type !== b.stop_type) return a.stop_type === 'pickup' ? -1 : 1;
      return aDistance - bDistance;
    });

    const segments = [];
    let previousPoint = courierLocation;
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    for (const stop of stops) {
      const routeSnapshot = await buildMapsRouteEtaSnapshot(
        previousPoint,
        { latitude: stop.latitude, longitude: stop.longitude },
        'courier_mobile',
        {
          serviceCode: stop.service_code || null,
          vehicleType: first.route_vehicle_type || null,
          routeProfile: first.route_profile || null,
        }
      );
      const distanceMeters = Number(routeSnapshot.distance_meters || 0);
      const durationSeconds = Number(routeSnapshot.duration_seconds || 0);
      totalDistanceMeters += distanceMeters;
      totalDurationSeconds += durationSeconds;
      segments.push({
        to_order_id: stop.order_id,
        to_stop_type: stop.stop_type,
        provider: routeSnapshot.provider || null,
        distance_meters: distanceMeters,
        duration_seconds: durationSeconds,
        eta_minutes: routeSnapshot.eta_minutes || Math.ceil(durationSeconds / 60),
        route_profile: routeSnapshot.route_profile || null,
        route_polyline: routeSnapshot.route_polyline || null,
        fallback_reason: routeSnapshot.fallback_reason || null,
      });
      previousPoint = { latitude: stop.latitude, longitude: stop.longitude };
    }

    res.json({
      success: true,
      data: {
        courier_location: courierLocation,
        stops,
        segments,
        total_distance_km: Number((totalDistanceMeters / 1000).toFixed(2)),
        total_eta_minutes: Math.ceil(totalDurationSeconds / 60),
        traffic_aware: result.rows.every((row: any) => row.traffic_aware_assignment !== false),
      },
      message: 'Route aktif kurir tersedia.',
    });
  } catch (error) {
    securityLog.error('Get mobile courier active route plan error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const getMobileCourierPerformance = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const summary = await db.query(
      `WITH delivered AS (
         SELECT ol.*, o.delivered_at
         FROM order_legs ol
         JOIN orders o ON o.id = ol.order_id
         WHERE ol.courier_id = $1
       ),
       ratings AS (
         SELECT COALESCE(AVG(stars), 5.0)::numeric(3,2) AS avg_rating, COUNT(*)::int AS rating_count
         FROM courier_ratings
         WHERE courier_id = $1
       )
       SELECT
         COUNT(*) FILTER (WHERE status = 'delivered')::int AS total_deliveries,
         COUNT(*) FILTER (WHERE status = 'delivered' AND updated_at >= NOW() - INTERVAL '30 days')::int AS deliveries_30d,
         COALESCE(SUM(assigned_fee_idr) FILTER (WHERE status = 'delivered' AND updated_at::date = CURRENT_DATE), 0)::int AS today_earnings_idr,
         COALESCE(SUM(assigned_fee_idr) FILTER (WHERE status = 'delivered' AND updated_at >= date_trunc('week', NOW())), 0)::int AS week_earnings_idr,
         COALESCE(SUM(assigned_fee_idr) FILTER (WHERE status = 'delivered'), 0)::int AS total_earnings_idr,
         COALESCE(ROUND(COUNT(*) FILTER (WHERE status = 'delivered')::numeric / NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('pending')), 0) * 100), 100)::int AS completion_rate_pct,
         COALESCE((SELECT avg_rating FROM ratings), 5.00) AS avg_rating,
         COALESCE((SELECT rating_count FROM ratings), 0)::int AS rating_count
       FROM delivered`,
      [req.user.id]
    );

    const row = summary.rows[0] || {};
    const tierRes = await db.query(
      `SELECT tier_code, tier_name, benefit_summary
       FROM courier_tier_configs
       WHERE is_active = TRUE
         AND min_rating <= $1
         AND min_completion_rate <= $2
         AND min_deliveries_30d <= $3
       ORDER BY display_order DESC
       LIMIT 1`,
      [Number(row.avg_rating || 5), Number(row.completion_rate_pct || 100), Number(row.deliveries_30d || 0)]
    );

    const campaignRes = await db.query(
      `SELECT id, code, title, description, target_deliveries, reward_idr, ends_at
       FROM courier_incentive_campaigns
       WHERE is_active = TRUE
         AND starts_at <= NOW()
         AND ends_at >= NOW()
       ORDER BY reward_idr DESC
       LIMIT 5`
    );

    const deliveredToday = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM order_legs
       WHERE courier_id = $1
         AND status = 'delivered'
         AND updated_at::date = CURRENT_DATE`,
      [req.user.id]
    );

    const todayCount = Number(deliveredToday.rows[0]?.total || 0);
    const incentives = campaignRes.rows.map((campaign: any) => ({
      ...campaign,
      progress_deliveries: todayCount,
      progress_percent: campaign.target_deliveries > 0 ? Math.min(100, Math.round(todayCount / campaign.target_deliveries * 100)) : 0,
    }));

    res.json({
      success: true,
      data: {
        today_earnings_idr: Number(row.today_earnings_idr || 0),
        week_earnings_idr: Number(row.week_earnings_idr || 0),
        total_earnings_idr: Number(row.total_earnings_idr || 0),
        total_deliveries: Number(row.total_deliveries || 0),
        deliveries_30d: Number(row.deliveries_30d || 0),
        completion_rate_pct: Number(row.completion_rate_pct || 100),
        acceptance_rate_pct: 100,
        avg_rating: Number(row.avg_rating || 5),
        rating_count: Number(row.rating_count || 0),
        tier: tierRes.rows[0] || { tier_code: 'starter', tier_name: 'Starter', benefit_summary: 'Akses pekerjaan on-demand reguler.' },
        incentives,
      },
      message: 'Courier performance loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier performance error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const listAdminCourierSafetyEvents = async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT se.*, u.full_name AS courier_name, o.order_number
       FROM courier_safety_events se
       JOIN users u ON u.id = se.courier_id
       LEFT JOIN orders o ON o.id = se.order_id
       ORDER BY se.created_at DESC
       LIMIT 100`
    );

    res.json({ success: true, data: result.rows, events: result.rows });
  } catch (error) {
    securityLog.error('List admin courier safety events error:', error);
    res.status(500).json({ success: false, data: [], events: [], message: 'Internal Server Error' });
  }
};

export const listAdminCourierGrowthConfigs = async (_req: Request, res: Response) => {
  try {
    const [tiers, incentives] = await Promise.all([
      db.query(
        `SELECT id, tier_code, tier_name, min_rating, min_completion_rate, min_deliveries_30d,
                benefit_summary, display_order, is_active, updated_at
         FROM courier_tier_configs
         ORDER BY display_order ASC`
      ),
      db.query(
        `SELECT id, code, title, description, target_deliveries, reward_idr,
                starts_at, ends_at, is_active, metadata, updated_at
         FROM courier_incentive_campaigns
         ORDER BY is_active DESC, reward_idr DESC, ends_at DESC`
      ),
    ]);
    res.json({ success: true, data: { tiers: tiers.rows, incentives: incentives.rows } });
  } catch (error) {
    securityLog.error('List courier growth configs error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error' });
  }
};

export const updateAdminCourierTierConfig = async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body || {};
  try {
    const result = await db.query(
      `UPDATE courier_tier_configs
       SET tier_name = COALESCE(NULLIF($1, ''), tier_name),
           min_rating = COALESCE($2, min_rating),
           min_completion_rate = COALESCE($3, min_completion_rate),
           min_deliveries_30d = COALESCE($4, min_deliveries_30d),
           benefit_summary = COALESCE(NULLIF($5, ''), benefit_summary),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        body.tier_name,
        body.min_rating ?? null,
        body.min_completion_rate ?? null,
        body.min_deliveries_30d ?? null,
        body.benefit_summary,
        typeof body.is_active === 'boolean' ? body.is_active : null,
        id,
      ]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, data: null, message: 'Tier config tidak ditemukan.' });
      return;
    }
    res.json({ success: true, data: result.rows[0], message: 'Tier config updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};

export const updateAdminCourierIncentive = async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body || {};
  try {
    const result = await db.query(
      `UPDATE courier_incentive_campaigns
       SET title = COALESCE(NULLIF($1, ''), title),
           description = COALESCE($2, description),
           target_deliveries = COALESCE($3, target_deliveries),
           reward_idr = COALESCE($4, reward_idr),
           starts_at = COALESCE($5, starts_at),
           ends_at = COALESCE($6, ends_at),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        body.title,
        body.description ?? null,
        body.target_deliveries ?? null,
        body.reward_idr ?? null,
        body.starts_at ?? null,
        body.ends_at ?? null,
        typeof body.is_active === 'boolean' ? body.is_active : null,
        id,
      ]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, data: null, message: 'Campaign tidak ditemukan.' });
      return;
    }
    res.json({ success: true, data: result.rows[0], message: 'Incentive campaign updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};

const ON_DEMAND_OFFER_TTL_SECONDS = 15;
const ON_DEMAND_OPEN_ORDER_STATUSES = ['pending', 'pending_payment', 'paid', 'matched', 'offered', 'dispatching', 'pending_assignment', 'searching'];

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
  service_name?: string | null;
  service_code?: string | null;
  vehicle_type?: string | null;
  route_profile?: string | null;
  route_provider?: string | null;
  route_distance_meters?: number | null;
  route_duration_seconds?: number | null;
  eta_minutes?: number | null;
  route_snapshot_hash?: string | null;
  route_snapshot_version?: number | null;
  route_version?: string | null;
  courier_payout_estimate_idr?: number | null;
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

export const dispatchNextOnDemandCourier = async (client: any, orderId: string): Promise<CreatedDispatchOffer | null> => {
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
       SELECT
         ol.courier_id,
         COUNT(*)::int AS active_count,
         BOOL_OR(COALESCE(ol.status, ao.status) IN ('accepted', 'assigned', 'going_to_pickup', 'pickup_pending')) AS has_pickup_job,
         BOOL_OR(COALESCE(ol.status, ao.status) IN ('picked_up', 'in_transit')) AS has_delivery_job,
         BOOL_OR(ao.customer_id IS DISTINCT FROM target.customer_id) AS has_different_customer_job
       FROM order_legs ol
       JOIN orders ao ON ao.id = ol.order_id
       JOIN orders target ON target.id = $1
       WHERE ol.courier_id IS NOT NULL
         AND ol.order_id <> $1
         AND COALESCE(ol.status, ao.status) NOT IN ('delivered', 'completed', 'failed', 'cancelled', 'rejected', 'return_required')
       GROUP BY ol.courier_id
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
          COALESCE(
            NULLIF(o.route_snapshot->>'distance_km', '')::numeric,
            CASE
              WHEN COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0) > 0
              THEN ROUND(COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int)::numeric / 1000.0, 2)
              ELSE NULL
            END,
            o.distance_km,
            0
          )::text AS distance,
          COALESCE(NULLIF(o.courier_payout_estimate_idr, 0), GREATEST(o.total_price_idr - o.platform_commission_idr, 0), 0)::text AS fee,
          COALESCE(NULLIF(o.courier_payout_estimate_idr, 0), GREATEST(o.total_price_idr - o.platform_commission_idr, 0), 0)::int AS courier_payout_estimate_idr,
          COALESCE(o.total_price_idr, 0)::int AS customer_price_idr,
          o.route_snapshot,
          o.route_provider,
          o.route_profile,
          COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0)::int AS route_distance_meters,
          COALESCE(o.route_duration_seconds, NULLIF(o.route_snapshot->>'duration_seconds', '')::int, 0)::int AS route_duration_seconds,
          o.route_polyline,
          o.route_fallback_reason,
          NULLIF(o.route_snapshot->>'vehicle_type', '') AS vehicle_type,
          NULLIF(o.route_snapshot->>'eta_minutes', '')::int AS eta_minutes,
          NULLIF(o.route_snapshot->>'snapshot_hash', '') AS route_snapshot_hash,
          NULLIF(o.route_snapshot->>'snapshot_version', '')::int AS route_snapshot_version,
          NULLIF(o.route_snapshot->>'route_version', '') AS route_version,
          o.service_code,
          COALESCE(dsp.max_active_orders_on_demand, 1)::int AS max_active_orders_on_demand,
          COALESCE(dsp.same_customer_batching_required, TRUE) AS same_customer_batching_required,
          COALESCE(dsp.allow_new_offer_while_pickup, FALSE) AS allow_new_offer_while_pickup,
          COALESCE(dsp.allow_new_offer_while_delivery, FALSE) AS allow_new_offer_while_delivery,
          COALESCE(dsp.assignment_radius_pickup_km, 2)::float8 AS assignment_radius_pickup_km,
          COALESCE(dsp.assignment_radius_delivery_km, 3)::float8 AS assignment_radius_delivery_km,
          COALESCE(dsp.max_pickup_detour_km, 1)::float8 AS max_pickup_detour_km,
          COALESCE(dsp.max_delivery_detour_km, 2)::float8 AS max_delivery_detour_km,
          COALESCE(dsp.traffic_aware_assignment, TRUE) AS traffic_aware_assignment,
          COALESCE(aj.active_count, 0)::int AS active_count,
          COALESCE(aj.has_pickup_job, FALSE) AS has_pickup_job,
          COALESCE(aj.has_delivery_job, FALSE) AS has_delivery_job,
          COALESCE(u.full_name, 'Customer') AS customer_name,
          COALESCE(dsp.name, o.service_snapshot->>'service_name', o.service_code, 'TEMBUS On Demand') AS service_name
       FROM orders o
       JOIN delivery_service_products dsp ON dsp.code = o.service_code
        AND dsp.is_enabled = TRUE
        AND dsp.service_category = 'on_demand'
       JOIN courier_profiles cp ON cp.application_channel = 'on_demand'
        AND cp.verification_status = 'approved'
        AND cp.is_online = TRUE
        AND cp.current_zone_id IS NOT NULL
        AND cp.current_location IS NOT NULL
        AND cp.last_location_at >= NOW() - INTERVAL '10 minutes'
       JOIN courier_service_capabilities csc ON csc.courier_profile_id = cp.id
        AND csc.service_code = o.service_code
        AND csc.application_channel = 'on_demand'
        AND csc.status = 'enabled'
       JOIN courier_vehicles cv ON cv.id = csc.vehicle_id
        AND cv.courier_profile_id = cp.id
        AND cv.verification_status = 'approved'
        AND (
          COALESCE(array_length(dsp.vehicle_types, 1), 0) = 0
          OR cv.vehicle_type = ANY(dsp.vehicle_types)
          OR (cv.vehicle_type = 'motor' AND 'bike' = ANY(dsp.vehicle_types))
          OR (cv.vehicle_type = 'car' AND 'mobil' = ANY(dsp.vehicle_types))
        )
       JOIN zones z ON z.id = cp.current_zone_id
        AND z.is_active = TRUE
        AND ST_Covers(z.polygon, o.pickup_location)
       LEFT JOIN users u ON u.id = o.customer_id
       LEFT JOIN active_jobs aj ON aj.courier_id = cp.user_id
       WHERE o.id = $1
        AND LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
        AND o.status = ANY($2::text[])
        AND (o.pickup_location IS NULL OR ST_Covers(z.polygon, o.pickup_location))
        AND COALESCE(aj.active_count, 0) < COALESCE(dsp.max_active_orders_on_demand, 1)
        AND (
          COALESCE(aj.active_count, 0) = 0
          OR (
            (COALESCE(aj.has_pickup_job, FALSE) = FALSE OR COALESCE(dsp.allow_new_offer_while_pickup, FALSE) = TRUE)
            AND (COALESCE(aj.has_delivery_job, FALSE) = FALSE OR COALESCE(dsp.allow_new_offer_while_delivery, FALSE) = TRUE)
            AND (COALESCE(dsp.same_customer_batching_required, TRUE) = FALSE OR COALESCE(aj.has_different_customer_job, FALSE) = FALSE)
            AND COALESCE(ST_Distance(cp.current_location, o.pickup_location), 0) <= (
              CASE
                WHEN COALESCE(aj.has_delivery_job, FALSE) THEN COALESCE(dsp.assignment_radius_delivery_km, 3)
                ELSE COALESCE(dsp.assignment_radius_pickup_km, 2)
              END * 1000
            )
          )
        )
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
  const routeContract = routeContractFromOrder(nextCourier);
  const routeDispatchMetadata = {
    source: 'dispatch_engine_v1',
    route_snapshot_hash: routeContract.snapshot_hash,
    route_snapshot_version: routeContract.snapshot_version,
    route_version: routeContract.route_version,
    route_provider: routeContract.provider,
    route_profile: routeContract.route_profile,
    route_distance_meters: routeContract.distance_meters,
    route_duration_seconds: routeContract.duration_seconds,
    eta_minutes: routeContract.eta_minutes,
    vehicle_type: routeContract.vehicle_type,
    service_code: routeContract.service_code,
    courier_payout_estimate_idr: Number(nextCourier.courier_payout_estimate_idr || 0),
    customer_price_idr: Number(nextCourier.customer_price_idr || 0),
    assignment_policy: {
      active_count: Number(nextCourier.active_count || 0),
      max_active_orders_on_demand: Number(nextCourier.max_active_orders_on_demand || 1),
      allow_new_offer_while_pickup: Boolean(nextCourier.allow_new_offer_while_pickup),
      allow_new_offer_while_delivery: Boolean(nextCourier.allow_new_offer_while_delivery),
      same_customer_batching_required: Boolean(nextCourier.same_customer_batching_required),
      assignment_radius_pickup_km: Number(nextCourier.assignment_radius_pickup_km || 0),
      assignment_radius_delivery_km: Number(nextCourier.assignment_radius_delivery_km || 0),
      max_pickup_detour_km: Number(nextCourier.max_pickup_detour_km || 0),
      max_delivery_detour_km: Number(nextCourier.max_delivery_detour_km || 0),
      traffic_aware_assignment: Boolean(nextCourier.traffic_aware_assignment),
    },
  };

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
      JSON.stringify(routeDispatchMetadata),
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
        ...routeDispatchMetadata,
      }),
    ]
  );

  return {
    dispatch_id: dispatch.id,
    order_id: orderId,
    courier_id: nextCourier.courier_id,
    pickup_address: nextCourier.pickup_address,
    dropoff_address: nextCourier.dropoff_address,
    distance: routeContract.distance_km > 0 ? String(routeContract.distance_km) : nextCourier.distance,
    fee: nextCourier.fee,
    customer_name: nextCourier.customer_name,
    expires_at: dispatch.expires_at,
    service_name: nextCourier.service_name,
    service_code: nextCourier.service_code,
    vehicle_type: routeContract.vehicle_type,
    route_profile: routeContract.route_profile,
    route_provider: routeContract.provider,
    route_distance_meters: routeContract.distance_meters,
    route_duration_seconds: routeContract.duration_seconds,
    eta_minutes: routeContract.eta_minutes,
    route_snapshot_hash: routeContract.snapshot_hash,
    route_snapshot_version: routeContract.snapshot_version,
    route_version: routeContract.route_version,
    courier_payout_estimate_idr: Number(nextCourier.courier_payout_estimate_idr || 0),
  };
};

export const advanceOnDemandDispatchQueue = async (client: any, limit = 25): Promise<CreatedDispatchOffer[]> => {
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

export const notifyOnDemandOffers = async (offers: CreatedDispatchOffer[]) => {
  for (const offer of offers) {
    try {
      emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.OFFER_CREATED, {
        order_id: offer.order_id,
        courier_user_id: offer.courier_id,
        status: 'offered',
        stage: 'offer_created',
        metadata: {
          dispatch_id: offer.dispatch_id,
          pickup_address: offer.pickup_address || '',
          distance: offer.distance || '',
          fee: offer.fee || '',
          customer_name: offer.customer_name || '',
          service_name: offer.service_name || 'TEMBUS On Demand',
          service_code: offer.service_code || '',
          vehicle_type: offer.vehicle_type || '',
          route_profile: offer.route_profile || '',
          route_provider: offer.route_provider || '',
          route_distance_meters: offer.route_distance_meters || 0,
          route_duration_seconds: offer.route_duration_seconds || 0,
          eta_minutes: offer.eta_minutes || 0,
          route_snapshot_hash: offer.route_snapshot_hash || '',
          route_snapshot_version: offer.route_snapshot_version || null,
          route_version: offer.route_version || '',
          courier_payout_estimate_idr: offer.courier_payout_estimate_idr || Number(offer.fee || 0) || 0,
          expires_at: offer.expires_at,
          offer_ttl_seconds: ON_DEMAND_OFFER_TTL_SECONDS,
        },
      });

      await createNotification({
        user_id: offer.courier_id,
        title: 'Pekerjaan On Demand Baru',
        body: `${offer.service_name || 'On Demand'} tersedia. Terima dalam ${ON_DEMAND_OFFER_TTL_SECONDS} detik.`,
        type: 'on_demand_offer',
        order_id: offer.order_id,
        deep_link: `tembus://orders/${offer.order_id}`,
        metadata: {
          dispatch_id: offer.dispatch_id,
          order_id: offer.order_id,
          pickup_address: offer.pickup_address || '',
          drop_address: 'Alamat tujuan dibuka setelah pekerjaan diterima',
          distance: offer.distance || '',
          fee: offer.fee || '',
          customer_name: offer.customer_name || '',
          service_name: offer.service_name || 'TEMBUS On Demand',
          service_code: offer.service_code || '',
          vehicle_type: offer.vehicle_type || '',
          route_profile: offer.route_profile || '',
          route_provider: offer.route_provider || '',
          route_distance_meters: String(offer.route_distance_meters || 0),
          route_duration_seconds: String(offer.route_duration_seconds || 0),
          eta_minutes: String(offer.eta_minutes || 0),
          route_snapshot_hash: offer.route_snapshot_hash || '',
          route_snapshot_version: String(offer.route_snapshot_version || ''),
          route_version: offer.route_version || '',
          courier_payout_estimate_idr: String(offer.courier_payout_estimate_idr || Number(offer.fee || 0) || 0),
          model: 'p2p',
          workflow_role: 'on_demand',
          offer_expires_at: new Date(offer.expires_at).getTime().toString(),
          offer_ttl_seconds: ON_DEMAND_OFFER_TTL_SECONDS.toString(),
          title: 'Pekerjaan On Demand Baru',
          body: `${offer.service_name || 'On Demand'} tersedia. Terima dalam ${ON_DEMAND_OFFER_TTL_SECONDS} detik.`,
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
       LEFT JOIN delivery_service_products dsp ON dsp.code = o.service_code
       ORDER BY d.expires_at ASC
       LIMIT 1`,
      [req.user.id]
    );

    await client.query('COMMIT');
    await notifyOnDemandOffers(createdOffers);

    res.json({
      success: true,
      data: result.rows.map(normalizeOfferMobileOrder),
      message: 'Courier on-demand offers loaded',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Get mobile courier offers error:', error);
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
          d.metadata AS dispatch_metadata,
          o.model,
          o.total_price_idr,
          o.courier_payout_estimate_idr,
          o.platform_commission_idr,
          o.pickup_location,
          o.service_code,
          o.customer_id,
          o.order_number,
          o.route_snapshot,
          o.route_provider,
          o.route_profile,
          o.route_distance_meters,
          o.route_duration_seconds,
          o.route_polyline,
          o.route_fallback_reason,
          NULLIF(o.route_snapshot->>'vehicle_type', '') AS route_vehicle_type
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
    const acceptedRouteContract = routeContractFromOrder(dispatch);
    const acceptedRouteMetadata = {
      route_snapshot_hash: acceptedRouteContract.snapshot_hash,
      route_snapshot_version: acceptedRouteContract.snapshot_version,
      route_version: acceptedRouteContract.route_version,
      route_provider: acceptedRouteContract.provider,
      route_profile: acceptedRouteContract.route_profile,
      route_distance_meters: acceptedRouteContract.distance_meters,
      route_duration_seconds: acceptedRouteContract.duration_seconds,
      eta_minutes: acceptedRouteContract.eta_minutes,
      vehicle_type: acceptedRouteContract.vehicle_type,
      service_code: acceptedRouteContract.service_code || dispatch.service_code,
      courier_payout_estimate_idr: Number(dispatch.courier_payout_estimate_idr || 0),
    };

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
      `WITH active_jobs AS (
         SELECT
           COUNT(*)::int AS active_count,
           BOOL_OR(COALESCE(ol.status, ao.status) IN ('accepted', 'assigned', 'going_to_pickup', 'pickup_pending')) AS has_pickup_job,
           BOOL_OR(COALESCE(ol.status, ao.status) IN ('picked_up', 'in_transit')) AS has_delivery_job,
           BOOL_OR(ao.customer_id IS DISTINCT FROM $5::uuid) AS has_different_customer_job
         FROM order_legs ol
         JOIN orders ao ON ao.id = ol.order_id
         WHERE ol.courier_id = $1
           AND ol.order_id <> $4
           AND COALESCE(ol.status, ao.status) NOT IN ('delivered', 'completed', 'failed', 'cancelled', 'rejected', 'return_required')
       )
       SELECT
         cp.id,
         cp.current_zone_id,
         z.name AS zone_name,
         COALESCE(aj.active_count, 0)::int AS active_count,
         COALESCE(dsp.max_active_orders_on_demand, 1)::int AS max_active_orders_on_demand,
         COALESCE(dsp.allow_new_offer_while_pickup, FALSE) AS allow_new_offer_while_pickup,
         COALESCE(dsp.allow_new_offer_while_delivery, FALSE) AS allow_new_offer_while_delivery,
         COALESCE(dsp.same_customer_batching_required, TRUE) AS same_customer_batching_required,
         COALESCE(aj.has_pickup_job, FALSE) AS has_pickup_job,
         COALESCE(aj.has_delivery_job, FALSE) AS has_delivery_job,
         COALESCE(aj.has_different_customer_job, FALSE) AS has_different_customer_job
       FROM courier_profiles cp
       JOIN zones z ON z.id = cp.current_zone_id AND z.is_active = TRUE
       JOIN courier_service_capabilities csc ON csc.courier_profile_id = cp.id
        AND csc.service_code = $3
        AND csc.application_channel = 'on_demand'
        AND csc.status = 'enabled'
       JOIN delivery_service_products dsp ON dsp.code = csc.service_code
        AND dsp.is_enabled = TRUE
        AND dsp.service_category = 'on_demand'
       CROSS JOIN active_jobs aj
       WHERE cp.user_id = $1
         AND cp.application_channel = 'on_demand'
         AND cp.verification_status = 'approved'
         AND cp.is_online = TRUE
         AND cp.current_zone_id = $2
         AND COALESCE(aj.active_count, 0) < COALESCE(dsp.max_active_orders_on_demand, 1)
         AND (
           COALESCE(aj.active_count, 0) = 0
           OR (
             (COALESCE(aj.has_pickup_job, FALSE) = FALSE OR COALESCE(dsp.allow_new_offer_while_pickup, FALSE) = TRUE)
             AND (COALESCE(aj.has_delivery_job, FALSE) = FALSE OR COALESCE(dsp.allow_new_offer_while_delivery, FALSE) = TRUE)
             AND (COALESCE(dsp.same_customer_batching_required, TRUE) = FALSE OR COALESCE(aj.has_different_customer_job, FALSE) = FALSE)
           )
         )
       LIMIT 1`,
      [req.user.id, dispatch.zone_id, dispatch.service_code, dispatch.order_id, dispatch.customer_id]
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
      [dispatch.order_id, req.user.id, JSON.stringify({
        source: 'courier_app',
        dispatch_id: dispatch.dispatch_id,
        ...acceptedRouteMetadata,
      })]
    );

    const accepted = await client.query(
      `SELECT ${mobileOrderSelect},
         NULL::uuid AS dispatch_id,
         NULL::bigint AS offer_expires_at,
         NULL::int AS offer_ttl_seconds
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       LEFT JOIN users c ON c.id = o.customer_id
       LEFT JOIN delivery_service_products dsp ON dsp.code = o.service_code
       WHERE o.id = $1`,
      [dispatch.order_id]
    );

    await client.query('COMMIT');
    emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.OFFER_ACCEPTED, {
      order_id: dispatch.order_id,
      order_number: dispatch.order_number || null,
      customer_id: dispatch.customer_id,
      courier_user_id: req.user.id,
      status: 'accepted',
      stage: 'courier_otw_pickup',
      metadata: {
        dispatch_id: dispatch.dispatch_id,
        ...acceptedRouteMetadata,
      },
    });
    emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.COURIER_OTW_PICKUP, {
      order_id: dispatch.order_id,
      order_number: dispatch.order_number || null,
      customer_id: dispatch.customer_id,
      courier_user_id: req.user.id,
      status: 'accepted',
      stage: 'courier_otw_pickup',
      metadata: {
        dispatch_id: dispatch.dispatch_id,
        ...acceptedRouteMetadata,
      },
    });
    if (dispatch.customer_id) {
      try {
        await createNotification({
          user_id: dispatch.customer_id,
          title: 'Kurir sudah menerima order',
          body: 'Kurir sedang menuju titik pickup. Lokasi dapat dipantau dari detail order.',
          type: 'courier_assigned',
          order_id: dispatch.order_id,
          deep_link: `/orders/${dispatch.order_id}`,
          metadata: {
            order_number: dispatch.order_number || '',
            courier_id: req.user.id,
            dispatch_id: dispatch.dispatch_id,
            route_snapshot_hash: acceptedRouteMetadata.route_snapshot_hash || '',
            route_provider: acceptedRouteMetadata.route_provider || '',
          },
        });
      } catch (notificationError) {
        console.warn('Failed to notify customer about accepted offer:', notificationError);
      }
    }
    void evaluateOnDemandRealtimeAlerts(db);
    res.json({ success: true, data: normalizeMobileOrder(accepted.rows[0]), message: 'Offer accepted' });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Accept mobile courier offer error:', error);
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
    securityLog.error('Reject mobile courier offer error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

const ON_DEMAND_GEOFENCE_RADIUS_M = Number(process.env.ON_DEMAND_GEOFENCE_RADIUS_M || 10);
const ON_DEMAND_MAX_ACCURACY_M = Number(process.env.ON_DEMAND_MAX_ACCURACY_M || 50);

const DEFAULT_GPS_OVERRIDE_POLICY = {
  enabled: true,
  soft_radius_m: 25,
  max_accuracy_m: 100,
  requires_reason: true,
  manual_review_required: true,
};

const HIGH_RISK_SPOOF_SIGNALS = new Set([
  'mock',
  'mock_location',
  'rooted',
  'rooted_device',
  'emulator',
  'tampered',
  'high',
]);

const normalizeProofPolicyNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
};

const normalizeGpsOverridePolicy = (value: unknown) => ({
  ...DEFAULT_GPS_OVERRIDE_POLICY,
  ...(parseJsonObject(value) || {}),
});

const parseCoordinate = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const creditCourierDeliveryEarning = async (client: any, orderId: string, courierId: string) => {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`courier-earning:${orderId}`]);
  const result = await client.query(
    `INSERT INTO courier_earnings_ledger (
       courier_id,
       order_id,
       source,
       direction,
       amount_idr,
       settlement_status,
       transaction_type,
       description,
       metadata
     )
     SELECT
       $2,
       o.id,
       'delivery',
       'credit',
       COALESCE(
         NULLIF(ol.assigned_fee_idr, 0),
         NULLIF(o.courier_payout_estimate_idr, 0),
         GREATEST(o.total_price_idr - o.platform_commission_idr, 0),
         0
       )::int,
       'available',
       'earning_credit',
       'Pendapatan pengiriman on-demand',
       jsonb_build_object(
         'source', 'on_demand_pod_verified',
         'order_number', o.order_number,
         'service_code', o.service_code,
         'credited_at', NOW()
       )
     FROM orders o
     JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
     WHERE o.id = $1
       AND ol.courier_id = $2
       AND COALESCE(
         NULLIF(ol.assigned_fee_idr, 0),
         NULLIF(o.courier_payout_estimate_idr, 0),
         GREATEST(o.total_price_idr - o.platform_commission_idr, 0),
         0
       ) > 0
       AND NOT EXISTS (
         SELECT 1
         FROM courier_earnings_ledger cel
         WHERE cel.order_id = o.id
           AND cel.courier_id = $2
           AND cel.source = 'delivery'
           AND cel.direction = 'credit'
           AND COALESCE(cel.transaction_type, 'earning_credit') = 'earning_credit'
       )
     RETURNING id, amount_idr`,
    [orderId, courierId]
  );

  if (result.rows[0]) return result.rows[0];

  const existing = await client.query(
    `SELECT id, amount_idr
     FROM courier_earnings_ledger
     WHERE order_id = $1
       AND courier_id = $2
       AND source = 'delivery'
       AND direction = 'credit'
       AND COALESCE(transaction_type, 'earning_credit') = 'earning_credit'
     ORDER BY created_at DESC
     LIMIT 1`,
    [orderId, courierId]
  );

  return existing.rows[0] || null;
};

const normalizeFaceVerificationType = (value: unknown) => {
  const verificationType = String(value || 'pickup').trim().toLowerCase();
  if (verificationType === 'pod' || verificationType === 'delivery_pod') return 'delivery';
  if (verificationType === 'registration') return 'registration';
  return verificationType === 'delivery' ? 'delivery' : 'pickup';
};

export const verifyMobileCourierFace = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const verificationType = normalizeFaceVerificationType(req.body?.verification_type || req.body?.verificationType);
  const orderId = req.body?.order_id || req.body?.orderId ? String(req.body?.order_id || req.body?.orderId).trim() : null;
  const challengeCode = req.body?.challenge_code || req.body?.challengeCode ? String(req.body?.challenge_code || req.body?.challengeCode).trim() : null;
  const livenessScore = req.body?.liveness_score || req.body?.livenessScore ? Number(req.body?.liveness_score || req.body?.livenessScore) : null;

  if (!req.file) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Foto wajah wajib dikirim untuk verifikasi.',
      code: 'ERR_FACE_PHOTO_REQUIRED',
    });
    return;
  }

  const provider = String(process.env.FACE_VERIFICATION_PROVIDER || '').trim();
  const devBypassAllowed = process.env.NODE_ENV !== 'production' && process.env.FACE_VERIFICATION_DEV_BYPASS === 'true';
  const minimumScore = Number(process.env.FACE_VERIFICATION_MIN_SCORE || 0.75);
  const canVerifyLocally = devBypassAllowed && (livenessScore == null || livenessScore >= minimumScore);
  const status = provider
    ? (canVerifyLocally ? 'verified' : 'pending_review')
    : (canVerifyLocally ? 'verified' : 'provider_required');
  const savedUpload = saveSecureUploadBuffer(req.file, 'face-verifications');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (orderId) {
      const accessRes = await client.query(
        `SELECT 1
         FROM order_legs
         WHERE order_id = $1
           AND courier_id = $2
         LIMIT 1`,
        [orderId, req.user.id]
      );
      if (accessRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(403).json({
          success: false,
          data: null,
          message: 'Order tidak tersedia untuk akun kurir ini.',
          code: 'ERR_ORDER_FORBIDDEN',
        });
        return;
      }
    }

    const insertRes = await client.query(
      `INSERT INTO courier_face_verifications (
         courier_id,
         order_id,
         verification_type,
         status,
         provider,
         liveness_score,
         image_url,
         image_checksum_sha256,
         challenge_code_hash,
         failure_reason,
         metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, status, created_at`,
      [
        req.user.id,
        orderId,
        verificationType,
        status,
        provider || (devBypassAllowed ? 'non_production_device_check' : 'provider_required'),
        Number.isFinite(livenessScore) ? livenessScore : null,
        savedUpload.fileUrl,
        req.file.checksumSha256 || sha256(savedUpload.fileUrl),
        challengeCode ? sha256(challengeCode) : null,
        status === 'provider_required' ? 'FACE_VERIFICATION_PROVIDER is not configured' : null,
        JSON.stringify({
          source: 'courier_mobile',
          mime_type: req.file.detectedMimeType,
          file_size_bytes: req.file.size,
          dev_bypass: devBypassAllowed,
        }),
      ]
    );

    if (status === 'verified') {
      await client.query(
        `UPDATE courier_profiles
            SET face_enrolled = TRUE,
                face_verified_at = NOW(),
                face_liveness_score = COALESCE($2, face_liveness_score),
                updated_at = NOW()
          WHERE user_id = $1`,
        [req.user.id, Number.isFinite(livenessScore) ? livenessScore : null]
      );
    }

    await client.query('COMMIT');

    const responseStatus = status === 'provider_required' ? 503 : 200;
    res.status(responseStatus).json({
      success: status === 'verified',
      data: {
        verification_id: insertRes.rows[0].id,
        status: insertRes.rows[0].status,
        verification_type: verificationType,
        order_id: orderId,
        created_at: insertRes.rows[0].created_at,
      },
      message: status === 'verified'
        ? 'Verifikasi wajah berhasil.'
        : status === 'pending_review'
          ? 'Verifikasi wajah menunggu review provider.'
          : 'Provider verifikasi wajah belum dikonfigurasi.',
      code: status === 'provider_required' ? 'ERR_FACE_PROVIDER_REQUIRED' : undefined,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Verify mobile courier face error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
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
  spoofRisk,
  faceVerificationId,
  packageCode,
  overrideReason,
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
  spoofRisk?: string | null;
  faceVerificationId?: string | null;
  packageCode?: string | null;
  overrideReason?: string | null;
}) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const writeProofAttempt = async (
    client: any,
    status: 'accepted' | 'rejected',
    reason: string | null,
    distanceM?: number | null,
    policySnapshot: Record<string, unknown> = {},
    manualReviewRequired = false
  ) => {
    await client.query(
      `INSERT INTO courier_proof_attempts (
         order_id,
         courier_id,
         service_code,
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
         face_verification_id,
         override_reason,
         manual_review_required,
         policy_snapshot
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        orderId,
        req.user?.id,
        policySnapshot.service_code || null,
        step,
        status,
        reason,
        distanceM ?? null,
        policySnapshot.radius_m || ON_DEMAND_GEOFENCE_RADIUS_M,
        latitude,
        longitude,
        accuracy,
        spoofRisk || 'normal',
        barcodeValue || null,
        photoUrl || null,
        faceVerificationId || null,
        overrideReason || null,
        manualReviewRequired,
        JSON.stringify(policySnapshot),
      ]
    );
  };

  const writeRejectedProofAttempt = async (reason: string, distanceM?: number | null) => {
    const auditClient = await db.connect();
    try {
      await writeProofAttempt(auditClient, 'rejected', reason, distanceM ?? null);
    } catch (error) {
      console.warn('Failed to write proof attempt audit:', error);
    } finally {
      auditClient.release();
    }
  };

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT
         o.id,
         o.customer_id,
         o.order_number,
         o.status,
         o.model,
         o.service_code,
         ol.id AS leg_id,
         ol.status AS leg_status,
         COALESCE(dsp.proof_geofence_radius_m, $6)::int AS proof_geofence_radius_m,
         COALESCE(dsp.proof_min_accuracy_m, $7)::int AS proof_min_accuracy_m,
         COALESCE(dsp.proof_gps_override_policy, '{}'::jsonb) AS proof_gps_override_policy,
         COALESCE(dsp.face_verification_required, TRUE) AS face_verification_required,
         COALESCE(dsp.pod_label, 'POD') AS pod_label,
         ST_Distance(
           CASE WHEN $2 = 'pickup' THEN o.pickup_location ELSE o.dropoff_location END,
           ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
         )::int AS distance_m
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       JOIN courier_profiles cp ON cp.user_id = ol.courier_id
       LEFT JOIN delivery_service_products dsp ON dsp.code = o.service_code
       WHERE o.id = $1
         AND ol.courier_id = $5
         AND cp.application_channel = 'on_demand'
         AND LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
       LIMIT 1
       FOR UPDATE OF o, ol`,
      [orderId, step, longitude, latitude, req.user.id, ON_DEMAND_GEOFENCE_RADIUS_M, ON_DEMAND_MAX_ACCURACY_M]
    );

    const order = orderRes.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('order_not_found', null);
      res.status(404).json({
        success: false,
        data: null,
        message: 'Order on-demand tidak ditemukan untuk kurir ini.',
        code: 'ERR_ORDER_NOT_FOUND',
      });
      return;
    }

    const proofRadiusM = Math.min(
      normalizeProofPolicyNumber(order.proof_geofence_radius_m, ON_DEMAND_GEOFENCE_RADIUS_M, 1, 100),
      10
    );
    const proofMinAccuracyM = normalizeProofPolicyNumber(order.proof_min_accuracy_m, ON_DEMAND_MAX_ACCURACY_M, 1, 500);
    const gpsOverridePolicy = normalizeGpsOverridePolicy(order.proof_gps_override_policy);
    const faceRequired = order.face_verification_required !== false;
    const normalizedSpoofRisk = String(spoofRisk || 'normal').trim().toLowerCase();
    const policySnapshot = {
      service_code: order.service_code || null,
      radius_m: proofRadiusM,
      min_accuracy_m: proofMinAccuracyM,
      gps_override_policy: gpsOverridePolicy,
      face_verification_required: faceRequired,
      pod_label: order.pod_label || 'POD',
    };

    if (accuracy != null && accuracy > proofMinAccuracyM) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('location_accuracy_low', null);
      res.status(422).json({
        success: false,
        data: {
          accuracy_m: accuracy,
          max_accuracy_m: proofMinAccuracyM,
        },
        message: 'Akurasi lokasi belum cukup. Tunggu beberapa detik lalu coba lagi.',
        code: 'ERR_LOCATION_ACCURACY_LOW',
      });
      return;
    }

    let manualReviewRequired = false;
    const distanceM = Number(order.distance_m || 0);
    if (distanceM > proofRadiusM) {
      const softRadiusM = normalizeProofPolicyNumber(gpsOverridePolicy.soft_radius_m, DEFAULT_GPS_OVERRIDE_POLICY.soft_radius_m, proofRadiusM, 100);
      const overrideMaxAccuracyM = normalizeProofPolicyNumber(gpsOverridePolicy.max_accuracy_m, DEFAULT_GPS_OVERRIDE_POLICY.max_accuracy_m, proofMinAccuracyM, 500);
      const canOverrideDistance = gpsOverridePolicy.enabled === true
        && !HIGH_RISK_SPOOF_SIGNALS.has(normalizedSpoofRisk)
        && distanceM <= softRadiusM
        && (accuracy == null || accuracy <= overrideMaxAccuracyM)
        && (gpsOverridePolicy.requires_reason !== true || Boolean(overrideReason?.trim()));

      if (canOverrideDistance) {
        manualReviewRequired = gpsOverridePolicy.manual_review_required !== false;
      } else {
        await client.query('ROLLBACK');
        await writeRejectedProofAttempt('outside_geofence', distanceM);
        res.status(422).json({
          success: false,
          data: { distance_m: distanceM, radius_m: proofRadiusM },
          message: step === 'pickup'
            ? 'Anda belum berada di titik pickup. Dekati lokasi pengambilan untuk melanjutkan.'
            : 'Anda belum berada di titik tujuan. Penyelesaian paket hanya bisa dilakukan di lokasi penerima.',
          code: 'ERR_OUTSIDE_GEOFENCE',
        });
        return;
      }
    }

    const faceCheckRequiredForProof = faceRequired && (step === 'delivery' || Boolean(photoUrl));
    if (faceCheckRequiredForProof) {
      const verifiedFaceRes = faceVerificationId
        ? await client.query(
            `SELECT id
             FROM courier_face_verifications
             WHERE id = $1
               AND courier_id = $2
               AND verification_type = $3
               AND status = 'verified'
               AND (order_id = $4 OR order_id IS NULL)
             LIMIT 1`,
            [faceVerificationId, req.user.id, step, orderId]
          )
        : { rows: [] };

      if (verifiedFaceRes.rows.length === 0) {
        await client.query('ROLLBACK');
        await writeRejectedProofAttempt('face_verification_required', distanceM);
        res.status(403).json({
          success: false,
          data: {
            face_verification_required: true,
            verification_type: step,
          },
          message: 'Verifikasi wajah wajib dilakukan sebelum bukti pickup/POD dikirim.',
          code: 'ERR_FACE_VERIFICATION_REQUIRED',
        });
        return;
      }
    }

    if (HIGH_RISK_SPOOF_SIGNALS.has(normalizedSpoofRisk)) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('high_spoof_risk', distanceM);
      res.status(422).json({
        success: false,
        data: { spoof_risk: normalizedSpoofRisk },
        message: 'Perangkat atau lokasi terdeteksi tidak aman. Gunakan perangkat operasional yang valid.',
        code: 'ERR_HIGH_SPOOF_RISK',
      });
      return;
    }

    const currentStatus = String(order.status || '').toLowerCase();
    if (step === 'pickup' && ['delivered', 'completed', 'cancelled', 'failed'].includes(currentStatus)) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('invalid_pickup_status', distanceM);
      res.status(409).json({ success: false, data: null, message: 'Order ini sudah tidak bisa diverifikasi pickup.', code: 'ERR_INVALID_STATUS' });
      return;
    }
    if (step === 'delivery' && !['picked_up', 'in_transit'].includes(currentStatus)) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('pickup_required', distanceM);
      res.status(409).json({
        success: false,
        data: null,
        message: 'Verifikasi pickup harus selesai sebelum POD dikirim.',
        code: 'ERR_PICKUP_REQUIRED',
      });
      return;
    }

    if (step === 'pickup' && !barcodeValue && !photoUrl) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('pickup_evidence_required', distanceM);
      res.status(400).json({
        success: false,
        data: null,
        message: 'Scan/input kode atau foto barang wajib dikirim untuk verifikasi pickup.',
        code: 'ERR_PICKUP_EVIDENCE_REQUIRED',
      });
      return;
    }

    if (step === 'delivery' && !photoUrl) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('pod_photo_required', distanceM);
      res.status(400).json({
        success: false,
        data: null,
        message: 'Foto POD wajib dikirim untuk menyelesaikan pengiriman.',
        code: 'ERR_POD_PHOTO_REQUIRED',
      });
      return;
    }

    const packageSummaryRes = await client.query(
      `SELECT COUNT(*)::int AS total_packages
       FROM order_packages
       WHERE order_id = $1`,
      [orderId]
    );
    const totalPackages = Number(packageSummaryRes.rows[0]?.total_packages || 0);
    const normalizedPackageCode = String(packageCode || barcodeValue || '').trim();
    if (totalPackages > 1 && !normalizedPackageCode) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('package_code_required', distanceM);
      res.status(400).json({
        success: false,
        data: { package_count: totalPackages },
        message: 'Kode paket wajib dikirim untuk order dengan lebih dari satu paket.',
        code: 'ERR_PACKAGE_CODE_REQUIRED',
      });
      return;
    }

    const packageRes = normalizedPackageCode
      ? await client.query(
          `SELECT id, package_code
           FROM order_packages
           WHERE order_id = $1
             AND package_code = $2
           LIMIT 1`,
          [orderId, normalizedPackageCode]
        )
      : totalPackages === 1
        ? await client.query(
            `SELECT id, package_code
             FROM order_packages
             WHERE order_id = $1
             ORDER BY package_index ASC
             LIMIT 1`,
            [orderId]
          )
      : { rows: [] };
    if (normalizedPackageCode && totalPackages > 0 && packageRes.rows.length === 0) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('package_code_not_found', distanceM);
      res.status(404).json({
        success: false,
        data: { package_code: normalizedPackageCode },
        message: 'Kode paket tidak terdaftar pada order ini.',
        code: 'ERR_PACKAGE_CODE_NOT_FOUND',
      });
      return;
    }
    const packageId = packageRes.rows[0]?.id || null;

    const scanType = step === 'pickup'
      ? (photoUrl ? 'pickup_photo' : 'pickup_scan')
      : 'pod';
    const scanRes = await client.query(
      `INSERT INTO package_scans (
         order_id,
         package_id,
         scanned_by,
         scanned_by_role,
         scan_type,
         image_urls,
         photo_url,
         latitude,
         longitude,
         location_accuracy_m,
         scan_location,
         override_reason,
         face_verification_id
       )
       VALUES (
         $1,
         $2,
         $3,
         'courier',
         $4,
         CASE WHEN $5::text IS NULL THEN NULL ELSE ARRAY[$5::text] END,
         $5,
         $6,
         $7,
         $8,
         ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography,
         $9,
         $10
       )
       RETURNING id, COALESCE(scanned_at, created_at, NOW()) AS recorded_at`,
      [
        orderId,
        packageId,
        req.user.id,
        scanType,
        photoUrl || null,
        latitude,
        longitude,
        accuracy,
        overrideReason || (barcodeValue ? `barcode:${barcodeValue}` : null),
        faceVerificationId || null,
      ]
    );

    if (packageId) {
      if (scanType === 'pickup_scan') {
        await client.query(
          `UPDATE order_packages
              SET status = CASE
                    WHEN pickup_photo_verified_at IS NOT NULL THEN 'pickup_verified'
                    ELSE 'pickup_scanned'
                  END,
                  pickup_scan_verified_at = COALESCE(pickup_scan_verified_at, NOW()),
                  updated_at = NOW()
            WHERE id = $1`,
          [packageId]
        );
      } else if (scanType === 'pickup_photo') {
        await client.query(
          `UPDATE order_packages
              SET status = CASE
                    WHEN pickup_scan_verified_at IS NOT NULL THEN 'pickup_verified'
                    ELSE status
                  END,
                  pickup_photo_verified_at = COALESCE(pickup_photo_verified_at, NOW()),
                  updated_at = NOW()
            WHERE id = $1`,
          [packageId]
        );
      } else if (scanType === 'pod') {
        await client.query(
          `UPDATE order_packages
              SET status = 'delivered',
                  delivery_pod_verified_at = COALESCE(delivery_pod_verified_at, NOW()),
                  updated_at = NOW()
            WHERE id = $1`,
          [packageId]
        );
      }
    }

    const pickupProofRes = step === 'pickup'
      ? await client.query(
          `SELECT
             CASE
               WHEN COUNT(op.id) > 0
               THEN COUNT(op.id) = COUNT(op.id) FILTER (WHERE op.pickup_scan_verified_at IS NOT NULL)
               ELSE EXISTS (
                 SELECT 1 FROM package_scans
                 WHERE order_id = $1
                   AND scan_type IN ('pickup_scan', 'pickup')
               )
             END AS has_scan,
             CASE
               WHEN COUNT(op.id) > 0
               THEN COUNT(op.id) = COUNT(op.id) FILTER (WHERE op.pickup_photo_verified_at IS NOT NULL)
               ELSE EXISTS (
                 SELECT 1 FROM package_scans
                 WHERE order_id = $1
                   AND scan_type = 'pickup_photo'
               )
             END AS has_photo
           FROM order_packages op
           WHERE op.order_id = $1`,
          [orderId]
        )
      : null;

    const pickupScanVerified = Boolean(pickupProofRes?.rows[0]?.has_scan);
    const pickupPhotoVerified = Boolean(pickupProofRes?.rows[0]?.has_photo);
    const pickupComplete = step === 'pickup' && pickupScanVerified && pickupPhotoVerified;
    const deliveryProofRes = step === 'delivery'
      ? await client.query(
          `SELECT
             CASE
               WHEN COUNT(id) > 0
               THEN COUNT(id) = COUNT(id) FILTER (WHERE delivery_pod_verified_at IS NOT NULL)
               ELSE TRUE
             END AS complete
           FROM order_packages
           WHERE order_id = $1`,
          [orderId]
        )
      : null;
    const deliveryComplete = step === 'delivery' && Boolean(deliveryProofRes?.rows[0]?.complete);
    const nextStatus = step === 'delivery'
      ? (deliveryComplete ? 'delivered' : currentStatus)
      : (pickupComplete ? 'in_transit' : currentStatus);

    if (deliveryComplete || pickupComplete) {
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
    }

    const earningCredit = deliveryComplete
      ? await creditCourierDeliveryEarning(client, orderId, req.user.id)
      : null;

    const eventType = step === 'delivery'
      ? (deliveryComplete ? 'pod_verified' : 'pod_package_verified')
      : (pickupComplete ? 'pickup_verified' : (photoUrl ? 'pickup_photo_uploaded' : 'pickup_scan_verified'));
    const eventDescription = step === 'delivery'
      ? (deliveryComplete
          ? 'Courier verified on-demand delivery POD at geofence'
          : 'Courier verified one package POD at geofence')
      : (pickupComplete
          ? 'Courier completed on-demand pickup evidence at geofence'
          : (photoUrl ? 'Courier uploaded on-demand pickup photo at geofence' : 'Courier verified on-demand pickup scan at geofence'));

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        orderId,
        req.user.id,
        eventType,
        eventDescription,
        JSON.stringify({
          distance_m: distanceM,
          accuracy_m: accuracy,
          barcode_value: barcodeValue || null,
          package_code: normalizedPackageCode || packageRes.rows[0]?.package_code || null,
          package_id: packageId,
          photo_url: photoUrl || null,
          spoof_risk: spoofRisk || 'normal',
          face_verification_id: faceVerificationId || null,
          manual_review_required: manualReviewRequired,
          policy_snapshot: policySnapshot,
          pickup_scan_verified: pickupScanVerified,
          pickup_photo_verified: pickupPhotoVerified,
          pickup_complete: pickupComplete,
          delivery_complete: deliveryComplete,
          earning_ledger_id: earningCredit?.id || null,
          earning_amount_idr: earningCredit?.amount_idr || null,
        }),
      ]
    );

    if (pickupComplete) {
      await client.query(
        `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
         VALUES ($1, $2, 'delivery_started', 'Courier started on-demand delivery after pickup evidence completed', $3)`,
        [
          orderId,
          req.user.id,
          JSON.stringify({
            distance_m: distanceM,
            accuracy_m: accuracy,
            pickup_scan_verified: pickupScanVerified,
            pickup_photo_verified: pickupPhotoVerified,
            source: 'courier_app',
          }),
        ]
      );
    }

    await writeProofAttempt(client, 'accepted', null, distanceM, policySnapshot, manualReviewRequired);

    await client.query('COMMIT');
    const realtimeEvent = step === 'delivery'
      ? (deliveryComplete ? ON_DEMAND_REALTIME_EVENTS.POD_COMPLETED : ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED)
      : (pickupComplete ? ON_DEMAND_REALTIME_EVENTS.PICKUP_VERIFIED : (photoUrl ? ON_DEMAND_REALTIME_EVENTS.PICKUP_VERIFIED : ON_DEMAND_REALTIME_EVENTS.PICKUP_VERIFIED));
    emitOnDemandRealtime(realtimeEvent, {
      order_id: orderId,
      order_number: order.order_number || null,
      customer_id: order.customer_id,
      courier_user_id: req.user.id,
      status: nextStatus,
      stage: step === 'delivery' ? (deliveryComplete ? 'pod_completed' : 'pod_package_verified') : (pickupComplete ? 'delivery_started' : 'pickup_validation'),
      location: {
        latitude,
        longitude,
        accuracy: accuracy || undefined,
        timestamp: new Date().toISOString(),
      },
      proof: {
        scan_id: scanRes.rows[0]?.id,
        scan_type: scanType,
        photo_url: photoUrl || null,
        barcode_value: barcodeValue || null,
        package_id: packageId,
        package_code: normalizedPackageCode || packageRes.rows[0]?.package_code || null,
        pickup_scan_verified: pickupScanVerified,
        pickup_photo_verified: pickupPhotoVerified,
        pickup_complete: pickupComplete,
        delivery_complete: deliveryComplete,
      },
      metadata: {
        earning_ledger_id: earningCredit?.id || null,
        earning_amount_idr: earningCredit?.amount_idr || null,
      },
    });
    if (pickupComplete) {
      emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.DELIVERY_STARTED, {
        order_id: orderId,
        order_number: order.order_number || null,
        customer_id: order.customer_id,
        courier_user_id: req.user.id,
        status: nextStatus,
        stage: 'delivery_started',
        metadata: {
          pickup_scan_verified: pickupScanVerified,
          pickup_photo_verified: pickupPhotoVerified,
        },
      });
    }

    if (order.customer_id && (deliveryComplete || pickupComplete)) {
      try {
        await createNotification({
          user_id: order.customer_id,
          title: step === 'delivery' ? 'Paket sudah diterima' : 'Barang sudah diambil',
          body: step === 'delivery'
            ? 'Pengiriman selesai. Bukti serah terima sudah tersedia di detail order.'
            : 'Kurir sudah mengambil barang dan sedang menuju lokasi tujuan.',
          type: step === 'delivery' ? 'delivery_completed' : 'delivery_started',
          order_id: orderId,
          deep_link: `/orders/${orderId}`,
          metadata: {
            order_number: order.order_number || '',
            status: nextStatus,
            pickup_scan_verified: pickupScanVerified,
            pickup_photo_verified: pickupPhotoVerified,
            earning_ledger_id: earningCredit?.id || null,
            earning_amount_idr: earningCredit?.amount_idr || null,
          },
        });
      } catch (notificationError) {
        console.warn('Failed to notify customer about on-demand step:', notificationError);
      }
    }

    res.json({
      success: true,
      data: {
        scan_id: scanRes.rows[0]?.id,
        order_id: orderId,
        status: nextStatus,
        scan_type: scanType,
        distance_m: distanceM,
        package_id: packageId,
        package_code: normalizedPackageCode || packageRes.rows[0]?.package_code || null,
        pickup_scan_verified: pickupScanVerified,
        pickup_photo_verified: pickupPhotoVerified,
        pickup_complete: pickupComplete,
        delivery_complete: deliveryComplete,
        manual_review_required: manualReviewRequired,
        earning_ledger_id: earningCredit?.id || null,
        earning_amount_idr: earningCredit?.amount_idr || null,
        recorded_at: scanRes.rows[0]?.recorded_at || new Date().toISOString(),
      },
      message: step === 'delivery'
        ? (deliveryComplete ? 'Pengiriman berhasil diselesaikan.' : 'POD paket tersimpan. Selesaikan POD paket lainnya.')
        : (pickupComplete
            ? 'Pickup lengkap. Pengantaran bisa dimulai.'
            : (photoUrl ? 'Foto barang tersimpan. Scan/input kode paket masih wajib.' : 'Scan/input kode tersimpan. Foto barang pickup masih wajib.')),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Verify on-demand courier step error:', error);
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
    spoofRisk: req.body?.spoof_risk || req.body?.spoofRisk || null,
    faceVerificationId: req.body?.face_verification_id || req.body?.faceVerificationId || null,
    packageCode: req.body?.package_code || req.body?.packageCode || null,
    overrideReason: req.body?.override_reason || req.body?.overrideReason || null,
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

  const savedUpload = saveSecureUploadBuffer(req.file, 'pod');

  const proofType = String(req.body?.proof_type || req.body?.proofType || 'delivery').toLowerCase();
  const pickupProofTypes = new Set(['pickup', 'pickup_photo', 'pickup_scan']);
  const deliveryProofTypes = new Set(['delivery', 'pod', 'delivery_pod', 'delivery_pod_photo', 'delivery_signature']);

  if (!pickupProofTypes.has(proofType) && !deliveryProofTypes.has(proofType)) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Tipe bukti tidak dikenali.',
      code: 'ERR_INVALID_PROOF_TYPE',
    });
    return;
  }

  await verifyOnDemandStep({
    req,
    res,
    orderId,
    step: pickupProofTypes.has(proofType) ? 'pickup' : 'delivery',
    latitude,
    longitude,
    accuracy,
    barcodeValue: req.body?.barcode_value || req.body?.barcodeValue || null,
    photoUrl: savedUpload.fileUrl,
    spoofRisk: req.body?.spoof_risk || req.body?.spoofRisk || null,
    faceVerificationId: req.body?.face_verification_id || req.body?.faceVerificationId || null,
    packageCode: req.body?.package_code || req.body?.packageCode || null,
    overrideReason: req.body?.override_reason || req.body?.overrideReason || null,
  });
};

export const getMobileCourierPickupCancellationReasons = async (_req: Request, res: Response) => {
  const reasonsRes = await db.query(
    `SELECT code, title, description, updated_at
       FROM courier_pickup_cancellation_reasons
      WHERE is_active = TRUE
      ORDER BY display_order ASC, title ASC`
  );

  if (!reasonsRes.rows.length) {
    res.status(503).json({
      success: false,
      data: null,
      message: 'Konfigurasi alasan pembatalan pickup belum tersedia.',
      code: 'ERR_PICKUP_CANCEL_REASONS_NOT_CONFIGURED',
    });
    return;
  }

  res.json({
    success: true,
    data: reasonsRes.rows.map((row) => ({
      code: row.code,
      title: row.title,
      description: row.description,
    })),
    cache_ttl_seconds: 300,
    version: reasonsRes.rows
      .map((row) => row.updated_at)
      .filter(Boolean)
      .sort()
      .pop() || null,
    message: 'Alasan pembatalan pickup tersedia.',
  });
};

export const getMobileCourierStatusTransitions = async (req: Request, res: Response) => {
  const workflowRole = String(req.query.workflow_role || req.query.workflowRole || 'on_demand').trim().toLowerCase();
  const currentStatus = String(req.query.current_status || req.query.currentStatus || '').trim().toLowerCase();

  if (!workflowRole) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Workflow role wajib dikirim.',
      code: 'ERR_BAD_REQUEST',
    });
    return;
  }

  const params: string[] = [workflowRole];
  const currentStatusClause = currentStatus ? 'AND from_status = $2' : '';
  if (currentStatus) params.push(currentStatus);

  const transitionsRes = await db.query(
      `SELECT
        workflow_role,
        from_status,
        to_status,
        label,
        description,
        requires_proof,
        requires_admin,
        display_order,
        version,
        updated_at
       FROM status_transition_policies
      WHERE workflow_role = $1
        AND is_active = TRUE
        AND requires_admin = FALSE
        ${currentStatusClause}
      ORDER BY from_status ASC, display_order ASC, label ASC`,
    params
  );

  if (!transitionsRes.rows.length) {
    res.status(503).json({
      success: false,
      data: null,
      message: 'Konfigurasi transisi status order belum tersedia.',
      code: 'ERR_STATUS_TRANSITIONS_NOT_CONFIGURED',
    });
    return;
  }

  res.json({
    success: true,
    data: transitionsRes.rows.map((row) => ({
      workflow_role: row.workflow_role,
      from_status: row.from_status,
      to_status: row.to_status,
      label: row.label,
      description: row.description,
      requires_proof: row.requires_proof,
      requires_admin: row.requires_admin,
      display_order: Number(row.display_order || 0),
      version: Number(row.version || 1),
    })),
    cache_ttl_seconds: 300,
    version: transitionsRes.rows
      .map((row) => row.updated_at)
      .filter(Boolean)
      .sort()
      .pop() || null,
    message: 'Transisi status order tersedia.',
  });
};

export const updateMobileCourierOrderStatus = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const orderId = String(req.body?.order_id || req.body?.orderId || '').trim();
  const requestedStatus = String(req.body?.status || '').trim().toLowerCase();
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;

  if (!orderId || !requestedStatus) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Order dan status tujuan wajib dikirim.',
      code: 'ERR_BAD_REQUEST',
    });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT
          o.id AS order_id,
          o.order_number,
          o.customer_id,
          o.model,
          o.status AS order_status,
          o.service_code,
          o.batch_id,
          ol.id AS leg_id,
          ol.status AS leg_status,
          COALESCE(dsp.service_category, '') AS service_category,
          COALESCE(dsp.failed_delivery_policy, CASE WHEN COALESCE(dsp.service_category, '') = 'regular' THEN 'reschedule_then_return' ELSE 'must_deliver' END) AS failed_delivery_policy,
          COALESCE(dsp.regular_max_reschedule_attempts, 3)::int AS regular_max_reschedule_attempts,
          CASE
            WHEN COALESCE(dsp.service_category, '') = 'on_demand' THEN 'on_demand'
            WHEN LOWER(o.model) = 'p2p' THEN 'regular'
            WHEN ol.leg_number = 1 THEN 'pickup'
            WHEN ol.leg_number > 1 THEN 'delivery'
            ELSE 'network'
          END AS workflow_role
         FROM order_legs ol
         JOIN orders o ON o.id = ol.order_id
         LEFT JOIN delivery_service_products dsp ON dsp.code = o.service_code
        WHERE o.id = $1
          AND ol.courier_id = $2
        ORDER BY ol.leg_number ASC
        LIMIT 1
        FOR UPDATE`,
      [orderId, req.user.id]
    );

    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        data: null,
        message: 'Order tidak ditemukan untuk kurir ini.',
        code: 'ERR_ORDER_NOT_FOUND',
      });
      return;
    }

    const order = orderRes.rows[0];
    const workflowRole = String(order.workflow_role || 'network');
    const currentStatus = String(order.leg_status || order.order_status || '').toLowerCase();
    const failedDeliveryPolicy = String(order.failed_delivery_policy || '').toLowerCase();

    if (workflowRole === 'on_demand' && ['failed', 'return_required', 'returned', 'reschedule_required', 'delivery_rescheduled'].includes(requestedStatus)) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: {
          failed_delivery_policy: failedDeliveryPolicy || 'must_deliver',
        },
        message: 'Order on-demand wajib diselesaikan sampai terkirim. Laporkan kendala melalui fitur bantuan/SOS, bukan status gagal atau return.',
        code: 'ERR_ON_DEMAND_MUST_DELIVER',
      });
      return;
    }

    let effectiveRequestedStatus = requestedStatus;
    let regularFailedAttempt = 0;
    if (workflowRole === 'regular' && requestedStatus === 'failed') {
      const attemptRes = await client.query(
        `SELECT COUNT(*)::int AS attempts
         FROM order_events
         WHERE order_id = $1
           AND event_type IN ('regular_delivery_failed', 'delivery_rescheduled')`,
        [orderId]
      );
      regularFailedAttempt = Number(attemptRes.rows[0]?.attempts || 0) + 1;
      const maxAttempts = Number(order.regular_max_reschedule_attempts || 3);
      effectiveRequestedStatus = regularFailedAttempt >= maxAttempts ? 'return_required' : 'delivery_rescheduled';
    }

    const configuredRes = await client.query(
      `SELECT COUNT(*)::int AS total
         FROM status_transition_policies
        WHERE workflow_role = $1
          AND from_status = $2
          AND is_active = TRUE
          AND requires_admin = FALSE`,
      [workflowRole, currentStatus]
    );

    if (Number(configuredRes.rows[0]?.total || 0) === 0) {
      await client.query('ROLLBACK');
      res.status(503).json({
        success: false,
        data: null,
        message: 'Policy transisi status untuk status order saat ini belum dikonfigurasi.',
        code: 'ERR_STATUS_TRANSITION_POLICY_MISSING',
      });
      return;
    }

    const policyRes = await client.query(
      `SELECT to_status, label, requires_proof
         FROM status_transition_policies
        WHERE workflow_role = $1
          AND from_status = $2
          AND to_status = $3
          AND is_active = TRUE
          AND requires_admin = FALSE
        LIMIT 1`,
      [workflowRole, currentStatus, effectiveRequestedStatus]
    );

    if (!policyRes.rows.length) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        data: null,
        message: 'Transisi status tidak diizinkan oleh policy operasional.',
        code: 'ERR_STATUS_TRANSITION_NOT_ALLOWED',
      });
      return;
    }

    const policy = policyRes.rows[0];
    if (policy.requires_proof) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: null,
        message: 'Status ini wajib diperbarui lewat flow bukti pickup/POD, bukan update manual.',
        code: 'ERR_STATUS_REQUIRES_PROOF',
      });
      return;
    }

    const pickupStatuses = ['going_to_pickup', 'pickup_pending', 'picked_up', 'in_transit'];
    const isPickupStatus = pickupStatuses.includes(effectiveRequestedStatus);

    if (isPickupStatus && order.batch_id) {
      await client.query(
        `UPDATE order_legs
            SET status = $2,
                started_at = CASE WHEN $2 IN ('picked_up', 'in_transit') THEN COALESCE(started_at, NOW()) ELSE started_at END,
                completed_at = CASE WHEN $2 IN ('delivered', 'failed', 'return_required') THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
                updated_at = NOW()
          WHERE courier_id = $3 AND order_id IN (SELECT id FROM orders WHERE batch_id = $1)`,
        [order.batch_id, effectiveRequestedStatus, req.user.id]
      );

      await client.query(
        `UPDATE orders
            SET status = $2,
                picked_up_at = CASE WHEN $2 IN ('picked_up', 'in_transit') THEN COALESCE(picked_up_at, NOW()) ELSE picked_up_at END,
                delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
                updated_at = NOW()
          WHERE batch_id = $1`,
        [order.batch_id, effectiveRequestedStatus]
      );
    } else {
      await client.query(
        `UPDATE order_legs
            SET status = $2,
                started_at = CASE WHEN $2 IN ('picked_up', 'in_transit') THEN COALESCE(started_at, NOW()) ELSE started_at END,
                completed_at = CASE WHEN $2 IN ('delivered', 'failed', 'return_required') THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
                updated_at = NOW()
          WHERE id = $1`,
        [order.leg_id, effectiveRequestedStatus]
      );

      await client.query(
        `UPDATE orders
            SET status = $2,
                picked_up_at = CASE WHEN $2 IN ('picked_up', 'in_transit') THEN COALESCE(picked_up_at, NOW()) ELSE picked_up_at END,
                delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
                updated_at = NOW()
          WHERE id = $1`,
        [orderId, effectiveRequestedStatus]
      );
    }

    const statusEventType = workflowRole === 'regular' && requestedStatus === 'failed'
      ? (effectiveRequestedStatus === 'return_required' ? 'return_required' : 'delivery_rescheduled')
      : 'courier_status_updated';

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        orderId,
        req.user.id,
        statusEventType,
        `Courier updated status from ${currentStatus} to ${effectiveRequestedStatus}`,
        JSON.stringify({
          from_status: currentStatus,
          requested_status: requestedStatus,
          to_status: effectiveRequestedStatus,
          workflow_role: workflowRole,
          policy_label: policy.label,
          failed_delivery_policy: failedDeliveryPolicy || null,
          regular_failed_attempt: regularFailedAttempt || null,
          regular_max_reschedule_attempts: Number(order.regular_max_reschedule_attempts || 3),
          notes,
          source: 'courier_mobile',
        }),
      ]
    );

    await client.query('COMMIT');

    emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED, {
      order_id: orderId,
      order_number: order.order_number || null,
      customer_id: order.customer_id || null,
      courier_user_id: req.user.id,
      status: effectiveRequestedStatus,
      stage: 'status_updated',
      metadata: {
        from_status: currentStatus,
        requested_status: requestedStatus,
        to_status: effectiveRequestedStatus,
        workflow_role: workflowRole,
        policy_label: policy.label,
      },
    });

    res.json({
      success: true,
      data: true,
      message: 'Status order diperbarui sesuai policy.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Update mobile courier order status error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

export const cancelMobileCourierOnDemandPickup = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const orderId = String(req.params.orderId || req.body?.order_id || req.body?.orderId || '');
  const reasonCode = String(req.body?.reason_code || req.body?.reasonCode || '').trim();
  const reasonNote = req.body?.reason_note || req.body?.reasonNote ? String(req.body?.reason_note || req.body?.reasonNote).trim() : null;
  const latitude = parseCoordinate(req.body?.latitude);
  const longitude = parseCoordinate(req.body?.longitude);
  const accuracy = parseCoordinate(req.body?.accuracy);

  let allowedReasons: Set<string>;
  try {
    const activeReasonRes = await db.query(
      `SELECT code
         FROM courier_pickup_cancellation_reasons
        WHERE is_active = TRUE`
    );
    allowedReasons = new Set(activeReasonRes.rows.map((row) => String(row.code)));
  } catch (_error) {
    res.status(500).json({ success: false, data: null, message: 'Gagal membaca konfigurasi alasan pembatalan pickup.', code: 'ERR_REASON_CONFIG_UNAVAILABLE' });
    return;
  }

  if (!orderId || !reasonCode || !allowedReasons.has(reasonCode)) {
    res.status(400).json({ success: false, data: null, message: 'Alasan pembatalan pickup tidak valid.', code: 'ERR_INVALID_REASON' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ success: false, data: null, message: 'Foto bukti wajib dikirim sebelum pickup dibatalkan.', code: 'ERR_PHOTO_REQUIRED' });
    return;
  }

  const savedUpload = saveSecureUploadBuffer(req.file, 'cancellations');
  const photoUrl = savedUpload.fileUrl;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT
         o.id,
         o.customer_id,
         o.order_number,
         o.status,
         o.model,
         ol.id AS leg_id,
         ol.status AS leg_status
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       JOIN courier_profiles cp ON cp.user_id = ol.courier_id
       WHERE o.id = $1
         AND ol.courier_id = $2
         AND cp.application_channel = 'on_demand'
         AND LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
       LIMIT 1
       FOR UPDATE OF o, ol`,
      [orderId, req.user.id]
    );

    const order = orderRes.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Order on-demand tidak ditemukan untuk kurir ini.', code: 'ERR_ORDER_NOT_FOUND' });
      return;
    }

    const currentStatus = String(order.status || '').toLowerCase();
    if (['picked_up', 'in_transit', 'delivered', 'completed'].includes(currentStatus)) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: null,
        message: 'Pickup sudah selesai. Order wajib dilanjutkan ke pengantaran.',
        code: 'ERR_PICKUP_ALREADY_COMPLETED',
      });
      return;
    }

    const proofRes = await client.query(
      `SELECT id
       FROM package_scans
       WHERE order_id = $1
         AND scan_type IN ('pickup', 'pickup_scan', 'pickup_photo')
       LIMIT 1`,
      [orderId]
    );
    if (proofRes.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: null,
        message: 'Bukti pickup sudah tercatat. Order wajib dilanjutkan ke pengantaran.',
        code: 'ERR_PICKUP_PROOF_EXISTS',
      });
      return;
    }

    const cancellationReason = reasonNote ? `${reasonCode}: ${reasonNote}` : reasonCode;
    await client.query(
      `UPDATE orders
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancellation_reason = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [orderId, cancellationReason]
    );

    await client.query(
      `UPDATE order_legs
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1`,
      [order.leg_id]
    );

    await client.query(
      `UPDATE courier_offer_dispatches
       SET status = CASE WHEN status = 'accepted' THEN 'cancelled' ELSE status END,
           response_reason = COALESCE(response_reason, $3),
           updated_at = NOW()
       WHERE order_id = $1 AND courier_id = $2`,
      [orderId, req.user.id, reasonCode]
    );

    await client.query(
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
         'pickup_cancellation',
         ARRAY[$3::text],
         $3,
         $4,
         $5,
         $6,
         CASE WHEN $4::double precision IS NULL OR $5::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography END,
         $7
       )`,
      [orderId, req.user.id, photoUrl, latitude, longitude, accuracy, cancellationReason]
    );

    await client.query(
      `INSERT INTO courier_safety_events (
         order_id, courier_id, event_type, severity, latitude, longitude, accuracy_m, message, metadata
       )
       VALUES ($1, $2, 'support_request', 'high', $3, $4, $5, $6, $7)`,
      [
        orderId,
        req.user.id,
        latitude,
        longitude,
        accuracy,
        reasonNote || cancellationReason,
        JSON.stringify({
          source: 'courier_app',
          action: 'pickup_cancelled',
          reason_code: reasonCode,
          reason_note: reasonNote,
          photo_url: photoUrl,
          app_surface: 'on_demand_pickup_validation',
        }),
      ]
    );

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, 'pickup_cancelled_by_courier', 'Courier cancelled on-demand pickup before custody transfer', $3)`,
      [
        orderId,
        req.user.id,
        JSON.stringify({
          reason_code: reasonCode,
          reason_note: reasonNote,
          photo_url: photoUrl,
          latitude,
          longitude,
          accuracy_m: accuracy,
          source: 'courier_app',
        }),
      ]
    );

    await notifyAdminOps({
      title: 'Pickup On-Demand Dibatalkan Kurir',
      body: reasonNote || `Alasan: ${reasonCode.replace(/_/g, ' ')}`,
      type: 'courier_pickup_cancelled',
      order_id: orderId,
      metadata: {
        courier_id: req.user.id,
        reason_code: reasonCode,
        reason_note: reasonNote,
        photo_url: photoUrl,
      },
    });

    await client.query('COMMIT');
    emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.PICKUP_CANCELLED, {
      order_id: orderId,
      order_number: order.order_number || null,
      customer_id: order.customer_id,
      courier_user_id: req.user.id,
      status: 'cancelled',
      stage: 'pickup_cancelled',
      location: latitude != null && longitude != null ? {
        latitude,
        longitude,
        accuracy: accuracy || undefined,
        timestamp: new Date().toISOString(),
      } : null,
      proof: {
        proof_type: 'pickup_cancellation',
        reason_code: reasonCode,
        reason_note: reasonNote,
        photo_url: photoUrl,
      },
    });
    if (order.customer_id) {
      try {
        await createNotification({
          user_id: order.customer_id,
          title: 'Pickup belum bisa dilanjutkan',
          body: 'Kurir mengirim alasan dan bukti pembatalan pickup. Tim operasional akan membantu pengecekan.',
          type: 'pickup_cancelled',
          order_id: orderId,
          deep_link: `/orders/${orderId}`,
          metadata: {
            order_number: order.order_number || '',
            reason_code: reasonCode,
            reason_note: reasonNote,
            photo_url: photoUrl,
          },
        });
      } catch (notificationError) {
        console.warn('Failed to notify customer about pickup cancellation:', notificationError);
      }
    }
    res.json({
      success: true,
      data: {
        order_id: orderId,
        status: 'cancelled',
        reason_code: reasonCode,
        photo_url: photoUrl,
      },
      message: 'Pickup dibatalkan. Bukti dan alasan sudah dikirim ke operasional.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Cancel mobile courier on-demand pickup error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};
