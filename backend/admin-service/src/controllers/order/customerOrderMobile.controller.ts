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
  toMobileCustomerOrderDto,
} from './_shared';

export const getMobileCustomerOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    if (!customer_id) {
      res.status(401).json({
        success: false,
        data: null,
        message: 'Sesi tidak valid. Silakan masuk kembali.',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    const { status, limit, offset } = req.query;
    const limitVal = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 100);
    const offsetVal = Math.max(parseInt(offset as string, 10) || 0, 0);
    const params: any[] = [customer_id];
    let statusFilter = '';

    if (typeof status === 'string' && status.trim() && status !== 'all') {
      params.push(status.trim());
      statusFilter = ` AND o.status = $${params.length}`;
    }

    params.push(limitVal);
    const limitParam = params.length;
    params.push(offsetVal);
    const offsetParam = params.length;

    const { rows } = await db.query(`
      SELECT o.id,
             o.order_number,
             o.pickup_address,
             o.dropoff_address,
             o.recipient_name,
             o.recipient_phone_masked,
             o.model,
             o.status,
             o.distance_km,
             o.route_snapshot,
             o.route_provider,
             o.route_profile,
             o.route_polyline,
             COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0)::int AS route_distance_meters,
             COALESCE(o.route_duration_seconds, NULLIF(o.route_snapshot->>'duration_seconds', '')::int, 0)::int AS route_duration_seconds,
             COALESCE(NULLIF(o.route_snapshot->>'eta_minutes', '')::int, 0)::int AS eta_minutes,
             o.total_price_idr,
             o.scheduled_at,
             o.created_at,
             o.updated_at,
             p.status AS payment_status,
             p.provider AS payment_provider,
             p.method AS payment_method,
             p.amount_idr AS payment_amount_idr,
             p.paid_at,
             p.provider_reference,
             COALESCE(o.service_sub_type, '') AS service_sub_type,
             COALESCE(o.order_notes, '') AS order_notes,
             COALESCE(m.nama_toko, '') AS merchant_name,
             u.full_name AS courier_name,
             cp.vehicle_type AS courier_vehicle,
             cp.vehicle_plate AS courier_plate,
             NULL::text AS courier_phone
      FROM orders o
      LEFT JOIN merchants m ON m.id = o.merchant_id
      LEFT JOIN order_legs ol ON o.id = ol.order_id AND ol.leg_number = 1
      LEFT JOIN users u ON ol.courier_id = u.id
      LEFT JOIN courier_profiles cp ON u.id = cp.user_id
      LEFT JOIN LATERAL (
        SELECT status, provider, method, amount_idr, paid_at, provider_reference
        FROM payments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) p ON TRUE
      WHERE o.customer_id = $1
      ${statusFilter}
      ORDER BY o.created_at DESC
      LIMIT $${limitParam}
      OFFSET $${offsetParam}
    `, params);

    // FB-111: sertakan snapshot food_order_items (harga beku) untuk tiap order
    // food pada daftar riwayat — C-052 butuh item & varian tetap tampil walau
    // menu merchant sudah berubah. Satu query batch untuk semua order.
    const orderIds = rows.map((r: any) => r.id);
    const foodItemsByOrder: Record<string, any[]> = {};
    if (orderIds.length > 0) {
      const { rows: foodRows } = await db.query(`
        SELECT foi.order_id AS order_id,
               foi.item_name AS name,
               foi.quantity,
               foi.notes,
               foi.item_price AS price,
               foi.subtotal,
               COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                   'variant_id', foiv.variant_id,
                   'variant_name', foiv.variant_name,
                   'option_name', foiv.option_name,
                   'price_delta', foiv.price_delta
                 ) ORDER BY foiv.id)
                 FROM food_order_item_variants foiv
                 WHERE foiv.order_item_id = foi.id
               ), '[]'::jsonb) AS variants
        FROM food_order_items foi
        WHERE foi.order_id = ANY($1::uuid[])
        ORDER BY foi.id ASC
      `, [orderIds]);
      for (const foodRow of foodRows) {
        (foodItemsByOrder[foodRow.order_id] = foodItemsByOrder[foodRow.order_id] || []).push(foodRow);
      }
    }
    const enrichedRows = rows.map((row: any) => ({
      ...row,
      food_items: foodItemsByOrder[row.id] || [],
    }));

    res.json({
      success: true,
      data: enrichedRows.map(toMobileCustomerOrderDto),
      message: 'Riwayat pesanan berhasil dimuat'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Gagal memuat riwayat pesanan.',
      code: 'CUSTOMER_ORDER_HISTORY_FAILED'
    });
  }
};



export const getMobileCustomerOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    const { id } = req.params;
    if (!customer_id) {
      res.status(401).json({
        success: false,
        data: null,
        message: 'Sesi tidak valid. Silakan masuk kembali.',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    const { rows } = await db.query(`
      SELECT o.id,
             o.order_number,
             o.pickup_address,
             o.dropoff_address,
             o.recipient_name,
             o.recipient_phone_masked,
             o.model,
             o.status,
             o.distance_km,
             o.route_snapshot,
             o.route_provider,
             o.route_profile,
             o.route_polyline,
             COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0)::int AS route_distance_meters,
             COALESCE(o.route_duration_seconds, NULLIF(o.route_snapshot->>'duration_seconds', '')::int, 0)::int AS route_duration_seconds,
             COALESCE(NULLIF(o.route_snapshot->>'eta_minutes', '')::int, 0)::int AS eta_minutes,
             o.total_price_idr,
             o.scheduled_at,
             o.created_at,
             o.updated_at,
             p.status AS payment_status,
             p.provider AS payment_provider,
             p.method AS payment_method,
             p.amount_idr AS payment_amount_idr,
             p.paid_at,
             p.provider_reference,
             COALESCE(o.service_sub_type, '') AS service_sub_type,
             COALESCE(o.order_notes, '') AS order_notes,
             COALESCE(m.nama_toko, '') AS merchant_name,
             u.full_name AS courier_name,
             cp.vehicle_type AS courier_vehicle,
             cp.vehicle_plate AS courier_plate,
             NULL::text AS courier_phone
      FROM orders o
      LEFT JOIN merchants m ON m.id = o.merchant_id
      LEFT JOIN order_legs ol ON o.id = ol.order_id AND ol.leg_number = 1
      LEFT JOIN users u ON ol.courier_id = u.id
      LEFT JOIN courier_profiles cp ON u.id = cp.user_id
      LEFT JOIN LATERAL (
        SELECT status, provider, method, amount_idr, paid_at, provider_reference
        FROM payments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) p ON TRUE
      WHERE o.customer_id = $1 AND o.id = $2
      LIMIT 1
    `, [customer_id, id]);

    const { rows: foodItems } = await db.query(`
      SELECT foi.item_name AS name,
             foi.quantity,
             foi.notes,
             foi.item_price AS price,
             foi.subtotal,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'variant_id', foiv.variant_id,
                 'variant_name', foiv.variant_name,
                 'option_name', foiv.option_name,
                 'price_delta', foiv.price_delta
               ) ORDER BY foiv.id)
               FROM food_order_item_variants foiv
               WHERE foiv.order_item_id = foi.id
             ), '[]'::jsonb) AS variants
      FROM food_order_items foi
      WHERE order_id = $1
      ORDER BY foi.id ASC
    `, [id]);

    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        data: null,
        message: 'Pesanan tidak ditemukan.',
        code: 'ORDER_NOT_FOUND'
      });
      return;
    }

    const order = {
      ...rows[0],
      food_items: foodItems,
    };

    res.json({
      success: true,
      data: toMobileCustomerOrderDto(order),
      message: 'Detail pesanan berhasil dimuat'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Gagal memuat detail pesanan.',
      code: 'CUSTOMER_ORDER_DETAIL_FAILED'
    });
  }
};



export const getMobileCustomerIncomingPackages = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    if (!customer_id) {
      res.status(401).json({
        success: false,
        data: null,
        message: 'Sesi tidak valid. Silakan masuk kembali.',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    const userResult = await db.query(
      `SELECT phone_number
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL
       LIMIT 1`,
      [customer_id]
    );
    const recipientPhoneHash = hashPhoneForPrivateLookup(userResult.rows[0]?.phone_number);
    if (!recipientPhoneHash) {
      res.json({
        success: true,
        data: [],
        message: 'Belum ada paket masuk.'
      });
      return;
    }

    await db.query(
      `UPDATE users
       SET phone_number_hash = $2
       WHERE id = $1
         AND (phone_number_hash IS NULL OR phone_number_hash <> $2)`,
      [customer_id, recipientPhoneHash]
    );

    const limitVal = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 50);
    const { rows } = await db.query(
      `SELECT o.id,
              o.order_number,
              o.pickup_address,
              o.dropoff_address,
              o.recipient_name,
              o.recipient_phone_masked,
              o.model,
              o.status,
              o.distance_km,
              o.route_snapshot,
              o.route_provider,
              o.route_profile,
              o.route_polyline,
              o.total_price_idr,
              o.scheduled_at,
              o.created_at,
              o.updated_at,
              u.full_name AS courier_name,
              cp.vehicle_type AS courier_vehicle,
              cp.vehicle_plate AS courier_plate,
              NULL::text AS courier_phone
       FROM orders o
       LEFT JOIN order_legs ol ON o.id = ol.order_id AND ol.leg_number = 1
       LEFT JOIN users u ON ol.courier_id = u.id
       LEFT JOIN courier_profiles cp ON u.id = cp.user_id
       WHERE o.recipient_phone_hash = $1
         AND o.status NOT IN ('cancelled', 'payment_failed')
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [recipientPhoneHash, limitVal]
    );

    res.json({
      success: true,
      data: rows.map(toMobileCustomerOrderDto),
      message: rows.length > 0 ? 'Paket masuk berhasil dimuat.' : 'Belum ada paket masuk.'
    });
  } catch {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Gagal memuat paket masuk.',
      code: 'CUSTOMER_INCOMING_PACKAGES_FAILED'
    });
  }
};


