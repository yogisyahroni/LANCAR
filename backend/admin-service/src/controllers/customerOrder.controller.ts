import { Request, Response } from 'express';
import { db } from '../db';

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

export const calculatePrice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pickup, dropoff, dimensions, weight_kg, has_insurance, item_value } = req.body;

    // Default coordinates if not provided (for mock)
    const pLat = pickup?.lat || -6.200000;
    const pLon = pickup?.lng || 106.816666;
    const dLat = dropoff?.lat || -6.210000;
    const dLon = dropoff?.lng || 106.820000;

    const distance = calculateDistance(pLat, pLon, dLat, dLon);
    
    // Pricing Rules
    const BASE_FARE_FIRST_KM = 10000;
    const PRICE_PER_KM = 4000;
    
    let base_price = BASE_FARE_FIRST_KM;
    if (distance > 1) {
      base_price += Math.ceil(distance - 1) * PRICE_PER_KM;
    }

    // Volumetric Weight Calculation
    let volumetric_surcharge = 0;
    if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
      const volumetricWeight = (dimensions.length * dimensions.width * dimensions.height) / 6000;
      const actualWeight = parseFloat(weight_kg) || 0;
      const chargeableWeight = Math.max(volumetricWeight, actualWeight);
      
      // If chargeable weight > 5kg, add surcharge
      if (chargeableWeight > 5) {
        volumetric_surcharge = Math.ceil(chargeableWeight - 5) * 2000; // Rp 2,000 per extra kg
      }
    }

    // Insurance
    let insurance_premium = 0;
    if (has_insurance && item_value) {
      // 0.2% of item value
      insurance_premium = Math.ceil((item_value * 0.2) / 100);
      // Min insurance Rp 1,000
      if (insurance_premium < 1000) insurance_premium = 1000;
    }

    const total_price = base_price + volumetric_surcharge + insurance_premium;

    res.json({
      distance_km: distance,
      base_price_idr: base_price,
      volumetric_surcharge_idr: volumetric_surcharge,
      insurance_premium_idr: insurance_premium,
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
      price_breakdown
    } = req.body;

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
        status, 
        distance_km,
        base_price_idr,
        volumetric_surcharge_idr,
        insurance_premium_idr,
        total_price_idr,
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
        'relay', 'pending', $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW()
      ) RETURNING id, order_number, total_price_idr
    `;

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
      price_breakdown?.distance_km || 0,
      price_breakdown?.base_price_idr || 0,
      price_breakdown?.volumetric_surcharge_idr || 0,
      price_breakdown?.insurance_premium_idr || 0,
      price_breakdown?.total_price_idr || 0,
      has_insurance || false,
      item_value || 0,
      JSON.stringify(package_details || {}),
      customer_notes || '',
      schedule_type || 'now',
      scheduled_at ? new Date(scheduled_at) : null
    ];

    const result = await client.query(insertQuery, values);
    const newOrder = result.rows[0];

    // Create Order Event
    await client.query(`
      INSERT INTO order_events (order_id, user_id, event_type, description)
      VALUES ($1, $2, 'created', 'Customer created order via Web Portal')
    `, [newOrder.id, customer_id]);

    await client.query('COMMIT');
    
    // In a real app, generate QRIS payment intent here with a payment provider.
    // For now, we return a mock QRIS URL/String.
    res.status(201).json({
      success: true,
      order: newOrder,
      payment: {
        method: 'QRIS',
        qris_string: '00020101021126590013ID.CO.GOJEK.WWW011893600915300000001020900000000000052045499530336054061200005802ID5914LANCAR LOGISTIK6015JAKARTA SELATAN61051212062330729QRIS202405030000000000000000016304',
        expires_in: 900 // 15 mins
      }
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
      SELECT id, order_number, pickup_address, dropoff_address, recipient_name, recipient_phone_masked, model, status, distance_km, 
             base_price_idr, volumetric_surcharge_idr, insurance_premium_idr, total_price_idr, has_insurance, insured_value_idr, 
             package_details, customer_notes, schedule_type, scheduled_at, created_at
      FROM orders
      WHERE customer_id = $1 AND id = $2
    `;

    const { rows } = await db.query(queryStr, [customer_id, id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const order = rows[0];

    // Get order events for timeline
    const eventQuery = `
      SELECT id, event_type, description, created_at
      FROM order_events
      WHERE order_id = $1
      ORDER BY created_at ASC
    `;
    const { rows: events } = await db.query(eventQuery, [id]);

    res.json({ success: true, order, events });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
