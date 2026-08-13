import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import type { PoolClient } from 'pg';
import { db } from '../db';
import { createNotification } from '../notifications';
import { createSnapTransaction, getMidtransClientKey, getMidtransSnapJsUrl } from '../midtrans';
import { isExpiredOrFailedTransaction, isSuccessfulTransaction } from '../midtrans';
import { calculateServiceSettlement, customerFacingService, DeliveryServiceProduct, findDeliveryServiceByCode, listEnabledDeliveryServicesForCustomer } from './deliveryServices.controller';
import { advanceOnDemandDispatchQueue, dispatchToPreferredCourier, notifyOnDemandOffers } from './courierAuth.controller';
import { redis } from '../redis';
import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../services/onDemandRealtime';
import { buildOnDemandTrackingSnapshot, evaluateLocationQuality, writeLocationSafetyEvent } from '../services/onDemandTracking';
import { evaluateOnDemandRealtimeAlerts } from '../services/realtimeObservability';
import { buildMapsRouteEtaSnapshot, RouteEtaSnapshot } from '../services/mapsProviderConfig';
import { enqueueOutboxEvent } from '../services/eventOutbox';
import {
  createOrderCallSession,
  endOrderCallSession,
  errorStatusCode,
  joinOrderCallSession,
  listConversationChats,
  markConversationRead,
  revokeReceiverLocationInvite,
  sendConversationChat,
} from '../services/orderCommunication';
import crypto from 'crypto';
import { saveSecureUploadBuffer } from '../security/uploadSecurity';
import { releasePromoReservation, validatePromoForCheckout } from '../services/promoEngine';
import {
  insertWebhookAuditEvent,
  resolveRawBody,
  updateWebhookAuditEvent,
  verifyMidtransSignature,
} from '../security/webhookSecurity';

type CoordinatePayload = {
  lat: number;
  lng: number;
};

type NormalizedOrderPackage = {
  package_index: number;
  package_code: string;
  description: string;
  category: string;
  size_tier: string | null;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  declared_value_idr: number;
  dimensions_scanned: boolean;
  metadata: Record<string, any>;
};

// Helper to calculate distance based on coordinates (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
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

const toNumber = (value: any, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const roundRupiah = (value: number) => Math.ceil(value);

const publicServiceSnapshot = (service: DeliveryServiceProduct) => customerFacingService(service);

const publicBaseUrl = () =>
  process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

const normalizePromoCode = (value: unknown) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  return /^[A-Z0-9_-]{3,40}$/.test(normalized) ? normalized : null;
};

const buildPromoReservationKey = (orderIdempotencyKey: unknown, customerId: string, promoCode: string) =>
  sha256(`customer-order-promo:${customerId}:${String(orderIdempotencyKey || '')}:${promoCode}`);

const redeemReservedPromosForPaidOrder = async (client: PoolClient, customerId: string, orderId: string) => {
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

const releaseReservedPromosForOrders = async (client: PoolClient, orderIds: string[]) => {
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

const receiverLocationBaseUrl = () =>
  process.env.RECEIVER_LOCATION_PUBLIC_URL || publicBaseUrl();

const maskPhone = (value: any) => {
  const normalized = String(value || '').replace(/[^\d+]/g, '');
  if (!normalized) return null;
  return normalized.replace(/\d(?=\d{4})/g, '*');
};

const toMobileCustomerProfileDto = (row: any) => ({
  id: row.id,
  name: row.full_name || '',
  phone_number: row.phone_number || '',
  wallet_balance: Number(row.wallet_balance || 0),
  profile_image_url: row.photo_url || null,
  store_name: row.store_name || '',
  default_pickup_address: row.default_pickup_address || ''
});

const getCustomerWalletBalance = async (customerId: string) => {
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

type CustomerPaymentMethod = 'qris' | 'lapay';

const normalizeCustomerPaymentMethod = (value: any): CustomerPaymentMethod => {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'lapay') return 'lapay';
  if (method === 'qris' || method === 'midtrans' || method === 'midtrans_qris' || method === 'snap') return 'qris';
  return 'qris';
};

const customerPaymentMethodLabel = (provider?: string | null, method?: string | null) => {
  const normalizedProvider = String(provider || '').toLowerCase();
  const normalizedMethod = String(method || '').toLowerCase();
  if (normalizedProvider === 'lapay' || normalizedMethod === 'lapay') return 'LAPAY';
  return 'QRIS';
};

const requireMidtransConfig = () => {
  if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
    const error = new Error('QRIS belum aktif. Lengkapi MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY di environment admin-service.');
    (error as any).statusCode = 503;
    (error as any).code = 'ERR_MIDTRANS_NOT_CONFIGURED';
    throw error;
  }
};

const normalizeCustomerProfileName = (value: any) => {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) return null;
  return name;
};

const normalizeCustomerProfilePhone = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('@')) return null;
  const normalized = raw.replace(/[^\d+]/g, '');
  if (normalized.length < 8 || normalized.length > 20) return null;
  return normalized;
};

const normalizePhoneForPrivateLookup = (value: any) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = `62${digits.slice(1)}`;
  } else if (digits.startsWith('8')) {
    digits = `62${digits}`;
  }
  if (digits.length < 8 || digits.length > 18) return null;
  return digits;
};

const phoneHashSecret = () => {
  const configured = process.env.PHONE_HASH_SECRET || process.env.JWT_SECRET || process.env.JWT_REFRESH_SECRET || '';
  if (configured) return configured;
  return process.env.NODE_ENV === 'production' ? '' : 'development-only-recipient-phone-hash-secret';
};

const hashPhoneForPrivateLookup = (value: any) => {
  const phone = normalizePhoneForPrivateLookup(value);
  const secret = phoneHashSecret();
  if (!phone || !secret) return null;
  return crypto.createHmac('sha256', secret).update(phone).digest('hex');
};

const normalizeCoordinatePayload = (value: any): CoordinatePayload | null => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const validAddress = (value: any) => typeof value === 'string' && value.trim().length >= 6;

const normalizeAddressKind = (value: any) => {
  const kind = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ['pickup', 'receiver', 'both'].includes(kind) ? kind : 'receiver';
};

const publicCustomerAddress = (row: any) => ({
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

const publicCustomerPaymentSession = (row: any) => {
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

const getCustomerOrderPaymentRow = async (customerId: string, orderId: string) => {
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

const resolveSizeTier = (service: DeliveryServiceProduct, requestedCode?: string) => {
  if (!service.uses_size_tier || service.size_tiers.length === 0) return null;
  return service.size_tiers.find((tier) => tier.code === requestedCode) || service.size_tiers[0];
};

const normalizePackageDetailsForOrder = (
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
    service_code: service.code,
    service_name: service.name,
    vehicle_types: service.vehicle_types || [],
    package_count: packages.length || 1,
    packages: packages.length > 0 ? packages : undefined
  };
};

const sanitizePackageString = (value: any, fallback = '') =>
  String(value || fallback)
    .replace(/[<>{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

const normalizePackageInputs = (rawPackages: any, legacyPackageDetails: any): NormalizedOrderPackage[] => {
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
      size_tier: item?.size_tier ? sanitizePackageString(item.size_tier).slice(0, 50) : null,
      weight_kg: Math.max(0, toNumber(item?.weight_kg ?? legacyPackageDetails?.weight_kg, 0)),
      length_cm: Math.max(0, toNumber(item?.length_cm ?? dimensions.length ?? legacyPackageDetails?.length_cm, 0)),
      width_cm: Math.max(0, toNumber(item?.width_cm ?? dimensions.width ?? legacyPackageDetails?.width_cm, 0)),
      height_cm: Math.max(0, toNumber(item?.height_cm ?? dimensions.height ?? legacyPackageDetails?.height_cm, 0)),
      declared_value_idr: Math.max(0, Math.trunc(toNumber(item?.declared_value_idr ?? item?.item_value_idr, 0))),
      dimensions_scanned: Boolean(item?.dimensions_scanned ?? legacyPackageDetails?.dimensions_scanned),
      metadata: {
        source: Array.isArray(rawPackages) && rawPackages.length > 0 ? 'packages_array' : 'legacy_package_details',
      },
    };
  });
};

const packageChargeableWeight = (service: DeliveryServiceProduct, item: NormalizedOrderPackage) => {
  const divisor = toNumber(service.dimension_rules?.volumetric_divisor, 6000);
  const volumetric = item.length_cm && item.width_cm && item.height_cm
    ? (item.length_cm * item.width_cm * item.height_cm) / divisor
    : 0;
  return {
    actual: item.weight_kg,
    volumetric,
    chargeable: Math.max(item.weight_kg, volumetric),
  };
};

const summarizePackages = (service: DeliveryServiceProduct, packages: NormalizedOrderPackage[]) => {
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
    package_count: packages.length,
    actual_weight_kg: actualWeightKg,
    dimensional_weight_kg: volumetricWeightKg,
    chargeable_weight_kg: chargeableWeightKg,
    max_dimensions: maxDimensions,
    packages: packageSummaries,
  };
};

const validatePackagePolicy = (service: DeliveryServiceProduct, packages: NormalizedOrderPackage[]) => {
  if (packages.length > service.max_packages_per_order) {
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
};

const routeVehicleTypeForService = (service: DeliveryServiceProduct) => {
  const vehicles = (service.vehicle_types || []).map((item) => String(item).toLowerCase());
  return vehicles.includes('car') || vehicles.includes('mobil') ? 'car' : 'motorcycle';
};

const ROUTE_SNAPSHOT_CONTRACT_VERSION = 1;

const routeSnapshotHash = (snapshot: Record<string, unknown>) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(snapshot, Object.keys(snapshot).sort()))
    .digest('hex');

const publicRouteSnapshot = (route: RouteEtaSnapshot) => {
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

const publicConversationContext = (access: {
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

type CustomerPriceCalculationInput = {
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
};

const calculateCustomerPriceBreakdown = async ({
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
      volumetric_surcharge_idr: 0,
      insurance_premium_idr: 0,
      dynamic_price_idr: 0,
      platform_fee_idr: 0,
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
        requireRoadRoute: true,
      }
    )),
    service_code: service.code,
  };

  const distance = Math.max(0, Number(routeSnapshot.distance_km || 0));
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

  const distanceChargeKm = Math.max(0, Math.ceil(distance - service.included_distance_km));
  const tierMultiplier = toNumber(selectedTier?.multiplier, 1);
  const tierDelta = toNumber(selectedTier?.price_delta_idr, 0);
  const baseBeforeMultiplier = service.base_fare_idr + (distanceChargeKm * service.per_km_idr) + tierDelta;
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
  const platformFee = Math.ceil(service.platform_fee_idr + (priceAfterSurge * service.platform_fee_pct));
  const totalPrice = priceAfterSurge + volumetricSurcharge + insurancePremium + platformFee;

  return {
    service_code: service.code,
    service_name: service.name,
    service_snapshot: publicServiceSnapshot(service),
    selected_size_tier: selectedTier,
    distance_km: distance,
    route_snapshot: publicRouteSnapshot({ ...routeSnapshot, eta_minutes: etaMinutes, eta: `${etaMinutes} menit` }),
    base_price_idr: basePrice,
    actual_weight_kg: Number(actualWeight.toFixed(2)),
    dimensional_weight_kg: Number(volumetricWeight.toFixed(2)),
    chargeable_weight_kg: Number(chargeableWeight.toFixed(2)),
    package_count: packageSummary.package_count,
    packages: normalizedPackages,
    volumetric_surcharge_idr: volumetricSurcharge,
    insurance_premium_idr: insurancePremium,
    dynamic_price_idr: dynamicPrice,
    platform_fee_idr: platformFee,
    delivery_model: service.route_model,
    eta_minutes: etaMinutes,
    total_price_idr: totalPrice,
  };
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
      size_tier
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
      size_tier
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
      preferred_courier_id
    } = req.body;

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
      preferred_courier_id || null
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
          // "Pilih Petugas" flow: dispatch langsung ke courier yang dipilih customer
          const offer = await dispatchToPreferredCourier(dispatchClient, newOrder.id, preferred_courier_id);
          if (offer) createdOffers.push(offer);
          if (!offer) {
            securityLog.warn(`[WARN] Preferred courier ${preferred_courier_id} tidak bisa di-dispatch untuk order ${newOrder.id}; fallback ke queue normal`);
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

const completeCustomerLapayPayment = async (customerId: string, orderId: string) => {
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
        createdOffers
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

    return { payment, createdOffers };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

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
      const { payment, createdOffers } = await completeCustomerLapayPayment(customerId, orderId);
      await notifyOnDemandOffers(createdOffers);
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
              p.status AS payment_status
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

    if (order.status === 'pending_payment' && (paymentAlreadyPaid || manualConfirmEnabled)) {
      await client.query(
        `UPDATE orders SET status = 'pending', updated_at = NOW() WHERE id = $1`,
        [id]
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
      createdOffers = await advanceOnDemandDispatchQueue(client, 1);
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

    if (createdOffers.length > 0 || paymentAlreadyPaid || manualConfirmEnabled) {
      try {
        await createNotification({
          user_id: customer_id,
          title: `Pembayaran diterima - ${order.order_number}`,
          body: 'Order Anda sedang masuk antrean dispatch.',
          type: 'payment',
          order_id: id,
          deep_link: `/orders/${id}`
        });
      } catch (notificationError) {
        console.warn('Failed to create payment notification:', notificationError);
      }
    }

    const payment = publicCustomerPaymentSession({
      ...order,
      payment_status: paymentAlreadyPaid || manualConfirmEnabled ? 'paid' : order.payment_status,
      order_status: paymentAlreadyPaid || manualConfirmEnabled ? 'pending' : order.order_status
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

const toMobileCustomerOrderDto = (row: any) => {
  const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const updatedAtMs = row.updated_at ? new Date(row.updated_at).getTime() : createdAtMs;

  return {
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
    service_sub_type: row.service_sub_type || row.serviceSubType || '',
    merchant_name: row.merchant_name || row.merchantName || '',
    order_notes: row.order_notes || row.orderNotes || '',
    food_items: row.food_items || [],
  };
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
             o.total_price_idr,
             o.scheduled_at,
             o.created_at,
             o.updated_at,
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
             o.total_price_idr,
             o.scheduled_at,
             o.created_at,
             o.updated_at,
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

    const order = {
      ...rows[0],
      food_items: foodItems,
    };

    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        data: null,
        message: 'Pesanan tidak ditemukan.',
        code: 'ORDER_NOT_FOUND'
      });
      return;
    }

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

    res.json({ success: true, order, events, proofs, food_items: foodItems });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getMobileCustomerOrderTrackingDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    const { id } = req.params;
    if (!customer_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    const orderQuery = `
      SELECT o.id, o.order_number, o.pickup_address, o.dropoff_address, o.recipient_name,
             o.recipient_phone_masked, o.model, o.status, o.distance_km, o.total_price_idr,
             o.route_snapshot, o.route_provider, o.route_profile, o.route_polyline,
             o.package_details, o.customer_notes, o.created_at, o.updated_at,
             COALESCE(o.order_notes, '') AS order_notes,
             COALESCE(o.service_sub_type, '') AS service_sub_type,
             COALESCE(m.nama_toko, '') AS merchant_name,
             u.full_name as courier_name, cp.vehicle_type as courier_vehicle, cp.vehicle_plate as courier_plate,
             cp.avg_partner_rating as courier_rating, NULL::text as courier_phone,
             u.photo_url AS courier_photo_url
      FROM orders o
      LEFT JOIN merchants m ON m.id = o.merchant_id
      LEFT JOIN order_legs ol ON o.id = ol.order_id AND ol.leg_number = 1
      LEFT JOIN users u ON ol.courier_id = u.id
      LEFT JOIN courier_profiles cp ON u.id = cp.user_id
      WHERE o.customer_id = $1 AND o.id = $2
    `;
    const { rows } = await db.query(orderQuery, [customer_id, id]);
    if (rows.length === 0) {
      res.status(404).json({ success: false, data: null, message: 'Order tidak ditemukan' });
      return;
    }

    const { rows: events } = await db.query(`
      SELECT id, event_type, description, metadata, created_at
      FROM order_events
      WHERE order_id = $1
      ORDER BY created_at ASC
    `, [id]);

    const { rows: packages } = await db.query(`
      SELECT id AS package_id,
             package_index,
             package_code,
             description,
             size_tier,
             weight_kg,
             status,
             pickup_scan_verified_at,
             pickup_photo_verified_at,
             delivery_pod_verified_at
      FROM order_packages
      WHERE order_id = $1
      ORDER BY package_index ASC
    `, [id]);

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

    const { rows: foodItems } = await db.query(`
      SELECT foi.item_name AS name,
             foi.quantity,
             foi.notes,
             foi.item_price AS price,
             foi.subtotal,
             mm.foto AS photo_url,
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
      LEFT JOIN merchant_menu_items mm ON mm.id = foi.menu_item_id
      WHERE order_id = $1
      ORDER BY foi.id ASC
    `, [id]);

    const tracking = await buildOnDemandTrackingSnapshot(db, {
      orderId: String(id),
      userId: String(customer_id),
      role: req.user?.role,
    });

    const order = {
      ...rows[0],
      food_items: foodItems,
    };

    res.json({
      success: true,
      data: {
        order,
        events,
        packages,
        proofs,
        tracking,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};

export const syncCourierTracking = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const requestedCourierId = req.body?.courier_id || req.body?.courierId;
  const deviceId = req.body?.device_id || req.body?.deviceId || null;
  const locations = Array.isArray(req.body?.locations) ? req.body.locations : [];

  if (!userId) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    return;
  }

  if (requestedCourierId && requestedCourierId !== userId) {
    res.status(403).json({ success: false, data: null, message: 'Courier token tidak sesuai dengan payload lokasi' });
    return;
  }

  if (locations.length === 0) {
    res.json({ success: true, data: { success: true, syncedCount: 0, message: 'Tidak ada lokasi baru' } });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: courierRows } = await client.query(
      `SELECT id, user_id FROM courier_profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (courierRows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Profil kurir tidak ditemukan' });
      return;
    }

    const courierProfile = courierRows[0];
    let syncedCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;
    let duplicateCount = 0;
    let latestPayload: Record<string, any> | null = null;

    for (const item of locations) {
      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      const orderId = item.order_id || item.orderId || null;
      const recordedAt = item.timestamp ? new Date(item.timestamp) : new Date();
      const heading = Number(item.heading ?? item.bearing ?? 0);
      const speed = Number(item.speed ?? 0);
      const accuracy = Number(item.accuracy ?? item.accuracy_m ?? 0);
      const clientLocationId = item.client_location_id || item.clientLocationId || null;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        continue;
      }

      if (clientLocationId) {
        const { rows: duplicateRows } = await client.query(
          `SELECT 1
           FROM courier_locations
           WHERE courier_id = $1
             AND client_location_id = $2
           LIMIT 1`,
          [courierProfile.id, clientLocationId]
        );
        if (duplicateRows.length > 0) {
          duplicateCount += 1;
          syncedCount += 1;
          continue;
        }
      }

      const { rows: previousRows } = await client.query(
        `SELECT ST_Y(location::geometry) AS latitude,
                ST_X(location::geometry) AS longitude,
                accuracy_m,
                heading_deg,
                speed_kmh,
                recorded_at
         FROM courier_locations
         WHERE courier_id = $1
           AND COALESCE(is_spoofed, FALSE) = FALSE
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [courierProfile.id]
      );
      const currentPoint = {
        latitude,
        longitude,
        heading: Number.isFinite(heading) ? heading : undefined,
        speed: Number.isFinite(speed) ? speed : undefined,
        accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
        timestamp: recordedAt.toISOString(),
      };
      const previousPoint = previousRows[0]
        ? {
            latitude: Number(previousRows[0].latitude),
            longitude: Number(previousRows[0].longitude),
            heading: Number(previousRows[0].heading_deg || 0),
            speed: Number(previousRows[0].speed_kmh || 0),
            accuracy: previousRows[0].accuracy_m == null ? undefined : Number(previousRows[0].accuracy_m),
            timestamp: previousRows[0].recorded_at,
          }
        : null;
      const quality = evaluateLocationQuality(currentPoint, previousPoint, {
        is_mock: Boolean(item.is_mock || item.isMock),
        is_rooted: Boolean(item.is_rooted || item.isRooted),
      });

      if (orderId) {
        const { rows: accessRows } = await client.query(
          `SELECT o.customer_id, ol.courier_id
           FROM orders o
           JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
           WHERE o.id = $1 AND ol.courier_id = $2
           LIMIT 1`,
          [orderId, userId]
        );

        if (accessRows.length === 0) {
          continue;
        }

        await writeLocationSafetyEvent(client, {
          order_id: orderId,
          courier_id: userId,
          location: currentPoint,
          quality,
          device_id: deviceId,
        });

        if (quality.accepted) {
          latestPayload = {
            order_id: orderId,
            courier_id: courierProfile.id,
            courier_user_id: userId,
            customer_id: accessRows[0].customer_id,
            device_id: deviceId,
            location: currentPoint,
          };
        }
      }

      await client.query(
        `INSERT INTO courier_locations (
           courier_id, order_id, location, accuracy_m, heading_deg, speed_kmh, is_spoofed, recorded_at, client_location_id, device_id
         )
         VALUES (
           $1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, $7, $8, $9, $10, $11
         )`,
        [
          courierProfile.id,
          orderId,
          longitude,
          latitude,
          Number.isFinite(accuracy) ? accuracy : null,
          Number.isFinite(heading) ? heading : null,
          Number.isFinite(speed) ? speed : null,
          quality.is_spoofed,
          recordedAt,
          clientLocationId,
          deviceId,
        ]
      );

      if (quality.accepted) {
        await client.query(
          `UPDATE courier_profiles
           SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
               last_location_at = GREATEST(COALESCE(last_location_at, $3), $3),
               updated_at = NOW()
           WHERE id = $4`,
          [longitude, latitude, recordedAt, courierProfile.id]
        );
        acceptedCount += 1;
      } else {
        rejectedCount += 1;
      }

      syncedCount += 1;
    }

    await client.query('COMMIT');

    if (latestPayload) {
      emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED, {
        order_id: latestPayload.order_id,
        customer_id: latestPayload.customer_id,
        courier_user_id: latestPayload.courier_user_id,
        courier_profile_id: latestPayload.courier_id,
        stage: 'tracking',
        location: latestPayload.location,
        metadata: { device_id: latestPayload.device_id },
      });
      void evaluateOnDemandRealtimeAlerts(db);
    }

    res.json({
      success: true,
      data: {
        success: true,
        syncedCount,
        acceptedCount,
        rejectedCount,
        duplicateCount,
        message: `${syncedCount} lokasi tersinkronisasi`,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, data: null, message: error.message });
  } finally {
    client.release();
  }
};

export const createCustomerPublicTrackingLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const orderId = String(req.params.id || '');

    if (!userId) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    const { rows } = await db.query(
      `SELECT o.id, o.status, ol.courier_id
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       WHERE o.id = $1
         AND o.customer_id = $2
         AND LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
         AND o.status NOT IN ('cancelled', 'failed')
       LIMIT 1`,
      [orderId, userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, data: null, message: 'Order on-demand tidak ditemukan atau belum bisa dibagikan.' });
      return;
    }

    if (!rows[0].courier_id) {
      res.status(409).json({ success: false, data: null, message: 'Link tracking bisa dibuat setelah kurir menerima pekerjaan.' });
      return;
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO trip_share_tokens (order_id, courier_id, token_hash, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        orderId,
        rows[0].courier_id,
        sha256(token),
        expiresAt,
        JSON.stringify({ source: 'customer_web', created_by: userId }),
      ]
    );

    res.json({
      success: true,
      data: {
        url: `${publicBaseUrl()}/track/${token}`,
        expires_at: expiresAt.toISOString(),
      },
      message: 'Link tracking publik dibuat.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};

export const getOrderTracking = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const orderId = String(req.query.order_id || req.query.orderId || '');

    if (!userId) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    if (!orderId) {
      res.status(400).json({ success: false, data: null, message: 'order_id wajib diisi' });
      return;
    }

    const tracking = await buildOnDemandTrackingSnapshot(db, {
      orderId,
      userId,
      role: req.user?.role,
    });

    if (!tracking) {
      res.status(404).json({ success: false, data: null, message: 'Order tidak ditemukan atau akses ditolak' });
      return;
    }

    if (!tracking.location) {
      res.status(404).json({ success: false, data: null, message: 'Lokasi kurir belum tersedia' });
      return;
    }

    res.json({
      success: true,
      data: tracking,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};

export const getCustomerDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    if (!customer_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    const { rows: summaryRows } = await db.query(`
      WITH current_month AS (
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('delivered', 'completed', 'pod_completed', 'cancelled', 'failed'))::int AS active_orders,
          COUNT(*) FILTER (WHERE status IN ('delivered', 'completed', 'pod_completed'))::int AS completed_orders_month,
          COUNT(*) FILTER (WHERE status IN ('cancelled', 'failed'))::int AS cancelled_orders_month,
          COALESCE(SUM(total_price_idr) FILTER (WHERE status IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS total_spend_month
        FROM orders
        WHERE customer_id = $1
          AND created_at >= DATE_TRUNC('month', NOW())
      ),
      previous_month AS (
        SELECT
          COUNT(*)::int AS previous_orders_month,
          COALESCE(SUM(total_price_idr) FILTER (WHERE status IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS previous_spend_month
        FROM orders
        WHERE customer_id = $1
          AND created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND created_at < DATE_TRUNC('month', NOW())
      )
      SELECT *
      FROM current_month, previous_month
    `, [customer_id]);

    const { rows: weeklyRows } = await db.query(`
      WITH weeks AS (
        SELECT generate_series(3, 0, -1) AS idx
      ),
      orders_by_week AS (
        SELECT
          FLOOR((NOW()::date - created_at::date) / 7.0)::int AS week_bucket,
          COUNT(*)::int AS count,
          COALESCE(SUM(total_price_idr) FILTER (WHERE status IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS value
        FROM orders
        WHERE customer_id = $1
          AND created_at >= NOW() - INTERVAL '28 days'
        GROUP BY 1
      )
      SELECT
        CONCAT('W', 4 - weeks.idx) AS label,
        COALESCE(obw.count, 0)::int AS count,
        COALESCE(obw.value, 0)::bigint AS value
      FROM weeks
      LEFT JOIN orders_by_week obw ON obw.week_bucket = weeks.idx
      ORDER BY weeks.idx DESC
    `, [customer_id]);

    const summary = summaryRows[0] || {};
    const totalSpend = Number(summary.total_spend_month || 0);
    const previousSpend = Number(summary.previous_spend_month || 0);
    const spendGrowth = previousSpend > 0 ? ((totalSpend - previousSpend) / previousSpend) * 100 : 0;

    res.json({
      success: true,
      data: {
        active_orders: Number(summary.active_orders || 0),
        completed_orders_month: Number(summary.completed_orders_month || 0),
        cancelled_orders_month: Number(summary.cancelled_orders_month || 0),
        total_spend_month: totalSpend,
        previous_spend_month: previousSpend,
        spend_growth_percent: Number(spendGrowth.toFixed(1)),
        weekly_activity: weeklyRows.map((row) => ({
          label: row.label,
          count: Number(row.count || 0),
          value: Number(row.value || 0),
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};

type CustomerReportPeriod = 'bulan_ini' | 'bulan_lalu' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom';

const CUSTOMER_REPORT_PERIODS = new Set<CustomerReportPeriod>(['bulan_ini', 'bulan_lalu', 'q1', 'q2', 'q3', 'q4', 'custom']);

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const addUtcDays = (value: Date, days: number): Date => {
  const nextValue = new Date(value);
  nextValue.setUTCDate(nextValue.getUTCDate() + days);
  return nextValue;
};

const isDateOnlyInput = (value: unknown): value is string => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
);

const parseUtcDateOnly = (value: string): Date => {
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Invalid date');
  }
  return parsedDate;
};

const getCustomerReportRange = (periodInput: unknown, startDateInput: unknown, endDateInput: unknown) => {
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

export const getCustomerUmkmReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    const reportRange = getCustomerReportRange(req.query.period, req.query.start_date, req.query.end_date);
    if ('error' in reportRange) {
      res.status(400).json({ success: false, data: null, message: reportRange.error });
      return;
    }

    const queryParams = [customerId, reportRange.startDate, reportRange.endDateExclusive];

    const [summaryResult, trendResult, modelResult, zoneResult, exportResult] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed'))::int AS completed_orders,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('cancelled', 'canceled', 'failed', 'rejected'))::int AS failed_orders,
          COALESCE(SUM(COALESCE(total_price_idr, 0)) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS total_spend,
          COALESCE(AVG(NULLIF(
            CASE
              WHEN COALESCE(package_details->>'weight_kg', '') ~ '^[0-9]+([.][0-9]+)?$'
                THEN (package_details->>'weight_kg')::numeric
              ELSE 0
            END,
            0
          )), 0)::numeric AS avg_weight,
          COALESCE(AVG(NULLIF(COALESCE(total_price_idr, 0), 0)), 0)::numeric AS avg_cost
        FROM orders
        WHERE customer_id = $1
          AND created_at >= $2::date
          AND created_at < $3::date
      `, queryParams),
      db.query(`
        WITH days AS (
          SELECT generate_series($2::date, ($3::date - INTERVAL '1 day')::date, INTERVAL '1 day')::date AS day
        ),
        daily_orders AS (
          SELECT
            created_at::date AS day,
            COUNT(*)::int AS order_count,
            COALESCE(SUM(COALESCE(total_price_idr, 0)) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS total_spend
          FROM orders
          WHERE customer_id = $1
            AND created_at >= $2::date
            AND created_at < $3::date
          GROUP BY 1
        )
        SELECT
          days.day::text AS date,
          TO_CHAR(days.day, 'DD Mon') AS label,
          COALESCE(daily_orders.order_count, 0)::int AS order_count,
          COALESCE(daily_orders.total_spend, 0)::bigint AS total_spend
        FROM days
        LEFT JOIN daily_orders ON daily_orders.day = days.day
        ORDER BY days.day ASC
      `, queryParams),
      db.query(`
        SELECT
          COALESCE(NULLIF(INITCAP(REPLACE(COALESCE(model::text, ''), '_', ' ')), ''), 'Tidak tersedia') AS name,
          COUNT(*)::int AS count,
          COALESCE(SUM(COALESCE(total_price_idr, 0)) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS total_spend
        FROM orders
        WHERE customer_id = $1
          AND created_at >= $2::date
          AND created_at < $3::date
        GROUP BY 1
        ORDER BY count DESC, name ASC
      `, queryParams),
      db.query(`
        SELECT
          COALESCE(
            NULLIF(TRIM(SPLIT_PART(COALESCE(dropoff_address, ''), ',', 2)), ''),
            NULLIF(TRIM(SPLIT_PART(COALESCE(dropoff_address, ''), ',', 1)), ''),
            'Tujuan tidak tersedia'
          ) AS zone,
          COUNT(*)::int AS order_count,
          COALESCE(SUM(COALESCE(total_price_idr, 0)) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS total_spend
        FROM orders
        WHERE customer_id = $1
          AND created_at >= $2::date
          AND created_at < $3::date
        GROUP BY 1
        ORDER BY order_count DESC, zone ASC
        LIMIT 5
      `, queryParams),
      db.query(`
        SELECT
          COALESCE(order_number, id::text) AS order_number,
          created_at::date::text AS order_date,
          COALESCE(recipient_name, '') AS recipient_name,
          COALESCE(dropoff_address, '') AS dropoff_address,
          CASE
            WHEN COALESCE(package_details->>'weight_kg', '') ~ '^[0-9]+([.][0-9]+)?$'
              THEN (package_details->>'weight_kg')::numeric
            ELSE 0
          END AS package_weight_kg,
          COALESCE(model::text, '') AS model,
          COALESCE(total_price_idr, 0)::bigint AS total_price_idr,
          COALESCE(status::text, '') AS status
        FROM orders
        WHERE customer_id = $1
          AND created_at >= $2::date
          AND created_at < $3::date
        ORDER BY created_at DESC
        LIMIT 1000
      `, queryParams),
    ]);

    const summary = summaryResult.rows[0] || {};
    const completedOrders = Number(summary.completed_orders || 0);
    const failedOrders = Number(summary.failed_orders || 0);
    const completedOrFailedOrders = completedOrders + failedOrders;

    res.json({
      success: true,
      data: {
        period: reportRange.period,
        range: {
          start_date: reportRange.startDate,
          end_date: reportRange.endDateInclusive,
        },
        summary: {
          total_orders: Number(summary.total_orders || 0),
          completed_orders: completedOrders,
          failed_orders: failedOrders,
          total_spend: Number(summary.total_spend || 0),
          completion_rate: completedOrFailedOrders > 0 ? Number(((completedOrders / completedOrFailedOrders) * 100).toFixed(1)) : null,
          on_time_rate: null,
          avg_weight: Number(Number(summary.avg_weight || 0).toFixed(2)),
          avg_cost: Math.round(Number(summary.avg_cost || 0)),
        },
        trend: trendResult.rows.map((row) => ({
          date: row.date,
          label: row.label,
          order_count: Number(row.order_count || 0),
          total_spend: Number(row.total_spend || 0),
        })),
        model_distribution: modelResult.rows.map((row) => ({
          name: row.name,
          count: Number(row.count || 0),
          total_spend: Number(row.total_spend || 0),
        })),
        destination_zones: zoneResult.rows.map((row) => ({
          zone: row.zone,
          order_count: Number(row.order_count || 0),
          total_spend: Number(row.total_spend || 0),
        })),
        export_rows: exportResult.rows.map((row) => ({
          no_order: row.order_number,
          tanggal: row.order_date,
          penerima: row.recipient_name,
          tujuan: row.dropoff_address,
          berat_kg: Number(row.package_weight_kg || 0),
          model: row.model,
          harga: Number(row.total_price_idr || 0),
          status: row.status,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};

export const getOrderChats = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, chats: [], error: 'Unauthorized' });
      return;
    }

    const result = await listConversationChats(String(req.params.id || ''), req.user);
    res.json({
      success: true,
      chats: result.chats,
      read_receipts: result.read_receipts,
      conversation: publicConversationContext(result.access),
    });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, chats: [], error: error.message });
  }
};

export const sendOrderChat = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, chat: null, error: 'Unauthorized' });
      return;
    }

    const result = await sendConversationChat(String(req.params.id || ''), req.user, req.body || {});
    const chatMessage = result.chat;
    const order = result.order;
    const notificationTargetIds = result.notificationTargetIds;

    // Emit chat message to both sender and recipient rooms for real-time UI update
    if (result.created) {
      try {
        emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE, {
          order_id: order.id,
          customer_id: order.customer_id,
          courier_user_id: order.courier_id,
          stage: 'chat',
          chat: chatMessage,
          metadata: { order_number: order.order_number },
        });
      } catch (wsError) {
        console.warn('[WebSocket] Could not emit chat message');
      }
    }

    // Create notification for recipient if they are not the sender
    if (result.created && notificationTargetIds.length > 0) {
      await Promise.all(
        notificationTargetIds.map((targetId) =>
          createNotification({
            user_id: targetId,
            title: `Pesan Baru - ${order.order_number}`,
            body: 'Ada pesan baru di percakapan order.',
            type: 'order_group_chat_message',
            category: 'message',
            priority: 'high',
            order_id: order.id,
            conversation_id: result.access.conversationId,
            metadata: {
              chat_id: chatMessage.id,
              sender_name: req.user?.full_name || 'User',
              conversation_id: result.access.conversationId,
              order_number: order.order_number
            },
            deep_link: `tembus://orders/${order.id}/chat`
          })
        )
      );
    }

    res.status(result.created ? 201 : 200).json({ success: true, chat: chatMessage, idempotent: !result.created });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, chat: null, error: error.message });
  }
};

export const markOrderChatRead = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await markConversationRead(String(req.params.id || ''), req.user, req.body?.last_message_id);
    res.json({
      success: true,
      receipt: result.receipt,
      conversation: publicConversationContext(result.access),
    });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, error: error.message });
  }
};

export const createOrderCall = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await createOrderCallSession(String(req.params.id || ''), req.user, req.body?.target_type);
    try {
      const { getIO } = await import('../websocket');
      const io = getIO();
      const callEvent = {
        order_id: result.access.orderId,
        call_id: result.call.id,
        caller_id: req.user.id,
        caller_name: req.user.full_name || 'TEMBUS',
        target_type: result.call.target_type,
        status: result.call.status,
        expires_at: result.call.expires_at,
      };
      if (result.call.target_id) {
        io.to(String(result.call.target_id)).emit('call:incoming', {
          ...callEvent,
          call_token: result.call.call_token,
        });
      }
    } catch {
      console.warn('[WebSocket] Could not emit call incoming event');
    }

    res.status(201).json({
      success: true,
      call: result.call,
      conversation: publicConversationContext(result.access),
    });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, error: error.message });
  }
};

export const joinOrderCall = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await joinOrderCallSession(
      String(req.params.id || ''),
      String(req.params.callId || ''),
      req.user,
      req.body?.call_token
    );
    try {
      const { getIO } = await import('../websocket');
      getIO().to(`call:${result.call.id}`).emit('call:accepted', {
        order_id: result.access.orderId,
        call_id: result.call.id,
        accepted_by: req.user.id,
        status: result.call.status,
      });
    } catch {
      console.warn('[WebSocket] Could not emit call accepted event');
    }

    res.json({
      success: true,
      call: result.call,
      conversation: publicConversationContext(result.access),
    });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, error: error.message });
  }
};

export const endOrderCall = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await endOrderCallSession(
      String(req.params.id || ''),
      String(req.params.callId || ''),
      req.user,
      req.body?.status
    );
    try {
      const { getIO } = await import('../websocket');
      getIO().to(`call:${result.call.id}`).emit('call:ended', {
        order_id: result.access.orderId,
        call_id: result.call.id,
        ended_by: req.user.id,
        status: result.call.status,
      });
    } catch {
      console.warn('[WebSocket] Could not emit call ended event');
    }

    res.json({ success: true, call: result.call });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, error: error.message });
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

export const uploadOrderFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const savedUpload = saveSecureUploadBuffer(req.file, 'orders');
    res.json({ success: true, url: savedUpload.fileUrl });
  } catch (error: any) {
    securityLog.error('Error uploading order file:', error);
    res.status(500).json({ error: error.message });
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
      `SELECT p.order_id, o.customer_id, o.order_number
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
    const customerId = rows[0].customer_id;

    if (isSuccessfulTransaction(transaction_status, fraud_status)) {
      await client.query(
        `UPDATE payments
         SET status = 'paid', paid_at = COALESCE(paid_at, NOW()), webhook_payload = $2, updated_at = NOW()
         WHERE provider_reference = $1`,
        [order_id, payload]
      );
      await client.query(
        `UPDATE orders SET status = 'pending', updated_at = NOW() WHERE id = ANY($1::uuid[]) AND status = 'pending_payment'`,
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
      createdOffers = await advanceOnDemandDispatchQueue(client, Math.max(orderIds.length, 1));
    } else if (isExpiredOrFailedTransaction(transaction_status)) {
      await client.query(
        `UPDATE payments
         SET status = $2, webhook_payload = $3, updated_at = NOW()
         WHERE provider_reference = $1`,
        [order_id, transaction_status === 'expire' ? 'expired' : 'failed', payload]
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

    // 🚀 ENTERPRISE ORCHESTRATION: Trigger Courier Matching
    if (isSuccessfulTransaction(transaction_status, fraud_status)) {
      const orderServiceClientUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:8083';
      console.log(`[Orchestration] Triggering courier matching for ${orderIds.length} orders...`);
      
      for (const orderId of orderIds) {
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

// ─── Customer Cancel Order ────────────────────────────────────────────────────
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
