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
  calculateCustomerPriceBreakdown,
  completeCustomerLapayPayment,
  getCustomerOrderPaymentRow,
  normalizeCoordinatePayload,
  normalizeCustomerPaymentMethod,
  normalizePackageInputs,
  notifyCustomerPaymentLifecycle,
  publicCustomerPaymentSession,
  redeemReservedPromosForPaidOrder,
  releaseReservedPromosForOrders,
  requireMidtransConfig,
  routeVehicleTypeForService,
  validatePackagePolicy,
} from './_shared';

export const createCustomerOrderPaymentSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    const orderId = String(req.params.id);
    const requestedMethod = normalizeCustomerPaymentMethod(req.body?.payment_method || req.body?.method);

    if (!customerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (requestedMethod === 'lapay') {
      const { payment, createdOffers, lifecycle } = await completeCustomerLapayPayment(customerId, orderId);
      await notifyOnDemandOffers(createdOffers);
      await notifyCustomerPaymentLifecycle(lifecycle);
      res.json({ success: true, payment, ...payment });
      return;
    }

    const existing = await getCustomerOrderPaymentRow(customerId, orderId);
    if (!existing) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const currentPayment = publicCustomerPaymentSession(existing);
    if (currentPayment.payment_status === 'paid') {
      res.json({ success: true, payment: currentPayment, ...currentPayment });
      return;
    }

    if (existing.order_status !== 'pending_payment') {
      res.status(409).json({
        success: false,
        code: 'ERR_PAYMENT_NOT_ALLOWED',
        message: 'Order ini tidak berada pada fase pembayaran.',
        payment: currentPayment,
        ...currentPayment
      });
      return;
    }

    requireMidtransConfig();

    if (currentPayment.snap_token && currentPayment.redirect_url && currentPayment.expires_in > 30) {
      res.json({ success: true, payment: currentPayment, ...currentPayment });
      return;
    }

    const midtransOrderId = `${existing.order_number}-${Date.now()}`;
    const totalPrice = Number(existing.total_price_idr || 0);
    const serviceName = existing.service_snapshot?.service_name || existing.service_snapshot?.name || 'TEMBUS Delivery';
    const snap = await createSnapTransaction({
      orderId: midtransOrderId,
      grossAmount: totalPrice,
      itemDetails: [
        {
          id: existing.order_number,
          price: totalPrice,
          quantity: 1,
          name: `${serviceName} ${existing.order_number}`.slice(0, 50)
        }
      ],
      customerDetails: {
        first_name: existing.recipient_name || undefined,
        phone: existing.recipient_phone_masked || undefined
      },
      customFields: {
        custom_field1: String(existing.id),
        custom_field3: String(customerId)
      },
      expiryMinutes: 30
    });

    const { rows } = await db.query(
      `UPDATE payments
          SET status = 'pending',
              provider = 'midtrans',
              method = 'qris',
              provider_reference = $2,
              snap_token = $3,
              redirect_url = $4,
              client_key = $5,
              snap_js_url = $6,
              expires_at = $7,
              updated_at = NOW()
        WHERE order_id = $1
          AND status <> 'paid'
      RETURNING id AS payment_id,
                status AS payment_status,
                provider,
                method,
                amount_idr,
                expires_at,
                provider_reference,
                snap_token,
                redirect_url,
                client_key,
                snap_js_url`,
      [
        orderId,
        snap.midtrans_order_id,
        snap.token,
        snap.redirect_url,
        getMidtransClientKey(),
        getMidtransSnapJsUrl(),
        snap.expires_at
      ]
    );

    if (rows.length === 0) {
      res.status(409).json({ success: false, code: 'ERR_PAYMENT_ALREADY_FINAL', message: 'Status pembayaran sudah final.' });
      return;
    }

    const payment = publicCustomerPaymentSession({
      ...existing,
      ...rows[0],
      order_status: existing.order_status
    });

    res.json({ success: true, payment, ...payment });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message,
      wallet_balance_idr: error.walletBalance
    });
  }
};



export const getCustomerOrderPaymentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    const id = String(req.params.id);

    if (!customer_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const order = await getCustomerOrderPaymentRow(customer_id, id);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const payment = publicCustomerPaymentSession(order);

    res.json({
      success: true,
      ...payment,
      payment
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};



export const confirmCustomerOrderPayment = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();
  let createdOffers: Awaited<ReturnType<typeof advanceOnDemandDispatchQueue>> = [];
  try {
    const customer_id = req.user?.id;
    const id = String(req.params.id);

    if (!customer_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT o.id,
              o.order_number,
              o.status,
              o.status AS order_status,
              o.created_at,
              o.total_price_idr,
              p.id AS payment_id,
              p.provider,
              p.method,
              p.amount_idr,
              p.expires_at,
              p.provider_reference,
              p.snap_token,
              p.redirect_url,
              p.client_key,
              p.snap_js_url,
              p.status AS payment_status,
              o.merchant_id,
              o.service_sub_type
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1 AND o.customer_id = $2
       FOR UPDATE OF o`,
      [id, customer_id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const order = rows[0];
    if (order.status === 'pending_payment' && order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK');
      res.status(410).json({ error: 'Pembayaran sudah kedaluwarsa', payment_status: 'expired' });
      return;
    }

    const manualConfirmEnabled = process.env.ALLOW_CUSTOMER_MANUAL_PAYMENT_CONFIRM === 'true';
    const paymentAlreadyPaid = order.payment_status === 'paid';

    const isFoodOrder = order.merchant_id != null || order.service_sub_type === 'food_delivery';

    if (order.status === 'pending_payment' && (paymentAlreadyPaid || manualConfirmEnabled)) {
      await client.query(
        `UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1`,
        [id, isFoodOrder ? 'pending_merchant' : 'pending']
      );
      if (manualConfirmEnabled && !paymentAlreadyPaid) {
        await client.query(
          `UPDATE payments SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE order_id = $1`,
          [id]
        );
      }
      await redeemReservedPromosForPaidOrder(client, customer_id, id);
      await client.query(
        `INSERT INTO order_events (order_id, user_id, event_type, description)
         VALUES ($1, $2, 'payment_confirmed', $3)`,
        [
          id,
          customer_id,
          manualConfirmEnabled && !paymentAlreadyPaid
            ? 'Customer payment manually confirmed in dev mode'
            : 'Customer payment status reconciled as paid'
        ]
      );
      await enqueueOutboxEvent(client, {
        aggregateType: 'payment',
        aggregateId: order.payment_id,
        eventType: 'payment.paid',
        eventVersion: 1,
        payload: {
          order_id: id,
          order_number: order.order_number,
          customer_id,
          provider: order.provider || 'midtrans',
          method: order.method || 'qris',
          amount_idr: Number(order.amount_idr || order.total_price_idr || 0),
          manual_confirmed: manualConfirmEnabled && !paymentAlreadyPaid,
        },
      });
      if (!isFoodOrder) {
        createdOffers = await advanceOnDemandDispatchQueue(client, 1);
      }
    }

    if (order.status === 'pending_payment' && !paymentAlreadyPaid && !manualConfirmEnabled) {
      await client.query('COMMIT');
      const payment = publicCustomerPaymentSession(order);
      res.json({
        success: true,
        payment_status: payment.payment_status,
        order_status: payment.order_status,
        payment,
        message: 'Pembayaran QRIS sedang menunggu konfirmasi gateway.'
      });
      return;
    }

    await client.query('COMMIT');
    await notifyOnDemandOffers(createdOffers);

    if (paymentAlreadyPaid || manualConfirmEnabled) {
      await notifyCustomerPaymentLifecycle({
        orderId: id,
        orderNumber: order.order_number,
        customerId: customer_id,
        paymentStatus: 'paid',
        orderStatus: isFoodOrder ? 'pending_merchant' : 'pending',
        source: manualConfirmEnabled && !paymentAlreadyPaid ? 'manual_confirm' : 'payment_reconciled',
        serviceSubType: order.service_sub_type,
        merchantId: order.merchant_id,
        provider: order.provider || 'midtrans',
        method: order.method || 'qris',
        amountIdr: Number(order.amount_idr || order.total_price_idr || 0),
      });
    }

    const payment = publicCustomerPaymentSession({
      ...order,
      payment_status: paymentAlreadyPaid || manualConfirmEnabled ? 'paid' : order.payment_status,
      order_status: paymentAlreadyPaid || manualConfirmEnabled ? (isFoodOrder ? 'pending_merchant' : 'pending') : order.order_status
    });

    res.json({
      success: true,
      payment_status: payment.payment_status,
      order_status: payment.order_status,
      payment
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};



export const handleMidtransNotification = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();
  let createdOffers: Awaited<ReturnType<typeof advanceOnDemandDispatchQueue>> = [];
  let auditEventId: string | null = null;
  try {
    const payload = req.body || {};
    const {
      order_id,
      transaction_id,
      transaction_status,
      fraud_status,
      status_code,
      gross_amount,
      signature_key
    } = payload;
    const rawBody = resolveRawBody(req);
    const providerEventId = String(transaction_id || order_id || '').trim()
      ? `midtrans:${transaction_id || order_id}:${transaction_status || 'unknown'}:${status_code || 'unknown'}`
      : null;

    if (!order_id || !transaction_status) {
      await insertWebhookAuditEvent(db, req, {
        providerName: 'midtrans',
        providerEventId,
        providerReference: order_id || null,
        eventType: transaction_status || null,
        verificationStatus: 'invalid_payload',
        processingStatus: 'failed',
        payload,
        rawBody,
        signature: signature_key || null,
        errorCode: 'invalid_payload',
      });
      res.status(400).json({ success: false, error: 'Invalid webhook request' });
      return;
    }

    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    if (!verifyMidtransSignature(payload, serverKey)) {
      await insertWebhookAuditEvent(db, req, {
        providerName: 'midtrans',
        providerEventId,
        providerReference: order_id,
        eventType: transaction_status,
        verificationStatus: signature_key ? 'invalid' : 'missing_signature',
        processingStatus: 'failed',
        payload,
        rawBody,
        signature: signature_key || null,
        errorCode: signature_key ? 'invalid_signature' : 'missing_signature',
      });
      res.status(401).json({ success: false, error: 'Invalid webhook request' });
      return;
    }

    await client.query('BEGIN');

    const auditInsert = await insertWebhookAuditEvent(client, req, {
      providerName: 'midtrans',
      providerEventId,
      providerReference: order_id,
      eventType: transaction_status,
      verificationStatus: 'valid',
      processingStatus: 'received',
      payload,
      rawBody,
      signature: signature_key || null,
    });

    if (auditInsert.duplicate) {
      await client.query('ROLLBACK');
      res.json({ success: true, duplicate: true });
      return;
    }
    auditEventId = auditInsert.id;

    const { rows } = await client.query(
      `SELECT p.order_id,
              p.provider,
              p.method,
              p.amount_idr,
              o.total_price_idr,
              o.customer_id,
              o.order_number,
              o.merchant_id,
              o.service_sub_type
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.provider_reference = $1
       FOR UPDATE OF p`,
      [order_id]
    );

    if (rows.length === 0) {
      await updateWebhookAuditEvent(client, auditEventId, 'ignored', 'payment_not_found');
      await client.query('COMMIT');
      res.status(200).json({ success: true, ignored: true, reason: 'payment_not_found' });
      return;
    }

    const orderIds = rows.map((row) => row.order_id);
    const dispatchableOrderIds = rows
      .filter((row) => row.merchant_id == null && row.service_sub_type !== 'food_delivery')
      .map((row) => row.order_id);
    const customerId = rows[0].customer_id;
    const paidWebhook = isSuccessfulTransaction(transaction_status, fraud_status);
    const failedWebhook = isExpiredOrFailedTransaction(transaction_status);
    const failedPaymentStatus = transaction_status === 'expire' ? 'expired' : 'failed';

    if (paidWebhook) {
      await client.query(
        `UPDATE payments
         SET status = 'paid', paid_at = COALESCE(paid_at, NOW()), webhook_payload = $2, updated_at = NOW()
         WHERE provider_reference = $1`,
        [order_id, payload]
      );
      await client.query(
        `UPDATE orders
         SET status = CASE
               WHEN merchant_id IS NOT NULL OR service_sub_type = 'food_delivery' THEN 'pending_merchant'
               ELSE 'pending'
             END,
             updated_at = NOW()
         WHERE id = ANY($1::uuid[]) AND status = 'pending_payment'`,
        [orderIds]
      );
      for (const orderId of orderIds) {
        await redeemReservedPromosForPaidOrder(client, customerId, orderId);
        await client.query(
          `INSERT INTO order_events (order_id, user_id, event_type, description)
           VALUES ($1, $2, 'payment_confirmed', 'Midtrans confirmed payment')`,
          [orderId, customerId]
        );
      }
      if (dispatchableOrderIds.length > 0) {
        createdOffers = await advanceOnDemandDispatchQueue(client, Math.max(dispatchableOrderIds.length, 1));
      }
    } else if (failedWebhook) {
      await client.query(
        `UPDATE payments
         SET status = $2, webhook_payload = $3, updated_at = NOW()
         WHERE provider_reference = $1`,
        [order_id, failedPaymentStatus, payload]
      );
      await client.query(
        `UPDATE orders SET status = 'payment_failed', updated_at = NOW() WHERE id = ANY($1::uuid[]) AND status = 'pending_payment'`,
        [orderIds]
      );
      await releaseReservedPromosForOrders(client, orderIds);
    } else {
      await client.query(
        `UPDATE payments SET webhook_payload = $2, updated_at = NOW() WHERE provider_reference = $1`,
        [order_id, payload]
      );
    }

    await updateWebhookAuditEvent(client, auditEventId, 'processed');
    await client.query('COMMIT');
    await notifyOnDemandOffers(createdOffers);
    if (paidWebhook || failedWebhook) {
      await Promise.all(rows.map((row) => notifyCustomerPaymentLifecycle({
        orderId: row.order_id,
        orderNumber: row.order_number,
        customerId: row.customer_id,
        paymentStatus: paidWebhook ? 'paid' : failedPaymentStatus,
        orderStatus: paidWebhook
          ? (row.merchant_id != null || row.service_sub_type === 'food_delivery' ? 'pending_merchant' : 'pending')
          : 'payment_failed',
        source: 'midtrans_webhook',
        serviceSubType: row.service_sub_type,
        merchantId: row.merchant_id,
        provider: row.provider || 'midtrans',
        method: row.method || 'qris',
        amountIdr: Number(row.amount_idr || row.total_price_idr || gross_amount || 0),
      })));
    }

    // 🚀 ENTERPRISE ORCHESTRATION: Trigger Courier Matching
    if (paidWebhook) {
      const orderServiceClientUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:8083';
      console.log(`[Orchestration] Triggering courier matching for ${orderIds.length} orders...`);
      
      for (const orderId of dispatchableOrderIds) {
        // Use global fetch (Node 18+)
        fetch(`${orderServiceClientUrl}/api/v1/internal/orders/matching?id=${orderId}`, { 
          method: 'POST' 
        }).then(response => {
          if (!response.ok) console.warn(`[OrderService] Matching trigger returned status ${response.status} for ${orderId}`);
        }).catch(err => {
          securityLog.error(`[OrderService] Failed to reach order-service for matching:`, err.message);
        });
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (auditEventId) {
      await updateWebhookAuditEvent(db, auditEventId, 'failed', 'processing_failed').catch(() => undefined);
    }
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  } finally {
    client.release();
  }
};



export const calculatePrice = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      pickup,
      dropoff,
      dimensions,
      weight_kg,
      packages: rawPackages,
      has_insurance,
      item_value,
      dimension_scan_verified,
            service_code,
            size_tier,
            courier_id
          } = req.body;

    const service = await findDeliveryServiceByCode(service_code);
    if (!service) {
      res.status(400).json({
        code: 'ERR_SERVICE_NOT_AVAILABLE',
        message: 'Layanan pengiriman tidak tersedia'
      });
      return;
    }

    if (service.requires_dimension_scan && !dimension_scan_verified) {
      res.status(400).json({
        code: 'ERR_DIMENSION_SCAN_REQUIRED',
        message: `${service.name} wajib scan dimensi sebelum menghitung harga`
      });
      return;
    }
    const normalizedPackages = normalizePackageInputs(rawPackages, {
      dimensions,
      weight_kg,
      size_tier,
      dimensions_scanned: dimension_scan_verified,
      item_value_idr: item_value,
    });
    validatePackagePolicy(service, normalizedPackages);

    const pickupPoint = normalizeCoordinatePayload(pickup);
    const dropoffPoint = normalizeCoordinatePayload(dropoff);
    if (!pickupPoint || !dropoffPoint) {
      res.status(400).json({
        code: 'ERR_ROUTE_LOCATION_REQUIRED',
        message: 'Lokasi pickup dan tujuan wajib valid sebelum harga dihitung.'
      });
      return;
    }

    const breakdown = await calculateCustomerPriceBreakdown({
      service,
      pickupPoint,
      dropoffPoint,
      dimensions,
      weightKg: weight_kg,
      packages: normalizedPackages,
      hasInsurance: has_insurance,
      itemValue: item_value,
      sizeTier: size_tier,
      courierId: courier_id,
    });

    res.json(breakdown);
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({
      code: error?.code || 'ERR_PRICE_CALCULATION_FAILED',
      error: error.message,
      message: error.message,
    });
  }
};



export const calculatePrices = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      pickup,
      dropoff,
      dimensions,
      weight_kg,
      packages: rawPackages,
      has_insurance,
      item_value,
      dimension_scan_verified,
      size_tier,
      courier_id
    } = req.body;

    const pickupPoint = normalizeCoordinatePayload(pickup);
    const dropoffPoint = normalizeCoordinatePayload(dropoff);
    if (!pickupPoint || !dropoffPoint) {
      res.status(400).json({
        code: 'ERR_ROUTE_LOCATION_REQUIRED',
        message: 'Lokasi pickup dan tujuan wajib valid sebelum harga dihitung.'
      });
      return;
    }

    const services = await listEnabledDeliveryServicesForCustomer();
    const routeSnapshots = new Map<string, Promise<RouteEtaSnapshot>>();

    const routeForService = (service: DeliveryServiceProduct) => {
      const vehicleType = routeVehicleTypeForService(service);
      if (!routeSnapshots.has(vehicleType)) {
        routeSnapshots.set(
          vehicleType,
          buildMapsRouteEtaSnapshot(
            { latitude: pickupPoint.lat, longitude: pickupPoint.lng },
            { latitude: dropoffPoint.lat, longitude: dropoffPoint.lng },
            'customer_mobile',
            {
              serviceCode: `bulk_${vehicleType}`,
              vehicleType,
              routeProfile: vehicleType,
              requireRoadRoute: true,
            }
          )
        );
      }
      return routeSnapshots.get(vehicleType)!;
    };

    const settled = await Promise.all(services.map(async (service) => {
      try {
        if (service.requires_dimension_scan && !dimension_scan_verified) {
          const error = new Error(`${service.name} wajib scan dimensi sebelum menghitung harga`);
          (error as any).code = 'ERR_DIMENSION_SCAN_REQUIRED';
          throw error;
        }
        const normalizedPackages = normalizePackageInputs(rawPackages, {
          dimensions,
          weight_kg,
          size_tier,
          dimensions_scanned: dimension_scan_verified,
          item_value_idr: item_value,
        });
        validatePackagePolicy(service, normalizedPackages);

        const routeSnapshot = await routeForService(service);
        const breakdown = await calculateCustomerPriceBreakdown({
          service,
          pickupPoint,
          dropoffPoint,
          dimensions,
          weightKg: weight_kg,
          packages: normalizedPackages,
          hasInsurance: has_insurance,
          itemValue: item_value,
          sizeTier: size_tier,
          routeSnapshotOverride: routeSnapshot,
          courierId: courier_id,
        });
        return { ok: true as const, service_code: service.code, breakdown };
      } catch (error: any) {
        return {
          ok: false as const,
          service_code: service.code,
          code: error?.code || 'ERR_PRICE_CALCULATION_FAILED',
          message: error?.message || 'Gagal menghitung harga layanan',
        };
      }
    }));

    const estimates = settled
      .filter((item): item is Extract<typeof item, { ok: true }> => item.ok)
      .map((item) => item.breakdown);
    const errors = settled
      .filter((item): item is Extract<typeof item, { ok: false }> => !item.ok)
      .map(({ service_code, code, message }) => ({ service_code, code, message }));

    if (estimates.length === 0) {
      res.status(422).json({
        success: false,
        code: errors[0]?.code || 'ERR_ROUTE_UNAVAILABLE',
        message: errors[0]?.message || 'Rute jalan belum tersedia. Harga tidak dihitung dari garis lurus.',
        errors,
      });
      return;
    }

    res.json({ success: true, data: estimates, errors });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'ERR_PRICE_CALCULATION_FAILED',
      message: error.message,
    });
  }
};


