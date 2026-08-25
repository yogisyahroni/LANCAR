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
  maskPhone,
  normalizeAddressKind,
  normalizeCoordinatePayload,
  publicCustomerAddress,
  validAddress,
} from './_shared';

export const createCustomerAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    const {
      label,
      contact_name,
      contact_phone,
      address,
      location,
      notes,
      kind,
      is_favorite,
    } = req.body || {};

    const point = normalizeCoordinatePayload(location);
    const cleanLabel = typeof label === 'string' && label.trim().length >= 2
      ? label.trim().slice(0, 80)
      : null;
    if (!cleanLabel || !validAddress(address) || !point) {
      res.status(400).json({
        success: false,
        data: null,
        message: 'Label, alamat, dan koordinat alamat wajib valid.',
      });
      return;
    }

    const { rows } = await db.query(
      `INSERT INTO customer_addresses (
          customer_id, label, contact_name, contact_phone_masked, address,
          location, notes, kind, is_favorite, last_used_at
       ) VALUES (
          $1, $2, NULLIF($3, ''), $4, $5,
          ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
          NULLIF($8, ''), $9, $10, NOW()
       )
       RETURNING id, label, contact_name, contact_phone_masked, address,
                 ST_Y(location::geometry) AS lat,
                 ST_X(location::geometry) AS lng,
                 notes, kind, is_favorite, usage_count, last_used_at, created_at, updated_at`,
      [
        customerId,
        cleanLabel,
        typeof contact_name === 'string' ? contact_name.trim().slice(0, 160) : '',
        maskPhone(contact_phone),
        String(address).trim(),
        point.lng,
        point.lat,
        typeof notes === 'string' ? notes.trim().slice(0, 500) : '',
        normalizeAddressKind(kind),
        Boolean(is_favorite),
      ]
    );

    res.status(201).json({
      success: true,
      data: publicCustomerAddress(rows[0]),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};



export const updateCustomerAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    const id = String(req.params.id || '');
    if (!customerId) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    const point = req.body?.location ? normalizeCoordinatePayload(req.body.location) : null;
    if (req.body?.location && !point) {
      res.status(400).json({ success: false, data: null, message: 'Koordinat alamat tidak valid.' });
      return;
    }

    const current = await db.query(
      `SELECT * FROM customer_addresses WHERE id = $1 AND customer_id = $2 AND deleted_at IS NULL`,
      [id, customerId]
    );
    if (current.rows.length === 0) {
      res.status(404).json({ success: false, data: null, message: 'Alamat tidak ditemukan.' });
      return;
    }

    const existing = current.rows[0];
    const label = typeof req.body?.label === 'string' && req.body.label.trim().length >= 2
      ? req.body.label.trim().slice(0, 80)
      : existing.label;
    const address = validAddress(req.body?.address) ? String(req.body.address).trim() : existing.address;
    const kind = req.body?.kind ? normalizeAddressKind(req.body.kind) : existing.kind;

    const { rows } = await db.query(
      `UPDATE customer_addresses
       SET label = $3,
           contact_name = COALESCE(NULLIF($4, ''), contact_name),
           contact_phone_masked = COALESCE($5, contact_phone_masked),
           address = $6,
           location = CASE WHEN $7::double precision IS NULL OR $8::double precision IS NULL
             THEN location
             ELSE ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography
           END,
           notes = COALESCE($9, notes),
           kind = $10,
           is_favorite = COALESCE($11, is_favorite),
           usage_count = usage_count + CASE WHEN $12::boolean THEN 1 ELSE 0 END,
           last_used_at = CASE WHEN $12::boolean THEN NOW() ELSE last_used_at END,
           updated_at = NOW()
       WHERE id = $1 AND customer_id = $2 AND deleted_at IS NULL
       RETURNING id, label, contact_name, contact_phone_masked, address,
                 ST_Y(location::geometry) AS lat,
                 ST_X(location::geometry) AS lng,
                 notes, kind, is_favorite, usage_count, last_used_at, created_at, updated_at`,
      [
        id,
        customerId,
        label,
        typeof req.body?.contact_name === 'string' ? req.body.contact_name.trim().slice(0, 160) : '',
        req.body?.contact_phone ? maskPhone(req.body.contact_phone) : null,
        address,
        point?.lat ?? null,
        point?.lng ?? null,
        typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : null,
        kind,
        typeof req.body?.is_favorite === 'boolean' ? req.body.is_favorite : null,
        Boolean(req.body?.mark_used),
      ]
    );

    res.json({ success: true, data: publicCustomerAddress(rows[0]) });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};



export const deleteCustomerAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    const id = String(req.params.id || '');
    if (!customerId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const result = await db.query(
      `UPDATE customer_addresses
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND customer_id = $2 AND deleted_at IS NULL`,
      [id, customerId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Alamat tidak ditemukan.' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};



export const listCustomerAddresses = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      res.status(401).json({ success: false, data: [], message: 'Unauthorized' });
      return;
    }

    const kind = typeof req.query.kind === 'string' ? req.query.kind : '';
    const validKind = ['pickup', 'receiver', 'both'].includes(kind) ? kind : null;
    const params: any[] = [customerId];
    let kindClause = '';
    if (validKind) {
      params.push(validKind);
      kindClause = `AND (kind = $2 OR kind = 'both')`;
    }

    const { rows } = await db.query(
      `SELECT id, label, contact_name, contact_phone_masked, address,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng,
              notes, kind, is_favorite, usage_count, last_used_at, created_at, updated_at
       FROM customer_addresses
       WHERE customer_id = $1
         AND deleted_at IS NULL
         ${kindClause}
       ORDER BY is_favorite DESC, last_used_at DESC NULLS LAST, created_at DESC
       LIMIT 50`,
      params
    );

    res.json({
      success: true,
      data: rows.map(publicCustomerAddress),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: [], message: error.message });
  }
};


