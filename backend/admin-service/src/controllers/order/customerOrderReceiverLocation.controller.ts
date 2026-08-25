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
  hashPhoneForPrivateLookup,
  maskPhone,
  normalizeCoordinatePayload,
  receiverLocationBaseUrl,
  sha256,
  validAddress,
} from './_shared';

export const createReceiverLocationRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const {
      pickup_address,
      pickup_location,
      recipient_name,
      recipient_phone,
      expires_hours = 24
    } = req.body || {};

    if (!validAddress(pickup_address)) {
      res.status(400).json({
        success: false,
        message: 'Alamat pickup wajib diisi sebelum membuat link lokasi penerima.'
      });
      return;
    }

    const pickupPoint = normalizeCoordinatePayload(pickup_location);
    const boundedExpiresHours = Math.min(Math.max(Number(expires_hours) || 24, 1), 72);
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = sha256(rawToken);

    const insertSql = `
      INSERT INTO customer_receiver_location_requests (
        customer_id,
        token_hash,
        pickup_address,
        pickup_location,
        recipient_name,
        recipient_phone_masked,
        requested_payload,
        expires_at
      ) VALUES (
        $1,
        $2,
        $3,
        CASE WHEN $4::double precision IS NULL OR $5::double precision IS NULL
          THEN NULL
          ELSE ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography
        END,
        $6,
        $7,
        $8,
        NOW() + ($9::int * INTERVAL '1 hour')
      )
      RETURNING id, status, pickup_address, recipient_name, expires_at, created_at
    `;

    const { rows } = await db.query(insertSql, [
      customerId,
      tokenHash,
      String(pickup_address).trim(),
      pickupPoint?.lat ?? null,
      pickupPoint?.lng ?? null,
      typeof recipient_name === 'string' ? recipient_name.trim() : null,
      maskPhone(recipient_phone),
      JSON.stringify({ source: 'customer_mobile', expires_hours: boundedExpiresHours }),
      boundedExpiresHours
    ]);

    const linkUrl = `${receiverLocationBaseUrl().replace(/\/$/, '')}/location-requests/${rawToken}`;
    res.status(201).json({
      success: true,
      data: {
        ...rows[0],
        url: linkUrl,
        token: rawToken
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};



export const getReceiverLocationRequestForCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    const id = String(req.params.id || '');
    if (!customerId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { rows } = await db.query(
      `SELECT id, status, pickup_address, recipient_name, submitted_address,
              submitted_contact_name, submitted_contact_phone_masked, submitted_notes, submitted_at, expires_at, created_at,
              ST_Y(submitted_location::geometry) AS submitted_lat,
              ST_X(submitted_location::geometry) AS submitted_lng
       FROM customer_receiver_location_requests
       WHERE id = $1 AND customer_id = $2
       LIMIT 1`,
      [id, customerId]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, message: 'Request lokasi tidak ditemukan.' });
      return;
    }

    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};



export const getReceiverLocationRequestPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.params.token || '');
    if (token.length < 32) {
      res.status(404).json({ success: false, message: 'Link lokasi tidak tersedia.' });
      return;
    }

    const { rows } = await db.query(
      `SELECT id, pickup_address, recipient_name, status, submitted_address, submitted_contact_name,
              submitted_contact_phone_masked,
              submitted_notes, submitted_at, expires_at, created_at,
              ST_Y(submitted_location::geometry) AS submitted_lat,
              ST_X(submitted_location::geometry) AS submitted_lng
       FROM customer_receiver_location_requests
       WHERE token_hash = $1
       LIMIT 1`,
      [sha256(token)]
    );

    const request = rows[0];
    if (!request) {
      res.status(404).json({ success: false, message: 'Link lokasi tidak tersedia.' });
      return;
    }

    if (new Date(request.expires_at).getTime() < Date.now() && request.status === 'pending') {
      await db.query(
        `UPDATE customer_receiver_location_requests
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1 AND status = 'pending'`,
        [request.id]
      );
      res.status(410).json({ success: false, message: 'Link lokasi sudah kedaluwarsa.' });
      return;
    }

    if (['revoked', 'cancelled'].includes(String(request.status))) {
      res.status(410).json({ success: false, message: 'Link lokasi sudah tidak aktif.' });
      return;
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};



export const revokeReceiverLocationRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const revoked = await revokeReceiverLocationInvite(req.params.id, req.user);
    res.json({
      success: true,
      data: revoked,
      message: 'Link lokasi penerima sudah dibatalkan.',
    });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, message: error.message });
  }
};



export const submitReceiverLocationRequestPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.params.token || '');
    const {
      address,
      location,
      contact_name,
      contact_phone,
      notes
    } = req.body || {};
    const dropoffPoint = normalizeCoordinatePayload(location);

    if (token.length < 32 || !validAddress(address) || !dropoffPoint) {
      res.status(400).json({
        success: false,
        message: 'Alamat dan titik lokasi penerima wajib valid.'
      });
      return;
    }

    const { rows } = await db.query(
      `UPDATE customer_receiver_location_requests
       SET status = 'submitted',
           submitted_address = $2,
           submitted_location = ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
           submitted_contact_name = NULLIF($5, ''),
           submitted_contact_phone_masked = $6,
           submitted_contact_phone_hash = $7,
           submitted_notes = NULLIF($8, ''),
           submitted_at = NOW(),
           updated_at = NOW()
       WHERE token_hash = $1
         AND status = 'pending'
         AND expires_at > NOW()
       RETURNING id, status, submitted_address, submitted_contact_name, submitted_notes, submitted_at, expires_at,
                 ST_Y(submitted_location::geometry) AS submitted_lat,
                 ST_X(submitted_location::geometry) AS submitted_lng`,
      [
        sha256(token),
        String(address).trim(),
        dropoffPoint.lng,
        dropoffPoint.lat,
        typeof contact_name === 'string' ? contact_name.trim() : '',
        maskPhone(contact_phone),
        hashPhoneForPrivateLookup(contact_phone),
        typeof notes === 'string' ? notes.trim() : ''
      ]
    );

    if (rows.length === 0) {
      res.status(409).json({
        success: false,
        message: 'Link lokasi sudah dipakai, kedaluwarsa, atau tidak aktif.'
      });
      return;
    }

    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


