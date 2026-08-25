import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';

import type { PoolClient } from 'pg';
import { db } from '../../db';

import { createNotification } from '../../notifications';
import { createSnapTransaction, getMidtransClientKey, getMidtransSnapJsUrl } from '../../midtrans';

import { isExpiredOrFailedTransaction, isSuccessfulTransaction } from '../../midtrans';
import { calculateServiceSettlement, customerFacingService, DeliveryServiceProduct, findDeliveryServiceByCode, listEnabledDeliveryServicesForCustomer } from '../deliveryServices.controller';

import { advanceOnDemandDispatchQueue, dispatchToPreferredCourier, notifyOnDemandOffers } from '../courierAuth.controller';
import { redis } from '../../redis';

import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../../services/onDemandRealtime';
import { buildOnDemandTrackingSnapshot, evaluateLocationQuality, writeLocationSafetyEvent } from '../../services/onDemandTracking';

import { evaluateOnDemandRealtimeAlerts } from '../../services/realtimeObservability';
import { buildMapsRouteEtaSnapshot, RouteEtaSnapshot } from '../../services/mapsProviderConfig';

import { enqueueOutboxEvent } from '../../services/eventOutbox';
import {
  createOrderCallSession,
  endOrderCallSession,
  errorStatusCode,
  joinOrderCallSession,
  listConversationChats,
  markConversationRead,
  revokeReceiverLocationInvite,
  sendConversationChat,
} from '../../services/orderCommunication';

import crypto from 'crypto';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';

import { releasePromoReservation, validatePromoForCheckout } from '../../services/promoEngine';
import {
  insertWebhookAuditEvent,
  resolveRawBody,
  updateWebhookAuditEvent,
  verifyMidtransSignature,
} from '../../security/webhookSecurity';




import {
  getCustomerWalletBalance,
  normalizeCustomerProfileName,
  normalizeCustomerProfilePhone,
  toMobileCustomerProfileDto,
} from './_shared';

export const getMobileCustomerProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      res.status(401).json({
        success: false,
        data: null,
        message: 'Sesi tidak valid. Silakan masuk kembali.',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    const walletBalance = await getCustomerWalletBalance(customerId);
    const { rows } = await db.query(`
      SELECT id,
             full_name,
             phone_number,
             photo_url,
             store_name,
             default_pickup_address
      FROM users
      WHERE id = $1
        AND role = 'customer'
        AND deleted_at IS NULL
      LIMIT 1
    `, [customerId]);

    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        data: null,
        message: 'Profil customer tidak ditemukan.',
        code: 'CUSTOMER_PROFILE_NOT_FOUND'
      });
      return;
    }

    res.json({
      success: true,
      data: toMobileCustomerProfileDto({ ...rows[0], wallet_balance: walletBalance }),
      message: 'Profil customer berhasil dimuat.'
    });
  } catch (error: any) {
    securityLog.error('Error in getMobileCustomerProfile:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Gagal memuat profil customer.',
      code: 'CUSTOMER_PROFILE_FAILED'
    });
  }
};



export const updateMobileCustomerProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      res.status(401).json({
        success: false,
        data: null,
        message: 'Sesi tidak valid. Silakan masuk kembali.',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    const normalizedName = normalizeCustomerProfileName(req.body?.name);
    if (!normalizedName) {
      res.status(400).json({
        success: false,
        data: null,
        message: 'Nama customer harus 2-120 karakter.',
        code: 'INVALID_CUSTOMER_NAME'
      });
      return;
    }

    const normalizedPhone = normalizeCustomerProfilePhone(req.body?.phone_number);

    const { rows } = await db.query(`
      UPDATE users
      SET full_name = $2,
          phone_number = COALESCE($3, phone_number),
          store_name = COALESCE($4, store_name),
          default_pickup_address = COALESCE($5, default_pickup_address),
          updated_at = NOW()
      WHERE id = $1
        AND role = 'customer'
        AND deleted_at IS NULL
      RETURNING id,
                full_name,
                phone_number,
                photo_url,
                store_name,
                default_pickup_address
    `, [customerId, normalizedName, normalizedPhone, req.body?.store_name, req.body?.default_pickup_address]);

    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        data: null,
        message: 'Profil customer tidak ditemukan.',
        code: 'CUSTOMER_PROFILE_NOT_FOUND'
      });
      return;
    }

    const walletBalance = await getCustomerWalletBalance(customerId);

    res.json({
      success: true,
      data: toMobileCustomerProfileDto({ ...rows[0], wallet_balance: walletBalance }),
      message: 'Profil customer berhasil diperbarui.'
    });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({
        success: false,
        data: null,
        message: 'Nomor handphone sudah digunakan akun lain.',
        code: 'CUSTOMER_PHONE_CONFLICT'
      });
      return;
    }
    securityLog.error('Error in updateMobileCustomerProfile:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Gagal memperbarui profil customer.',
      code: 'UPDATE_CUSTOMER_PROFILE_FAILED'
    });
  }
};



export const uploadMobileCustomerProfilePhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      res.status(401).json({
        success: false,
        data: null,
        message: 'Sesi tidak valid. Silakan masuk kembali.',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        data: null,
        message: 'Foto profil wajib diunggah.',
        code: 'CUSTOMER_PROFILE_PHOTO_REQUIRED'
      });
      return;
    }

    const savedUpload = saveSecureUploadBuffer(req.file, `customers/${customerId}/profile`);
    const { rows } = await db.query(`
      UPDATE users
      SET photo_url = $2,
          updated_at = NOW()
      WHERE id = $1
        AND role = 'customer'
        AND deleted_at IS NULL
      RETURNING id,
                full_name,
                phone_number,
                photo_url
    `, [customerId, savedUpload.fileUrl]);

    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        data: null,
        message: 'Profil customer tidak ditemukan.',
        code: 'CUSTOMER_PROFILE_NOT_FOUND'
      });
      return;
    }

    const walletBalance = await getCustomerWalletBalance(customerId);

    res.json({
      success: true,
      data: toMobileCustomerProfileDto({ ...rows[0], wallet_balance: walletBalance }),
      message: 'Foto profil berhasil diperbarui.'
    });
  } catch {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Gagal mengunggah foto profil.',
      code: 'CUSTOMER_PROFILE_PHOTO_UPLOAD_FAILED'
    });
  }
};


