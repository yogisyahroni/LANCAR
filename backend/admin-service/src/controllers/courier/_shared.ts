import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';

import { db } from '../../db';
import { createNotification } from '../../notifications';

import crypto from 'crypto';
import axios from 'axios';

import { evaluateCourierPayoutRisk } from '../../services/payoutRiskEngine';
import { decoratePayoutRequest, payoutMobileMessage } from '../../services/payoutStatusPolicy';

import { evaluatePayoutAlerts, writePayoutAuditEvent } from '../../utils/payoutObservability';
import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../../services/onDemandRealtime';

import { evaluateOnDemandRealtimeAlerts } from '../../services/realtimeObservability';
import { buildMapsRouteEtaSnapshot } from '../../services/mapsProviderConfig';

import { isFeatureFlagEnabled } from '../../services/featureFlags';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';

import {
  AuthProtectionError,
  assertAuthAttemptAllowed,
  getRequestIpAddress,
  recordAuthFailure,
  recordAuthSuccess,
  sendAuthProtectionError,
} from '../../security/bruteForceProtection';


import { dispatchNextOnDemandCourier } from './courierOnDemand.controller';

export type CourierLoginRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string;
  status: string;
  pin_hash: string | null;
  vehicle_type: string | null;
  photo_url: string | null;
};

export const COURIER_LOGIN_OTP_REQUIRED_FLAG = 'courier_login_otp_required';
export const PLACEHOLDER_SEEDED_PIN_HASH = 'hashed_pin';

export const getDevelopmentSeedCourierPin = () => {
  if (process.env.NODE_ENV === 'production') return null;

  const seedPin = process.env.DEV_SEEDED_COURIER_PIN?.trim();
  if (!seedPin || seedPin.length < 6) return null;

  return seedPin;
};

export const isValidCourierPassword = (password: string, pinHash: string | null) => {
  if (!pinHash) return false;

  // Local seed data currently stores placeholder hashes. Keep this compatibility
  // narrow so seeded couriers can be tested without weakening real hashes.
  if (pinHash === PLACEHOLDER_SEEDED_PIN_HASH) {
    return password === getDevelopmentSeedCourierPin();
  }

  return password === pinHash;
};

export const base64Url = (value: string) =>
  Buffer.from(value)
    .toString('base64url');

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
};

export const signCourierJwt = (userId: string) => {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (7 * 24 * 60 * 60);

  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    user_id: userId,
    role: 'courier',
    iss: process.env.JWT_ISSUER || 'tembus-auth-service',
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

export const normalizeDeviceId = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const hashDeviceId = (deviceId: string) =>
  `sha256:${crypto.createHash('sha256').update(deviceId).digest('hex')}`;

export const buildCourierDeviceContext = (req: Request) => {
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

export const getCourierByIdentity = async (identity: string) => {
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

export const isTrustedCourierDevice = async (courierId: string, deviceIdHash: string) => {
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

export const trustCourierDevice = async (
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

export const touchCourierTrustedDevice = async (courierId: string, deviceIdHash: string) => {
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

export const hashOtpRecipient = (recipient: string) =>
  crypto.createHash('sha256').update(recipient.trim().toLowerCase()).digest('hex');

export const defaultCourierLoginOtpRequired = () => {
  const environment = (process.env.ENVIRONMENT || process.env.NODE_ENV || '').trim().toLowerCase();
  return environment !== 'development' && environment !== 'test';
};

export const isCourierLoginOtpRequired = async () => {
  return isFeatureFlagEnabled(COURIER_LOGIN_OTP_REQUIRED_FLAG, defaultCourierLoginOtpRequired());
};

export const sendCourierOtp = async (recipient: string) => {
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

export const verifyCourierOtpCode = async (recipient: string, code: string) => {
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

export const issueCourierLoginSession = async (
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

export const mobileOrderSelect = `
  o.id AS order_id,
  o.model,
  o.batch_id,
  o.sequence_no,
  ol.leg_number,
  CASE
    WHEN COALESCE(dsp.service_category, '') IN ('on_demand', 'tambal_ban', 'towing') THEN 'on_demand'
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
  CASE
    WHEN COALESCE(dsp.service_category, '') IN ('tambal_ban', 'towing')
    THEN COALESCE(
      (SELECT ROUND(ST_Distance(cp.current_location, o.pickup_location)::numeric / 1000.0, 2)
       FROM courier_profiles cp
       WHERE cp.user_id = COALESCE(ol.courier_id, (
         SELECT d.courier_id FROM courier_offer_dispatches d
         WHERE d.order_id = o.id AND d.status = 'offered' LIMIT 1
       ))
       LIMIT 1),
      0
    )
    ELSE COALESCE(
      NULLIF(o.route_snapshot->>'distance_km', '')::numeric,
      CASE
        WHEN COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0) > 0
        THEN ROUND(COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int)::numeric / 1000.0, 2)
        ELSE NULL
      END,
      o.distance_km,
      0
    )
  END::text AS distance,
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
  o.settlement_snapshot,
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
  -- FB-105: rincian item food untuk driver app (snapshot food_order_items).
  -- FB-108: + variants (nama grup/opsi + harga delta) supaya driver tahu
  -- pilihan yang harus diserahkan (mis. "Level Pedas: Extra Pedas").
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', foi.item_name,
      'quantity', foi.quantity,
      'notes', foi.notes,
      'price', foi.item_price,
      'photo_url', COALESCE(mm.foto, ''),
      'variants', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'variant_name', foiv.variant_name,
          'option_name', foiv.option_name,
          'price_delta', foiv.price_delta
        ) ORDER BY foiv.id)
        FROM food_order_item_variants foiv
        WHERE foiv.order_item_id = foi.id
      ), '[]'::jsonb)
    ) ORDER BY foi.id)
    FROM food_order_items foi
    LEFT JOIN merchant_menu_items mm ON mm.id = foi.menu_item_id
    WHERE foi.order_id = o.id
  ), '[]'::jsonb) AS food_items,
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
  ) AS pickup_photo_verified,
  (SELECT row_to_json(tr) FROM tambal_ban_reports tr WHERE tr.order_id = o.id LIMIT 1) AS tambal_ban_report,
  (SELECT row_to_json(twr) FROM towing_reports twr WHERE twr.order_id = o.id LIMIT 1) AS towing_report
`;

export const normalizeMobileOrder = (order: any) => {
  const routeContract = routeContractFromOrder(order);
  const isMaintenance = ['tambal_ban', 'towing'].includes(String(order.service_category || '')) ||
    String(order.service_code || '').startsWith('tambal_ban') ||
    String(order.service_code || '').startsWith('towing');
  // Travel fee realtime utk maintenance: base fare + per_km utk km berikutnya,
  // pembulatan 0.5 ke atas (Math.round) — override snapshot yang beku.
  const rawPb = order.settlement_snapshot?.pricing_breakdown || null;
  let livePricingBreakdown = rawPb;
  if (isMaintenance && rawPb) {
    const liveDistanceKm = Number(order.distance || 0);
    const baseFare = Number(rawPb.base_fare_idr || 0);
    const perKm = Number(rawPb.per_km_idr || 0);
    const includedKm = Number(rawPb.included_distance_km || 1);
    if (liveDistanceKm > 0) {
      const chargeableKm = Math.max(0, Math.round(liveDistanceKm - includedKm));
      const liveTravelFee = Math.ceil(baseFare * includedKm) + Math.round(chargeableKm * perKm);
      livePricingBreakdown = {
        ...rawPb,
        travel_fee_idr: liveTravelFee,
        live_distance_km: liveDistanceKm,
      };
    }
  }
  const proofRequirements = {
    face_verification_required: order.service_face_verification_required !== false,
    geofence_radius_m: Number(order.service_proof_geofence_radius_m || 10),
    min_accuracy_m: Number(order.service_proof_min_accuracy_m || 50),
    failed_delivery_policy: order.service_failed_delivery_policy || 'must_deliver',
    pod_label: order.service_pod_label || 'POD',
    required_steps: isMaintenance
      ? ['arrival_photo', 'service_report', 'completion_photo']
      : ['pickup_scan', 'pickup_photo', 'delivery_pod_photo'],
  };
  return {
    ...order,
    pickup_lat: order.pickup_latitude == null ? null : Number(order.pickup_latitude),
    pickup_lng: order.pickup_longitude == null ? null : Number(order.pickup_longitude),
    dropoff_lat: order.drop_latitude == null ? null : Number(order.drop_latitude),
    dropoff_lng: order.drop_longitude == null ? null : Number(order.drop_longitude),
    distance: isMaintenance && order.distance ? String(order.distance) : (routeContract.distance_km > 0 ? String(routeContract.distance_km) : order.distance),
    pricing_breakdown: livePricingBreakdown,
    proof_requirements: proofRequirements,
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
    tambal_ban_report: order.tambal_ban_report || null,
    towing_report: order.towing_report || null,
    tip_amount_idr: Number(order.tip_amount_idr || 0),
  };
};

export const normalizeOfferMobileOrder = (order: any) => ({
  ...normalizeMobileOrder(order),
  drop_address: 'Alamat tujuan dibuka setelah pekerjaan diterima',
});

export const publicBaseUrl = () =>
  process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

export const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

export const getRequestIp = (req: Request) =>
  (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
  || req.socket.remoteAddress
  || null;

export const getDeviceId = (req: Request) =>
  (req.headers['x-device-id'] as string | undefined)
  || (req.headers['x-client-device-id'] as string | undefined)
  || null;

export const logPayoutSecurityEvent = async (
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

export const getCourierPayoutPolicy = async () => {
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

export const toRad = (value: number) => value * Math.PI / 180;

export const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const radiusKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const startLat = toRad(aLat);
  const endLat = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
};

export const parseJsonObject = (value: unknown): Record<string, any> | null => {
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

export const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const routeContractFromOrder = (order: any) => {
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

export const parseLatLng = (row: any) => ({
  pickup_latitude: Number(row.pickup_latitude),
  pickup_longitude: Number(row.pickup_longitude),
  drop_latitude: Number(row.drop_latitude),
  drop_longitude: Number(row.drop_longitude),
});

export const notifyAdminOps = async (payload: {
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

export const MOBILE_COURIER_SAFETY_EVENT_TYPES = new Set([
  'sos',
  'support_request',
  'recipient_unavailable',
  'address_not_found',
  'package_issue',
  'return_required',
  'failed_delivery',
  'route_issue',
]);

export const MOBILE_COURIER_SAFETY_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

export const normalizeSafetyEventType = (value: unknown) =>
  String(value || 'support_request')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, '_')
    .slice(0, 40);

export const sanitizeSafetyMessage = (value: unknown): string | null => {
  const message = String(value || '')
    .replace(/[<>{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return message || null;
};

export const ON_DEMAND_OFFER_TTL_SECONDS = 90;
export const ON_DEMAND_OPEN_ORDER_STATUSES = ['pending', 'pending_payment', 'paid', 'matched', 'offered', 'dispatching', 'pending_assignment', 'searching'];
export const ON_DEMAND_DISPATCH_READY_STATUSES = ['pending', 'matched', 'offered', 'dispatching', 'pending_assignment', 'searching'];

export type CreatedDispatchOffer = {
  dispatch_id: string;
  order_id: string;
  courier_id: string;
  vehicle_id?: string | null;
  merchant_id?: string | null;
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

export const expireStaleOnDemandOffers = async (client: any): Promise<CreatedDispatchOffer[]> => {
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

/**
 * dispatchToPreferredCourier — "Pilih Petugas" flow (tambal ban & towing).
 * Customer explicitly selects a courier from the nearby list; instead of
 * ranking via the normal queue, we create a direct offer to that courier.
 */
export const ON_DEMAND_GEOFENCE_RADIUS_M = Number(process.env.ON_DEMAND_GEOFENCE_RADIUS_M || 10);
export const ON_DEMAND_MAX_ACCURACY_M = Number(process.env.ON_DEMAND_MAX_ACCURACY_M || 50);

export const DEFAULT_GPS_OVERRIDE_POLICY = {
  enabled: true,
  soft_radius_m: 25,
  max_accuracy_m: 100,
  requires_reason: true,
  manual_review_required: true,
};

export const HIGH_RISK_SPOOF_SIGNALS = new Set([
  'mock',
  'mock_location',
  'rooted',
  'rooted_device',
  'emulator',
  'tampered',
  'high',
]);

export const normalizeProofPolicyNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
};

export const normalizeGpsOverridePolicy = (value: unknown) => ({
  ...DEFAULT_GPS_OVERRIDE_POLICY,
  ...(parseJsonObject(value) || {}),
});

export const parseCoordinate = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const creditCourierDeliveryEarning = async (client: any, orderId: string, courierId: string) => {
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

export const normalizeFaceVerificationType = (value: unknown) => {
  const verificationType = String(value || 'pickup').trim().toLowerCase();
  if (verificationType === 'pod' || verificationType === 'delivery_pod') return 'delivery';
  if (verificationType === 'registration') return 'registration';
  return verificationType === 'delivery' ? 'delivery' : 'pickup';
};

export const verifyOnDemandStep = async ({
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
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
         o.merchant_id,
         ol.id AS leg_id,
         ol.status AS leg_status,
         COALESCE(dsp.proof_geofence_radius_m, $6)::int AS proof_geofence_radius_m,
         COALESCE(dsp.proof_min_accuracy_m, $7)::int AS proof_min_accuracy_m,
         COALESCE(dsp.proof_gps_override_policy, '{}'::jsonb) AS proof_gps_override_policy,
         COALESCE(dsp.face_verification_required, TRUE) AS face_verification_required,
         COALESCE(dsp.pod_label, 'POD') AS pod_label,
         o.handover_token,
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
    const pickupArrivalStatuses = new Set(['pickup_arrived', 'picked_up', 'pickup_verified', 'in_transit']);
    if (step === 'pickup' && !pickupArrivalStatuses.has(currentStatus)) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('pickup_arrival_required', distanceM);
      res.status(409).json({
        success: false,
        data: { current_status: currentStatus, required_status: 'pickup_arrived' },
        message: 'Konfirmasi tiba di titik pickup wajib dilakukan sebelum verifikasi paket.',
        code: 'ERR_PICKUP_ARRIVAL_REQUIRED',
      });
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

    // FOOD-BIKE-032: validasi barcode terhadap handover token order.
    // Sebelumnya barcode hanya disimpan untuk audit tanpa dicocokkan —
    // celah keamanan (barcode/QR asal bisa dipakai bukti pickup palsu).
    // Sekarang: untuk order tanpa order_packages (single proof flow),
    // barcode yang di-scan WAJIB cocok dengan order.handover_token.
    // Backward compatible: token kosong (order lama) → skip validasi.
    const normalizedBarcode = String(barcodeValue || '').trim();
    const orderHandoverToken = String(order.handover_token || '').trim();
    if (
      step === 'pickup' &&
      totalPackages === 0 &&
      normalizedBarcode &&
      orderHandoverToken &&
      normalizedBarcode !== orderHandoverToken
    ) {
      await client.query('ROLLBACK');
      await writeRejectedProofAttempt('barcode_mismatch', distanceM);
      res.status(422).json({
        success: false,
        data: null,
        message: 'Kode barcode tidak cocok dengan token handover order ini. Periksa kembali kode pada paket/struk.',
        code: 'ERR_BARCODE_MISMATCH',
      });
      return;
    }

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
         SET status = $2::text,
             picked_up_at = CASE WHEN $2::text = 'in_transit' THEN COALESCE(picked_up_at, NOW()) ELSE picked_up_at END,
             delivered_at = CASE WHEN $2::text = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [orderId, nextStatus]
      );

      await client.query(
        `UPDATE order_legs
         SET status = $2::text,
             started_at = CASE WHEN $2::text = 'in_transit' THEN COALESCE(started_at, NOW()) ELSE started_at END,
             completed_at = CASE WHEN $2::text = 'delivered' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [order.leg_id, nextStatus]
      );
    }

    const earningCredit = deliveryComplete
      ? await creditCourierDeliveryEarning(client, orderId, req.user.id)
      : null;

    // Parity FOOD-BIKE-067: proof delivery lewat jalur courier mobile
    // (admin-service) juga harus memicu merchant settlement food on-demand,
    // sama seperti ScanPackage (order-service Go). Fire-and-forget: endpoint
    // internal idempotent (settle-order-<orderID>); service yang memutuskan
    // apakah order ini food/merchant — gagal tidak menggagalkan POD sukses.
    if (deliveryComplete) {
      const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://order-service:8083';
      const internalApiKey = process.env.INTERNAL_API_KEY || '';
      axios
        .post(
          `${orderServiceUrl}/api/v1/internal/orders/food-settlement`,
          { order_id: orderId },
          {
            timeout: 8000,
            headers: internalApiKey ? { 'X-Internal-Api-Key': internalApiKey } : undefined,
          }
        )
        .then(() => {
          console.info(JSON.stringify({
            event: 'food_settlement_triggered',
            order_id: orderId,
            source: 'courier_mobile_proof',
          }));
        })
        .catch((error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`[settlement] gagal trigger food settlement via admin proof flow untuk order ${orderId}: ${msg}`);
        });
    }

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
      merchant_id: order.merchant_id || null,
      admin_broadcast: true,
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
        merchant_id: order.merchant_id || null,
        admin_broadcast: true,
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
