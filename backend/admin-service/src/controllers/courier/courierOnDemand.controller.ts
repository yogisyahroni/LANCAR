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
  CreatedDispatchOffer,
  ON_DEMAND_DISPATCH_READY_STATUSES,
  ON_DEMAND_OFFER_TTL_SECONDS,
  expireStaleOnDemandOffers,
  routeContractFromOrder,
} from './_shared';

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
                 COALESCE(ST_Distance(cp.current_location, o.pickup_location)::int, 0) AS travel_distance_m,
         COALESCE(cp.avg_partner_rating, cp.relay_score, 5.00)::numeric(3,2) AS rating_snapshot,
         COALESCE(cp.acceptance_rate_pct, 100)::int AS acceptance_rate_snapshot,
          COALESCE(cp.completion_rate_pct, 100)::int AS completion_rate_snapshot,
          o.pickup_address,
                   o.dropoff_address,
                   CASE
                     WHEN dsp.service_category IN ('tambal_ban', 'towing')
                     THEN ROUND((COALESCE(ST_Distance(cp.current_location, o.pickup_location)::int, 0))::numeric / 1000.0, 2)
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
          o.merchant_id,
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
       JOIN delivery_service_products dsp ON dsp.code = COALESCE(NULLIF(o.service_code, ''), o.service_sub_type)
        AND dsp.is_enabled = TRUE
        AND dsp.service_category IN ('on_demand', 'food_delivery', 'tambal_ban', 'towing')
       JOIN courier_profiles cp ON cp.application_channel = 'on_demand'
        AND cp.verification_status = 'approved'
        AND cp.is_online = TRUE
        AND cp.current_zone_id IS NOT NULL
        AND cp.current_location IS NOT NULL
        AND cp.last_location_at >= NOW() - INTERVAL '10 minutes'
       JOIN courier_service_capabilities csc ON csc.courier_profile_id = cp.id
        AND csc.service_code = COALESCE(NULLIF(o.service_code, ''), o.service_sub_type)
        AND csc.application_channel = 'on_demand'
        AND csc.status = 'enabled'
       JOIN courier_vehicles cv ON cv.courier_profile_id = cp.id
        AND cv.verification_status = 'approved'
        AND (
          csc.vehicle_id IS NULL
          OR cv.id = csc.vehicle_id
        )
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
        AND EXISTS (
          SELECT 1
          FROM payments p
          WHERE p.order_id = o.id
            AND p.status = 'paid'
        )
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
            AND d.status IN ('offered', 'accepted')
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
    [orderId, ON_DEMAND_DISPATCH_READY_STATUSES]
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
         ON CONFLICT (order_id, courier_id) DO UPDATE SET
           status = 'offered',
           responded_at = NULL,
           response_reason = NULL,
           rank_number = EXCLUDED.rank_number,
           score = EXCLUDED.score,
           distance_m = EXCLUDED.distance_m,
           rating_snapshot = EXCLUDED.rating_snapshot,
           acceptance_rate_snapshot = EXCLUDED.acceptance_rate_snapshot,
           completion_rate_snapshot = EXCLUDED.completion_rate_snapshot,
           expires_at = EXCLUDED.expires_at,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()
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
           WHEN status IN ('pending', 'matched', 'dispatching', 'offered') THEN 'offered'
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
    merchant_id: nextCourier.merchant_id || null,
    pickup_address: nextCourier.pickup_address,
    dropoff_address: nextCourier.dropoff_address,
    distance: ['tambal_ban', 'towing'].includes(nextCourier.service_code?.split('_')[0] ?? '')
      ? (nextCourier.travel_distance_m != null && nextCourier.travel_distance_m > 0
          ? String(Number((nextCourier.travel_distance_m / 1000).toFixed(2)))
          : (routeContract.distance_km > 0 ? String(routeContract.distance_km) : nextCourier.distance))
      : (routeContract.distance_km > 0 ? String(routeContract.distance_km) : nextCourier.distance),
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



export const dispatchToPreferredCourier = async (
  client: any,
  orderId: string,
  preferredCourierUserId: string
): Promise<CreatedDispatchOffer | null> => {
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

  // Validate the preferred courier is online, approved, capable & nearby.
  const courier = await client.query(
    `SELECT
       cp.user_id AS courier_id,
               cp.current_zone_id AS zone_id,
               COALESCE(ST_Distance(cp.current_location, o.pickup_location)::int, 0) AS distance_m,
               COALESCE(ST_Distance(cp.current_location, o.pickup_location)::int, 0) AS travel_distance_m,
       COALESCE(cp.avg_partner_rating, cp.relay_score, 5.00)::numeric(3,2) AS rating_snapshot,
       COALESCE(cp.acceptance_rate_pct, 100)::int AS acceptance_rate_snapshot,
       COALESCE(cp.completion_rate_pct, 100)::int AS completion_rate_snapshot,
       o.pickup_address,
             o.dropoff_address,
             CASE
               WHEN dsp.service_category IN ('tambal_ban', 'towing')
               THEN ROUND((COALESCE(ST_Distance(cp.current_location, o.pickup_location)::int, 0))::numeric / 1000.0, 2)
               ELSE COALESCE(NULLIF(o.route_snapshot->>'distance_km', '')::numeric, o.distance_km, 0)
             END::text AS distance,
       COALESCE(NULLIF(o.courier_payout_estimate_idr, 0), GREATEST(o.total_price_idr - o.platform_commission_idr, 0), 0)::text AS fee,
       COALESCE(NULLIF(o.courier_payout_estimate_idr, 0), GREATEST(o.total_price_idr - o.platform_commission_idr, 0), 0)::int AS courier_payout_estimate_idr,
       COALESCE(o.total_price_idr, 0)::int AS customer_price_idr,
       COALESCE(u.full_name, 'Customer') AS customer_name,
       COALESCE(dsp.name, o.service_snapshot->>'service_name', o.service_code, 'TEMBUS') AS service_name,
       o.merchant_id,
       o.service_code,
       NULLIF(o.route_snapshot->>'vehicle_type', '') AS vehicle_type,
       COALESCE(NULLIF(o.route_snapshot->>'eta_minutes', '')::int, 0) AS eta_minutes,
       o.route_profile,
       o.route_provider,
       COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0)::int AS route_distance_meters,
       COALESCE(o.route_duration_seconds, NULLIF(o.route_snapshot->>'duration_seconds', '')::int, 0)::int AS route_duration_seconds,
       NULLIF(o.route_snapshot->>'snapshot_hash', '') AS route_snapshot_hash,
       NULLIF(o.route_snapshot->>'snapshot_version', '')::int AS route_snapshot_version,
       NULLIF(o.route_snapshot->>'route_version', '') AS route_version
     FROM orders o
     JOIN delivery_service_products dsp ON dsp.code = COALESCE(NULLIF(o.service_code, ''), o.service_sub_type)
      AND dsp.is_enabled = TRUE
     JOIN courier_profiles cp ON cp.user_id = $2
      AND cp.verification_status = 'approved'
      AND cp.is_online = TRUE
      AND cp.current_location IS NOT NULL
      AND cp.last_location_at >= NOW() - INTERVAL '10 minutes'
     JOIN courier_service_capabilities csc ON csc.courier_profile_id = cp.id
      AND csc.service_code = COALESCE(NULLIF(o.service_code, ''), o.service_sub_type)
      AND csc.status = 'enabled'
     LEFT JOIN users u ON u.id = o.customer_id
     WHERE o.id = $1
       AND o.status = ANY($3::text[])
       AND EXISTS (
         SELECT 1
         FROM payments p
         WHERE p.order_id = o.id
           AND p.status = 'paid'
       )
     LIMIT 1`,
    [orderId, preferredCourierUserId, ON_DEMAND_DISPATCH_READY_STATUSES]
  );
  const nextCourier = courier.rows[0];
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
     VALUES ($1, $2, $3, $4, 9999, $5, $6, $7, $8, NOW() + ($9::text || ' seconds')::interval, $10)
         ON CONFLICT (order_id, courier_id) DO UPDATE SET
           status = 'offered',
           responded_at = NULL,
           response_reason = NULL,
           expires_at = EXCLUDED.expires_at,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()
         RETURNING id, expires_at`,
    [
      orderId,
      nextCourier.courier_id,
      nextCourier.zone_id,
      Number(rank.rows[0]?.next_rank || 1),
      nextCourier.distance_m,
      nextCourier.rating_snapshot,
      nextCourier.acceptance_rate_snapshot,
      nextCourier.completion_rate_snapshot,
      ON_DEMAND_OFFER_TTL_SECONDS,
      JSON.stringify({ source: 'customer_selected', dispatch_type: 'preferred' }),
    ]
  );
  const dispatch = inserted.rows[0];
  if (!dispatch) return null;

  await client.query(
    `UPDATE orders
     SET status = CASE
           WHEN status IN ('pending', 'matched', 'dispatching', 'offered') THEN 'offered'
           ELSE status
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [orderId]
  );

  await client.query(
    `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
     VALUES ($1, $2, 'offer_dispatched', 'Offer dispatched to customer-selected courier', $3)`,
    [
      orderId,
      nextCourier.courier_id,
      JSON.stringify({
        dispatch_id: dispatch.id,
        ttl_seconds: ON_DEMAND_OFFER_TTL_SECONDS,
        rank_number: Number(rank.rows[0]?.next_rank || 1),
        source: 'customer_selected',
        dispatch_type: 'preferred',
      }),
    ]
  );

  return {
    dispatch_id: dispatch.id,
    order_id: orderId,
    courier_id: nextCourier.courier_id,
    merchant_id: nextCourier.merchant_id || null,
    pickup_address: nextCourier.pickup_address,
    dropoff_address: nextCourier.dropoff_address,
    distance: ['tambal_ban', 'towing'].includes((nextCourier.service_code ?? '').split('_')[0])
      ? (nextCourier.travel_distance_m != null && nextCourier.travel_distance_m > 0
          ? String(Number((nextCourier.travel_distance_m / 1000).toFixed(2)))
          : nextCourier.distance)
      : nextCourier.distance,
    fee: nextCourier.fee,
    customer_name: nextCourier.customer_name,
    expires_at: dispatch.expires_at,
    service_name: nextCourier.service_name,
    service_code: nextCourier.service_code,
    vehicle_type: nextCourier.vehicle_type,
    route_profile: nextCourier.route_profile,
    route_provider: nextCourier.route_provider,
    route_distance_meters: nextCourier.route_distance_meters,
    route_duration_seconds: nextCourier.route_duration_seconds,
    eta_minutes: nextCourier.eta_minutes,
    route_snapshot_hash: nextCourier.route_snapshot_hash,
    route_snapshot_version: nextCourier.route_snapshot_version,
    route_version: nextCourier.route_version,
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
       AND EXISTS (
         SELECT 1
         FROM payments p
         WHERE p.order_id = o.id
           AND p.status = 'paid'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM courier_offer_dispatches d
         WHERE d.order_id = o.id
           AND d.status IN ('offered', 'accepted')
       )
     ORDER BY o.created_at ASC
     LIMIT $2
     FOR UPDATE SKIP LOCKED`,
    [ON_DEMAND_DISPATCH_READY_STATUSES, limit]
  );

  for (const order of orders.rows) {
    const created = await dispatchNextOnDemandCourier(client, order.id);
    if (created) createdOffers.push(created);
  }

  return createdOffers;
};


