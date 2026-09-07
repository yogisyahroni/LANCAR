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
         cp.market_code,
         cp.onboarding_status,
         cp.verification_status,
         cp.home_zone_id,
         cp.is_online,
         COALESCE(cps.effective_presence_state, CASE WHEN cp.is_online THEN 'online' ELSE 'offline' END) AS effective_presence_state,
         COALESCE(cps.presence_state, CASE WHEN cp.is_online THEN 'online' ELSE 'offline' END) AS presence_state,
         COALESCE(cps.work_state, 'idle') AS work_state,
         cps.presence_reason,
         cps.heartbeat_at,
         COALESCE(cps.is_matchable, FALSE) AS is_matchable,
         COALESCE(cps.active_job_count, 0)::int AS active_job_count,
         z.id AS current_zone_id,
         z.name AS current_zone_name,
         z.code AS current_zone_code,
         COALESCE((
           SELECT jsonb_agg(cz.zone_id ORDER BY cz.is_primary DESC, cz.assigned_at ASC)
           FROM courier_zones cz
           WHERE cz.courier_id = cp.id AND cz.removed_at IS NULL
         ), '[]'::jsonb) AS operating_zone_ids,
         cp.max_weight_capacity_kg,
         cp.max_packages_capacity,
         COUNT(ol.id)::int AS total_deliveries,
         COUNT(ol.id) FILTER (WHERE ol.updated_at::date = CURRENT_DATE)::int AS today_deliveries,
         COALESCE(SUM(ol.assigned_fee_idr) FILTER (WHERE ol.status = 'delivered'), 0)::int AS total_earnings_idr,
         COALESCE(SUM(ol.assigned_fee_idr) FILTER (WHERE ol.status = 'delivered' AND ol.updated_at::date = CURRENT_DATE), 0)::int AS today_earnings_idr
       FROM users u
       LEFT JOIN courier_profiles cp ON cp.user_id = u.id
       LEFT JOIN courier_presence_snapshot cps ON cps.courier_profile_id = cp.id
       LEFT JOIN zones z ON z.id = cp.current_zone_id
       LEFT JOIN order_legs ol ON ol.courier_id = u.id AND ol.status = 'delivered'
       WHERE u.id = $1 AND u.role = 'courier'
       GROUP BY u.id, u.full_name, u.phone_number, u.photo_url, cp.vehicle_type, cp.application_channel,
                cp.market_code, cp.onboarding_status, cp.verification_status, cp.home_zone_id,
                cp.is_online, cps.effective_presence_state, cps.presence_state, cps.work_state,
                cps.presence_reason, cps.heartbeat_at, cps.is_matchable, cps.active_job_count,
                z.id, z.name, z.code, cp.max_weight_capacity_kg, cp.max_packages_capacity`,
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
        market_code: courier.market_code || 'id',
        onboarding_status: courier.onboarding_status || 'DRAFT',
        verification_status: courier.verification_status || 'pending',
        home_zone_id: courier.home_zone_id,
        operating_zone_ids: courier.operating_zone_ids || [],
        status: courier.effective_presence_state || (courier.is_online ? 'online' : 'offline'),
        presence_state: courier.presence_state || (courier.is_online ? 'online' : 'offline'),
        work_state: courier.work_state || 'idle',
        presence_reason: courier.presence_reason || null,
        heartbeat_at: courier.heartbeat_at || null,
        is_matchable: courier.is_matchable === true,
        active_job_count: Number(courier.active_job_count || 0),
        profile_photo_url: courier.photo_url,
        total_deliveries: courier.total_deliveries,
        today_deliveries: courier.today_deliveries,
        total_earnings_idr: courier.total_earnings_idr,
        today_earnings_idr: courier.today_earnings_idr,
        current_zone: courier.current_zone_id ? {
          id: courier.current_zone_id,
          name: courier.current_zone_name,
          code: courier.current_zone_code,
        } : null,
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
