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
  normalizeMobileOrder,
} from './_shared';

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
               SELECT d2.courier_id FROM courier_offer_dispatches d2
               WHERE d2.order_id = o.id AND d2.status = 'offered' LIMIT 1
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
         COALESCE(ol.assigned_fee_idr, o.total_price_idr, 0)::text AS fee,
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
        COALESCE(c.photo_url, '') AS customer_photo_url,
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
         ) AS pickup_photo_verified,
         (SELECT row_to_json(tr) FROM tambal_ban_reports tr WHERE tr.order_id = o.id LIMIT 1) AS tambal_ban_report,
         (SELECT row_to_json(twr) FROM towing_reports twr WHERE twr.order_id = o.id LIMIT 1) AS towing_report,
         -- FB-077: tip dari customer (LEFT JOIN — 0/null kalau belum di-tip)
         COALESCE(dt.amount_idr, 0)::bigint AS tip_amount_idr
         FROM order_legs ol
         JOIN orders o ON o.id = ol.order_id
         LEFT JOIN delivery_service_products dsp ON dsp.code = COALESCE(NULLIF(o.service_code, ''), o.service_sub_type)
         LEFT JOIN users c ON c.id = o.customer_id
         LEFT JOIN driver_tips dt ON dt.order_id = o.id
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


