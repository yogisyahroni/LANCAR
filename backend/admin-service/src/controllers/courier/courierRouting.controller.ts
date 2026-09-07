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
import {
  COURIER_GROWTH_POLICY_VERSION,
  COURIER_GROWTH_SAFETY_POLICY_VERSION,
  COURIER_INCENTIVE_SAFETY_NOTICE,
  getCourierEducationModules,
} from '../../services/courierGrowthPolicy';
import {
  buildCourierQualityScorecard,
  buildCourierServiceMetrics,
  COURIER_SCORECARD_APPEAL_POLICY,
  COURIER_SCORECARD_METRICS,
  COURIER_SCORECARD_VERSION,
} from '../../services/courierQualityScorecard';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';
import { getActorId } from '../../utils/authUtils';

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
      `WITH assignments AS (
         SELECT ol.*, o.delivered_at, o.service_sub_type, o.service_code
         FROM order_legs ol
         JOIN orders o ON o.id = ol.order_id
         WHERE ol.courier_id = $1
       ),
       ratings AS (
         SELECT COALESCE(AVG(stars), 5.0)::numeric(3,2) AS avg_rating,
                COUNT(*)::int AS rating_count,
                COALESCE(ARRAY_AGG(stars::int ORDER BY created_at DESC), ARRAY[]::int[]) AS rating_values
         FROM courier_ratings
         WHERE courier_id = $1
           AND created_at >= NOW() - INTERVAL '90 days'
       )
       SELECT
         COUNT(*) FILTER (WHERE status = 'delivered')::int AS total_deliveries,
         COUNT(*) FILTER (WHERE status = 'delivered' AND updated_at >= NOW() - INTERVAL '30 days')::int AS deliveries_30d,
         COALESCE(SUM(assigned_fee_idr) FILTER (WHERE status = 'delivered' AND updated_at::date = CURRENT_DATE), 0)::int AS today_earnings_idr,
         COALESCE(SUM(assigned_fee_idr) FILTER (WHERE status = 'delivered' AND updated_at >= date_trunc('week', NOW())), 0)::int AS week_earnings_idr,
         COALESCE(SUM(assigned_fee_idr) FILTER (WHERE status = 'delivered'), 0)::int AS total_earnings_idr,
         COUNT(*) FILTER (WHERE status = 'delivered' AND updated_at >= NOW() - INTERVAL '30 days')::int AS completed_30d,
         COUNT(*) FILTER (WHERE status IN ('delivered', 'cancelled', 'failed') AND updated_at >= NOW() - INTERVAL '30 days')::int AS terminal_30d,
         COALESCE(ROUND(COUNT(*) FILTER (WHERE status = 'delivered' AND updated_at >= NOW() - INTERVAL '30 days')::numeric / NULLIF(COUNT(*) FILTER (WHERE status IN ('delivered', 'cancelled', 'failed') AND updated_at >= NOW() - INTERVAL '30 days'), 0) * 100), 100)::int AS completion_rate_pct,
         COUNT(*) FILTER (WHERE status IN ('cancelled', 'failed') AND updated_at >= NOW() - INTERVAL '30 days')::int AS cancelled_30d,
         COUNT(*) FILTER (WHERE status = 'delivered' AND sla_deadline IS NOT NULL AND updated_at >= NOW() - INTERVAL '30 days')::int AS sla_eligible_30d,
         COUNT(*) FILTER (WHERE status = 'delivered' AND sla_deadline IS NOT NULL AND COALESCE(completed_at, delivered_at, updated_at) <= sla_deadline AND updated_at >= NOW() - INTERVAL '30 days')::int AS sla_met_30d,
         (SELECT COUNT(*)::int FROM courier_proof_attempts cpa
          WHERE cpa.courier_id = $1 AND cpa.proof_step = 'delivery'
            AND cpa.created_at >= NOW() - INTERVAL '30 days') AS proof_attempts_30d,
         (SELECT COUNT(*)::int FROM courier_proof_attempts cpa
          WHERE cpa.courier_id = $1 AND cpa.proof_step = 'delivery' AND cpa.proof_status = 'accepted'
            AND cpa.created_at >= NOW() - INTERVAL '30 days') AS proof_accepted_30d,
         (SELECT COUNT(*)::int
          FROM driver_penalty_log dpl
          JOIN courier_profiles cp ON cp.id = dpl.driver_id
          WHERE cp.user_id = $1 AND dpl.created_at >= NOW() - INTERVAL '30 days'
            AND dpl.violation_type IN ('silent_cancel', 'soft_ghosting', 'coerced_cancel')) AS preventable_cancellations_30d,
         (SELECT COUNT(*)::int FROM courier_safety_events cse
          WHERE cse.courier_id = $1 AND cse.created_at >= NOW() - INTERVAL '90 days'
            AND cse.status IN ('resolved', 'dismissed')) AS reviewed_safety_incidents_90d,
         (SELECT COUNT(*)::int FROM courier_safety_events cse
          WHERE cse.courier_id = $1 AND cse.created_at >= NOW() - INTERVAL '90 days'
            AND cse.status = 'resolved' AND LOWER(COALESCE(cse.metadata->>'quality_impact', 'false')) IN ('true', '1', 'yes')) AS quality_impact_safety_incidents_90d,
         COALESCE((SELECT avg_rating FROM ratings), 5.00) AS avg_rating,
         COALESCE((SELECT rating_count FROM ratings), 0)::int AS rating_count,
         COALESCE((SELECT rating_values FROM ratings), ARRAY[]::int[]) AS rating_values
       FROM assignments`,
      [req.user.id]
    );

    const row = summary.rows[0] || {};
    const qualityScorecard = buildCourierQualityScorecard({
      completion_rate_pct: row.terminal_30d > 0 ? Number(row.completion_rate_pct) : null,
      preventable_cancellation_rate_pct: row.cancelled_30d > 0
        ? (Number(row.preventable_cancellations_30d || 0) / Number(row.cancelled_30d)) * 100
        : null,
      pickup_delivery_sla_pct: row.sla_eligible_30d > 0
        ? (Number(row.sla_met_30d || 0) / Number(row.sla_eligible_30d)) * 100
        : null,
      proof_quality_pct: row.proof_attempts_30d > 0
        ? (Number(row.proof_accepted_30d || 0) / Number(row.proof_attempts_30d)) * 100
        : null,
      ratings: row.rating_values || [],
      reviewed_safety_incidents: Number(row.reviewed_safety_incidents_90d || 0),
      quality_impact_safety_incidents: Number(row.quality_impact_safety_incidents_90d || 0),
    });
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

    const [campaignRes, educationModules, serviceMetricRes, appealRes] = await Promise.all([
      db.query(
      `SELECT c.id, c.code, c.title, c.description, c.target_deliveries,
              c.reward_idr, c.ends_at, c.market_code, c.zone_id, c.service_code,
              c.cohort_code, c.policy_version, c.budget_idr,
              COALESCE(NULLIF(c.metadata->>'mechanic', ''), 'delivery_count') AS incentive_mechanic,
              COALESCE(NULLIF(c.metadata->>'safety_policy_version', ''), $2) AS safety_policy_version,
              TRUE AS safe_for_driving,
              $3 AS safety_notice,
              COALESCE(p.completed_deliveries, 0)::int AS progress_deliveries,
              COALESCE(p.status, 'in_progress') AS progress_status,
              CASE WHEN c.target_deliveries > 0
                THEN LEAST(100, ROUND(COALESCE(p.completed_deliveries, 0)::numeric / c.target_deliveries * 100)::int)
                ELSE 0 END AS progress_percent
       FROM courier_incentive_campaigns c
       LEFT JOIN courier_incentive_progress p
         ON p.campaign_id = c.id AND p.courier_id = $1
       WHERE c.is_active = TRUE
         AND c.starts_at <= NOW()
         AND c.ends_at >= NOW()
         AND LOWER(COALESCE(c.metadata->>'mechanic', 'delivery_count')) IN ('delivery_count', 'completion_quality')
         AND LOWER(COALESCE(c.metadata->>'requires_speeding', 'false')) NOT IN ('true', '1', 'yes')
         AND LOWER(COALESCE(c.metadata->>'unsafe_driving', 'false')) NOT IN ('true', '1', 'yes')
       ORDER BY c.reward_idr DESC
       LIMIT 5`,
      [req.user.id, COURIER_GROWTH_SAFETY_POLICY_VERSION, COURIER_INCENTIVE_SAFETY_NOTICE]
      ),
      getCourierEducationModules(),
      db.query(
        `WITH proof_counts AS (
           SELECT order_id,
                  COUNT(*) FILTER (WHERE proof_step = 'delivery')::int AS proof_attempts,
                  COUNT(*) FILTER (WHERE proof_step = 'delivery' AND proof_status = 'accepted')::int AS proof_accepted
           FROM courier_proof_attempts
           WHERE courier_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
           GROUP BY order_id
         )
         SELECT COALESCE(NULLIF(o.service_sub_type, ''), NULLIF(o.service_code, ''), 'delivery') AS service_code,
                COUNT(*)::int AS total_assignments,
                COUNT(*) FILTER (WHERE ol.status = 'delivered')::int AS completed_deliveries,
                COUNT(*) FILTER (WHERE ol.status IN ('cancelled', 'failed'))::int AS cancelled_deliveries,
                COUNT(*) FILTER (WHERE ol.status IN ('cancelled', 'failed') AND EXISTS (
                  SELECT 1 FROM driver_penalty_log dpl
                  JOIN courier_profiles cp ON cp.id = dpl.driver_id
                  WHERE cp.user_id = $1 AND dpl.order_id = ol.order_id
                    AND dpl.created_at >= NOW() - INTERVAL '30 days'
                    AND dpl.violation_type IN ('silent_cancel', 'soft_ghosting', 'coerced_cancel')
                ))::int AS preventable_cancellations,
                COUNT(*) FILTER (WHERE ol.status = 'delivered' AND ol.sla_deadline IS NOT NULL)::int AS sla_eligible,
                COUNT(*) FILTER (WHERE ol.status = 'delivered' AND ol.sla_deadline IS NOT NULL
                  AND COALESCE(ol.completed_at, o.delivered_at, ol.updated_at) <= ol.sla_deadline)::int AS sla_met,
                COALESCE(SUM(pc.proof_attempts), 0)::int AS proof_attempts,
                COALESCE(SUM(pc.proof_accepted), 0)::int AS proof_accepted
         FROM order_legs ol
         JOIN orders o ON o.id = ol.order_id
         LEFT JOIN proof_counts pc ON pc.order_id = ol.order_id
         WHERE ol.courier_id = $1 AND ol.updated_at >= NOW() - INTERVAL '30 days'
         GROUP BY 1
         ORDER BY total_assignments DESC, service_code ASC`,
        [req.user.id]
      ),
      db.query(
        `SELECT id, scorecard_version, metric_code, reason, status, created_at, updated_at
         FROM courier_quality_score_appeals
         WHERE courier_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [req.user.id]
      ),
    ]);
    const incentives = campaignRes.rows;
    const serviceMetrics = buildCourierServiceMetrics(serviceMetricRes.rows);

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
        scorecard_version: qualityScorecard.version,
        quality_score: qualityScorecard.score,
        quality_score_status: qualityScorecard.status,
        quality_score_enforcement_eligible: qualityScorecard.enforcement_eligible,
        material_decision_requires_review: qualityScorecard.material_decision_requires_review,
        anomalous_rating_count: qualityScorecard.rating.anomalous_rating_count,
        rating_anomaly_policy: qualityScorecard.rating.anomaly_policy,
        reviewed_safety_incidents_90d: qualityScorecard.reviewed_safety_incidents,
        quality_impact_safety_incidents_90d: qualityScorecard.quality_impact_safety_incidents,
        scorecard_metrics: qualityScorecard.metrics,
        scorecard_appeal_policy: COURIER_SCORECARD_APPEAL_POLICY,
        scorecard_appeals: appealRes.rows,
        service_metrics: serviceMetrics,
        tier: tierRes.rows[0] || { tier_code: 'starter', tier_name: 'Starter', benefit_summary: 'Akses pekerjaan on-demand reguler.' },
        incentives,
        operational_modules: educationModules,
        growth_policy_version: COURIER_GROWTH_POLICY_VERSION,
        job_state_mutation_allowed: false,
      },
      message: 'Courier performance loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier performance error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const submitMobileCourierQualityAppeal = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const metricCode = String(req.body?.metric_code || 'quality_score').trim().toLowerCase();
  const reason = String(req.body?.reason || '').trim();
  const requestedVersion = String(req.body?.scorecard_version || COURIER_SCORECARD_VERSION).trim();
  const allowedMetricCodes = new Set(['quality_score', ...COURIER_SCORECARD_METRICS.map((metric) => metric.code)]);

  if (!allowedMetricCodes.has(metricCode)) {
    res.status(400).json({ success: false, data: null, message: 'Metric scorecard tidak dikenali.', code: 'ERR_INVALID_METRIC' });
    return;
  }
  if (requestedVersion !== COURIER_SCORECARD_VERSION) {
    res.status(409).json({ success: false, data: null, message: 'Versi scorecard sudah berubah. Muat ulang performa lalu kirim ulang appeal.', code: 'ERR_SCORECARD_VERSION_CHANGED' });
    return;
  }
  if (reason.length < 10 || reason.length > 2000) {
    res.status(400).json({ success: false, data: null, message: 'Alasan appeal harus berisi 10-2000 karakter.', code: 'ERR_INVALID_APPEAL_REASON' });
    return;
  }

  try {
    const result = await db.query(
      `INSERT INTO courier_quality_score_appeals (courier_id, scorecard_version, metric_code, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id, scorecard_version, metric_code, reason, status, created_at, updated_at`,
      [req.user.id, COURIER_SCORECARD_VERSION, metricCode, reason]
    );
    res.status(201).json({
      success: true,
      data: {
        appeal: result.rows[0],
        score_snapshot_server_authoritative: true,
        appeal_policy: COURIER_SCORECARD_APPEAL_POLICY,
      },
      message: 'Permintaan review scorecard berhasil dikirim.',
    });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ success: false, data: null, message: 'Appeal metric ini masih dalam review.', code: 'ERR_APPEAL_ALREADY_OPEN' });
      return;
    }
    securityLog.error('Submit mobile courier quality appeal error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const listAdminCourierQualityAppeals = async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT a.id, a.courier_id, u.full_name AS courier_name,
              a.scorecard_version, a.metric_code, a.reason, a.status,
              a.review_note, a.reviewed_by, a.reviewed_at, a.created_at, a.updated_at
       FROM courier_quality_score_appeals a
       JOIN users u ON u.id = a.courier_id
       ORDER BY CASE a.status WHEN 'submitted' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END,
                a.created_at DESC
       LIMIT 200`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    securityLog.error('List admin courier quality appeals error:', error);
    res.status(500).json({ success: false, data: [], message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const reviewAdminCourierQualityAppeal = async (req: Request, res: Response) => {
  const appealId = String(req.params.id || '').trim();
  const status = String(req.body?.status || '').trim().toLowerCase();
  const reviewNote = String(req.body?.review_note || '').trim().slice(0, 2000);
  if (!appealId || !['in_review', 'approved', 'rejected'].includes(status)) {
    res.status(400).json({ success: false, data: null, message: 'status harus in_review, approved, atau rejected.', code: 'ERR_INVALID_REVIEW_STATUS' });
    return;
  }
  if (['approved', 'rejected'].includes(status) && reviewNote.length < 10) {
    res.status(400).json({ success: false, data: null, message: 'Keputusan final membutuhkan catatan review minimal 10 karakter.', code: 'ERR_REVIEW_NOTE_REQUIRED' });
    return;
  }

  try {
    const actorId = getActorId(req);
    const result = await db.query(
      `UPDATE courier_quality_score_appeals
       SET status = $1::varchar,
           review_note = NULLIF($2, ''),
           reviewed_by = CASE WHEN $1::varchar IN ('approved', 'rejected') THEN $3::uuid ELSE reviewed_by END,
           reviewed_at = CASE WHEN $1::varchar IN ('approved', 'rejected') THEN NOW() ELSE reviewed_at END,
           updated_at = NOW()
       WHERE id = $4 AND status IN ('submitted', 'in_review')
       RETURNING id, courier_id, scorecard_version, metric_code, status, review_note, reviewed_by, reviewed_at, updated_at`,
      [status, reviewNote, actorId, appealId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, data: null, message: 'Appeal tidak ditemukan atau sudah ditutup.', code: 'ERR_APPEAL_NOT_OPEN' });
      return;
    }
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [actorId, `courier.quality_score.appeal.${status}`, appealId, JSON.stringify({ scorecard_version: result.rows[0].scorecard_version, metric_code: result.rows[0].metric_code })]
    );
    res.json({ success: true, data: result.rows[0], message: 'Review appeal scorecard tersimpan.' });
  } catch (error) {
    securityLog.error('Review admin courier quality appeal error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};


