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
  buildCourierDeviceContext,
  getCourierByIdentity,
  hashDeviceId,
  isCourierLoginOtpRequired,
  isTrustedCourierDevice,
  isValidCourierPassword,
  issueCourierLoginSession,
  normalizeDeviceId,
  sendCourierOtp,
  touchCourierTrustedDevice,
  verifyCourierOtpCode,
} from './_shared';

export const loginCourier = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const deviceId = normalizeDeviceId(req.body?.device_id || req.headers['x-device-id']);
  const ipAddress = getRequestIpAddress(req);

  if (!username || !password) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Username and password are required',
      code: 'ERR_BAD_REQUEST',
    });
    return;
  }
  if (!deviceId) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Device ID is required',
      code: 'ERR_DEVICE_REQUIRED',
    });
    return;
  }

  try {
    await assertAuthAttemptAllowed({
      scope: 'courier_login',
      identifier: normalizedUsername,
      ipAddress,
    });

    const courier = await getCourierByIdentity(normalizedUsername);
    if (!courier || courier.status !== 'active' || !isValidCourierPassword(password, courier.pin_hash)) {
      await recordAuthFailure({
        scope: 'courier_login',
        identifier: normalizedUsername,
        ipAddress,
        reason: !courier || courier.status !== 'active' ? 'invalid_courier' : 'invalid_password',
      });
      res.status(401).json({
        success: false,
        data: null,
        message: 'Username atau password salah',
        code: 'ERR_INVALID_CREDENTIALS',
      });
      return;
    }

    await recordAuthSuccess({
      scope: 'courier_login',
      identifier: normalizedUsername,
      ipAddress,
    });

    const deviceIdHash = hashDeviceId(deviceId);
    const deviceInfo = buildCourierDeviceContext(req);
    const [isTrusted, isOtpRequired] = await Promise.all([
      isTrustedCourierDevice(courier.id, deviceIdHash),
      isCourierLoginOtpRequired(),
    ]);

    if (!isTrusted && isOtpRequired) {
      const recipient = courier.email || courier.phone_number;
      await sendCourierOtp(recipient);
      res.json({
        success: true,
        data: {
          requires_otp: true,
          otp_reason: 'new_device',
          courier_id: courier.id,
          name: courier.full_name,
          phone: courier.phone_number,
          vehicle_type: courier.vehicle_type,
          profile_photo_url: courier.photo_url,
        },
        message: 'Kode OTP dikirim untuk verifikasi perangkat baru',
      });
      return;
    }

    if (isTrusted) {
      await touchCourierTrustedDevice(courier.id, deviceIdHash);
    }

    const loginData = await issueCourierLoginSession(courier, deviceId, deviceInfo);

    res.json({
      success: true,
      data: {
        ...loginData,
        requires_otp: false,
        otp_policy: isOtpRequired ? 'trusted_device' : 'disabled_by_feature_flag',
      },
      message: 'Login successful',
    });
  } catch (error) {
    if (error instanceof AuthProtectionError) {
      sendAuthProtectionError(res, error);
      return;
    }

    securityLog.error('Courier login error:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Internal Server Error',
      code: 'ERR_INTERNAL_SERVER',
    });
  }
};



export const verifyCourierLoginOtp = async (req: Request, res: Response) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const normalizedUsername = username.toLowerCase();
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const deviceId = normalizeDeviceId(req.body?.device_id || req.headers['x-device-id']);
  const ipAddress = getRequestIpAddress(req);

  if (!username || !code || !deviceId) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Username, OTP, and device ID are required',
      code: 'ERR_BAD_REQUEST',
    });
    return;
  }

  try {
    await assertAuthAttemptAllowed({
      scope: 'courier_otp_verify',
      identifier: normalizedUsername,
      ipAddress,
    });

    const courier = await getCourierByIdentity(normalizedUsername);
    if (!courier || courier.status !== 'active') {
      await recordAuthFailure({
        scope: 'courier_otp_verify',
        identifier: normalizedUsername,
        ipAddress,
        reason: 'invalid_courier',
      });
      res.status(401).json({
        success: false,
        data: null,
        message: 'Akun kurir tidak valid',
        code: 'ERR_INVALID_COURIER',
      });
      return;
    }

    const recipient = courier.email || courier.phone_number;
    const isValidOtp = await verifyCourierOtpCode(recipient, code);
    if (!isValidOtp) {
      await recordAuthFailure({
        scope: 'courier_otp_verify',
        identifier: normalizedUsername,
        ipAddress,
        reason: 'invalid_otp',
      });
      res.status(401).json({
        success: false,
        data: null,
        message: 'Kode OTP tidak valid atau sudah kedaluwarsa',
        code: 'ERR_INVALID_OTP',
      });
      return;
    }

    await recordAuthSuccess({
      scope: 'courier_otp_verify',
      identifier: normalizedUsername,
      ipAddress,
    });

    const loginData = await issueCourierLoginSession(courier, deviceId, buildCourierDeviceContext(req));
    res.json({
      success: true,
      data: loginData,
      message: 'Perangkat terverifikasi',
    });
  } catch (error) {
    if (error instanceof AuthProtectionError) {
      sendAuthProtectionError(res, error);
      return;
    }

    securityLog.error('Courier OTP verification error:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Internal Server Error',
      code: 'ERR_INTERNAL_SERVER',
    });
  }
};


