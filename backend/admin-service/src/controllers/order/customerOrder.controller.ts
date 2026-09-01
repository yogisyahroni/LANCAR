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
  buildPromoReservationKey,
  calculateCustomerPriceBreakdown,
  hashPhoneForPrivateLookup,
  maskPhone,
  normalizeCoordinatePayload,
  normalizePackageDetailsForOrder,
  normalizePackageInputs,
  normalizePromoCode,
  packageChargeableWeight,
  publicServiceSnapshot,
  resolveSizeTier,
  summarizePackages,
  toNumber,
  validAddress,
  validatePackagePolicy,
} from './_shared';

export const createCustomerOrder = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();
  let reservedPromoKey: string | null = null;
  let reservedPromoCustomerId: string | null = null;
  let isPaymentBypassed = false;
  try {
    const flagRes = await client.query("SELECT is_enabled FROM feature_flags WHERE key = 'require_payment_gateway' LIMIT 1");
    const requirePayment = flagRes.rows.length > 0 ? flagRes.rows[0].is_enabled : true;
    isPaymentBypassed = !requirePayment;

    const customer_id = req.user?.id;
    if (!customer_id) {
      client.release();
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      pickup_address,
      pickup_location,
      dropoff_address,
      dropoff_location,
      recipient_name,
      recipient_phone,
      package_details,
      packages: raw_packages,
      has_insurance,
      item_value,
      schedule_type,
      scheduled_at,
      customer_notes,
      price_breakdown,
      service_code,
      promo_code,
      voucher_code, // FB-078: kode voucher diskon (opsional, terpisah dari promo)
      logistics_provider,
      logistics_service_type,
      logistics_tariff_idr,
      logistics_net_cost_idr,
      pickup_city,
      dropoff_city,
      preferred_courier_id,
      material_codes
    } = req.body;

    // Home services: harga jasa petugas dipakai utk hitung breakdown server-side
    const courierIdForPricing = preferred_courier_id || null;

    const service = await findDeliveryServiceByCode(price_breakdown?.service_code || service_code);
    if (!service) {
      client.release();
      res.status(400).json({
        code: 'ERR_SERVICE_NOT_AVAILABLE',
        error: 'Layanan pengiriman tidak tersedia'
      });
      return;
    }

    const normalizedPackages = normalizePackageInputs(raw_packages, package_details || {});
    validatePackagePolicy(service, normalizedPackages);
    const packageSummary = summarizePackages(service, normalizedPackages);
    const selectedTier = resolveSizeTier(service, package_details?.size_tier || normalizedPackages[0]?.size_tier || undefined);
    const packageDimensions = package_details?.dimensions || packageSummary.max_dimensions;
    const packageActualWeight = packageSummary.actual_weight_kg;
    const packageChargeableWeight = packageSummary.chargeable_weight_kg;

    if (selectedTier?.max_weight_kg && packageActualWeight > toNumber(selectedTier.max_weight_kg)) {
      client.release();
      res.status(400).json({
        code: 'ERR_SIZE_TIER_WEIGHT_LIMIT',
        error: `Berat aktual melewati tier ${selectedTier.name}. Pilih tier yang lebih besar.`
      });
      return;
    }

    if (service.max_weight_kg && packageChargeableWeight > service.max_weight_kg) {
      client.release();
      res.status(400).json({
        code: 'ERR_SERVICE_WEIGHT_LIMIT',
        error: `${service.name} maksimal ${service.max_weight_kg} kg. Berat hitung order ini ${packageChargeableWeight.toFixed(2)} kg.`
      });
      return;
    }

    const pickupPoint = normalizeCoordinatePayload(pickup_location);
    const dropoffPoint = normalizeCoordinatePayload(dropoff_location);
    if (!validAddress(pickup_address) || !validAddress(dropoff_address) || !pickupPoint || !dropoffPoint) {
      client.release();
      res.status(400).json({
        code: 'ERR_ORDER_ROUTE_REQUIRED',
        error: 'Alamat dan koordinat pickup/dropoff wajib valid sebelum order dibuat'
      });
      return;
    }

    const trustedPriceBreakdown = await calculateCustomerPriceBreakdown({
      service,
      pickupPoint,
      dropoffPoint,
      dimensions: packageDimensions,
      weightKg: packageActualWeight,
      packages: normalizedPackages,
      hasInsurance: has_insurance,
      itemValue: item_value,
      sizeTier: package_details?.size_tier || normalizedPackages[0]?.size_tier,
      courierId: courierIdForPricing,
      materialCodes: material_codes ?? package_details?.service_material_codes,
    });
    const trustedRouteSnapshot = trustedPriceBreakdown.route_snapshot;

    // For quote-based pricing (aggregator/3PL), use the logistics tariff as the gross price
    const effectiveTotalPriceIdr = service.price_mode === 'quote'
      ? (logistics_tariff_idr || trustedPriceBreakdown.total_price_idr || 0)
      : (trustedPriceBreakdown.total_price_idr || 0);

    const grossTotalPrice = effectiveTotalPriceIdr;
    const grossSettlement = calculateServiceSettlement(
      service,
      grossTotalPrice,
      trustedPriceBreakdown.insurance_premium_idr || 0
    );
    const requestedPromoCode = promo_code ?? price_breakdown?.promo_code ?? price_breakdown?.promo?.code;
    const normalizedPromoCode = normalizePromoCode(requestedPromoCode);
    if (requestedPromoCode && !normalizedPromoCode) {
      client.release();
      res.status(400).json({
        code: 'ERR_PROMO_CODE_INVALID',
        error: 'Kode promo tidak valid.'
      });
      return;
    }

    let promoDiscountIdr = 0;
    let promoCampaignId: string | null = null;
    let appliedPromoCode: string | null = null;
    if (normalizedPromoCode) {
      const reservationKey = buildPromoReservationKey(res.locals.idempotencyKey, customer_id, normalizedPromoCode);
      const promoResult = await validatePromoForCheckout(
        customer_id,
        {
          code: normalizedPromoCode,
          service_code: service.code,
          vehicle_type: trustedRouteSnapshot.vehicle_type || trustedRouteSnapshot.route_profile || service.vehicle_types?.[0],
          gross_amount_idr: grossTotalPrice,
          insurance_amount_idr: trustedPriceBreakdown.insurance_premium_idr || 0,
          payment_fee_idr: grossSettlement.mdr_idr,
          tax_amount_idr: grossSettlement.ppn_idr,
          idempotency_key: reservationKey,
        },
        'reserve'
      );

      if (!promoResult.eligible) {
        client.release();
        res.status(409).json({
          code: 'ERR_PROMO_NOT_ELIGIBLE',
          error: promoResult.reason || 'Promo tidak dapat digunakan untuk order ini.'
        });
        return;
      }

      reservedPromoKey = reservationKey;
      reservedPromoCustomerId = customer_id;
      promoDiscountIdr = Math.max(0, Math.min(Number(promoResult.discount_idr || 0), grossTotalPrice));
      promoCampaignId = promoResult.campaign?.id || null;
      appliedPromoCode = promoResult.campaign?.code || normalizedPromoCode;
    }

    let totalPrice = Math.max(0, grossTotalPrice - promoDiscountIdr);
    let settlement = {
          ...grossSettlement,
          platform_commission_idr: Math.max(0, grossSettlement.platform_commission_idr - promoDiscountIdr),
          settlement_snapshot: {
            ...grossSettlement.settlement_snapshot,
            gross_total_price_idr: grossTotalPrice,
            final_total_price_idr: totalPrice,
            promo_discount_idr: promoDiscountIdr,
            promo_campaign_id: promoCampaignId,
            promo_code: appliedPromoCode,
            pricing_breakdown: {
                          service_fee_idr: trustedPriceBreakdown.service_fee_idr || 0,
                          travel_fee_idr: trustedPriceBreakdown.travel_fee_idr || 0,
                          platform_fee_idr: trustedPriceBreakdown.platform_fee_breakdown_idr || 0,
                          base_fare_idr: trustedPriceBreakdown.base_fare_idr || 0,
                          per_km_idr: trustedPriceBreakdown.per_km_idr || 0,
                          included_distance_km: trustedPriceBreakdown.included_distance_km || 0,
                          platform_fee_pct: trustedPriceBreakdown.platform_fee_pct || 0,
                          platform_commission_pct: trustedPriceBreakdown.platform_commission_pct || 0,
                          material_cost_idr: trustedPriceBreakdown.material_cost_idr || 0,
                          materials: trustedPriceBreakdown.materials || [],
                        }
                      }
        };

    await client.query('BEGIN');

    // ── FB-078: Voucher redeem customer ──────────────────────────────
    // Tabel vouchers/voucher_usages (migration 00008). Terpisah dari promo
    // campaign; voucher TIDAK bisa digabung dengan promo.
    // Semua early-return di blok ini WAJIB ROLLBACK dulu (sudah BEGIN).
    let voucherDiscountIdr = 0;
    let voucherId: string | null = null;
    const voucherFail = async (status: number, code: string, error: string) => {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      res.status(status).json({ code, error });
    };
    if (voucher_code) {
      if (normalizedPromoCode) {
        await voucherFail(409, 'ERR_VOUCHER_CONFLICT', 'Voucher tidak bisa digabung dengan promo.');
        return;
      }
      const vResult = await client.query(
        `SELECT id, name, type, value, max_discount_idr, min_order_idr,
                quota, used_count, is_single_use, applicable_models,
                valid_from, valid_until
           FROM vouchers
          WHERE code = $1 AND is_active = TRUE`,
        [String(voucher_code).trim().toUpperCase()]
      );
      const v = vResult.rows[0];
      if (!v) {
        await voucherFail(404, 'ERR_VOUCHER_NOT_FOUND', 'Kode voucher tidak ditemukan atau sudah nonaktif.');
        return;
      }
      const now = new Date();
      if (new Date(v.valid_from) > now || (v.valid_until && new Date(v.valid_until) < now)) {
        await voucherFail(400, 'ERR_VOUCHER_EXPIRED', 'Voucher sudah kedaluwarsa atau belum aktif.');
        return;
      }
      if (v.quota != null && v.used_count >= v.quota) {
        await voucherFail(409, 'ERR_VOUCHER_QUOTA', 'Kuota voucher sudah habis.');
        return;
      }
      if (v.is_single_use) {
        const usedRes = await client.query(
          `SELECT 1 FROM voucher_usages WHERE voucher_id = $1 AND user_id = $2 LIMIT 1`,
          [v.id, customer_id]
        );
        if (usedRes.rows.length > 0) {
          await voucherFail(409, 'ERR_VOUCHER_USED', 'Voucher sudah pernah dipakai.');
          return;
        }
      }
      if (v.min_order_idr && grossTotalPrice < Number(v.min_order_idr)) {
        await voucherFail(400, 'ERR_VOUCHER_MIN_ORDER', 'Minimal belanja belum terpenuhi untuk voucher ini.');
        return;
      }
      const vModels = Array.isArray(v.applicable_models) ? v.applicable_models : [];
      if (vModels.length > 0 && !vModels.includes(service.route_model)) {
        await voucherFail(400, 'ERR_VOUCHER_MODEL', 'Voucher tidak berlaku untuk layanan ini.');
        return;
      }

      let discount = 0;
      if (v.type === 'percentage') {
        discount = Math.round((grossTotalPrice * Number(v.value)) / 100);
        if (v.max_discount_idr && discount > Number(v.max_discount_idr)) {
          discount = Number(v.max_discount_idr);
        }
      } else if (v.type === 'fixed') {
        discount = Number(v.value);
      } else if (v.type === 'free_shipping') {
        discount = Number(trustedPriceBreakdown.dynamic_price_idr || 0) || 8000;
      } else {
        await voucherFail(400, 'ERR_VOUCHER_TYPE', 'Jenis voucher tidak didukung.');
        return;
      }
      voucherDiscountIdr = Math.max(0, Math.min(discount, grossTotalPrice));
      if (voucherDiscountIdr <= 0) {
        await voucherFail(400, 'ERR_VOUCHER_ZERO', 'Nilai diskon voucher Rp0.');
        return;
      }
      voucherId = v.id;
      appliedPromoCode = String(voucher_code).trim().toUpperCase();
    }

    // Terapkan diskon voucher ke total & settlement (konsisten dgn promo)
    if (voucherDiscountIdr > 0) {
      totalPrice = Math.max(0, totalPrice - voucherDiscountIdr);
      settlement = {
        ...settlement,
        platform_commission_idr: Math.max(0, settlement.platform_commission_idr - voucherDiscountIdr),
        settlement_snapshot: {
          ...settlement.settlement_snapshot,
          final_total_price_idr: Math.max(0, totalPrice),
          voucher_discount_idr: voucherDiscountIdr,
        } as any,
      };
    }

    // Generate simple order number
    const order_number = `TMB-${Date.now().toString().slice(-6)}`;

    const insertQuery = `
      INSERT INTO orders (
        customer_id, 
        order_number,
        pickup_address, 
        pickup_location,
        dropoff_address, 
        dropoff_location,
        recipient_name,
        recipient_phone_masked,
        model, 
        service_code,
        service_snapshot,
        status, 
        distance_km,
        base_price_idr,
        volumetric_surcharge_idr,
        insurance_premium_idr,
        dynamic_price_idr,
        loyalty_discount_idr,
        total_price_idr,
        ppn_idr,
        mdr_idr,
        platform_commission_idr,
        courier_payout_estimate_idr,
        settlement_snapshot,
        has_insurance,
        insured_value_idr,
        package_details,
        customer_notes,
        schedule_type,
        scheduled_at,
        route_snapshot,
        route_provider,
        route_profile,
        route_distance_meters,
        route_duration_seconds,
        route_polyline,
        route_fallback_reason,
        recipient_phone_hash,
        item_description,
        logistics_provider,
        logistics_service_type,
        logistics_tariff_idr,
        logistics_net_cost_idr,
        pickup_city,
        dropoff_city,
        preferred_courier_id,
        created_at
      ) VALUES (
        $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326),
        $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
        $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, NOW()
      ) RETURNING id, order_number, total_price_idr, loyalty_discount_idr, route_snapshot
    `;

    // FK orders_preferred_courier_id_fkey → users(id), TAPI app kirim
        // courier_profiles.id (UUID berbeda — home API mengembalikan cp.id).
        // Resolve ke user_id sebelum insert supaya FK valid + dispatch benar.
        let resolvedPreferredCourierUserId: string | null = null;
        if (preferred_courier_id && service.service_category !== 'aggregator') {
          const profile = await client.query(
            `SELECT user_id FROM courier_profiles WHERE id = $1`,
            [preferred_courier_id]
          );
          resolvedPreferredCourierUserId = profile.rows[0]?.user_id
            ? String(profile.rows[0].user_id)
            : preferred_courier_id;
        }

        const values = [
          customer_id,
          order_number,
          pickup_address.trim(),
          pickupPoint.lng,
          pickupPoint.lat,
          dropoff_address.trim(),
          dropoffPoint.lng,
          dropoffPoint.lat,
          recipient_name,
          maskPhone(recipient_phone) || '*****',
          service.route_model,
          service.code,
          JSON.stringify(trustedPriceBreakdown.service_snapshot || publicServiceSnapshot(service)),
          isPaymentBypassed ? 'pending' : 'pending_payment',
          trustedPriceBreakdown.distance_km || 0,
          trustedPriceBreakdown.base_price_idr || 0,
          trustedPriceBreakdown.volumetric_surcharge_idr || 0,
          trustedPriceBreakdown.insurance_premium_idr || 0,
          trustedPriceBreakdown.dynamic_price_idr || 0,
          promoDiscountIdr + voucherDiscountIdr, // total diskon (promo + voucher FB-078)
          totalPrice,
          settlement.ppn_idr,
          settlement.mdr_idr,
          settlement.platform_commission_idr,
          settlement.courier_payout_estimate_idr,
          JSON.stringify(settlement.settlement_snapshot),
          has_insurance || false,
          item_value || 0,
          JSON.stringify(normalizePackageDetailsForOrder(package_details || {}, service, selectedTier, packageChargeableWeight, normalizedPackages)),
          customer_notes || '',
          schedule_type || 'now',
          scheduled_at ? new Date(scheduled_at) : null,
          JSON.stringify(trustedRouteSnapshot),
          trustedRouteSnapshot.provider,
          trustedRouteSnapshot.route_profile,
          trustedRouteSnapshot.distance_meters,
          trustedRouteSnapshot.duration_seconds,
          trustedRouteSnapshot.route_polyline,
          trustedRouteSnapshot.fallback_reason,
          hashPhoneForPrivateLookup(recipient_phone),
          package_details?.item_description || '',
          logistics_provider || null,
          logistics_service_type || null,
          logistics_tariff_idr || null,
          logistics_net_cost_idr || null,
          pickup_city || null,
          dropoff_city || null,
          resolvedPreferredCourierUserId
        ];

        const result = await client.query(insertQuery, values);
        const newOrder = result.rows[0];

        if (voucherId) {
      await client.query(
        `INSERT INTO voucher_usages (voucher_id, order_id, user_id, discount_idr)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (voucher_id, order_id) DO NOTHING`,
        [voucherId, newOrder.id, customer_id, voucherDiscountIdr]
      );
      await client.query(
        `UPDATE vouchers SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1`,
        [voucherId]
      );
    }

    if (reservedPromoKey && promoCampaignId) {
      await client.query(
        `UPDATE promo_redemptions
            SET order_id = $3
          WHERE campaign_id = $1
            AND idempotency_key = $2
            AND user_id = $4
            AND status = 'reserved'`,
        [promoCampaignId, reservedPromoKey, newOrder.id, customer_id]
      );
      await client.query(
        `UPDATE promo_budget_ledger
            SET order_id = $3
          WHERE campaign_id = $1
            AND idempotency_key = $2
            AND user_id = $4
            AND ledger_type = 'reserve'
            AND status = 'active'`,
        [promoCampaignId, reservedPromoKey, newOrder.id, customer_id]
      );
    }

    for (const item of normalizedPackages) {
      await client.query(
        `INSERT INTO order_packages (
           order_id, package_index, package_code, description, size_tier,
           weight_kg, length_cm, width_cm, height_cm, declared_value_idr, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (order_id, package_index) DO UPDATE SET
           package_code = EXCLUDED.package_code,
           description = EXCLUDED.description,
           size_tier = EXCLUDED.size_tier,
           weight_kg = EXCLUDED.weight_kg,
           length_cm = EXCLUDED.length_cm,
           width_cm = EXCLUDED.width_cm,
           height_cm = EXCLUDED.height_cm,
           declared_value_idr = EXCLUDED.declared_value_idr,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          newOrder.id,
          item.package_index,
          item.package_code,
          item.description,
          item.size_tier,
          item.weight_kg,
          item.length_cm || null,
          item.width_cm || null,
          item.height_cm || null,
          item.declared_value_idr,
          JSON.stringify({
            ...item.metadata,
            category: item.category,
            dimensions_scanned: item.dimensions_scanned,
          }),
        ]
      );
    }

    // Insert a pending payment shell. The actual provider is selected explicitly on the payment screen.
    await client.query(`
      INSERT INTO payments (
        order_id, payment_number, provider, method, status, amount_idr,
        mdr_amount_idr, ppn_amount_idr, weather_reserve_idr, insurance_reserve_idr,
        net_operational_idr, provider_reference, expires_at
      ) VALUES ($1, $2, $8, $9, $10, $3, $4, $5, 0, $6, $7, NULL, NOW() + INTERVAL '30 minutes')
    `, [
      newOrder.id,
      `PAY-${order_number}`,
      totalPrice,
      settlement.mdr_idr,
      settlement.ppn_idr,
      settlement.insurance_reserve_idr,
      settlement.net_operational_idr,
      isPaymentBypassed ? 'bypassed' : 'midtrans',
      isPaymentBypassed ? 'bypassed' : 'unselected',
      isPaymentBypassed ? 'paid' : 'pending'
    ]);

    // Create Order Event
    await client.query(`
      INSERT INTO order_events (order_id, user_id, event_type, description)
      VALUES ($1, $2, 'created', 'Customer created order via Web Portal')
    `, [newOrder.id, customer_id]);

    await enqueueOutboxEvent(client, {
      aggregateType: 'order',
      aggregateId: newOrder.id,
      eventType: 'order.created',
      eventVersion: 1,
      headers: {
        request_id: res.locals.requestId || null,
        correlation_id: res.locals.correlationId || null,
        idempotency_key: res.locals.idempotencyKey || null,
      },
      payload: {
        order_id: newOrder.id,
        order_number,
        customer_id,
        model: service.route_model,
        service_code: service.code,
        status: 'pending_payment',
        total_price_idr: totalPrice,
        gross_total_price_idr: grossTotalPrice,
        promo_discount_idr: promoDiscountIdr,
        promo_campaign_id: promoCampaignId,
        promo_code: appliedPromoCode,
        voucher_discount_idr: voucherDiscountIdr, // FB-078
        voucher_code: voucherId ? (appliedPromoCode || voucher_code) : null, // FB-078
        distance_km: trustedPriceBreakdown.distance_km || 0,
        route_snapshot_hash: trustedRouteSnapshot.snapshot_hash || null,
        route_provider: trustedRouteSnapshot.provider || null,
        created_at: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');
    client.release();

    // Jika payment di-bypass, langsung dispatch ke kurir tanpa menunggu alur pembayaran
    if (isPaymentBypassed) {
      const dispatchClient = await db.connect();
      try {
        let createdOffers: Awaited<ReturnType<typeof advanceOnDemandDispatchQueue>> = [];
                if (preferred_courier_id) {
                  // "Pilih Petugas" flow: dispatch langsung ke courier yang dipilih customer.
                  // WAJIB pakai resolvedPreferredCourierUserId (user_id) — dispatchToPreferredCourier
                  // mencocokkan cp.user_id, sedangkan req.body.preferred_courier_id adalah
                  // courier_profiles.id (yang TIDAK match FK orders).
                  const dispatchTarget = resolvedPreferredCourierUserId || preferred_courier_id;
                  const offer = await dispatchToPreferredCourier(dispatchClient, newOrder.id, dispatchTarget);
                  if (offer) createdOffers.push(offer);
                  if (!offer) {
                    securityLog.warn(`[WARN] Preferred courier ${dispatchTarget} tidak bisa di-dispatch untuk order ${newOrder.id}; fallback ke queue normal`);
                    createdOffers = await advanceOnDemandDispatchQueue(dispatchClient, 1);
                  }
                } else {
                  createdOffers = await advanceOnDemandDispatchQueue(dispatchClient, 1);
                }
                await notifyOnDemandOffers(createdOffers);
      } catch (dispatchErr) {
        securityLog.error('[WARN] dispatch after bypass failed:', dispatchErr);
      } finally {
        dispatchClient.release();
      }
    }

    res.status(201).json({
      success: true,
      order: newOrder,
      payment: null
    });

  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (reservedPromoKey && reservedPromoCustomerId) {
      await releasePromoReservation(reservedPromoCustomerId, reservedPromoKey).catch(() => undefined);
    }
    client.release();
    securityLog.error("[DEBUG] Create Order Error:", error);
    res.status(500).json({ error: error.message });
  }
};



export const cancelCustomerOrder = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const orderId = String(req.params.id);
    const reason = String(req.body?.reason || 'Dibatalkan oleh pelanggan');

    // Statuses pelanggan boleh membatalkan (sebelum kurir pick up)
    const cancellableStatuses = ['pending', 'pending_payment', 'paid', 'dispatching', 'offered', 'searching', 'no_courier_found'];
    // FB-079: food order — window lebih panjang: boleh cancel sampai picking_up
    // (accepted/picking_up dikenakan biaya layanan sbg cancellation fee)
    const foodCancellableStatuses = [
      'pending', 'pending_payment', 'pending_merchant', 'preparing',
      'ready_for_pickup', 'searching', 'accepted', 'picking_up', 'no_courier_found',
    ];

    await client.query('BEGIN');

    // Lock baris order milik customer ini
    const { rows: orderRows } = await client.query(
      `SELECT id, status, order_number, service_sub_type, merchant_id FROM orders
       WHERE id = $1 AND customer_id = $2
       FOR UPDATE`,
      [orderId, customerId]
    );

    if (orderRows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Order tidak ditemukan' });
      return;
    }

    const order = orderRows[0];
    const isFood = order.service_sub_type === 'food_delivery' || order.merchant_id != null;
    // Simpan status ASAL sebelum diubah → dipakai refund service utk hitung
    // refund window (tanpa ini order sudah 'cancelled' → refund selalu 100%)
    const originalStatus = order.status;

    const allowedStatuses = isFood ? foodCancellableStatuses : cancellableStatuses;
    if (!allowedStatuses.includes(order.status)) {
      await client.query('ROLLBACK');
      const disputeHint = isFood && ['picked_up', 'delivering', 'delivered'].includes(order.status)
        ? ' Pesanan sudah diambil kurir — gunakan menu Bantuan/Komplain untuk dispute.'
        : '';
      res.status(409).json({
        success: false,
        error: `Pesanan tidak dapat dibatalkan pada status "${order.status}". Hubungi CS jika memerlukan bantuan.${disputeHint}`,
      });
      return;
    }

    // Expire semua dispatch yang sedang aktif agar kurir tidak menerimanya
    await client.query(
      `UPDATE courier_offer_dispatches
       SET status = 'expired', updated_at = NOW()
       WHERE order_id = $1 AND status IN ('offered', 'pending')`,
      [orderId]
    );

    // Update status order → cancelled
    await client.query(
      `UPDATE orders
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );

    // Catat event pembatalan
    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, 'cancelled', 'Dibatalkan oleh pelanggan', $3)`,
      [orderId, customerId, JSON.stringify({ reason, cancelled_by: 'customer' })]
    );

    await client.query('COMMIT');

    // Trigger refund process in order-service
    const orderServiceClientUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:8083';
    fetch(`${orderServiceClientUrl}/api/v1/internal/refunds/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, reason, original_status: originalStatus }),
    }).then(res => {
      if (!res.ok) console.warn(`[OrderService] Refund trigger returned status ${res.status} for ${orderId}`);
    }).catch(err => {
      securityLog.error(`[OrderService] Failed to reach order-service for refund:`, err.message);
    });

    // Advance queue untuk order lain yang sedang menunggu kurir
    const dispatchClient = await db.connect();
    try {
      const createdOffers = await advanceOnDemandDispatchQueue(dispatchClient, 5);
      await notifyOnDemandOffers(createdOffers);
    } catch (dispatchErr) {
      securityLog.error('[WARN] advanceOnDemandDispatchQueue after cancel failed:', dispatchErr);
    } finally {
      dispatchClient.release();
    }

    res.json({ success: true, message: `Pesanan ${order.order_number} berhasil dibatalkan.` });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('[cancelCustomerOrder] error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};



export const getCustomerOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    if (!customer_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { status, search, startDate, endDate, model, limit, offset } = req.query;

    let queryStr = `
      SELECT id, order_number, pickup_address, dropoff_address, recipient_name, model, status,
             distance_km, total_price_idr, route_snapshot, route_provider, route_profile,
             route_polyline, created_at
      FROM orders
      WHERE customer_id = $1
    `;
    const params: any[] = [customer_id];

    if (status && status !== 'all') {
      params.push(status);
      queryStr += ` AND status = $${params.length}`;
    }

    if (model && model !== 'all') {
      params.push(model);
      queryStr += ` AND model = $${params.length}`;
    }

    if (startDate) {
      params.push(new Date(startDate as string));
      queryStr += ` AND created_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(new Date(endDate as string));
      queryStr += ` AND created_at <= $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      queryStr += ` AND (order_number ILIKE $${params.length} OR recipient_name ILIKE $${params.length} OR dropoff_address ILIKE $${params.length} OR pickup_address ILIKE $${params.length})`;
    }

    queryStr += ` ORDER BY created_at DESC`;

    const limitVal = parseInt(limit as string) || 50;
    const offsetVal = parseInt(offset as string) || 0;

    params.push(limitVal);
    queryStr += ` LIMIT $${params.length}`;

    params.push(offsetVal);
    queryStr += ` OFFSET $${params.length}`;

    const { rows } = await db.query(queryStr, params);

    res.json({ success: true, orders: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};



export const getCustomerOrderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    const { id } = req.params;
    if (!customer_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const queryStr = `
      SELECT o.id, o.order_number, o.pickup_address, o.dropoff_address, o.recipient_name, o.recipient_phone_masked, o.model, o.status, o.distance_km,
             o.route_snapshot, o.route_provider, o.route_profile, o.route_polyline,
             o.base_price_idr, o.volumetric_surcharge_idr, o.insurance_premium_idr, o.total_price_idr, o.has_insurance, o.insured_value_idr, 
             o.package_details, o.customer_notes, o.schedule_type, o.scheduled_at, o.created_at,
             u.full_name as courier_name, cp.vehicle_type as courier_vehicle, cp.vehicle_plate as courier_plate, cp.avg_partner_rating as courier_rating,
             NULL::text as courier_phone
      FROM orders o
      LEFT JOIN order_legs ol ON o.id = ol.order_id AND ol.leg_number = 1
      LEFT JOIN users u ON ol.courier_id = u.id
      LEFT JOIN courier_profiles cp ON u.id = cp.user_id
      WHERE o.customer_id = $1 AND o.id = $2
    `;

    const { rows } = await db.query(queryStr, [customer_id, id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const order = rows[0];

    // Get order events for timeline
    const eventQuery = `
      SELECT id, event_type, description, metadata, created_at
      FROM order_events
      WHERE order_id = $1
      ORDER BY created_at ASC
    `;
    const { rows: events } = await db.query(eventQuery, [id]);

    const { rows: proofs } = await db.query(`
      SELECT id,
             CASE
               WHEN COALESCE(override_reason, '') ILIKE 'pickup_cancellation:%' THEN 'pickup_cancellation'
               WHEN scanned_by_role = 'courier' AND image_urls IS NOT NULL AND array_length(image_urls, 1) > 0 THEN 'pickup_photo'
               WHEN scanned_by_role = 'courier' THEN 'pickup_scan'
               ELSE 'operational'
             END AS scan_type,
             CASE
               WHEN COALESCE(override_reason, '') ILIKE 'pickup_cancellation:%' THEN 'Bukti pembatalan pickup'
               WHEN scanned_by_role = 'courier' AND image_urls IS NOT NULL AND array_length(image_urls, 1) > 0 THEN 'Foto barang pickup'
               WHEN scanned_by_role = 'courier' THEN 'Scan pickup'
               ELSE 'Bukti operasional'
             END AS proof_label,
             CASE
               WHEN COALESCE(override_reason, '') ILIKE 'pickup_cancellation:%' THEN 'cancellation'
               WHEN scanned_by_role = 'courier' THEN 'pickup'
               ELSE 'operational'
             END AS proof_category,
             CASE
               WHEN image_urls IS NOT NULL AND array_length(image_urls, 1) > 0 THEN image_urls[1]
               ELSE NULL
             END AS photo_url,
             image_urls,
             override_reason,
             CASE
               WHEN COALESCE(override_reason, '') ILIKE 'pickup_cancellation:%' THEN SPLIT_PART(COALESCE(override_reason, ''), ':', 1)
               ELSE NULL
             END AS reason_code,
             CASE
               WHEN COALESCE(override_reason, '') ILIKE 'pickup_cancellation:%' AND COALESCE(override_reason, '') LIKE '%:%'
                 THEN NULLIF(TRIM(REGEXP_REPLACE(override_reason, '^[^:]+:\\s*', '')), '')
               ELSE NULL
             END AS reason_note,
             CASE WHEN scan_location IS NOT NULL THEN ST_Y(scan_location::geometry) ELSE NULL END AS latitude,
             CASE WHEN scan_location IS NOT NULL THEN ST_X(scan_location::geometry) ELSE NULL END AS longitude,
             COALESCE(scanned_at, created_at) AS recorded_at
      FROM package_scans
      WHERE order_id = $1
      ORDER BY COALESCE(scanned_at, created_at) ASC
    `, [id]);

    // FB-111: rincian item food untuk customer (snapshot food_order_items —
    // harga beku saat order). Kosong [] untuk order non-food.
    // FB-108: + variants (nama grup/opsi + harga delta) supaya customer
    // bisa lihat kembali pilihan yang dipesan.
    const { rows: foodItems } = await db.query(`
      SELECT item_name AS name, quantity, notes, item_price AS price, subtotal,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
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

    const { rows: tambalBanReports } = await db.query(`
      SELECT *
      FROM tambal_ban_reports
      WHERE order_id = $1
      LIMIT 1
    `, [id]);

    const { rows: towingReports } = await db.query(`
      SELECT *
      FROM towing_reports
      WHERE order_id = $1
      LIMIT 1
    `, [id]);

    order.tambal_ban_report = tambalBanReports[0] || null;
    order.towing_report = towingReports[0] || null;

    res.json({ success: true, order, events, proofs, food_items: foodItems });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};



export const retryCustomerOrderMatching = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const orderId = String(req.params.id);

    const { rows: orderRows } = await client.query(
      `SELECT id, status, order_number FROM orders WHERE id = $1 AND customer_id = $2`,
      [orderId, customerId]
    );

    if (orderRows.length === 0) {
      res.status(404).json({ success: false, error: 'Order tidak ditemukan' });
      return;
    }

    const order = orderRows[0];
    if (order.status !== 'no_courier_found' && order.status !== 'searching') {
      res.status(409).json({
        success: false,
        error: `Pesanan hanya dapat dicoba ulang (retry) pada status "no_courier_found" atau "searching".`,
      });
      return;
    }

    const orderServiceClientUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:8083';
    const response = await fetch(`${orderServiceClientUrl}/api/v1/internal/orders/retry-matching?id=${orderId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      res.status(response.status).json({ success: false, error: `Gagal memulai ulang pencarian kurir: ${errText || response.statusText}` });
      return;
    }

    res.json({ success: true, message: `Pencarian kurir untuk pesanan ${order.order_number} telah dimulai kembali.` });
  } catch (error: any) {
    securityLog.error('[retryCustomerOrderMatching] error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

