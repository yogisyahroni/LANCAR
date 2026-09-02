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
  normalizeFaceVerificationType,
  parseCoordinate,
  sha256,
  verifyOnDemandStep,
} from './_shared';

export const verifyMobileCourierFace = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const verificationType = normalizeFaceVerificationType(req.body?.verification_type || req.body?.verificationType);
  const orderId = req.body?.order_id || req.body?.orderId ? String(req.body?.order_id || req.body?.orderId).trim() : null;
  const challengeCode = req.body?.challenge_code || req.body?.challengeCode ? String(req.body?.challenge_code || req.body?.challengeCode).trim() : null;
  const livenessScore = req.body?.liveness_score || req.body?.livenessScore ? Number(req.body?.liveness_score || req.body?.livenessScore) : null;

  if (!req.file) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Foto wajah wajib dikirim untuk verifikasi.',
      code: 'ERR_FACE_PHOTO_REQUIRED',
    });
    return;
  }

  const provider = String(process.env.FACE_VERIFICATION_PROVIDER || '').trim();
  const devBypassAllowed = process.env.NODE_ENV !== 'production' && process.env.FACE_VERIFICATION_DEV_BYPASS === 'true';
  const minimumScore = Number(process.env.FACE_VERIFICATION_MIN_SCORE || 0.75);
  const canVerifyLocally = devBypassAllowed && (livenessScore == null || livenessScore >= minimumScore);
  const status = provider
    ? (canVerifyLocally ? 'verified' : 'pending_review')
    : (canVerifyLocally ? 'verified' : 'provider_required');
  const savedUpload = saveSecureUploadBuffer(req.file, 'face-verifications');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (orderId) {
      const accessRes = await client.query(
        `SELECT 1
         FROM order_legs
         WHERE order_id = $1
           AND courier_id = $2
         LIMIT 1`,
        [orderId, req.user.id]
      );
      if (accessRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(403).json({
          success: false,
          data: null,
          message: 'Order tidak tersedia untuk akun kurir ini.',
          code: 'ERR_ORDER_FORBIDDEN',
        });
        return;
      }
    }

    const insertRes = await client.query(
      `INSERT INTO courier_face_verifications (
         courier_id,
         order_id,
         verification_type,
         status,
         provider,
         liveness_score,
         image_url,
         image_checksum_sha256,
         challenge_code_hash,
         failure_reason,
         metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, status, created_at`,
      [
        req.user.id,
        orderId,
        verificationType,
        status,
        provider || (devBypassAllowed ? 'non_production_device_check' : 'provider_required'),
        Number.isFinite(livenessScore) ? livenessScore : null,
        savedUpload.fileUrl,
        req.file.checksumSha256 || sha256(savedUpload.fileUrl),
        challengeCode ? sha256(challengeCode) : null,
        status === 'provider_required' ? 'FACE_VERIFICATION_PROVIDER is not configured' : null,
        JSON.stringify({
          source: 'courier_mobile',
          mime_type: req.file.detectedMimeType,
          file_size_bytes: req.file.size,
          dev_bypass: devBypassAllowed,
        }),
      ]
    );

    if (status === 'verified') {
      await client.query(
        `UPDATE courier_profiles
            SET face_enrolled = TRUE,
                face_verified_at = NOW(),
                face_liveness_score = COALESCE($2, face_liveness_score),
                updated_at = NOW()
          WHERE user_id = $1`,
        [req.user.id, Number.isFinite(livenessScore) ? livenessScore : null]
      );
    }

    await client.query('COMMIT');

    const responseStatus = status === 'provider_required' ? 503 : 200;
    res.status(responseStatus).json({
      success: status === 'verified',
      data: {
        verification_id: insertRes.rows[0].id,
        status: insertRes.rows[0].status,
        verification_type: verificationType,
        order_id: orderId,
        created_at: insertRes.rows[0].created_at,
      },
      message: status === 'verified'
        ? 'Verifikasi wajah berhasil.'
        : status === 'pending_review'
          ? 'Verifikasi wajah menunggu review provider.'
          : 'Provider verifikasi wajah belum dikonfigurasi.',
      code: status === 'provider_required' ? 'ERR_FACE_PROVIDER_REQUIRED' : undefined,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Verify mobile courier face error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};



export const scanMobileCourierOrder = async (req: Request, res: Response) => {
  const orderId = String(req.body?.order_id || req.body?.orderId || '');
  const scanType = String(req.body?.scan_type || req.body?.scanType || 'pickup').toLowerCase();
  const latitude = parseCoordinate(req.body?.latitude);
  const longitude = parseCoordinate(req.body?.longitude);
  const accuracy = parseCoordinate(req.body?.accuracy);

  if (!orderId || latitude == null || longitude == null) {
    res.status(400).json({ success: false, data: null, message: 'Order dan lokasi wajib dikirim.', code: 'ERR_BAD_REQUEST' });
    return;
  }

  await verifyOnDemandStep({
    req,
    res,
    orderId,
    step: scanType === 'delivery' || scanType === 'pod' ? 'delivery' : 'pickup',
    latitude,
    longitude,
    accuracy,
    barcodeValue: req.body?.barcode_value || req.body?.barcodeValue || null,
    spoofRisk: req.body?.spoof_risk || req.body?.spoofRisk || null,
    faceVerificationId: req.body?.face_verification_id || req.body?.faceVerificationId || null,
    packageCode: req.body?.package_code || req.body?.packageCode || null,
    overrideReason: req.body?.override_reason || req.body?.overrideReason || null,
  });
};



export const uploadMobileCourierPod = async (req: Request, res: Response) => {
  const orderId = String(req.body?.order_id || req.body?.orderId || '');
  const latitude = parseCoordinate(req.body?.latitude);
  const longitude = parseCoordinate(req.body?.longitude);
  const accuracy = parseCoordinate(req.body?.accuracy);

  if (!orderId || latitude == null || longitude == null || !req.file) {
    res.status(400).json({ success: false, data: null, message: 'Order, lokasi, dan foto POD wajib dikirim.', code: 'ERR_BAD_REQUEST' });
    return;
  }

  const savedUpload = saveSecureUploadBuffer(req.file, 'pod');

  const proofType = String(req.body?.proof_type || req.body?.proofType || 'delivery').toLowerCase();
  const pickupProofTypes = new Set(['pickup', 'pickup_photo', 'pickup_scan']);
  const deliveryProofTypes = new Set(['delivery', 'pod', 'delivery_pod', 'delivery_pod_photo', 'delivery_signature']);

  if (!pickupProofTypes.has(proofType) && !deliveryProofTypes.has(proofType)) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Tipe bukti tidak dikenali.',
      code: 'ERR_INVALID_PROOF_TYPE',
    });
    return;
  }

  await verifyOnDemandStep({
    req,
    res,
    orderId,
    step: pickupProofTypes.has(proofType) ? 'pickup' : 'delivery',
    latitude,
    longitude,
    accuracy,
    barcodeValue: req.body?.barcode_value || req.body?.barcodeValue || null,
    photoUrl: savedUpload.fileUrl,
    spoofRisk: req.body?.spoof_risk || req.body?.spoofRisk || null,
    faceVerificationId: req.body?.face_verification_id || req.body?.faceVerificationId || null,
    packageCode: req.body?.package_code || req.body?.packageCode || null,
    overrideReason: req.body?.override_reason || req.body?.overrideReason || null,
  });
};



export const uploadMobileCourierServiceReportProof = async (req: Request, res: Response) => {
  const orderId = String(req.body?.order_id || req.body?.orderId || '').trim();
  const serviceType = String(req.body?.service_type || req.body?.serviceType || '').trim().toLowerCase();
  const proofType = String(req.body?.proof_type || req.body?.proofType || '').trim().toLowerCase();

  const allowedServices = new Set(['tambal_ban', 'towing']);
  const allowedProofTypes = new Set([
    'tire_photo_before',
    'tire_photo_after',
    'vehicle_photo_before',
    'loading_photo',
    'unloading_photo',
    'completion_photo',
    'signature',
  ]);

  if (!orderId || !allowedServices.has(serviceType) || !allowedProofTypes.has(proofType) || !req.file) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Order, jenis layanan, tipe bukti, dan foto wajib dikirim.',
      code: 'ERR_BAD_REQUEST',
    });
    return;
  }

  const courierId = req.user?.id;
  if (!courierId) {
    res.status(401).json({
      success: false,
      data: null,
      message: 'Sesi kurir tidak valid.',
      code: 'ERR_UNAUTHORIZED',
    });
    return;
  }

  const ownership = await db.query(
    `SELECT status, vehicle_id
       FROM order_legs
      WHERE order_id = $1
        AND courier_id = $2
      LIMIT 1`,
    [orderId, courierId]
  );

  if (ownership.rows.length === 0) {
    res.status(403).json({
      success: false,
      data: null,
      message: 'Order tidak tersedia untuk akun kurir ini.',
      code: 'ERR_ORDER_FORBIDDEN',
    });
    return;
  }

  const legStatus = String(ownership.rows[0]?.status || '').trim().toLowerCase();
  const boundVehicleId = typeof ownership.rows[0]?.vehicle_id === 'string' ? ownership.rows[0].vehicle_id.trim() : '';
  if (serviceType === 'towing' && !boundVehicleId) {
    res.status(409).json({
      success: false,
      data: null,
      message: 'Kendaraan towing belum terikat pada order ini.',
      code: 'ERR_VEHICLE_BINDING_REQUIRED',
    });
    return;
  }
  if (proofType === 'vehicle_photo_before' && towingBeforeProofIsLocked(legStatus)) {
    res.status(409).json({
      success: false,
      data: null,
      message: 'Bukti kondisi awal kendaraan sudah terkunci setelah transit dimulai.',
      code: 'ERR_PROOF_IMMUTABLE',
    });
    return;
  }

  const savedUpload = saveSecureUploadBuffer(req.file, `service-reports/${serviceType}/${proofType}`);

  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [
      courierId,
      'towing.proof.uploaded',
      orderId,
      JSON.stringify({
        service_type: serviceType,
        proof_type: proofType,
        vehicle_id: boundVehicleId || null,
        storage_key: savedUpload.storageKey,
        checksum_sha256: req.file.checksumSha256 || null,
      }),
    ],
  );

  res.status(201).json({
    success: true,
    data: {
      order_id: orderId,
      service_type: serviceType,
      proof_type: proofType,
      file_url: savedUpload.fileUrl,
      storage_key: savedUpload.storageKey,
      checksum_sha256: req.file.checksumSha256 || null,
      mime_type: req.file.detectedMimeType || null,
    },
    message: 'Bukti layanan tersimpan.',
  });
};

/**
 * Before-condition evidence is a historical fact. It must not be captured
 * once the assigned leg has entered transit or any downstream stage.
 */
export const towingBeforeProofIsLocked = (legStatus: string): boolean =>
  new Set([
    'in_transit',
    'arrived_dropoff',
    'unloading',
    'completed',
    'delivered',
    'cancelled',
    'failed',
  ]).has(legStatus.trim().toLowerCase());



export const getMobileCourierPickupCancellationReasons = async (_req: Request, res: Response) => {
  const reasonsRes = await db.query(
    `SELECT code, title, description, updated_at
       FROM courier_pickup_cancellation_reasons
      WHERE is_active = TRUE
      ORDER BY display_order ASC, title ASC`
  );

  if (!reasonsRes.rows.length) {
    res.status(503).json({
      success: false,
      data: null,
      message: 'Konfigurasi alasan pembatalan pickup belum tersedia.',
      code: 'ERR_PICKUP_CANCEL_REASONS_NOT_CONFIGURED',
    });
    return;
  }

  res.json({
    success: true,
    data: reasonsRes.rows.map((row) => ({
      code: row.code,
      title: row.title,
      description: row.description,
    })),
    cache_ttl_seconds: 300,
    version: reasonsRes.rows
      .map((row) => row.updated_at)
      .filter(Boolean)
      .sort()
      .pop() || null,
    message: 'Alasan pembatalan pickup tersedia.',
  });
};


