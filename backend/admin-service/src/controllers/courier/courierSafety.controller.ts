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


