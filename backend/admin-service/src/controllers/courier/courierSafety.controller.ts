import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';
import { getActorId } from '../../utils/authUtils';

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
import { getTrackingFreshness } from '../../services/onDemandTracking';
import {
  DeliveryRecoveryPolicyError,
  evaluateOnDemandDeliveryRecovery,
} from '../../services/onDemandDeliveryRecovery';

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
  MOBILE_COURIER_SAFETY_EVENT_TYPES,
  MOBILE_COURIER_SAFETY_SEVERITIES,
  normalizeSafetyEventType,
  notifyAdminOps,
  parseCoordinate,
  publicBaseUrl,
  sanitizeSafetyMessage,
  sha256,
} from './_shared';

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
  const reasonCode = String(req.body?.reason_code || req.body?.reasonCode || '').trim().toLowerCase();

  try {
    let orderContext: {
      customer_id: string | null;
      order_number: string | null;
      order_status: string | null;
      service_category: string;
      failed_delivery_policy: string;
    } | null = null;
    if (orderId) {
      const ownership = await db.query(
        `SELECT
           o.customer_id,
           o.order_number,
           o.status AS order_status,
           COALESCE(dsp.service_category,
             CASE WHEN LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand') THEN 'on_demand' ELSE 'regular' END
           ) AS service_category,
           COALESCE(dsp.failed_delivery_policy,
             CASE WHEN COALESCE(dsp.service_category, '') = 'regular' THEN 'reschedule_then_return' ELSE 'must_deliver' END
           ) AS failed_delivery_policy
         FROM order_legs ol
         JOIN orders o ON o.id = ol.order_id
         LEFT JOIN delivery_service_products dsp ON dsp.code = COALESCE(NULLIF(o.service_code, ''), o.service_sub_type)
         WHERE ol.order_id = $1
           AND ol.courier_id = $2
         ORDER BY ol.leg_number ASC
         LIMIT 1`,
        [orderId, req.user.id]
      );

      if (ownership.rows.length === 0) {
        res.status(403).json({ success: false, data: null, message: 'Order tidak tersedia untuk akun kurir ini.', code: 'ERR_ORDER_FORBIDDEN' });
        return;
      }
      orderContext = ownership.rows[0];
    }

    let recoveryDecision: ReturnType<typeof evaluateOnDemandDeliveryRecovery> | null = null;
    if (eventType === 'failed_delivery') {
      if (!orderContext || orderContext.service_category !== 'on_demand') {
        res.status(409).json({
          success: false,
          data: null,
          message: 'Laporan failed delivery hanya tersedia untuk order on-demand.',
          code: 'ERR_INVALID_SERVICE_CATEGORY',
        });
        return;
      }
      if (['delivered', 'completed', 'cancelled', 'returned'].includes(String(orderContext.order_status || '').toLowerCase())) {
        res.status(409).json({
          success: false,
          data: null,
          message: 'Laporan failed delivery tidak dapat ditambahkan setelah order final.',
          code: 'ERR_FINAL_STATUS',
        });
        return;
      }

      try {
        recoveryDecision = evaluateOnDemandDeliveryRecovery({
          serviceCategory: orderContext.service_category,
          failedDeliveryPolicy: orderContext.failed_delivery_policy,
          reasonCode,
          hasEvidence: Boolean(uploadedPhoto?.fileUrl),
          custodyTransferred: ['picked_up', 'in_transit', 'delivered', 'completed'].includes(
            String(orderContext.order_status || '').toLowerCase(),
          ),
        });
      } catch (error) {
        if (error instanceof DeliveryRecoveryPolicyError) {
          res.status(400).json({ success: false, data: null, message: error.message, code: error.code });
          return;
        }
        throw error;
      }
    }

    const uploadedPhoto = req.file ? saveSecureUploadBuffer(req.file, 'safety-events') : null;
    const failureMetadata = recoveryDecision ? {
      reason_code: recoveryDecision.reasonCode,
      evidence_required: recoveryDecision.evidenceRequired,
      evidence_present: recoveryDecision.evidencePresent,
      custody_transferred: recoveryDecision.custodyTransferred,
      recovery_options: recoveryDecision.recoveryOptions,
      settlement_eligible: recoveryDecision.settlementEligible,
      return_to_sender_allowed: recoveryDecision.returnToSenderAllowed,
    } : null;

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
          failure: failureMetadata,
        }),
      ]
    );

    if (recoveryDecision && orderId) {
      await db.query(
        `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
         VALUES ($1, $2, 'delivery_failed_reported', 'Failed delivery reported with operational evidence', $3)`,
        [
          orderId,
          req.user.id,
          JSON.stringify({
            safety_event_id: result.rows[0].id,
            order_number: orderContext?.order_number || null,
            source: 'courier_app',
            ...failureMetadata,
            evidence_url: uploadedPhoto?.fileUrl || null,
          }),
        ],
      );

      if (orderContext?.customer_id) {
        await createNotification({
          user_id: orderContext.customer_id,
          title: 'Kendala pengantaran sedang ditangani',
          body: 'Kurir mengirim laporan dan bukti ke operasional. Gunakan Bantuan untuk mengikuti tindak lanjut pesanan.',
          type: 'delivery_failed_reported',
          order_id: orderId,
          deep_link: `/orders/${orderId}`,
          metadata: {
            safety_event_id: result.rows[0].id,
            recovery_options: recoveryDecision.recoveryOptions,
          },
        });
      }
    }

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
        ...(recoveryDecision ? {
          incident_id: result.rows[0].id,
          failure: failureMetadata,
          recovery_options: recoveryDecision.recoveryOptions,
        } : {}),
      },
      message: eventType === 'sos'
        ? 'SOS terkirim. Tim operasional sedang memantau lokasi Anda.'
        : recoveryDecision
          ? 'Laporan failed delivery dan bukti sudah tercatat. Pilih tindak lanjut melalui operasional; return tidak dibuat otomatis.'
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
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(token)) {
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
         o.route_duration_seconds,
         o.route_provider,
         o.route_snapshot,
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

    const freshness = getTrackingFreshness(row.last_location_at);
    const routeSnapshot = row.route_snapshot && typeof row.route_snapshot === 'object' ? row.route_snapshot : {};
    const etaMinutes = Number.isFinite(Number(row.route_duration_seconds)) && Number(row.route_duration_seconds) > 0
      ? Math.max(1, Math.ceil(Number(row.route_duration_seconds) / 60))
      : Number.isFinite(Number(routeSnapshot.eta_minutes)) && Number(routeSnapshot.eta_minutes) > 0
        ? Number(routeSnapshot.eta_minutes)
        : null;

    res.json({
      success: true,
      data: {
        ...row,
        route_snapshot: undefined,
        eta_minutes: etaMinutes,
        eta: etaMinutes == null ? null : `${etaMinutes} menit`,
        eta_source: row.route_provider || routeSnapshot.provider || null,
        location_stale: freshness.is_stale,
        location_age_seconds: freshness.age_seconds,
        location_stale_reason: freshness.stale_reason,
      },
      message: 'Trip tracking loaded',
    });
  } catch (error) {
    securityLog.error('Get public trip share error:', error);
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

/**
 * GET /admin/gps-risk-alerts
 *
 * Proof attempts are immutable evidence. This read model exposes the risky
 * attempts together with a separate operator action state, so an alert can be
 * acknowledged/resolved without rewriting the original evidence.
 */
export const listAdminGpsRiskAlerts = async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT cpa.id,
              cpa.order_id,
              o.order_number,
              cpa.courier_id,
              u.full_name AS courier_name,
              cpa.proof_step,
              cpa.proof_status,
              cpa.rejection_reason,
              cpa.distance_m,
              cpa.radius_m,
              cpa.latitude,
              cpa.longitude,
              cpa.accuracy_m,
              cpa.spoof_risk,
              cpa.created_at,
              COALESCE(gra.status, 'open') AS action_status,
              gra.note AS action_note,
              gra.updated_at AS action_updated_at
       FROM courier_proof_attempts cpa
       JOIN users u ON u.id = cpa.courier_id
       LEFT JOIN orders o ON o.id = cpa.order_id
       LEFT JOIN courier_gps_risk_actions gra ON gra.proof_attempt_id = cpa.id
       WHERE cpa.proof_status = 'rejected'
         AND (cpa.spoof_risk IN ('high', 'critical')
              OR cpa.rejection_reason IN ('outside_geofence', 'high_spoof_risk'))
       ORDER BY cpa.created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    securityLog.error('List admin GPS risk alerts error:', error);
    res.status(500).json({ success: false, data: [], message: 'Internal Server Error' });
  }
};

export const updateAdminGpsRiskAlert = async (req: Request, res: Response) => {
  const proofAttemptId = String(req.params.id || '').trim();
  const status = String(req.body?.status || '').trim().toLowerCase();
  const note = req.body?.note ? String(req.body.note).trim().slice(0, 500) : null;
  if (!proofAttemptId || !['acknowledged', 'resolved'].includes(status)) {
    res.status(400).json({ success: false, message: 'status harus acknowledged atau resolved' });
    return;
  }

  try {
    const actorId = getActorId(req);
    const exists = await db.query(
      `SELECT id FROM courier_proof_attempts
       WHERE id = $1 AND proof_status = 'rejected'
         AND (spoof_risk IN ('high', 'critical')
              OR rejection_reason IN ('outside_geofence', 'high_spoof_risk'))`,
      [proofAttemptId]
    );
    if (exists.rows.length === 0) {
      res.status(404).json({ success: false, message: 'GPS risk alert tidak ditemukan' });
      return;
    }

    const result = await db.query(
      `INSERT INTO courier_gps_risk_actions (proof_attempt_id, status, actor_id, note, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (proof_attempt_id) DO UPDATE SET
         status = EXCLUDED.status,
         actor_id = EXCLUDED.actor_id,
         note = EXCLUDED.note,
         updated_at = NOW()
       RETURNING proof_attempt_id, status, actor_id, note, updated_at`,
      [proofAttemptId, status, actorId, note]
    );
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [actorId, `courier.gps_risk.${status}`, proofAttemptId, JSON.stringify({ note })]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    securityLog.error('Update admin GPS risk alert error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
