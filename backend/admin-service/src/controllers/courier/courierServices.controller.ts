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


