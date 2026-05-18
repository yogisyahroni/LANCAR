import { Request, Response } from 'express';
import { db } from '../db';
import { createNotification } from '../notifications';
import { getIO } from '../websocket';
import { createSnapTransaction, getMidtransClientKey, getMidtransSnapJsUrl } from '../midtrans';
import { isExpiredOrFailedTransaction, isSuccessfulTransaction } from '../midtrans';
import { calculateServiceSettlement, customerFacingService, DeliveryServiceProduct, findDeliveryServiceByCode } from './deliveryServices.controller';
import { redis } from '../redis';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Helper to calculate distance based on coordinates (Haversine formula mock)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  // Simplified mock distance calculation.
  // In production, integrate with Google Maps Distance Matrix API.
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

const resolveSizeTier = (service: DeliveryServiceProduct, requestedCode?: string) => {
  if (!service.uses_size_tier || service.size_tiers.length === 0) return null;
  return service.size_tiers.find((tier) => tier.code === requestedCode) || service.size_tiers[0];
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

    const pLat = pickup?.lat || -6.200000;
    const pLon = pickup?.lng || 106.816666;
    const dLat = dropoff?.lat || -6.210000;
    const dLon = dropoff?.lng || 106.820000;

    const distance = calculateDistance(pLat, pLon, dLat, dLon);

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
      res.status(400).json({
        code: 'ERR_SERVICE_NOT_AVAILABLE',
        error: 'Layanan pengiriman tidak tersedia'
      });
      return;
    }

    if (service.requires_dimension_scan && !package_details?.dimensions_scanned) {
      res.status(400).json({
        code: 'ERR_DIMENSION_SCAN_REQUIRED',
        error: `${service.name} wajib scan dimensi sebelum order dibuat`
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
      pickup_address,
      pickup_location?.lng || 106.816666,
      pickup_location?.lat || -6.200000,
      dropoff_address,
      dropoff_location?.lng || 106.820000,
      dropoff_location?.lat || -6.210000,
      recipient_name,
      recipient_phone?.replace(/\\d(?=\\d{4})/g, "*") || '*****', // masking phone simple
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
      JSON.stringify(package_details || {}),
      customer_notes || '',
      schedule_type || 'now',
      scheduled_at ? new Date(scheduled_at) : null
    ];

    const result = await client.query(insertQuery, values);
    const newOrder = result.rows[0];

    const midtransOrderId = `${order_number}-${Date.now()}`;
    
    // Insert pending payment record BEFORE calling external API
    await client.query(`
      INSERT INTO payments (
        order_id, payment_number, provider, method, status, amount_idr,
        mdr_amount_idr, ppn_amount_idr, weather_reserve_idr, insurance_reserve_idr,
        net_operational_idr, provider_reference, expires_at
      ) VALUES ($1, $2, 'midtrans', 'snap', 'pending', $3, $4, $5, 0, $6, $7, $8, NOW() + INTERVAL '30 minutes')
    `, [
      newOrder.id,
      `PAY-${order_number}`,
      totalPrice,
      settlement.mdr_idr,
      settlement.ppn_idr,
      settlement.insurance_reserve_idr,
      settlement.net_operational_idr,
      midtransOrderId
    ]);

    // Create Order Event
    await client.query(`
      INSERT INTO order_events (order_id, user_id, event_type, description)
      VALUES ($1, $2, 'created', 'Customer created order via Web Portal')
    `, [newOrder.id, customer_id]);

    // COMMIT the database transaction BEFORE calling external Midtrans API
    // This prevents ghost transactions in Midtrans if the DB commit fails.
    await client.query('COMMIT');
    client.release(); // Release client early as DB work is done

    try {
      const ppn_amount = Math.ceil(totalPrice * 0.011); // 1.1% PPN
      const reserve_amount = Math.ceil(totalPrice * 0.02); // 2% Cuaca
      const insurance_amount = price_breakdown?.insurance_premium_idr || 0;
      const operational_amount = totalPrice - ppn_amount - reserve_amount - insurance_amount;

      const snap = await createSnapTransaction({
        orderId: midtransOrderId,
        grossAmount: totalPrice,
        itemDetails: [
          {
            id: order_number,
            price: totalPrice,
            quantity: 1,
            name: `LANCAR Delivery ${order_number}`
          }
        ],
        customerDetails: {
          first_name: recipient_name,
          phone: recipient_phone
        },
        routingDetails: {
          ppn_amount,
          reserve_amount,
          insurance_amount,
          operational_amount
        },
        customFields: {
          custom_field1: String(newOrder.id),
          custom_field3: String(customer_id)
        },
        expiryMinutes: 30
      });

      // Update the expiry time based on actual Snap response (non-blocking, don't strictly need a transaction)
      db.query(`UPDATE payments SET expires_at = $1 WHERE provider_reference = $2`, [snap.expires_at, midtransOrderId]).catch(console.error);

      res.status(201).json({
        success: true,
        order: newOrder,
        payment: {
          id: `PAY-${newOrder.order_number}`,
          method: 'MIDTRANS_SNAP',
          snap_token: snap.token,
          redirect_url: snap.redirect_url,
          midtrans_order_id: snap.midtrans_order_id,
          client_key: getMidtransClientKey(),
          snap_js_url: getMidtransSnapJsUrl(),
          expires_in: 1800,
          expires_at: snap.expires_at
        }
      });
    } catch (midtransError: any) {
      // Order and Payment records exist, but Snap token failed. 
      // User can retry payment later.
      console.error('[Midtrans Error] Failed to create snap token after DB commit:', midtransError);
      res.status(201).json({
        success: true,
        order: newOrder,
        payment_setup_error: 'Gagal menghubungi sistem pembayaran. Silakan coba bayar ulang dari menu pesanan.',
        payment: null
      });
    }

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

    const { rows } = await db.query(
      `SELECT o.id, o.status, o.created_at, p.status as payment_status, p.expires_at, p.provider_reference
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1 AND o.customer_id = $2`,
      [id, customer_id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const order = rows[0];
    const expired = order.expires_at ? new Date(order.expires_at).getTime() < Date.now() : false;

    res.json({
      success: true,
      payment_status: order.payment_status === 'paid' ? 'paid' : (expired ? 'expired' : 'pending'),
      order_status: order.status,
      midtrans_order_id: order.provider_reference,
      expires_in: order.expires_at ? Math.max(0, Math.ceil((new Date(order.expires_at).getTime() - Date.now()) / 1000)) : 0
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const confirmCustomerOrderPayment = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();
  try {
    const customer_id = req.user?.id;
    const id = String(req.params.id);

    if (!customer_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT o.id, o.order_number, o.status, o.created_at, p.expires_at, p.status as payment_status
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

    if (order.status === 'pending_payment') {
      await client.query(
        `UPDATE orders SET status = 'pending', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      await client.query(
        `UPDATE payments SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE order_id = $1`,
        [id]
      );
      await client.query(
        `INSERT INTO order_events (order_id, user_id, event_type, description)
         VALUES ($1, $2, 'payment_confirmed', 'Customer confirmed QRIS payment via Web Portal')`,
        [id, customer_id]
      );
    }

    await client.query('COMMIT');

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

    res.json({
      success: true,
      payment_status: 'paid',
      order_status: 'pending'
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
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
             u.phone as courier_phone
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
             photo_url,
             image_urls,
             override_reason,
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
             photo_url,
             image_urls,
             override_reason,
             latitude,
             longitude,
             COALESCE(scanned_at, created_at) AS recorded_at
      FROM package_scans
      WHERE order_id = $1
      ORDER BY COALESCE(scanned_at, created_at) ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        order: rows[0],
        events,
        proofs,
      },
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

    const chatMessage = rows[0];

    // Emit chat message to both sender and recipient rooms for real-time UI update
    if (sender_id && recipient_id) {
      try {
        const io = getIO();
        io.to(sender_id).to(recipient_id).emit('new_chat_message', {
          ...chatMessage,
          order_number: order.order_number,
          sender_name: req.user?.full_name || 'User'
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
