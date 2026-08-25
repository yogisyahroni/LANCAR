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


