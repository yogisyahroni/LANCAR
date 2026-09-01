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
  notifyAdminOps,
  parseCoordinate,
} from './_shared';

export const getMobileCourierStatusTransitions = async (req: Request, res: Response) => {
  const workflowRole = String(req.query.workflow_role || req.query.workflowRole || 'on_demand').trim().toLowerCase();
  const currentStatus = String(req.query.current_status || req.query.currentStatus || '').trim().toLowerCase();

  if (!workflowRole) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Workflow role wajib dikirim.',
      code: 'ERR_BAD_REQUEST',
    });
    return;
  }

  const params: string[] = [workflowRole];
  const currentStatusClause = currentStatus ? 'AND from_status = $2' : '';
  if (currentStatus) params.push(currentStatus);

  const transitionsRes = await db.query(
      `SELECT
        workflow_role,
        from_status,
        to_status,
        label,
        description,
        requires_proof,
        requires_admin,
        display_order,
        version,
        updated_at
       FROM status_transition_policies
      WHERE workflow_role = $1
        AND is_active = TRUE
        AND requires_admin = FALSE
        ${currentStatusClause}
      ORDER BY from_status ASC, display_order ASC, label ASC`,
    params
  );

  if (!transitionsRes.rows.length) {
    res.status(503).json({
      success: false,
      data: null,
      message: 'Konfigurasi transisi status order belum tersedia.',
      code: 'ERR_STATUS_TRANSITIONS_NOT_CONFIGURED',
    });
    return;
  }

  res.json({
    success: true,
    data: transitionsRes.rows.map((row) => ({
      workflow_role: row.workflow_role,
      from_status: row.from_status,
      to_status: row.to_status,
      label: row.label,
      description: row.description,
      requires_proof: row.requires_proof,
      requires_admin: row.requires_admin,
      display_order: Number(row.display_order || 0),
      version: Number(row.version || 1),
    })),
    cache_ttl_seconds: 300,
    version: transitionsRes.rows
      .map((row) => row.updated_at)
      .filter(Boolean)
      .sort()
      .pop() || null,
    message: 'Transisi status order tersedia.',
  });
};



export const updateMobileCourierOrderStatus = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const orderId = String(req.body?.order_id || req.body?.orderId || '').trim();
  const requestedStatus = String(req.body?.status || '').trim().toLowerCase();
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;

  if (!orderId || !requestedStatus) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Order dan status tujuan wajib dikirim.',
      code: 'ERR_BAD_REQUEST',
    });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT
          o.id AS order_id,
          o.order_number,
          o.customer_id,
          o.merchant_id,
          o.model,
          o.status AS order_status,
          o.service_code,
          o.batch_id,
          ol.id AS leg_id,
          ol.status AS leg_status,
          COALESCE(dsp.service_category, '') AS service_category,
          COALESCE(dsp.failed_delivery_policy, CASE WHEN COALESCE(dsp.service_category, '') = 'regular' THEN 'reschedule_then_return' ELSE 'must_deliver' END) AS failed_delivery_policy,
          COALESCE(dsp.regular_max_reschedule_attempts, 3)::int AS regular_max_reschedule_attempts,
          CASE
            WHEN COALESCE(dsp.service_category, '') IN ('on_demand', 'tambal_ban', 'towing') THEN 'on_demand'
            WHEN COALESCE(dsp.service_category, '') = 'food_delivery' THEN 'food_delivery'
            WHEN LOWER(o.model) = 'p2p' THEN 'regular'
            WHEN ol.leg_number = 1 THEN 'pickup'
            WHEN ol.leg_number > 1 THEN 'delivery'
            ELSE 'network'
          END AS workflow_role
         FROM order_legs ol
         JOIN orders o ON o.id = ol.order_id
         LEFT JOIN delivery_service_products dsp ON dsp.code = COALESCE(NULLIF(o.service_code, ''), o.service_sub_type)
        WHERE o.id = $1
          AND ol.courier_id = $2
        ORDER BY ol.leg_number ASC
        LIMIT 1
        FOR UPDATE OF o, ol`,
      [orderId, req.user.id]
    );

    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        data: null,
        message: 'Order tidak ditemukan untuk kurir ini.',
        code: 'ERR_ORDER_NOT_FOUND',
      });
      return;
    }

    const order = orderRes.rows[0];
    const workflowRole = String(order.workflow_role || 'network');
    const currentStatus = String(order.leg_status || order.order_status || '').toLowerCase();
    const failedDeliveryPolicy = String(order.failed_delivery_policy || '').toLowerCase();

    // F8-AN-071 (resurrection guard): order dengan status FINAL tidak boleh
    // diubah lagi — delivered/cancelled immutable. Mencegah event telat /
    // request kurir mengubah status yang sudah final (harus 409 jelas,
    // bukan 503 "internal error").
    const finalOrderStatus = String(order.order_status || '').toLowerCase();
    if (['delivered', 'cancelled', 'completed', 'returned'].includes(finalOrderStatus)) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: null,
        message: `Order sudah berstatus final (${order.order_status}) — status tidak bisa diubah lagi.`,
        code: 'ERR_FINAL_STATUS',
      });
      return;
    }

    if (workflowRole === 'on_demand' && ['failed', 'return_required', 'returned', 'reschedule_required', 'delivery_rescheduled'].includes(requestedStatus)) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: {
          failed_delivery_policy: failedDeliveryPolicy || 'must_deliver',
        },
        message: 'Order on-demand wajib diselesaikan sampai terkirim. Laporkan kendala melalui fitur bantuan/SOS, bukan status gagal atau return.',
        code: 'ERR_ON_DEMAND_MUST_DELIVER',
      });
      return;
    }

    let effectiveRequestedStatus = requestedStatus;
    let regularFailedAttempt = 0;
    if (workflowRole === 'regular' && requestedStatus === 'failed') {
      const attemptRes = await client.query(
        `SELECT COUNT(*)::int AS attempts
         FROM order_events
         WHERE order_id = $1
           AND event_type IN ('regular_delivery_failed', 'delivery_rescheduled')`,
        [orderId]
      );
      regularFailedAttempt = Number(attemptRes.rows[0]?.attempts || 0) + 1;
      const maxAttempts = Number(order.regular_max_reschedule_attempts || 3);
      effectiveRequestedStatus = regularFailedAttempt >= maxAttempts ? 'return_required' : 'delivery_rescheduled';
    }

    const configuredRes = await client.query(
      `SELECT COUNT(*)::int AS total
         FROM status_transition_policies
        WHERE workflow_role = $1
          AND from_status = $2
          AND is_active = TRUE
          AND requires_admin = FALSE`,
      [workflowRole, currentStatus]
    );

    if (Number(configuredRes.rows[0]?.total || 0) === 0) {
      await client.query('ROLLBACK');
      res.status(503).json({
        success: false,
        data: null,
        message: 'Policy transisi status untuk status order saat ini belum dikonfigurasi.',
        code: 'ERR_STATUS_TRANSITION_POLICY_MISSING',
      });
      return;
    }

    const policyRes = await client.query(
      `SELECT to_status, label, requires_proof
         FROM status_transition_policies
        WHERE workflow_role = $1
          AND from_status = $2
          AND to_status = $3
          AND is_active = TRUE
          AND requires_admin = FALSE
        LIMIT 1`,
      [workflowRole, currentStatus, effectiveRequestedStatus]
    );

    if (!policyRes.rows.length) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        data: null,
        message: 'Transisi status tidak diizinkan oleh policy operasional.',
        code: 'ERR_STATUS_TRANSITION_NOT_ALLOWED',
      });
      return;
    }

    const policy = policyRes.rows[0];
    if (policy.requires_proof) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: null,
        message: 'Status ini wajib diperbarui lewat flow bukti pickup/POD, bukan update manual.',
        code: 'ERR_STATUS_REQUIRES_PROOF',
      });
      return;
    }

    const pickupStatuses = ['going_to_pickup', 'pickup_pending', 'pickup_arrived', 'picked_up', 'in_transit'];
    const isPickupStatus = pickupStatuses.includes(effectiveRequestedStatus);

    if (isPickupStatus && order.batch_id) {
      await client.query(
        `UPDATE order_legs
            SET status = $2::text,
                started_at = CASE WHEN $2::text IN ('picked_up', 'in_transit') THEN COALESCE(started_at, NOW()) ELSE started_at END,
                completed_at = CASE WHEN $2::text IN ('delivered', 'failed', 'return_required') THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
                updated_at = NOW()
          WHERE courier_id = $3 AND order_id IN (SELECT id FROM orders WHERE batch_id = $1)`,
        [order.batch_id, effectiveRequestedStatus, req.user.id]
      );

      await client.query(
        `UPDATE orders
            SET status = $2::text,
                picked_up_at = CASE WHEN $2::text IN ('picked_up', 'in_transit') THEN COALESCE(picked_up_at, NOW()) ELSE picked_up_at END,
                delivered_at = CASE WHEN $2::text = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
                updated_at = NOW()
          WHERE batch_id = $1`,
        [order.batch_id, effectiveRequestedStatus]
      );
    } else {
      await client.query(
        `UPDATE order_legs
            SET status = $2::text,
                started_at = CASE WHEN $2::text IN ('picked_up', 'in_transit') THEN COALESCE(started_at, NOW()) ELSE started_at END,
                completed_at = CASE WHEN $2::text IN ('delivered', 'failed', 'return_required') THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
                updated_at = NOW()
          WHERE id = $1`,
        [order.leg_id, effectiveRequestedStatus]
      );

      await client.query(
        `UPDATE orders
            SET status = $2::text,
                picked_up_at = CASE WHEN $2::text IN ('picked_up', 'in_transit') THEN COALESCE(picked_up_at, NOW()) ELSE picked_up_at END,
                delivered_at = CASE WHEN $2::text = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
                updated_at = NOW()
          WHERE id = $1`,
        [orderId, effectiveRequestedStatus]
      );
    }

    const statusEventType = requestedStatus === 'pickup_arrived'
      ? 'pickup_arrived'
      : workflowRole === 'regular' && requestedStatus === 'failed'
      ? (effectiveRequestedStatus === 'return_required' ? 'return_required' : 'delivery_rescheduled')
      : 'courier_status_updated';

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        orderId,
        req.user.id,
        statusEventType,
        `Courier updated status from ${currentStatus} to ${effectiveRequestedStatus}`,
        JSON.stringify({
          from_status: currentStatus,
          requested_status: requestedStatus,
          to_status: effectiveRequestedStatus,
          workflow_role: workflowRole,
          policy_label: policy.label,
          failed_delivery_policy: failedDeliveryPolicy || null,
          regular_failed_attempt: regularFailedAttempt || null,
          regular_max_reschedule_attempts: Number(order.regular_max_reschedule_attempts || 3),
          notes,
          source: 'courier_mobile',
        }),
      ]
    );

    await client.query('COMMIT');

    emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED, {
      order_id: orderId,
      order_number: order.order_number || null,
      customer_id: order.customer_id || null,
      courier_user_id: req.user.id,
      merchant_id: order.merchant_id || null,
      admin_broadcast: true,
      status: effectiveRequestedStatus,
      stage: 'status_updated',
      metadata: {
        from_status: currentStatus,
        requested_status: requestedStatus,
        to_status: effectiveRequestedStatus,
        workflow_role: workflowRole,
        policy_label: policy.label,
      },
    });

    res.json({
      success: true,
      data: true,
      message: 'Status order diperbarui sesuai policy.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Update mobile courier order status error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};



export const cancelMobileCourierOnDemandPickup = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const orderId = String(req.params.orderId || req.body?.order_id || req.body?.orderId || '');
  const reasonCode = String(req.body?.reason_code || req.body?.reasonCode || '').trim();
  const reasonNote = req.body?.reason_note || req.body?.reasonNote ? String(req.body?.reason_note || req.body?.reasonNote).trim() : null;
  const latitude = parseCoordinate(req.body?.latitude);
  const longitude = parseCoordinate(req.body?.longitude);
  const accuracy = parseCoordinate(req.body?.accuracy);

  let allowedReasons: Set<string>;
  try {
    const activeReasonRes = await db.query(
      `SELECT code
         FROM courier_pickup_cancellation_reasons
        WHERE is_active = TRUE`
    );
    allowedReasons = new Set(activeReasonRes.rows.map((row) => String(row.code)));
  } catch (_error) {
    res.status(500).json({ success: false, data: null, message: 'Gagal membaca konfigurasi alasan pembatalan pickup.', code: 'ERR_REASON_CONFIG_UNAVAILABLE' });
    return;
  }

  if (!orderId || !reasonCode || !allowedReasons.has(reasonCode)) {
    res.status(400).json({ success: false, data: null, message: 'Alasan pembatalan pickup tidak valid.', code: 'ERR_INVALID_REASON' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ success: false, data: null, message: 'Foto bukti wajib dikirim sebelum pickup dibatalkan.', code: 'ERR_PHOTO_REQUIRED' });
    return;
  }

  const savedUpload = saveSecureUploadBuffer(req.file, 'cancellations');
  const photoUrl = savedUpload.fileUrl;

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
         o.merchant_id,
         ol.id AS leg_id,
         ol.status AS leg_status
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       JOIN courier_profiles cp ON cp.user_id = ol.courier_id
       WHERE o.id = $1
         AND ol.courier_id = $2
         AND cp.application_channel = 'on_demand'
         AND LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
       LIMIT 1
       FOR UPDATE OF o, ol`,
      [orderId, req.user.id]
    );

    const order = orderRes.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Order on-demand tidak ditemukan untuk kurir ini.', code: 'ERR_ORDER_NOT_FOUND' });
      return;
    }

    const currentStatus = String(order.status || '').toLowerCase();
    if (['picked_up', 'in_transit', 'delivered', 'completed'].includes(currentStatus)) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: null,
        message: 'Pickup sudah selesai. Order wajib dilanjutkan ke pengantaran.',
        code: 'ERR_PICKUP_ALREADY_COMPLETED',
      });
      return;
    }

    const proofRes = await client.query(
      `SELECT id
       FROM package_scans
       WHERE order_id = $1
         AND scan_type IN ('pickup', 'pickup_scan', 'pickup_photo')
       LIMIT 1`,
      [orderId]
    );
    if (proofRes.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: null,
        message: 'Bukti pickup sudah tercatat. Order wajib dilanjutkan ke pengantaran.',
        code: 'ERR_PICKUP_PROOF_EXISTS',
      });
      return;
    }

    const cancellationReason = reasonNote ? `${reasonCode}: ${reasonNote}` : reasonCode;
    await client.query(
      `UPDATE orders
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancellation_reason = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [orderId, cancellationReason]
    );

    await client.query(
      `UPDATE order_legs
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1`,
      [order.leg_id]
    );

    await client.query(
      `UPDATE courier_offer_dispatches
       SET status = CASE WHEN status = 'accepted' THEN 'cancelled' ELSE status END,
           response_reason = COALESCE(response_reason, $3),
           updated_at = NOW()
       WHERE order_id = $1 AND courier_id = $2`,
      [orderId, req.user.id, reasonCode]
    );

    await client.query(
      `INSERT INTO package_scans (
         order_id,
         scanned_by,
         scanned_by_role,
         scan_type,
         image_urls,
         photo_url,
         latitude,
         longitude,
         location_accuracy_m,
         scan_location,
         override_reason
       )
       VALUES (
         $1,
         $2,
         'courier',
         'pickup_cancellation',
         ARRAY[$3::text],
         $3,
         $4,
         $5,
         $6,
         CASE WHEN $4::double precision IS NULL OR $5::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography END,
         $7
       )`,
      [orderId, req.user.id, photoUrl, latitude, longitude, accuracy, cancellationReason]
    );

    await client.query(
      `INSERT INTO courier_safety_events (
         order_id, courier_id, event_type, severity, latitude, longitude, accuracy_m, message, metadata
       )
       VALUES ($1, $2, 'support_request', 'high', $3, $4, $5, $6, $7)`,
      [
        orderId,
        req.user.id,
        latitude,
        longitude,
        accuracy,
        reasonNote || cancellationReason,
        JSON.stringify({
          source: 'courier_app',
          action: 'pickup_cancelled',
          reason_code: reasonCode,
          reason_note: reasonNote,
          photo_url: photoUrl,
          app_surface: 'on_demand_pickup_validation',
        }),
      ]
    );

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, 'pickup_cancelled_by_courier', 'Courier cancelled on-demand pickup before custody transfer', $3)`,
      [
        orderId,
        req.user.id,
        JSON.stringify({
          reason_code: reasonCode,
          reason_note: reasonNote,
          photo_url: photoUrl,
          latitude,
          longitude,
          accuracy_m: accuracy,
          source: 'courier_app',
        }),
      ]
    );

    await notifyAdminOps({
      title: 'Pickup On-Demand Dibatalkan Kurir',
      body: reasonNote || `Alasan: ${reasonCode.replace(/_/g, ' ')}`,
      type: 'courier_pickup_cancelled',
      order_id: orderId,
      metadata: {
        courier_id: req.user.id,
        reason_code: reasonCode,
        reason_note: reasonNote,
        photo_url: photoUrl,
      },
    });

    await client.query('COMMIT');
    emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.PICKUP_CANCELLED, {
      order_id: orderId,
      order_number: order.order_number || null,
      customer_id: order.customer_id,
      courier_user_id: req.user.id,
      merchant_id: order.merchant_id || null,
      admin_broadcast: true,
      status: 'cancelled',
      stage: 'pickup_cancelled',
      location: latitude != null && longitude != null ? {
        latitude,
        longitude,
        accuracy: accuracy || undefined,
        timestamp: new Date().toISOString(),
      } : null,
      proof: {
        proof_type: 'pickup_cancellation',
        reason_code: reasonCode,
        reason_note: reasonNote,
        photo_url: photoUrl,
      },
    });
    if (order.customer_id) {
      try {
        await createNotification({
          user_id: order.customer_id,
          title: 'Pickup belum bisa dilanjutkan',
          body: 'Kurir mengirim alasan dan bukti pembatalan pickup. Tim operasional akan membantu pengecekan.',
          type: 'pickup_cancelled',
          order_id: orderId,
          deep_link: `/orders/${orderId}`,
          metadata: {
            order_number: order.order_number || '',
            reason_code: reasonCode,
            reason_note: reasonNote,
            photo_url: photoUrl,
          },
        });
      } catch (notificationError) {
        console.warn('Failed to notify customer about pickup cancellation:', notificationError);
      }
    }
    res.json({
      success: true,
      data: {
        order_id: orderId,
        status: 'cancelled',
        reason_code: reasonCode,
        photo_url: photoUrl,
      },
      message: 'Pickup dibatalkan. Bukti dan alasan sudah dikirim ke operasional.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Cancel mobile courier on-demand pickup error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

