import { Request, Response } from 'express';
import { db } from '../db';
import { createNotification } from '../notifications';
import { createSnapTransaction, getMidtransClientKey, getMidtransSnapJsUrl } from '../midtrans';
import { isExpiredOrFailedTransaction, isSuccessfulTransaction } from '../midtrans';
import { calculateServiceSettlement, customerFacingService, DeliveryServiceProduct, findDeliveryServiceByCode } from './deliveryServices.controller';
import { advanceOnDemandDispatchQueue, notifyOnDemandOffers } from './courierAuth.controller';
import { redis } from '../redis';
import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../services/onDemandRealtime';
import { buildOnDemandTrackingSnapshot, evaluateLocationQuality, writeLocationSafetyEvent } from '../services/onDemandTracking';
import { evaluateOnDemandRealtimeAlerts } from '../services/realtimeObservability';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

type CoordinatePayload = {
  lat: number;
  lng: number;
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
  profile_image_url: row.photo_url || null
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
    amount_idr: Number(row.amount_idr || row.total_price_idr || 0),
    wallet_balance_idr: Number(row.wallet_balance || 0),
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
  chargeableWeightKg: number
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
    vehicle_types: service.vehicle_types || []
  };
};

export const calculatePrice = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      pickup,
      dropoff,
      dimensions,
      weight_kg,
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

    const pickupPoint = normalizeCoordinatePayload(pickup);
    const dropoffPoint = normalizeCoordinatePayload(dropoff);
    if (!pickupPoint || !dropoffPoint) {
      res.status(400).json({
        code: 'ERR_ROUTE_LOCATION_REQUIRED',
        message: 'Lokasi pickup dan tujuan wajib valid sebelum harga dihitung.'
      });
      return;
    }

    const distance = calculateDistance(
      pickupPoint.lat,
      pickupPoint.lng,
      dropoffPoint.lat,
      dropoffPoint.lng
    );

    if (service.max_distance_km && distance > service.max_distance_km) {
      res.status(400).json({
        code: 'ERR_SERVICE_DISTANCE_LIMIT',
        message: `${service.name} maksimal ${service.max_distance_km} km. Jarak order ini ${distance} km.`
      });
      return;
    }

    const selectedTier = resolveSizeTier(service, size_tier);
    const divisor = toNumber(service.dimension_rules?.volumetric_divisor, 6000);
    const surchargeThreshold = toNumber(service.dimension_rules?.surcharge_threshold_kg, service.max_weight_kg || 20);
    const surchargePerKg = toNumber(service.dimension_rules?.surcharge_per_kg_idr, 2000);

    let volumetricWeight = 0;
    const actualWeight = toNumber(weight_kg, 0);
    if (selectedTier?.max_weight_kg && actualWeight > toNumber(selectedTier.max_weight_kg)) {
      res.status(400).json({
        code: 'ERR_SIZE_TIER_WEIGHT_LIMIT',
        message: `Berat aktual melewati tier ${selectedTier.name}. Pilih tier yang lebih besar.`
      });
      return;
    }

    let chargeableWeight = actualWeight;
    if (dimensions?.length && dimensions?.width && dimensions?.height) {
      volumetricWeight = (toNumber(dimensions.length) * toNumber(dimensions.width) * toNumber(dimensions.height)) / divisor;
      chargeableWeight = Math.max(volumetricWeight, actualWeight);
    }

    if (service.max_weight_kg && chargeableWeight > service.max_weight_kg) {
      res.status(400).json({
        code: 'ERR_SERVICE_WEIGHT_LIMIT',
        message: `${service.name} maksimal ${service.max_weight_kg} kg. Berat hitung order ini ${chargeableWeight.toFixed(2)} kg.`
      });
      return;
    }

    const distanceChargeKm = Math.max(0, Math.ceil(distance - service.included_distance_km));
    const tierMultiplier = toNumber(selectedTier?.multiplier, 1);
    const tierDelta = toNumber(selectedTier?.price_delta_idr, 0);
    const baseBeforeMultiplier = service.base_fare_idr + (distanceChargeKm * service.per_km_idr) + tierDelta;
    const base_price = roundRupiah(baseBeforeMultiplier * service.service_multiplier * tierMultiplier);
    const volumetric_surcharge = chargeableWeight > surchargeThreshold
      ? Math.ceil(chargeableWeight - surchargeThreshold) * surchargePerKg
      : 0;

    let insurance_premium = 0;
    if (has_insurance && item_value) {
      insurance_premium = Math.ceil((item_value * 0.2) / 100);
      if (insurance_premium < 1000) insurance_premium = 1000;
    }

    const hour = new Date().getHours();
    const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20);
    let dynamic_price = isPeakHour ? Math.ceil(base_price * 0.15) : 0;

    // Apply Weather Surge from Worker
    try {
      const weatherDataStr = await redis.get('current_weather_surge');
      if (weatherDataStr) {
        const weatherData = JSON.parse(weatherDataStr);
        if (weatherData.surgeMultiplier > 0) {
          const weatherSurge = Math.ceil(base_price * weatherData.surgeMultiplier);
          dynamic_price += weatherSurge;
        }
      }
    } catch (e) {
      console.error('Failed to apply weather surge:', e);
    }

    const delivery_model = service.route_model;
    const calculatedEta = Math.ceil(20 + (distance * 3.5) + (service.batching_allowed ? 120 : 0));
    const eta_minutes = Math.min(service.max_eta_minutes, Math.max(20, calculatedEta));

    const total_price = base_price + volumetric_surcharge + insurance_premium + dynamic_price;

    res.json({
      service_code: service.code,
      service_name: service.name,
      service_snapshot: publicServiceSnapshot(service),
      selected_size_tier: selectedTier,
      distance_km: distance,
      base_price_idr: base_price,
      actual_weight_kg: Number(actualWeight.toFixed(2)),
      dimensional_weight_kg: Number(volumetricWeight.toFixed(2)),
      chargeable_weight_kg: Number(chargeableWeight.toFixed(2)),
      volumetric_surcharge_idr: volumetric_surcharge,
      insurance_premium_idr: insurance_premium,
      dynamic_price_idr: dynamic_price,
      delivery_model,
      eta_minutes,
      total_price_idr: total_price
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createCustomerOrder = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();
  try {
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
      has_insurance,
      item_value,
      schedule_type,
      scheduled_at,
      customer_notes,
      price_breakdown,
      service_code
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

    if (service.requires_dimension_scan && !package_details?.dimensions_scanned) {
      client.release();
      res.status(400).json({
        code: 'ERR_DIMENSION_SCAN_REQUIRED',
        error: `${service.name} wajib scan dimensi sebelum order dibuat`
      });
      return;
    }

    const selectedTier = resolveSizeTier(service, package_details?.size_tier);
    const packageDimensions = package_details?.dimensions || {};
    const packageActualWeight = toNumber(package_details?.weight_kg, 0);
    const packageDivisor = toNumber(service.dimension_rules?.volumetric_divisor, 6000);
    const packageVolumetricWeight = packageDimensions?.length && packageDimensions?.width && packageDimensions?.height
      ? (toNumber(packageDimensions.length) * toNumber(packageDimensions.width) * toNumber(packageDimensions.height)) / packageDivisor
      : 0;
    const packageChargeableWeight = Math.max(packageActualWeight, packageVolumetricWeight);

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

    await client.query('BEGIN');

    // Generate simple order number
    const order_number = `LNC-${Date.now().toString().slice(-6)}`;

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
        created_at
      ) VALUES (
        $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326),
        $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10,
        $11, $12, $13, 'pending_payment', $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, NOW()
      ) RETURNING id, order_number, total_price_idr
    `;

    const totalPrice = price_breakdown?.total_price_idr || 0;
    const settlement = calculateServiceSettlement(
      service,
      totalPrice,
      price_breakdown?.insurance_premium_idr || 0
    );

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
      JSON.stringify(price_breakdown?.service_snapshot || publicServiceSnapshot(service)),
      price_breakdown?.distance_km || 0,
      price_breakdown?.base_price_idr || 0,
      price_breakdown?.volumetric_surcharge_idr || 0,
      price_breakdown?.insurance_premium_idr || 0,
      price_breakdown?.dynamic_price_idr || 0,
      totalPrice,
      settlement.ppn_idr,
      settlement.mdr_idr,
      settlement.platform_commission_idr,
      settlement.courier_payout_estimate_idr,
      JSON.stringify(settlement.settlement_snapshot),
      has_insurance || false,
      item_value || 0,
      JSON.stringify(normalizePackageDetailsForOrder(package_details || {}, service, selectedTier, packageChargeableWeight)),
      customer_notes || '',
      schedule_type || 'now',
      scheduled_at ? new Date(scheduled_at) : null
    ];

    const result = await client.query(insertQuery, values);
    const newOrder = result.rows[0];

    // Insert a pending payment shell. The actual provider is selected explicitly on the payment screen.
    await client.query(`
      INSERT INTO payments (
        order_id, payment_number, provider, method, status, amount_idr,
        mdr_amount_idr, ppn_amount_idr, weather_reserve_idr, insurance_reserve_idr,
        net_operational_idr, provider_reference, expires_at
      ) VALUES ($1, $2, 'midtrans', 'unselected', 'pending', $3, $4, $5, 0, $6, $7, NULL, NOW() + INTERVAL '30 minutes')
    `, [
      newOrder.id,
      `PAY-${order_number}`,
      totalPrice,
      settlement.mdr_idr,
      settlement.ppn_idr,
      settlement.insurance_reserve_idr,
      settlement.net_operational_idr
    ]);

    // Create Order Event
    await client.query(`
      INSERT INTO order_events (order_id, user_id, event_type, description)
      VALUES ($1, $2, 'created', 'Customer created order via Web Portal')
    `, [newOrder.id, customer_id]);

    await client.query('COMMIT');
    client.release();

    res.status(201).json({
      success: true,
      order: newOrder,
      payment: null
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    client.release();
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

    await client.query(
      `UPDATE orders SET status = 'pending', updated_at = NOW() WHERE id = $1 AND status = 'pending_payment'`,
      [orderId]
    );

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description)
       VALUES ($1, $2, 'payment_confirmed', 'Customer paid order using LAPAY balance')`,
      [orderId, customerId]
    );

    createdOffers = await advanceOnDemandDispatchQueue(client, 1);

    await client.query('COMMIT');

    const payment = publicCustomerPaymentSession({
      ...order,
      ...paymentResult.rows[0],
      order_status: 'pending',
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
    const serviceName = existing.service_snapshot?.service_name || existing.service_snapshot?.name || 'LANCAR Delivery';
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
    pickup_address: row.pickup_address || '',
    pickup_time: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : '',
    drop_address: row.dropoff_address || '',
    distance: row.distance_km !== null && row.distance_km !== undefined ? String(row.distance_km) : '',
    fee: row.total_price_idr !== null && row.total_price_idr !== undefined ? String(row.total_price_idr) : '',
    customer_name: row.recipient_name || row.customer_name || '',
    status: row.status || 'pending',
    created_at: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    updated_at: Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now(),
    customer_phone: row.recipient_phone_masked || row.customer_phone || null,
    courier_name: row.courier_name || null,
    courier_vehicle: row.courier_vehicle || null,
    courier_plate: row.courier_plate || null,
    courier_phone: row.courier_phone || null
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
      SELECT id, order_number, pickup_address, dropoff_address, recipient_name, model, status, distance_km, total_price_idr, created_at
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
             photo_url
      FROM customers
      WHERE id = $1 AND deleted_at IS NULL
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
      UPDATE customers
      SET full_name = $2,
          phone_number = COALESCE($3, phone_number),
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id,
                full_name,
                phone_number,
                photo_url
    `, [customerId, normalizedName, normalizedPhone]);

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

    res.status(500).json({
      success: false,
      data: null,
      message: 'Gagal memperbarui profil customer.',
      code: 'CUSTOMER_PROFILE_UPDATE_FAILED'
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
             o.total_price_idr,
             o.scheduled_at,
             o.created_at,
             o.updated_at,
             u.full_name AS courier_name,
             cp.vehicle_type AS courier_vehicle,
             cp.vehicle_plate AS courier_plate,
             u.phone_number AS courier_phone
      FROM orders o
      LEFT JOIN order_legs ol ON o.id = ol.order_id AND ol.leg_number = 1
      LEFT JOIN users u ON ol.courier_id = u.id
      LEFT JOIN courier_profiles cp ON u.id = cp.user_id
      WHERE o.customer_id = $1
      ${statusFilter}
      ORDER BY o.created_at DESC
      LIMIT $${limitParam}
      OFFSET $${offsetParam}
    `, params);

    res.json({
      success: true,
      data: rows.map(toMobileCustomerOrderDto),
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
             o.total_price_idr,
             o.scheduled_at,
             o.created_at,
             o.updated_at,
             u.full_name AS courier_name,
             cp.vehicle_type AS courier_vehicle,
             cp.vehicle_plate AS courier_plate,
             u.phone_number AS courier_phone
      FROM orders o
      LEFT JOIN order_legs ol ON o.id = ol.order_id AND ol.leg_number = 1
      LEFT JOIN users u ON ol.courier_id = u.id
      LEFT JOIN courier_profiles cp ON u.id = cp.user_id
      WHERE o.customer_id = $1 AND o.id = $2
      LIMIT 1
    `, [customer_id, id]);

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
      data: toMobileCustomerOrderDto(rows[0]),
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
             o.base_price_idr, o.volumetric_surcharge_idr, o.insurance_premium_idr, o.total_price_idr, o.has_insurance, o.insured_value_idr, 
             o.package_details, o.customer_notes, o.schedule_type, o.scheduled_at, o.created_at,
             u.full_name as courier_name, cp.vehicle_type as courier_vehicle, cp.vehicle_plate as courier_plate, cp.avg_partner_rating as courier_rating,
             u.phone_number as courier_phone
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
             scan_type,
             CASE
               WHEN scan_type IN ('pickup', 'pickup_scan') THEN 'Scan pickup'
               WHEN scan_type = 'pickup_photo' THEN 'Foto barang pickup'
               WHEN scan_type = 'pod' THEN 'Foto POD'
               WHEN scan_type = 'pickup_cancellation' THEN 'Bukti pembatalan pickup'
               ELSE 'Bukti operasional'
             END AS proof_label,
             CASE
               WHEN scan_type = 'pickup_cancellation' THEN 'cancellation'
               WHEN scan_type = 'pod' THEN 'pod'
               WHEN scan_type IN ('pickup', 'pickup_scan', 'pickup_photo') THEN 'pickup'
               ELSE 'operational'
             END AS proof_category,
             photo_url,
             image_urls,
             override_reason,
             CASE
               WHEN scan_type = 'pickup_cancellation' THEN SPLIT_PART(COALESCE(override_reason, ''), ':', 1)
               ELSE NULL
             END AS reason_code,
             CASE
               WHEN scan_type = 'pickup_cancellation' AND COALESCE(override_reason, '') LIKE '%:%'
                 THEN NULLIF(TRIM(REGEXP_REPLACE(override_reason, '^[^:]+:\\s*', '')), '')
               ELSE NULL
             END AS reason_note,
             latitude,
             longitude,
             COALESCE(scanned_at, created_at) AS recorded_at
      FROM package_scans
      WHERE order_id = $1
      ORDER BY COALESCE(scanned_at, created_at) ASC
    `, [id]);

    res.json({ success: true, order, events, proofs });
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
             o.package_details, o.customer_notes, o.created_at, o.updated_at,
             u.full_name as courier_name, cp.vehicle_type as courier_vehicle, cp.vehicle_plate as courier_plate,
             cp.avg_partner_rating as courier_rating, u.phone as courier_phone
      FROM orders o
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

    const { rows: proofs } = await db.query(`
      SELECT id,
             scan_type,
             CASE
               WHEN scan_type IN ('pickup', 'pickup_scan') THEN 'Scan pickup'
               WHEN scan_type = 'pickup_photo' THEN 'Foto barang pickup'
               WHEN scan_type = 'pod' THEN 'Foto POD'
               WHEN scan_type = 'pickup_cancellation' THEN 'Bukti pembatalan pickup'
               ELSE 'Bukti operasional'
             END AS proof_label,
             CASE
               WHEN scan_type = 'pickup_cancellation' THEN 'cancellation'
               WHEN scan_type = 'pod' THEN 'pod'
               WHEN scan_type IN ('pickup', 'pickup_scan', 'pickup_photo') THEN 'pickup'
               ELSE 'operational'
             END AS proof_category,
             photo_url,
             image_urls,
             override_reason,
             CASE
               WHEN scan_type = 'pickup_cancellation' THEN SPLIT_PART(COALESCE(override_reason, ''), ':', 1)
               ELSE NULL
             END AS reason_code,
             CASE
               WHEN scan_type = 'pickup_cancellation' AND COALESCE(override_reason, '') LIKE '%:%'
                 THEN NULLIF(TRIM(REGEXP_REPLACE(override_reason, '^[^:]+:\\s*', '')), '')
               ELSE NULL
             END AS reason_note,
             latitude,
             longitude,
             COALESCE(scanned_at, created_at) AS recorded_at
      FROM package_scans
      WHERE order_id = $1
      ORDER BY COALESCE(scanned_at, created_at) ASC
    `, [id]);

    const tracking = await buildOnDemandTrackingSnapshot(db, {
      orderId: String(id),
      userId: String(customer_id),
      role: req.user?.role,
    });

    res.json({
      success: true,
      data: {
        order: rows[0],
        events,
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
        SELECT *
        FROM orders
        WHERE customer_id = $1
          AND created_at >= DATE_TRUNC('month', NOW())
      ),
      previous_month AS (
        SELECT *
        FROM orders
        WHERE customer_id = $1
          AND created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND created_at < DATE_TRUNC('month', NOW())
      )
      SELECT
        COUNT(*) FILTER (WHERE cm.status NOT IN ('delivered', 'completed', 'cancelled', 'failed'))::int AS active_orders,
        COUNT(*) FILTER (WHERE cm.status IN ('delivered', 'completed'))::int AS completed_orders_month,
        COUNT(*) FILTER (WHERE cm.status IN ('cancelled', 'failed'))::int AS cancelled_orders_month,
        COALESCE(SUM(cm.total_price_idr), 0)::bigint AS total_spend_month,
        COALESCE(SUM(pm.total_price_idr), 0)::bigint AS previous_spend_month,
        COUNT(pm.*)::int AS previous_orders_month
      FROM current_month cm
      FULL OUTER JOIN previous_month pm ON false
    `, [customer_id]);

    const { rows: weeklyRows } = await db.query(`
      WITH weeks AS (
        SELECT generate_series(3, 0, -1) AS idx
      ),
      orders_by_week AS (
        SELECT
          FLOOR(EXTRACT(DAY FROM (NOW()::date - created_at::date)) / 7)::int AS week_bucket,
          COUNT(*)::int AS count,
          COALESCE(SUM(total_price_idr), 0)::bigint AS value
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

export const getOrderChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    
    // Check if order belongs to customer or is assigned to the courier
    const orderCheckQuery = `
      SELECT o.id FROM orders o
      LEFT JOIN order_legs ol ON o.id = ol.order_id AND ol.leg_number = 1
      WHERE o.id = $1 AND (o.customer_id = $2 OR ol.courier_id = $2)
    `;
    const orderCheck = await db.query(orderCheckQuery, [id, userId]);
    if (orderCheck.rows.length === 0) {
      res.status(404).json({ error: 'Order not found or access denied' });
      return;
    }

    const { rows } = await db.query(`
      SELECT c.id, c.sender_id, u.full_name as sender_name, u.role as sender_role, c.message, c.message_type, c.created_at
      FROM order_chats c
      JOIN users u ON c.sender_id = u.id
      WHERE c.order_id = $1
      ORDER BY c.created_at ASC
    `, [id]);

    res.json({ success: true, chats: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const sendOrderChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const sender_id = req.user?.id;
    const id = req.params.id as string;
    const { message, message_type = 'text' } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Check if order belongs to customer and find assigned courier
    const orderQuery = `
      SELECT o.id, o.order_number, o.customer_id, ol.courier_id
      FROM orders o
      LEFT JOIN order_legs ol ON o.id = ol.order_id AND ol.leg_number = 1
      WHERE o.id = $1 AND (o.customer_id = $2 OR ol.courier_id = $2)
    `;
    const orderRes = await db.query(orderQuery, [id, sender_id]);
    
    if (orderRes.rows.length === 0) {
      res.status(404).json({ error: 'Order not found or access denied' });
      return;
    }

    const order = orderRes.rows[0];
    const isCustomerSender = order.customer_id === sender_id;
    const recipient_id = isCustomerSender ? order.courier_id : order.customer_id;

    const { rows } = await db.query(`
      INSERT INTO order_chats (order_id, sender_id, message, message_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, sender_id, message, message_type]);

    const senderRole = req.user?.role || (isCustomerSender ? 'customer' : 'courier');
    const chatMessage = {
      ...rows[0],
      sender_name: req.user?.full_name || 'User',
      sender_role: senderRole,
      order_number: order.order_number,
    };

    // Emit chat message to both sender and recipient rooms for real-time UI update
    if (sender_id && recipient_id) {
      try {
        emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE, {
          order_id: id,
          customer_id: order.customer_id,
          courier_user_id: order.courier_id,
          stage: 'chat',
          chat: chatMessage,
          metadata: { order_number: order.order_number },
        });
      } catch (wsError) {
        console.warn('[WebSocket] Could not emit chat message:', wsError);
      }
    }

    // Create notification for recipient if they are not the sender
    if (recipient_id) {
      const notificationBody = message_type === 'image' ? '📸 [Gambar]' : (message.length > 50 ? message.substring(0, 47) + '...' : message);
      await createNotification({
        user_id: recipient_id,
        title: `Pesan Baru - ${order.order_number}`,
        body: notificationBody,
        type: 'chat',
        order_id: id,
        metadata: {
          chat_id: chatMessage.id,
          sender_name: req.user?.full_name || 'User'
        },
        deep_link: `/orders/${id}`
      });
    }

    res.status(201).json({ success: true, chat: chatMessage });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
           submitted_notes = NULLIF($7, ''),
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

    const file = req.file;
    const ext = path.extname(file.originalname);
    const filename = `${crypto.randomUUID()}${ext}`;

    const uploadPath = path.join(process.cwd(), 'public/uploads', filename);

    // Save file from memory to disk
    fs.writeFileSync(uploadPath, file.buffer);

    const fileUrl = `/uploads/${filename}`;
    res.json({ success: true, url: fileUrl });
  } catch (error: any) {
    console.error('Error uploading order file:', error);
    res.status(500).json({ error: error.message });
  }
};

export const handleMidtransNotification = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();
  let createdOffers: Awaited<ReturnType<typeof advanceOnDemandDispatchQueue>> = [];
  try {
    const payload = req.body || {};
    const {
      order_id,
      transaction_status,
      fraud_status,
      status_code,
      gross_amount,
      signature_key
    } = payload;

    if (!order_id || !transaction_status) {
      res.status(400).json({ error: 'Invalid Midtrans notification payload' });
      return;
    }

    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    if (serverKey && signature_key) {
      const expectedSignature = crypto
        .createHash('sha512')
        .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
        .digest('hex');

      if (expectedSignature !== signature_key) {
        res.status(403).json({ error: 'Invalid Midtrans signature' });
        return;
      }
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT p.order_id, o.customer_id, o.order_number
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.provider_reference = $1
       FOR UPDATE OF p`,
      [order_id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
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
    } else {
      await client.query(
        `UPDATE payments SET webhook_payload = $2, updated_at = NOW() WHERE provider_reference = $1`,
        [order_id, payload]
      );
    }

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
          console.error(`[OrderService] Failed to reach order-service for matching:`, err.message);
        });
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};
