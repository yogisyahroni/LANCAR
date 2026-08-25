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




import {
  haversineKm,
  parseJsonObject,
  parseLatLng,
  routeContractFromOrder,
} from './_shared';

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


