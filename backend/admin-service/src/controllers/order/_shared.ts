import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';

import type { PoolClient } from 'pg';
import { db } from '../../db';

import { withCanonicalOrderContract } from '../../services/orderContract';

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




export type CoordinatePayload = {
  lat: number;
  lng: number;
};

export type NormalizedOrderPackage = {
  package_index: number;
  package_code: string;
  description: string;
  category: string;
  quantity: number;
  size_tier: string | null;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  declared_value_idr: number;
  dimensions_scanned: boolean;
  is_fragile: boolean;
  is_prohibited: boolean;
  requires_delivery_code: boolean;
  metadata: Record<string, any>;
};

// Helper to calculate distance based on coordinates (Haversine formula)
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const radlat1 = Math.PI * lat1 / 180;
  const radlat2 = Math.PI * lat2 / 180;
  const theta = lon1 - lon2;
  const radtheta = Math.PI * theta / 180;
  let dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
  if (dist > 1) dist = 1;
  dist = Math.acos(dist);
  dist = dist * 180 / Math.PI;
  dist = dist * 60 * 1.1515;
  dist = dist * 1.609344; // kilometers
  
  return Math.max(1, parseFloat(dist.toFixed(2))); // Min 1km
};

export const toNumber = (value: any, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

export const roundRupiah = (value: number) => Math.ceil(value);

export const publicServiceSnapshot = (service: DeliveryServiceProduct) => customerFacingService(service);

export const publicBaseUrl = () =>
  process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

export const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

export const normalizePromoCode = (value: unknown) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  return /^[A-Z0-9_-]{3,40}$/.test(normalized) ? normalized : null;
};

export const buildPromoReservationKey = (orderIdempotencyKey: unknown, customerId: string, promoCode: string) =>
  sha256(`customer-order-promo:${customerId}:${String(orderIdempotencyKey || '')}:${promoCode}`);

export const redeemReservedPromosForPaidOrder = async (client: PoolClient, customerId: string, orderId: string) => {
  const { rows } = await client.query(
    `SELECT campaign_id, discount_idr, idempotency_key
       FROM promo_redemptions
      WHERE order_id = $1
        AND user_id = $2
        AND status = 'reserved'
      FOR UPDATE`,
    [orderId, customerId]
  );

  for (const redemption of rows) {
    const discountIdr = Number(redemption.discount_idr || 0);
    if (!Number.isInteger(discountIdr) || discountIdr <= 0) continue;

    await client.query(
      `UPDATE promo_redemptions
          SET status = 'redeemed',
              redeemed_at = NOW()
        WHERE campaign_id = $1
          AND user_id = $2
          AND order_id = $3
          AND idempotency_key = $4
          AND status = 'reserved'`,
      [redemption.campaign_id, customerId, orderId, redemption.idempotency_key]
    );

    await client.query(
      `UPDATE promo_budget_ledger
          SET status = 'redeemed'
        WHERE campaign_id = $1
          AND user_id = $2
          AND order_id = $3
          AND idempotency_key = $4
          AND ledger_type = 'reserve'
          AND status = 'active'`,
      [redemption.campaign_id, customerId, orderId, redemption.idempotency_key]
    );

    await client.query(
      `INSERT INTO promo_budget_ledger (
         campaign_id, user_id, order_id, ledger_type, amount_idr, idempotency_key, status, metadata
       )
       VALUES ($1, $2, $3, 'redeem', $4, $5, 'redeemed', $6::jsonb)
       ON CONFLICT (campaign_id, idempotency_key, ledger_type) DO NOTHING`,
      [
        redemption.campaign_id,
        customerId,
        orderId,
        discountIdr,
        redemption.idempotency_key,
        JSON.stringify({ source: 'payment_confirmed' })
      ]
    );

    await client.query(
      `UPDATE promo_campaigns
          SET reserved_budget_idr = GREATEST(0, reserved_budget_idr - $2),
              redeemed_budget_idr = redeemed_budget_idr + $2,
              updated_at = NOW()
        WHERE id = $1`,
      [redemption.campaign_id, discountIdr]
    );
  }
};

export const releaseReservedPromosForOrders = async (client: PoolClient, orderIds: string[]) => {
  if (orderIds.length === 0) return;

  const { rows } = await client.query(
    `SELECT campaign_id, user_id, order_id, discount_idr, idempotency_key
       FROM promo_redemptions
      WHERE order_id = ANY($1::uuid[])
        AND status = 'reserved'
      FOR UPDATE`,
    [orderIds]
  );

  for (const redemption of rows) {
    const discountIdr = Number(redemption.discount_idr || 0);
    if (!Number.isInteger(discountIdr) || discountIdr <= 0) continue;

    await client.query(
      `UPDATE promo_redemptions
          SET status = 'released',
              released_at = NOW()
        WHERE campaign_id = $1
          AND user_id = $2
          AND order_id = $3
          AND idempotency_key = $4
          AND status = 'reserved'`,
      [redemption.campaign_id, redemption.user_id, redemption.order_id, redemption.idempotency_key]
    );

    await client.query(
      `UPDATE promo_budget_ledger
          SET status = 'released',
              released_at = NOW()
        WHERE campaign_id = $1
          AND user_id = $2
          AND order_id = $3
          AND idempotency_key = $4
          AND ledger_type = 'reserve'
          AND status = 'active'`,
      [redemption.campaign_id, redemption.user_id, redemption.order_id, redemption.idempotency_key]
    );

    await client.query(
      `UPDATE promo_campaigns
          SET reserved_budget_idr = GREATEST(0, reserved_budget_idr - $2),
              updated_at = NOW()
        WHERE id = $1`,
      [redemption.campaign_id, discountIdr]
    );
  }
};

export const receiverLocationBaseUrl = () =>
  process.env.RECEIVER_LOCATION_PUBLIC_URL || publicBaseUrl();

export const maskPhone = (value: any) => {
  const normalized = String(value || '').replace(/[^\d+]/g, '');
  if (!normalized) return null;
  return normalized.replace(/\d(?=\d{4})/g, '*');
};

export const toMobileCustomerProfileDto = (row: any) => ({
  id: row.id,
  name: row.full_name || '',
  phone_number: row.phone_number || '',
  wallet_balance: Number(row.wallet_balance || 0),
  profile_image_url: row.photo_url || null,
  store_name: row.store_name || '',
  default_pickup_address: row.default_pickup_address || ''
});

export const getCustomerWalletBalance = async (customerId: string) => {
  const tableCheck = await db.query(`SELECT to_regclass('public.customer_wallets') AS table_name`);
  if (!tableCheck.rows[0]?.table_name) return 0;

  const { rows } = await db.query(
    `SELECT COALESCE(SUM(balance), 0)::bigint AS wallet_balance
     FROM customer_wallets
     WHERE customer_id = $1`,
    [customerId]
  );
  return Number(rows[0]?.wallet_balance || 0);
};

export type CustomerPaymentMethod = 'qris' | 'lapay';

export const normalizeCustomerPaymentMethod = (value: any): CustomerPaymentMethod => {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'lapay') return 'lapay';
  if (method === 'qris' || method === 'midtrans' || method === 'midtrans_qris' || method === 'snap') return 'qris';
  return 'qris';
};

export const customerPaymentMethodLabel = (provider?: string | null, method?: string | null) => {
  const normalizedProvider = String(provider || '').toLowerCase();
  const normalizedMethod = String(method || '').toLowerCase();
  if (normalizedProvider === 'lapay' || normalizedMethod === 'lapay') return 'LAPAY';
  return 'QRIS';
};

export const requireMidtransConfig = () => {
  if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
    const error = new Error('QRIS belum aktif. Lengkapi MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY di environment admin-service.');
    (error as any).statusCode = 503;
    (error as any).code = 'ERR_MIDTRANS_NOT_CONFIGURED';
    throw error;
  }
};

export const normalizeCustomerProfileName = (value: any) => {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) return null;
  return name;
};

export const normalizeCustomerProfilePhone = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('@')) return null;
  const normalized = raw.replace(/[^\d+]/g, '');
  if (normalized.length < 8 || normalized.length > 20) return null;
  return normalized;
};

export const normalizePhoneForPrivateLookup = (value: any) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = `62${digits.slice(1)}`;
  } else if (digits.startsWith('8')) {
    digits = `62${digits}`;
  }
  if (digits.length < 8 || digits.length > 18) return null;
  return digits;
};

export const phoneHashSecret = () => {
  const configured = process.env.PHONE_HASH_SECRET || process.env.JWT_SECRET || process.env.JWT_REFRESH_SECRET || '';
  if (configured) return configured;
  return process.env.NODE_ENV === 'production' ? '' : 'development-only-recipient-phone-hash-secret';
};

export const hashPhoneForPrivateLookup = (value: any) => {
  const phone = normalizePhoneForPrivateLookup(value);
  const secret = phoneHashSecret();
  if (!phone || !secret) return null;
  return crypto.createHmac('sha256', secret).update(phone).digest('hex');
};

export const normalizeCoordinatePayload = (value: any): CoordinatePayload | null => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

export const validAddress = (value: any) => typeof value === 'string' && value.trim().length >= 6;

export const normalizeAddressKind = (value: any) => {
  const kind = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ['pickup', 'receiver', 'both'].includes(kind) ? kind : 'receiver';
};

export const publicCustomerAddress = (row: any) => ({
  id: row.id,
  label: row.label,
  contact_name: row.contact_name,
  contact_phone_masked: row.contact_phone_masked,
  address: row.address,
  lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
  lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
  notes: row.notes,
  kind: row.kind,
  is_favorite: Boolean(row.is_favorite),
  usage_count: Number(row.usage_count || 0),
  last_used_at: row.last_used_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const publicCustomerPaymentSession = (row: any) => {
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const expiresIn = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) : 0;
  const paymentStatus = row.payment_status === 'paid'
    ? 'paid'
    : row.payment_status === 'failed' || row.payment_status === 'expired'
      ? row.payment_status
    : expiresAt && expiresIn <= 0
      ? 'expired'
      : (row.payment_status || 'pending');
  const method = customerPaymentMethodLabel(row.provider, row.method);

  return {
    id: row.payment_id || `PAY-${row.order_number}`,
    provider: row.provider || null,
    method,
    status: paymentStatus,
    payment_status: paymentStatus,
    order_status: row.order_status,
    active_payment_provider: process.env.ACTIVE_PAYMENT_PROVIDER || 'midtrans',
    amount_idr: Number(row.amount_idr || row.total_price_idr || 0),
    wallet_balance_idr: Number(row.wallet_balance || 0),
    // FOOD-BIKE-076: breakdown item makanan (null untuk order non-food)
    items: row.items || null,
    snap_token: row.snap_token || null,
    redirect_url: row.redirect_url || null,
    midtrans_order_id: row.provider_reference || null,
    client_key: row.client_key || getMidtransClientKey(),
    snap_js_url: row.snap_js_url || getMidtransSnapJsUrl(),
    expires_in: expiresIn,
    expires_at: row.expires_at || null
  };
};

// Re-exported from the dependency-free leaf module so existing callers that
// import from './order/_shared' keep working without the circular graph.
import { customerOrderStatusLabel } from './statusLabels';
export { customerOrderStatusLabel };

export const publicCustomerInvoice = (row: any) => ({
  amount_idr: Number(row.payment_amount_idr || row.total_price_idr || 0),
  currency: 'IDR',
  payment_status: row.payment_status || (Number(row.total_price_idr || 0) > 0 ? 'pending' : 'bypassed'),
  payment_method: customerPaymentMethodLabel(row.payment_provider, row.payment_method),
  provider: row.payment_provider || null,
  paid_at: row.paid_at || null,
  payment_reference: row.provider_reference || null,
});

export type CustomerPaymentLifecycleNotification = {
  orderId: string;
  orderNumber: string;
  customerId: string;
  merchantId?: string | null;
  paymentStatus: 'paid' | 'failed' | 'expired';
  orderStatus: string;
  source: 'manual_confirm' | 'payment_reconciled' | 'midtrans_webhook';
  serviceSubType?: string | null;
  provider?: string | null;
  method?: string | null;
  amountIdr?: number;
};

export const notifyCustomerPaymentLifecycle = async ({
  orderId,
  orderNumber,
  customerId,
  merchantId,
  paymentStatus,
  orderStatus,
  source,
  serviceSubType,
  provider,
  method,
  amountIdr,
}: CustomerPaymentLifecycleNotification) => {
  const paid = paymentStatus === 'paid';
  const event = paid
    ? ON_DEMAND_REALTIME_EVENTS.PAYMENT_CONFIRMED
    : ON_DEMAND_REALTIME_EVENTS.PAYMENT_FAILED;
  const type = paid ? 'payment' : 'payment_failed';
  const title = paid
    ? `Pembayaran diterima - ${orderNumber}`
    : `Pembayaran ${paymentStatus === 'expired' ? 'kedaluwarsa' : 'gagal'} - ${orderNumber}`;
  const body = paid
    ? serviceSubType === 'food_delivery'
      ? 'Pembayaran diterima. Pesanan diteruskan ke merchant.'
      : 'Pembayaran diterima. Order sedang masuk antrean dispatch.'
    : paymentStatus === 'expired'
      ? 'Batas waktu pembayaran sudah habis. Silakan buat pembayaran baru.'
      : 'Pembayaran belum berhasil. Silakan coba lagi atau gunakan metode lain.';
  const metadata = {
    source,
    service_sub_type: serviceSubType || null,
    payment_status: paymentStatus,
    provider: provider || null,
    method: method || null,
    amount_idr: amountIdr ?? null,
  };

  try {
    emitOnDemandRealtime(event, {
      order_id: orderId,
      order_number: orderNumber,
      customer_id: customerId,
      merchant_id: merchantId || null,
      admin_broadcast: true,
      status: orderStatus,
      stage: event,
      metadata,
    });
    await createNotification({
      user_id: customerId,
      title,
      body,
      type,
      order_id: orderId,
      deep_link: `/orders/${orderId}`,
      metadata,
      priority: paid ? 'normal' : 'high',
    });
  } catch (notificationError) {
    console.warn('Failed to publish customer payment lifecycle notification:', notificationError);
  }
};

export const getCustomerOrderPaymentRow = async (customerId: string, orderId: string) => {
  const { rows } = await db.query(
    `SELECT o.id,
            o.order_number,
            o.status AS order_status,
            o.total_price_idr,
            o.service_snapshot,
            o.recipient_name,
            o.recipient_phone_masked,
            o.merchant_id,
            o.model,
            p.id AS payment_id,
            p.provider,
            p.method,
            p.status AS payment_status,
            p.amount_idr,
            p.expires_at,
            p.provider_reference,
            p.snap_token,
            p.redirect_url,
            p.client_key,
            p.snap_js_url
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
      WHERE o.id = $1 AND o.customer_id = $2`,
    [orderId, customerId]
  );
  if (!rows[0]) return null;
  rows[0].wallet_balance = await getCustomerWalletBalance(customerId);
  // FOOD-BIKE-076: breakdown multi-item untuk order food (merchant_id terisi)
  if (rows[0].merchant_id) {
    const itemRows = await db.query(
      `SELECT item_name, item_price, quantity, notes, subtotal,
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
        ORDER BY foi.created_at ASC`,
      [orderId]
    );
    rows[0].items = itemRows.rows;
  } else {
    rows[0].items = null;
  }
  return rows[0];
};

export const resolveSizeTier = (service: DeliveryServiceProduct, requestedCode?: string) => {
  if (!service.uses_size_tier || service.size_tiers.length === 0) return null;
  return service.size_tiers.find((tier) => tier.code === requestedCode) || service.size_tiers[0];
};

export const normalizePackageDetailsForOrder = (
  packageDetails: any,
  service: DeliveryServiceProduct,
  selectedTier: any,
  chargeableWeightKg: number,
  packages: NormalizedOrderPackage[] = []
) => {
  const dimensions = packageDetails?.dimensions || {};
  const lengthCm = toNumber(packageDetails?.length_cm ?? dimensions.length, 0);
  const widthCm = toNumber(packageDetails?.width_cm ?? dimensions.width, 0);
  const heightCm = toNumber(packageDetails?.height_cm ?? dimensions.height, 0);
  const actualWeightKg = toNumber(packageDetails?.weight_kg, 0);

  return {
    ...packageDetails,
    category: packageDetails?.category || packageDetails?.item_category || 'other',
    item_description: packageDetails?.item_description || packageDetails?.description || 'Paket on-demand',
    size_tier: packageDetails?.size_tier || selectedTier?.code || null,
    size_tier_name: selectedTier?.name || null,
    weight_kg: actualWeightKg,
    chargeable_weight_kg: chargeableWeightKg,
    length_cm: lengthCm || null,
    width_cm: widthCm || null,
    height_cm: heightCm || null,
    dimensions: {
      length: lengthCm || null,
      width: widthCm || null,
      height: heightCm || null
    },
    dimensions_scanned: Boolean(packageDetails?.dimensions_scanned),
    requires_dimension_scan: Boolean(service.requires_dimension_scan),
    requires_delivery_code: Boolean(packageDetails?.requires_delivery_code),
    package_facts: {
      quantity: packages.reduce((sum, item) => sum + item.quantity, 0) || 1,
      category: packages[0]?.category || packageDetails?.category || 'other',
      item_description: packages[0]?.description || packageDetails?.item_description || '',
      item_value_idr: packages.reduce((sum, item) => sum + item.declared_value_idr * item.quantity, 0),
      fragile: packages.some((item) => item.is_fragile),
      prohibited: packages.some((item) => item.is_prohibited),
      size_tier: selectedTier?.code || packageDetails?.size_tier || null,
      delivery_code_policy: packageDetails?.requires_delivery_code ? 'required' : 'optional',
    },
    service_code: service.code,
    service_name: service.name,
    vehicle_types: service.vehicle_types || [],
    package_count: packages.reduce((sum, item) => sum + item.quantity, 0) || 1,
    packages: packages.length > 0 ? packages : undefined
  };
};

export const sanitizePackageString = (value: any, fallback = '') =>
  String(value || fallback)
    .replace(/[<>{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

export const normalizePackageInputs = (rawPackages: any, legacyPackageDetails: any): NormalizedOrderPackage[] => {
  const source = Array.isArray(rawPackages) && rawPackages.length > 0
    ? rawPackages
    : [legacyPackageDetails || {}];
  const seenCodes = new Set<string>();

  return source.slice(0, 100).map((item: any, index: number) => {
    const dimensions = item?.dimensions || {};
    const fallbackCode = `PKG-${String(index + 1).padStart(2, '0')}`;
    const rawCode = sanitizePackageString(item?.package_code || item?.barcode_value || item?.barcode || fallbackCode, fallbackCode)
      .replace(/[^A-Za-z0-9._-]/g, '')
      .slice(0, 80) || fallbackCode;
    let packageCode = rawCode;
    let suffix = 2;
    while (seenCodes.has(packageCode)) {
      packageCode = `${rawCode}-${suffix}`;
      suffix += 1;
    }
    seenCodes.add(packageCode);

    return {
      package_index: index + 1,
      package_code: packageCode,
      description: sanitizePackageString(item?.description || item?.item_description || legacyPackageDetails?.description, 'Paket'),
      category: sanitizePackageString(item?.category || item?.item_category || legacyPackageDetails?.category, 'other'),
      quantity: Math.min(100, Math.max(1, Math.trunc(toNumber(item?.quantity ?? legacyPackageDetails?.quantity, 1)))),
      size_tier: item?.size_tier ? sanitizePackageString(item.size_tier).slice(0, 50) : null,
      weight_kg: Math.max(0, toNumber(item?.weight_kg ?? legacyPackageDetails?.weight_kg, 0)),
      length_cm: Math.max(0, toNumber(item?.length_cm ?? dimensions.length ?? legacyPackageDetails?.length_cm, 0)),
      width_cm: Math.max(0, toNumber(item?.width_cm ?? dimensions.width ?? legacyPackageDetails?.width_cm, 0)),
      height_cm: Math.max(0, toNumber(item?.height_cm ?? dimensions.height ?? legacyPackageDetails?.height_cm, 0)),
      declared_value_idr: Math.max(0, Math.trunc(toNumber(item?.declared_value_idr ?? item?.item_value_idr, 0))),
      dimensions_scanned: Boolean(item?.dimensions_scanned ?? legacyPackageDetails?.dimensions_scanned),
      is_fragile: Boolean(item?.is_fragile ?? legacyPackageDetails?.is_fragile),
      is_prohibited: Boolean(item?.is_prohibited ?? legacyPackageDetails?.is_prohibited),
      requires_delivery_code: Boolean(item?.requires_delivery_code ?? legacyPackageDetails?.requires_delivery_code),
      metadata: {
        source: Array.isArray(rawPackages) && rawPackages.length > 0 ? 'packages_array' : 'legacy_package_details',
      },
    };
  });
};

export const packageChargeableWeight = (service: DeliveryServiceProduct, item: NormalizedOrderPackage) => {
  const divisor = toNumber(service.dimension_rules?.volumetric_divisor, 6000);
  const volumetric = item.length_cm && item.width_cm && item.height_cm
    ? (item.length_cm * item.width_cm * item.height_cm) / divisor
    : 0;
  return {
    actual: item.weight_kg * item.quantity,
    volumetric: volumetric * item.quantity,
    chargeable: Math.max(item.weight_kg, volumetric) * item.quantity,
  };
};

export const summarizePackages = (service: DeliveryServiceProduct, packages: NormalizedOrderPackage[]) => {
  const packageSummaries = packages.map((item) => ({
    ...item,
    ...packageChargeableWeight(service, item),
  }));
  const actualWeightKg = packageSummaries.reduce((sum, item) => sum + item.actual, 0);
  const volumetricWeightKg = packageSummaries.reduce((sum, item) => sum + item.volumetric, 0);
  const chargeableWeightKg = packageSummaries.reduce((sum, item) => sum + item.chargeable, 0);
  const maxDimensions = packageSummaries.reduce(
    (acc, item) => ({
      length: Math.max(acc.length, item.length_cm),
      width: Math.max(acc.width, item.width_cm),
      height: Math.max(acc.height, item.height_cm),
    }),
    { length: 0, width: 0, height: 0 }
  );

  return {
    package_count: packages.reduce((sum, item) => sum + item.quantity, 0),
    actual_weight_kg: actualWeightKg,
    dimensional_weight_kg: volumetricWeightKg,
    chargeable_weight_kg: chargeableWeightKg,
    max_dimensions: maxDimensions,
    packages: packageSummaries,
  };
};

export const validatePackagePolicy = (service: DeliveryServiceProduct, packages: NormalizedOrderPackage[]) => {
  const packageCount = packages.reduce((sum, item) => sum + item.quantity, 0);
  if (packageCount > service.max_packages_per_order) {
    const error = new Error(`${service.name} maksimal ${service.max_packages_per_order} paket dalam satu order.`);
    (error as any).statusCode = 400;
    (error as any).code = 'ERR_SERVICE_PACKAGE_LIMIT';
    throw error;
  }

  if (service.requires_dimension_scan && packages.some((item) => !item.dimensions_scanned)) {
    const error = new Error(`${service.name} wajib scan dimensi untuk semua paket sebelum order dibuat.`);
    (error as any).statusCode = 400;
    (error as any).code = 'ERR_DIMENSION_SCAN_REQUIRED';
    throw error;
  }

  if (packages.some((item) => item.is_prohibited)) {
    const error = new Error('Barang yang ditandai terlarang tidak dapat dikirim melalui layanan ini.');
    (error as any).statusCode = 400;
    (error as any).code = 'ERR_PROHIBITED_ITEM';
    throw error;
  }
};

export const routeVehicleTypeForService = (service: DeliveryServiceProduct) => {
  const vehicles = (service.vehicle_types || []).map((item) => String(item).toLowerCase());
  return vehicles.includes('car') || vehicles.includes('mobil') ? 'car' : 'motorcycle';
};

// Home services: kurir DATANG ke lokasi customer (tambal ban, towing).
// pickup == dropoff adalah kejadian normal — rute 0 km TIDAK boleh ditolak.
export const HOME_SERVICE_CATEGORIES = new Set(['tambal_ban', 'towing']);
export const isHomeServiceCategory = (service: DeliveryServiceProduct): boolean =>
  HOME_SERVICE_CATEGORIES.has(String(service.service_category || '').toLowerCase());

export const ROUTE_SNAPSHOT_CONTRACT_VERSION = 1;

export const routeSnapshotHash = (snapshot: Record<string, unknown>) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(snapshot, Object.keys(snapshot).sort()))
    .digest('hex');

export const publicRouteSnapshot = (route: RouteEtaSnapshot) => {
  const snapshot = {
    generated_at: route.generated_at,
    provider: route.provider,
    requested_provider: route.requested_provider,
    active_provider: route.active_provider,
    scope: route.scope,
    route_profile: route.route_profile,
    vehicle_type: route.vehicle_type,
    service_code: route.service_code,
    distance_km: route.distance_km,
    distance_meters: route.distance_meters,
    duration_seconds: route.duration_seconds,
    eta: route.eta,
    eta_minutes: route.eta_minutes,
    route_polyline: route.route_polyline,
    route_geometry: route.route_geometry,
    traffic_aware: route.traffic_aware,
    confidence: route.confidence,
    fallback_reason: route.fallback_reason || null,
  };

  return {
    ...snapshot,
    snapshot_version: ROUTE_SNAPSHOT_CONTRACT_VERSION,
    route_version: `route_snapshot_v${ROUTE_SNAPSHOT_CONTRACT_VERSION}`,
    snapshot_hash: routeSnapshotHash(snapshot),
    source: 'maps_provider_gateway',
  };
};

export const publicConversationContext = (access: {
  conversationId: string;
  orderId: string;
  memberType: string;
  conversationPhase: string;
  isGroup: boolean;
  participantCount: number;
  recipientJoined: boolean;
  canCallCustomer: boolean;
  canCallCourier: boolean;
  canCallRecipient: boolean;
  visibilityNotice: string | null;
}) => ({
  id: access.conversationId,
  order_id: access.orderId,
  member_type: access.memberType,
  phase: access.conversationPhase,
  is_group: access.isGroup,
  participant_count: access.participantCount,
  recipient_joined: access.recipientJoined,
  can_call_customer: access.canCallCustomer,
  can_call_courier: access.canCallCourier,
  can_call_recipient: access.canCallRecipient,
  visibility_notice: access.visibilityNotice,
});

export type CustomerPriceCalculationInput = {
  service: DeliveryServiceProduct;
  pickupPoint: CoordinatePayload;
  dropoffPoint: CoordinatePayload;
  dimensions?: any;
  weightKg?: any;
  packages?: NormalizedOrderPackage[];
  hasInsurance?: any;
  itemValue?: any;
  sizeTier?: string | null;
  routeSnapshotOverride?: RouteEtaSnapshot;
  courierId?: string | null;
  materialCodes?: string[];
  recipientName?: string | null;
  recipientPhone?: string | null;
  requiresDeliveryCode?: boolean;
};

const packageFactsSnapshot = (
  service: DeliveryServiceProduct,
  packages: NormalizedOrderPackage[],
  recipientName?: string | null,
  recipientPhone?: string | null,
  requiresDeliveryCode?: boolean,
) => {
  const summary = summarizePackages(service, packages);
  return {
    quantity: summary.package_count,
    category: packages[0]?.category || 'other',
    item_description: packages[0]?.description || '',
    item_value_idr: packages.reduce((sum, item) => sum + item.declared_value_idr * item.quantity, 0),
    fragile: packages.some((item) => item.is_fragile),
    prohibited: packages.some((item) => item.is_prohibited),
    size_tier: packages[0]?.size_tier || null,
    delivery_code_policy: requiresDeliveryCode || packages.some((item) => item.requires_delivery_code) ? 'required' : 'optional',
    receiver: {
      name: recipientName || null,
      phone: recipientPhone || null,
    },
  };
};

type SelectedTambalBanMaterial = {
  code: string;
  name: string;
  description: string;
  service_code: string;
  vehicle_type: string;
  price_idr: number;
};

const normalizeMaterialCodes = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20))];
};

const loadSelectedTambalBanMaterials = async (
  service: DeliveryServiceProduct,
  materialCodes: unknown,
): Promise<SelectedTambalBanMaterial[]> => {
  const codes = normalizeMaterialCodes(materialCodes);
  if (codes.length === 0 || service.service_category !== 'tambal_ban') return [];

  const result = await db.query(
    `SELECT code, name, description, service_code, vehicle_type, price_idr
       FROM tambal_ban_materials
      WHERE service_code = $1 AND code = ANY($2::text[]) AND is_active = TRUE`,
    [service.code, codes],
  );
  if (result.rows.length !== codes.length) {
    const error = new Error('Satu atau lebih material tambal ban sudah tidak tersedia. Muat ulang katalog.');
    (error as any).statusCode = 409;
    (error as any).code = 'ERR_MATERIAL_NOT_AVAILABLE';
    throw error;
  }
  return result.rows.map((row) => ({
    code: String(row.code),
    name: String(row.name),
    description: String(row.description || ''),
    service_code: String(row.service_code),
    vehicle_type: String(row.vehicle_type),
    price_idr: Number(row.price_idr || 0),
  }));
};

export const calculateCustomerPriceBreakdown = async ({
  service,
  pickupPoint,
  dropoffPoint,
  dimensions,
  weightKg,
  packages,
  hasInsurance,
  itemValue,
    sizeTier,
    routeSnapshotOverride,
    courierId,
    materialCodes,
    recipientName,
    recipientPhone,
    requiresDeliveryCode,
  }: CustomerPriceCalculationInput) => {
  // ─── Quote-based pricing (aggregator/3PL) ────────────────────
  // These services don't use internal distance × multiplier pricing.
  // The price comes from the logistics provider's tariff, stored as
  // logistics_tariff_idr in the order. We return placeholder values
  // so the order INSERT has valid route_snapshot and zero-cost components.
  if (service.price_mode === 'quote') {
      const routeSnapshot = {
        ...(routeSnapshotOverride || await buildMapsRouteEtaSnapshot(
          { latitude: pickupPoint.lat, longitude: pickupPoint.lng },
          { latitude: dropoffPoint.lat, longitude: dropoffPoint.lng },
          'customer_mobile',
          {
            serviceCode: service.code,
            vehicleType: routeVehicleTypeForService(service),
            routeProfile: routeVehicleTypeForService(service),
            requireRoadRoute: true,
          }
        )),
        service_code: service.code,
      };
      const distance = Math.max(0, Number(routeSnapshot.distance_km || 0));
      const routeEta = routeSnapshot.eta_minutes || 120;
      const etaMinutes = Math.min(service.max_eta_minutes, Math.max(20, routeEta));
      const normalizedPkgs = packages && packages.length > 0
        ? packages
        : normalizePackageInputs(null, { dimensions, weight_kg: weightKg, size_tier: sizeTier });
    const pkgSummary = summarizePackages(service, normalizedPkgs);

    return {
      service_code: service.code,
      service_name: service.name,
      service_snapshot: publicServiceSnapshot(service),
      selected_size_tier: null,
      distance_km: distance,
      route_snapshot: publicRouteSnapshot({ ...routeSnapshot, eta_minutes: etaMinutes, eta: `${etaMinutes} menit` }),
      base_price_idr: 0,
      actual_weight_kg: Number(pkgSummary.actual_weight_kg.toFixed(2)),
      dimensional_weight_kg: Number(pkgSummary.dimensional_weight_kg.toFixed(2)),
      chargeable_weight_kg: Number(pkgSummary.chargeable_weight_kg.toFixed(2)),
      package_count: pkgSummary.package_count,
      packages: normalizedPkgs,
      package_facts: packageFactsSnapshot(service, normalizedPkgs, recipientName, recipientPhone, requiresDeliveryCode),
      volumetric_surcharge_idr: 0,
      insurance_premium_idr: 0,
      dynamic_price_idr: 0,
      platform_fee_idr: 0,
      toll_cost_idr: 0,
      toll_cost_source: 'unavailable',
      material_cost_idr: 0,
      materials: [],
      delivery_model: service.route_model,
      eta_minutes: etaMinutes,
      total_price_idr: 0, // Actual price is logistics_tariff_idr, stored separately
    };
  }

  const routeSnapshot = {
      ...(routeSnapshotOverride || await buildMapsRouteEtaSnapshot(
        { latitude: pickupPoint.lat, longitude: pickupPoint.lng },
        { latitude: dropoffPoint.lat, longitude: dropoffPoint.lng },
        'customer_mobile',
        {
          serviceCode: service.code,
          vehicleType: routeVehicleTypeForService(service),
          routeProfile: routeVehicleTypeForService(service),
          requireRoadRoute: !isHomeServiceCategory(service),
        }
      )),
      service_code: service.code,
    };

    const isHomeService = isHomeServiceCategory(service);
    // Home services (tambal ban / towing): kurir DATANG ke lokasi customer —
    // pickup == dropoff adalah keadaan normal, bukan rute 0 km yang salah.
    // Jarak minimum = included_distance_km supaya base_fare tetap valid.
    const rawDistance = Math.max(0, Number(routeSnapshot.distance_km || 0));
    const distance = isHomeService
      ? Math.max(rawDistance, toNumber(service.included_distance_km, 1))
      : rawDistance;
    if (distance <= 0) {
      const error = new Error('Rute pickup dan tujuan belum bisa dihitung. Coba pilih alamat yang lebih lengkap.');
      (error as any).statusCode = 422;
      (error as any).code = 'ERR_ROUTE_UNAVAILABLE';
      throw error;
    }

  if (service.max_distance_km && distance > service.max_distance_km) {
    const error = new Error(`${service.name} maksimal ${service.max_distance_km} km. Jarak order ini ${distance} km.`);
    (error as any).statusCode = 400;
    (error as any).code = 'ERR_SERVICE_DISTANCE_LIMIT';
    throw error;
  }

  const normalizedPackages = packages && packages.length > 0
    ? packages
    : normalizePackageInputs(null, { dimensions, weight_kg: weightKg, size_tier: sizeTier });
  validatePackagePolicy(service, normalizedPackages);
  const packageSummary = summarizePackages(service, normalizedPackages);
  const selectedTier = resolveSizeTier(service, sizeTier || normalizedPackages[0]?.size_tier || undefined);
  const divisor = toNumber(service.dimension_rules?.volumetric_divisor, 6000);
  const surchargeThreshold = toNumber(service.dimension_rules?.surcharge_threshold_kg, service.max_weight_kg || 20);
  const surchargePerKg = toNumber(service.dimension_rules?.surcharge_per_kg_idr, 2000);

  let volumetricWeight = packageSummary.dimensional_weight_kg;
  const actualWeight = packageSummary.actual_weight_kg;
  if (selectedTier?.max_weight_kg && actualWeight > toNumber(selectedTier.max_weight_kg)) {
    const error = new Error(`Berat aktual melewati tier ${selectedTier.name}. Pilih tier yang lebih besar.`);
    (error as any).statusCode = 400;
    (error as any).code = 'ERR_SIZE_TIER_WEIGHT_LIMIT';
    throw error;
  }

  const chargeableWeight = packageSummary.chargeable_weight_kg;

  if (service.max_weight_kg && chargeableWeight > service.max_weight_kg) {
    const error = new Error(`${service.name} maksimal ${service.max_weight_kg} kg. Berat hitung order ini ${chargeableWeight.toFixed(2)} kg.`);
    (error as any).statusCode = 400;
    (error as any).code = 'ERR_SERVICE_WEIGHT_LIMIT';
    throw error;
  }

  const includedKm = toNumber(service.included_distance_km, 1);
  const selectedMaterials = await loadSelectedTambalBanMaterials(service, materialCodes);
  const materialCost = selectedMaterials.reduce((sum, material) => sum + material.price_idr, 0);
    // Aturan pembulatan jarak: <0.5 dibulatkan ke bawah, >=0.5 ke atas (Math.round)
    const distanceChargeKm = Math.max(0, Math.round(distance - includedKm));
      const tierMultiplier = toNumber(selectedTier?.multiplier, 1);
      const tierDelta = toNumber(selectedTier?.price_delta_idr, 0);
      // Home services (tambal ban / towing): biaya jasa = harga jasa petugas
        // (courier_service_prices), bukan base_fare produk. Base fare produk
        // tetap dikenakan sebagai ONGKOS LAYANAN 0-1 km (included_distance_km),
        // lalu +per_km utk km berikutnya.
              const courierPrice = isHomeService && courierId
                              ? await db.query(
                                  `SELECT price_amount FROM courier_service_prices
                                                                     WHERE (courier_id = $1
                                                                        OR courier_id = (SELECT id FROM courier_profiles WHERE user_id = $1))
                                                                       AND service_code = $2 AND is_active = TRUE
                                                                     LIMIT 1`,
                                  [courierId, service.code]
                                )
                              : null;
              const serviceFee = (isHomeService && courierId && courierPrice && courierPrice.rows.length > 0)
                ? toNumber(courierPrice.rows[0].price_amount, toNumber(service.base_fare_idr, 0))
                : toNumber(service.base_fare_idr, 0);
        const distanceLeg = includedKm; // 0-1km = base fare penuh (bukan gratis)
        const baseBeforeMultiplier = serviceFee
          + (distanceChargeKm * service.per_km_idr)
          + (toNumber(service.base_fare_idr, 0) * distanceLeg)
          + tierDelta;
        const basePrice = roundRupiah(baseBeforeMultiplier * service.service_multiplier * tierMultiplier);
  const volumetricSurcharge = chargeableWeight > surchargeThreshold
    ? Math.ceil(chargeableWeight - surchargeThreshold) * surchargePerKg
    : 0;

  let insurancePremium = 0;
  if (hasInsurance && itemValue) {
    const insuranceRate = toNumber(service.metadata?.insurance_premium_rate_percent, 0);
    const insuranceMinimum = toNumber(service.metadata?.insurance_min_premium_idr, 0);
    if (!insuranceRate) {
      const error = new Error(`${service.name} belum memiliki konfigurasi premi asuransi aktif.`);
      (error as any).statusCode = 422;
      (error as any).code = 'ERR_INSURANCE_CONFIG_MISSING';
      throw error;
    }
    insurancePremium = Math.max(insuranceMinimum, Math.ceil((toNumber(itemValue) * insuranceRate) / 100));
  }

  const hour = new Date().getHours();
  const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20);
  let dynamicPrice = isPeakHour ? Math.ceil(basePrice * 0.15) : 0;

  try {
    const weatherDataStr = await redis.get('current_weather_surge');
    if (weatherDataStr) {
      const weatherData = JSON.parse(weatherDataStr);
      if (weatherData.surgeMultiplier > 0) {
        const weatherSurge = Math.ceil(basePrice * weatherData.surgeMultiplier);
        dynamicPrice += weatherSurge;
      }
    }
  } catch (error) {
    securityLog.error('Failed to apply weather surge:', error);
  }

  const routeEta = routeSnapshot.eta_minutes || Math.ceil(20 + (distance * 3.5) + (service.batching_allowed ? 120 : 0));
  const etaMinutes = Math.min(service.max_eta_minutes, Math.max(20, routeEta));
  const priceAfterSurge = basePrice + dynamicPrice;
    // Home services: fee platform dihitung dari komponen JARAK (base fare
    // produk + per_km) saja — harga jasa petugas TIDAK kena fee platform.
    // Total utk demo: 15.000 (jasa) + 5.000 (base 0-1km) + 2.650 (fee) = 22.650.
    let platformFeeBase = basePrice;
    if (isHomeService && courierId && courierPrice && courierPrice.rows.length > 0) {
      platformFeeBase = (toNumber(service.base_fare_idr, 0) * includedKm)
        + (distanceChargeKm * service.per_km_idr);
    }
    const platformFee = Math.ceil(service.platform_fee_idr + (platformFeeBase * service.platform_fee_pct));
  const tollCost = toNumber(service.metadata?.toll_cost_idr, 0);
  const totalPrice = priceAfterSurge + volumetricSurcharge + insurancePremium + platformFee + materialCost + tollCost;

  return {
      service_code: service.code,
      service_name: service.name,
      service_snapshot: publicServiceSnapshot(service),
      selected_size_tier: selectedTier,
      distance_km: distance,
      route_snapshot: publicRouteSnapshot({ ...routeSnapshot, eta_minutes: etaMinutes, eta: `${etaMinutes} menit` }),
      base_price_idr: basePrice,
      service_fee_idr: isHomeService && courierId && courierPrice && courierPrice.rows.length > 0
        ? toNumber(courierPrice.rows[0].price_amount, toNumber(service.base_fare_idr, 0))
        : 0,
      travel_fee_idr: isHomeService && courierId && courierPrice && courierPrice.rows.length > 0
              ? Math.ceil(toNumber(service.base_fare_idr, 0) * includedKm) + Math.round(distanceChargeKm * service.per_km_idr)
              : 0,
            platform_fee_breakdown_idr: isHomeService && courierId && courierPrice && courierPrice.rows.length > 0
              ? platformFee
              : 0,
            platform_commission_pct: toNumber(service.platform_commission_percent, 0),
      base_fare_idr: toNumber(service.base_fare_idr, 0),
      per_km_idr: toNumber(service.per_km_idr, 0),
      included_distance_km: includedKm,
      platform_fee_pct: toNumber(service.platform_fee_pct, 0),
      actual_weight_kg: Number(actualWeight.toFixed(2)),
    dimensional_weight_kg: Number(volumetricWeight.toFixed(2)),
    chargeable_weight_kg: Number(chargeableWeight.toFixed(2)),
    package_count: packageSummary.package_count,
    packages: normalizedPackages,
    package_facts: packageFactsSnapshot(service, normalizedPackages, recipientName, recipientPhone, requiresDeliveryCode),
    volumetric_surcharge_idr: volumetricSurcharge,
    insurance_premium_idr: insurancePremium,
    dynamic_price_idr: dynamicPrice,
      platform_fee_idr: platformFee,
      toll_cost_idr: tollCost,
      toll_cost_source: tollCost > 0 ? 'service_configuration' : 'unavailable',
      material_cost_idr: materialCost,
      materials: selectedMaterials,
      delivery_model: service.route_model,
    eta_minutes: etaMinutes,
    total_price_idr: totalPrice,
  };
};

export const completeCustomerLapayPayment = async (customerId: string, orderId: string) => {
  const client = await db.connect();
  let createdOffers: Awaited<ReturnType<typeof advanceOnDemandDispatchQueue>> = [];

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT o.id,
              o.order_number,
              o.status AS order_status,
              o.total_price_idr,
              o.service_snapshot,
              o.recipient_name,
              o.recipient_phone_masked,
              o.merchant_id,
              o.service_sub_type,
              o.model,
              p.id AS payment_id,
              p.provider,
              p.method,
              p.status AS payment_status,
              p.amount_idr,
              p.expires_at,
              p.provider_reference,
              p.snap_token,
              p.redirect_url,
              p.client_key,
              p.snap_js_url
         FROM orders o
         LEFT JOIN payments p ON p.order_id = o.id
        WHERE o.id = $1 AND o.customer_id = $2
        FOR UPDATE OF o`,
      [orderId, customerId]
    );

    if (rows.length === 0) {
      const error = new Error('Order not found');
      (error as any).statusCode = 404;
      throw error;
    }

    const order = rows[0];
    // FOOD-BIKE-076: breakdown item makanan (flow LAPAY)
    if (order.merchant_id) {
      const itemRows = await client.query(
        `SELECT item_name, item_price, quantity, notes, subtotal,
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
          ORDER BY foi.created_at ASC`,
        [orderId]
      );
      order.items = itemRows.rows;
    } else {
      order.items = null;
    }
    const amountIdr = Number(order.amount_idr || order.total_price_idr || 0);
    if (!Number.isInteger(amountIdr) || amountIdr <= 0) {
      const error = new Error('Nominal pembayaran tidak valid.');
      (error as any).statusCode = 422;
      (error as any).code = 'ERR_INVALID_PAYMENT_AMOUNT';
      throw error;
    }

    if (order.payment_status === 'paid') {
      await client.query('COMMIT');
      return {
        payment: publicCustomerPaymentSession({ ...order, provider: order.provider || 'lapay', method: order.method || 'lapay' }),
        createdOffers,
        lifecycle: {
          orderId,
          orderNumber: order.order_number,
          customerId,
          merchantId: order.merchant_id,
          paymentStatus: 'paid' as const,
          orderStatus: order.order_status,
          source: 'payment_reconciled' as const,
          serviceSubType: order.service_sub_type,
          provider: order.provider || 'lapay',
          method: order.method || 'lapay',
          amountIdr,
        },
      };
    }

    if (order.order_status !== 'pending_payment') {
      const error = new Error('Order ini tidak berada pada fase pembayaran.');
      (error as any).statusCode = 409;
      (error as any).code = 'ERR_PAYMENT_NOT_ALLOWED';
      throw error;
    }

    const walletTableCheck = await client.query(`SELECT to_regclass('public.customer_wallets') AS table_name`);
    if (!walletTableCheck.rows[0]?.table_name) {
      const error = new Error('LAPAY belum aktif. Jalankan migration customer wallet terlebih dahulu.');
      (error as any).statusCode = 503;
      (error as any).code = 'ERR_LAPAY_NOT_READY';
      throw error;
    }

    const walletResult = await client.query(
      `SELECT id, balance
         FROM customer_wallets
        WHERE customer_id = $1
          AND status = 'active'
        ORDER BY created_at ASC, id ASC
        FOR UPDATE`,
      [customerId]
    );
    const wallets = walletResult.rows;
    const walletBalance = wallets.reduce((sum, wallet) => sum + Number(wallet.balance || 0), 0);

    if (walletBalance < amountIdr) {
      const error = new Error('Saldo LAPAY belum cukup untuk pembayaran order ini.');
      (error as any).statusCode = 402;
      (error as any).code = 'ERR_LAPAY_INSUFFICIENT_BALANCE';
      (error as any).walletBalance = walletBalance;
      throw error;
    }

    const paymentResult = await client.query(
      `INSERT INTO payments (
          order_id, payment_number, provider, method, status, amount_idr,
          mdr_amount_idr, ppn_amount_idr, weather_reserve_idr, insurance_reserve_idr,
          net_operational_idr, provider_reference, snap_token, redirect_url, client_key, snap_js_url,
          expires_at, paid_at, updated_at
        ) VALUES (
          $1, $2, 'lapay', 'lapay', 'paid', $3,
          COALESCE((SELECT mdr_amount_idr FROM payments WHERE order_id = $1), 0),
          COALESCE((SELECT ppn_amount_idr FROM payments WHERE order_id = $1), 0),
          COALESCE((SELECT weather_reserve_idr FROM payments WHERE order_id = $1), 0),
          COALESCE((SELECT insurance_reserve_idr FROM payments WHERE order_id = $1), 0),
          COALESCE((SELECT net_operational_idr FROM payments WHERE order_id = $1), $3),
          $4, NULL, NULL, NULL, NULL,
          NOW() + INTERVAL '5 minutes', NOW(), NOW()
        )
        ON CONFLICT (order_id) DO UPDATE
          SET provider = 'lapay',
              method = 'lapay',
              status = 'paid',
              amount_idr = EXCLUDED.amount_idr,
              provider_reference = EXCLUDED.provider_reference,
              snap_token = NULL,
              redirect_url = NULL,
              client_key = NULL,
              snap_js_url = NULL,
              expires_at = EXCLUDED.expires_at,
              paid_at = COALESCE(payments.paid_at, NOW()),
              updated_at = NOW()
        WHERE payments.status <> 'paid'
        RETURNING id AS payment_id,
                  provider,
                  method,
                  status AS payment_status,
                  amount_idr,
                  expires_at,
                  provider_reference,
                  snap_token,
                  redirect_url,
                  client_key,
                  snap_js_url`,
      [orderId, `PAY-${order.order_number}`, amountIdr, `LAPAY-${order.order_number}`]
    );

    if (paymentResult.rows.length === 0) {
      const error = new Error('Status pembayaran sudah final.');
      (error as any).statusCode = 409;
      (error as any).code = 'ERR_PAYMENT_ALREADY_FINAL';
      throw error;
    }

    let remaining = amountIdr;
    let runningBalance = walletBalance;
    for (const wallet of wallets) {
      if (remaining <= 0) break;
      const walletBalanceBefore = Number(wallet.balance || 0);
      if (walletBalanceBefore <= 0) continue;
      const debitAmount = Math.min(walletBalanceBefore, remaining);
      runningBalance -= debitAmount;
      remaining -= debitAmount;

      await client.query(
        `UPDATE customer_wallets
            SET balance = balance - $2,
                updated_at = NOW()
          WHERE id = $1
            AND balance >= $2`,
        [wallet.id, debitAmount]
      );

      await client.query(
        `INSERT INTO customer_wallet_ledger_entries (
            customer_id, wallet_id, order_id, payment_id, idempotency_key,
            entry_type, direction, amount_idr, balance_after_idr, metadata
          ) VALUES ($1, $2, $3, $4, $5, 'order_payment', 'debit', $6, $7, $8::jsonb)
          ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          customerId,
          wallet.id,
          orderId,
          paymentResult.rows[0].payment_id,
          `lapay:${orderId}:${wallet.id}`,
          debitAmount,
          runningBalance,
          JSON.stringify({ order_number: order.order_number, payment_method: 'LAPAY' })
        ]
      );
    }

    if (remaining !== 0) {
      const error = new Error('Saldo LAPAY berubah saat pembayaran diproses. Silakan coba lagi.');
      (error as any).statusCode = 409;
      (error as any).code = 'ERR_LAPAY_CONCURRENT_BALANCE_CHANGE';
      throw error;
    }

    // FOOD-BIKE-077-FIX: order food (merchant_id terisi) setelah paid harus
    // masuk antrian merchant (pending_merchant), BUKAN pending (status parcel
    // yang menunggu dispatch kurir). Tanpa ini merchant tidak bisa accept:
    // AcceptOrder hanya menerima status pending_merchant.
    const isFoodOrder = order.merchant_id != null;
    await client.query(
      `UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1 AND status = 'pending_payment'`,
      [orderId, isFoodOrder ? 'pending_merchant' : 'pending']
    );

    await redeemReservedPromosForPaidOrder(client, customerId, orderId);

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description)
       VALUES ($1, $2, 'payment_confirmed', 'Customer paid order using LAPAY balance')`,
      [orderId, customerId]
    );

    await enqueueOutboxEvent(client, {
      aggregateType: 'payment',
      aggregateId: paymentResult.rows[0].payment_id,
      eventType: 'payment.paid',
      eventVersion: 1,
      payload: {
        order_id: orderId,
        order_number: order.order_number,
        customer_id: customerId,
        provider: 'lapay',
        method: 'lapay',
        amount_idr: amountIdr,
      },
    });

    if (!isFoodOrder) {
      createdOffers = await advanceOnDemandDispatchQueue(client, 1);
    }

    await client.query('COMMIT');

    const payment = publicCustomerPaymentSession({
      ...order,
      ...paymentResult.rows[0],
      order_status: isFoodOrder ? 'pending_merchant' : 'pending',
      wallet_balance: runningBalance
    });

    return {
      payment,
      createdOffers,
      lifecycle: {
        orderId,
        orderNumber: order.order_number,
        customerId,
        merchantId: order.merchant_id,
        paymentStatus: 'paid' as const,
        orderStatus: isFoodOrder ? 'pending_merchant' : 'pending',
        source: 'payment_reconciled' as const,
        serviceSubType: order.service_sub_type,
        provider: 'lapay',
        method: 'lapay',
        amountIdr,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const toMobileCustomerOrderDto = (row: any) => {
  const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const updatedAtMs = row.updated_at ? new Date(row.updated_at).getTime() : createdAtMs;

  const canonical = withCanonicalOrderContract(row);
  return {
    ...canonical,
    local_id: 0,
    order_id: row.id,
    order_number: row.order_number || '',
    pickup_address: row.pickup_address || '',
    pickup_time: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : '',
    drop_address: row.dropoff_address || '',
    distance: row.distance_km !== null && row.distance_km !== undefined ? String(row.distance_km) : '',
    fee: row.total_price_idr !== null && row.total_price_idr !== undefined ? String(row.total_price_idr) : '',
    customer_name: row.recipient_name || row.customer_name || '',
    status: row.status || 'pending',
    status_label: customerOrderStatusLabel(row.status, row.service_sub_type || row.serviceSubType),
    created_at: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    updated_at: Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now(),
    customer_phone: null,
    courier_name: row.courier_name || null,
    courier_vehicle: row.courier_vehicle || null,
    courier_plate: row.courier_plate || null,
    courier_phone: null,
    communication: {
      primary_target: row.courier_name ? 'courier' : 'support',
      can_chat_courier: Boolean(row.courier_name),
      can_call_courier: Boolean(row.courier_name),
      raw_phone_exposed: false,
    },
    route_snapshot: row.route_snapshot || null,
    route_provider: row.route_provider || row.route_snapshot?.provider || null,
    route_profile: row.route_profile || row.route_snapshot?.route_profile || null,
    route_polyline: row.route_polyline || row.route_snapshot?.route_polyline || null,
    route_distance_meters: Number(row.route_distance_meters || row.route_snapshot?.distance_meters || 0),
    route_duration_seconds: Number(row.route_duration_seconds || row.route_snapshot?.duration_seconds || 0),
    eta_minutes: Number(row.eta_minutes || row.route_snapshot?.eta_minutes || 0),
    service_sub_type: row.service_sub_type || row.serviceSubType || '',
    merchant_name: row.merchant_name || row.merchantName || '',
    order_notes: row.order_notes || row.orderNotes || '',
    invoice: publicCustomerInvoice(row),
    food_items: row.food_items || [],
  };
};

export type CustomerReportPeriod = 'bulan_ini' | 'bulan_lalu' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom';

export const CUSTOMER_REPORT_PERIODS = new Set<CustomerReportPeriod>(['bulan_ini', 'bulan_lalu', 'q1', 'q2', 'q3', 'q4', 'custom']);

export const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

export const addUtcDays = (value: Date, days: number): Date => {
  const nextValue = new Date(value);
  nextValue.setUTCDate(nextValue.getUTCDate() + days);
  return nextValue;
};

export const isDateOnlyInput = (value: unknown): value is string => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
);

export const parseUtcDateOnly = (value: string): Date => {
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Invalid date');
  }
  return parsedDate;
};

export const getCustomerReportRange = (periodInput: unknown, startDateInput: unknown, endDateInput: unknown) => {
  const normalizedPeriod = typeof periodInput === 'string' && CUSTOMER_REPORT_PERIODS.has(periodInput as CustomerReportPeriod)
    ? periodInput as CustomerReportPeriod
    : 'bulan_ini';

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  if (normalizedPeriod === 'custom') {
    if (!isDateOnlyInput(startDateInput) || !isDateOnlyInput(endDateInput)) {
      return {
        error: 'Tanggal mulai dan tanggal selesai wajib diisi untuk periode custom',
      };
    }

    const startDate = parseUtcDateOnly(startDateInput);
    const endDateInclusive = parseUtcDateOnly(endDateInput);
    if (endDateInclusive < startDate) {
      return {
        error: 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai',
      };
    }

    const endDateExclusive = addUtcDays(endDateInclusive, 1);
    const rangeDays = Math.ceil((endDateExclusive.getTime() - startDate.getTime()) / 86_400_000);
    if (rangeDays > 366) {
      return {
        error: 'Rentang laporan maksimal 366 hari',
      };
    }

    return {
      period: normalizedPeriod,
      startDate: toDateOnly(startDate),
      endDateExclusive: toDateOnly(endDateExclusive),
      endDateInclusive: toDateOnly(endDateInclusive),
    };
  }

  if (normalizedPeriod === 'bulan_lalu') {
    const startDate = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
    const endDateExclusive = new Date(Date.UTC(currentYear, currentMonth, 1));
    return {
      period: normalizedPeriod,
      startDate: toDateOnly(startDate),
      endDateExclusive: toDateOnly(endDateExclusive),
      endDateInclusive: toDateOnly(addUtcDays(endDateExclusive, -1)),
    };
  }

  if (normalizedPeriod.startsWith('q')) {
    const quarterIndex = Number(normalizedPeriod.replace('q', '')) - 1;
    const startDate = new Date(Date.UTC(currentYear, quarterIndex * 3, 1));
    const endDateExclusive = new Date(Date.UTC(currentYear, quarterIndex * 3 + 3, 1));
    return {
      period: normalizedPeriod,
      startDate: toDateOnly(startDate),
      endDateExclusive: toDateOnly(endDateExclusive),
      endDateInclusive: toDateOnly(addUtcDays(endDateExclusive, -1)),
    };
  }

  const startDate = new Date(Date.UTC(currentYear, currentMonth, 1));
  const endDateExclusive = new Date(Date.UTC(currentYear, currentMonth + 1, 1));
  return {
    period: 'bulan_ini' as CustomerReportPeriod,
    startDate: toDateOnly(startDate),
    endDateExclusive: toDateOnly(endDateExclusive),
    endDateInclusive: toDateOnly(addUtcDays(endDateExclusive, -1)),
  };
};

// ─── Customer Cancel Order ────────────────────────────────────────────────────
