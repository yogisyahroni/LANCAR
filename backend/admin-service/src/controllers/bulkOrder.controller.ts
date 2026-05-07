import { Request, Response } from 'express';
import { db } from '../db';
import { redis } from '../redis';
import * as xlsx from 'xlsx';
import { createSnapTransaction, getMidtransClientKey, getMidtransSnapJsUrl } from '../midtrans';
import { calculateServiceSettlement, customerFacingService, findDeliveryServiceByCode } from './deliveryServices.controller';

// A simple distance calculation mock
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

// Pricing rules mock
const calculateRowPrice = (distance: number, weight_kg: number, dimensions?: any, has_insurance?: boolean, item_value?: number) => {
  const BASE_FARE_FIRST_KM = 10000;
  const PRICE_PER_KM = 4000;
  
  let base_price = BASE_FARE_FIRST_KM;
  if (distance > 1) {
    base_price += Math.ceil(distance - 1) * PRICE_PER_KM;
  }

  let volumetric_surcharge = 0;
  const actualWeight = parseFloat(weight_kg as any) || 0;
  let volumetricWeight = 0;
  let chargeableWeight = actualWeight;
  if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
    volumetricWeight = (dimensions.length * dimensions.width * dimensions.height) / 6000;
    chargeableWeight = Math.max(volumetricWeight, actualWeight);
    if (chargeableWeight > 5) {
      volumetric_surcharge = Math.ceil(chargeableWeight - 5) * 2000;
    }
  } else {
    if (actualWeight > 5) {
      volumetric_surcharge = Math.ceil(actualWeight - 5) * 2000;
    }
  }

  let insurance_premium = 0;
  if (has_insurance && item_value) {
    insurance_premium = Math.ceil((item_value * 0.2) / 100);
    if (insurance_premium < 1000) insurance_premium = 1000;
  }

  const hour = new Date().getHours();
  const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20);
  const dynamic_price = isPeakHour ? Math.ceil(base_price * 0.15) : 0;
  const delivery_model = distance < 15 ? 'p2p' : distance < 30 ? 'two_legs' : 'three_legs';
  const eta_minutes = Math.ceil(20 + (distance * 3.5) + (delivery_model === 'two_legs' ? 12 : delivery_model === 'three_legs' ? 24 : 0));

  return {
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
    total_price_idr: base_price + volumetric_surcharge + insurance_premium + dynamic_price
  };
};

const getCell = (row: any, keys: string[]) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return '';
};

const parseNumber = (value: any, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value: any) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['ya', 'yes', 'true', '1', 'y'].includes(normalized);
};

const validatePhone = (value: string) => /^(\+?62|0)8[0-9]{8,13}$/.test(String(value || '').replace(/\s|-/g, ''));

const buildRowFromExcel = (row: any, index: number, pickup: { address: string; lat: number; lng: number }) => {
  const recipientName = String(getCell(row, ['recipient_name', 'Nama Penerima', 'Penerima', 'nama_penerima'])).trim();
  const recipientPhone = String(getCell(row, ['recipient_phone', 'No HP Penerima', 'HP', 'Phone', 'no_hp_penerima'])).trim();
  const dropoffAddress = String(getCell(row, ['dropoff_address', 'Alamat Tujuan', 'Tujuan', 'Alamat', 'alamat_tujuan'])).trim();
  const category = String(getCell(row, ['category', 'Kategori Barang', 'Kategori', 'kategori']) || 'other').trim();
  const weightKg = parseNumber(getCell(row, ['weight_kg', 'Berat Aktual (kg)', 'Berat', 'Weight', 'berat_kg']), 0);
  const length = parseNumber(getCell(row, ['length_cm', 'Panjang (cm)', 'Panjang', 'panjang_cm']), 0);
  const width = parseNumber(getCell(row, ['width_cm', 'Lebar (cm)', 'Lebar', 'lebar_cm']), 0);
  const height = parseNumber(getCell(row, ['height_cm', 'Tinggi (cm)', 'Tinggi', 'tinggi_cm']), 0);
  const hasInsurance = parseBoolean(getCell(row, ['has_insurance', 'Asuransi (Ya/Tidak)', 'Asuransi', 'asuransi']));
  const itemValue = parseNumber(getCell(row, ['item_value', 'Nilai Barang (Rp)', 'Nilai Barang', 'nilai_barang']), 0);
  const notes = String(getCell(row, ['customer_notes', 'Catatan', 'catatan']) || '').trim();
  const dropoffLat = parseNumber(getCell(row, ['dropoff_lat', 'Latitude Tujuan', 'latitude']), NaN);
  const dropoffLng = parseNumber(getCell(row, ['dropoff_lng', 'Longitude Tujuan', 'longitude']), NaN);

  const errorMessages: string[] = [];
  if (!recipientName) errorMessages.push('Nama penerima harus diisi');
  if (!recipientPhone) errorMessages.push('Nomor HP penerima harus diisi');
  if (recipientPhone && !validatePhone(recipientPhone)) errorMessages.push('Nomor HP penerima tidak valid');
  if (!dropoffAddress) errorMessages.push('Alamat tujuan harus diisi');
  if (!weightKg || weightKg < 0.1) errorMessages.push('Berat minimal 0.1 kg');
  if (length < 0 || width < 0 || height < 0) errorMessages.push('Dimensi tidak boleh negatif');
  if (hasInsurance && itemValue < 1000) errorMessages.push('Nilai barang minimal Rp 1.000 jika asuransi aktif');
  if (notes.length > 200) errorMessages.push('Catatan maksimal 200 karakter');

  // If customer supplies coordinates, use them. Otherwise derive a deterministic Jakarta point
  // from row index so validation and pricing stay stable until a real geocoder is attached.
  const dLat = Number.isFinite(dropoffLat) ? dropoffLat : -6.210000 - (index * 0.001);
  const dLon = Number.isFinite(dropoffLng) ? dropoffLng : 106.820000 + (index * 0.001);
  const dimensions = length && width && height ? { length, width, height } : undefined;
  const distance = calculateDistance(pickup.lat, pickup.lng, dLat, dLon);
  const priceData = calculateRowPrice(distance, weightKg || 1, dimensions, hasInsurance, itemValue);

  return {
    id: `row_${index}`,
    row_number: index + 2,
    originalData: row,
    recipient_name: recipientName,
    recipient_phone: recipientPhone,
    dropoff_address: dropoffAddress,
    dropoff_location: { lat: dLat, lng: dLon },
    category,
    weight_kg: weightKg || 1,
    dimensions: dimensions || { length: 0, width: 0, height: 0 },
    has_insurance: hasInsurance,
    item_value: itemValue,
    customer_notes: notes,
    pickup_address: pickup.address,
    pickup_location: { lat: pickup.lat, lng: pickup.lng },
    price_breakdown: priceData,
    status: errorMessages.length > 0 ? 'error' : 'valid',
    error_messages: errorMessages
  };
};

export const uploadBulkExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    if (!customer_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Default pickup coords from frontend payload
    const pLat = parseFloat(req.body.pickup_lat) || -6.200000;
    const pLon = parseFloat(req.body.pickup_lng) || 106.816666;
    const pickup_address = req.body.pickup_address || 'Pickup Address';

    // Parse Excel
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: '' }) as any[];

    if (rawRows.length === 0) {
      res.status(400).json({ error: 'Template kosong. Isi minimal 1 baris order.' });
      return;
    }
    if (rawRows.length > 500) {
      res.status(400).json({ error: 'Maksimal 500 baris per upload.' });
      return;
    }

    const jobId = `bulk_job_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Set initial job state
    await redis.set(jobId, JSON.stringify({
      status: 'processing',
      progress: 0,
      total: rawRows.length,
      total_rows: rawRows.length,
      processed_rows: 0,
      rows: []
    }), 'EX', 3600); // 1 hour expiry

    res.status(202).json({ job_id: jobId, message: 'Processing started' });

    // Process asynchronously
    (async () => {
      const processedRows = [];
      let completed = 0;
      for (const [index, row] of rawRows.entries()) {
        processedRows.push(buildRowFromExcel(row, index, { address: pickup_address, lat: pLat, lng: pLon }));

        completed++;
        // Update Redis periodically
        if (completed % 10 === 0 || completed === rawRows.length) {
          await redis.set(jobId, JSON.stringify({
            status: completed === rawRows.length ? 'completed' : 'processing',
            progress: Math.round((completed / rawRows.length) * 100),
            total: rawRows.length,
            total_rows: rawRows.length,
            processed_rows: completed,
            rows: completed === rawRows.length ? processedRows : []
          }), 'EX', 3600);
        }
        
        // Mock delay for UI progress visibility
        await new Promise(resolve => setTimeout(resolve, 50)); 
      }
    })();

  } catch (error: any) {
    console.error('Bulk Upload Error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getBulkJobStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const job_id = req.params.job_id as string;
    const jobDataString = await redis.get(job_id);
    
    if (!jobDataString) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(JSON.parse(jobDataString));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const validateBulkRow = async (req: Request, res: Response): Promise<void> => {
  try {
    const job_id = req.params.job_id as string;
    const updatedRows = req.body.rows; // Array of rows that were edited

    const jobDataString = await redis.get(job_id);
    if (!jobDataString) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const jobData = JSON.parse(jobDataString);
    if (jobData.status !== 'completed') {
      res.status(400).json({ error: 'Cannot edit rows while job is still processing' });
      return;
    }

    // Map rows by ID for quick update
    const updatedMap = new Map(updatedRows.map((r: any) => [r.id, r]));

    for (let i = 0; i < jobData.rows.length; i++) {
      const row = jobData.rows[i];
      if (updatedMap.has(row.id)) {
        const edits = updatedMap.get(row.id) as any;
        const mergedOriginal = {
          recipient_name: edits.recipient_name ?? row.recipient_name,
          recipient_phone: edits.recipient_phone ?? row.recipient_phone,
          dropoff_address: edits.dropoff_address ?? row.dropoff_address,
          category: edits.category ?? row.category,
          weight_kg: edits.weight_kg ?? row.weight_kg,
          length_cm: edits.dimensions?.length ?? row.dimensions?.length,
          width_cm: edits.dimensions?.width ?? row.dimensions?.width,
          height_cm: edits.dimensions?.height ?? row.dimensions?.height,
          has_insurance: edits.has_insurance ?? row.has_insurance,
          item_value: edits.item_value ?? row.item_value,
          customer_notes: edits.customer_notes ?? row.customer_notes,
          dropoff_lat: row.dropoff_location?.lat,
          dropoff_lng: row.dropoff_location?.lng
        };
        jobData.rows[i] = {
          ...buildRowFromExcel(mergedOriginal, Number(String(row.id).replace('row_', '')) || i, {
            address: row.pickup_address,
            lat: row.pickup_location.lat,
            lng: row.pickup_location.lng
          }),
          id: row.id
        };
      }
    }

    // Save back to Redis
    await redis.set(job_id, JSON.stringify(jobData), 'EX', 3600);
    
    res.json({
      success: true,
      status: 'completed',
      total: jobData.rows.length,
      total_rows: jobData.rows.length,
      processed_rows: jobData.rows.length,
      rows: jobData.rows
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteBulkRows = async (req: Request, res: Response): Promise<void> => {
  try {
    const job_id = req.params.job_id as string;
    const { row_ids, delete_errors } = req.body;

    const jobDataString = await redis.get(job_id);
    if (!jobDataString) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const jobData = JSON.parse(jobDataString);
    const ids = new Set((row_ids || []) as string[]);
    jobData.rows = jobData.rows.filter((row: any) => {
      if (delete_errors && row.status === 'error') return false;
      if (ids.has(row.id)) return false;
      return true;
    });
    jobData.total = jobData.rows.length;
    jobData.total_rows = jobData.rows.length;
    jobData.processed_rows = jobData.rows.length;

    await redis.set(job_id, JSON.stringify(jobData), 'EX', 3600);
    res.json({ success: true, ...jobData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const processBulkPayment = async (req: Request, res: Response): Promise<void> => {
  const client = await db.connect();
  try {
    const customer_id = req.user?.id;
    const job_id = req.body.job_id as string;

    const jobDataString = await redis.get(job_id);
    if (!jobDataString) {
      res.status(404).json({ error: 'Job not found or expired' });
      return;
    }

    const jobData = JSON.parse(jobDataString);
    const validRows = jobData.rows.filter((r: any) => r.status === 'valid');

    if (validRows.length === 0) {
      res.status(400).json({ error: 'No valid rows to process' });
      return;
    }

    await client.query('BEGIN');

    let totalAmount = 0;
    const createdOrders = [];
    const bulkService = await findDeliveryServiceByCode('lancar_instant');
    if (!bulkService) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Layanan bulk default tidak tersedia' });
      return;
    }

    // Bulk insert (using a loop for simplicity, can be optimized with UNNEST in prod)
    for (const row of validRows) {
      const order_number = `LNC-BLK-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
      totalAmount += row.price_breakdown.total_price_idr;
      const settlement = calculateServiceSettlement(
        bulkService,
        row.price_breakdown.total_price_idr,
        row.price_breakdown.insurance_premium_idr || 0
      );

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
          created_at
        ) VALUES (
          $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326),
          $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10,
          $11, $12, $13, 'pending_payment', $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 'now', NOW()
        ) RETURNING id, order_number
      `;

      const values = [
        customer_id,
        order_number,
        row.pickup_address,
        row.pickup_location.lng,
        row.pickup_location.lat,
        row.dropoff_address,
        row.dropoff_location.lng,
        row.dropoff_location.lat,
        row.recipient_name,
        row.recipient_phone.replace(/\d(?=\d{4})/g, "*"),
        bulkService.route_model,
        bulkService.code,
        JSON.stringify(customerFacingService(bulkService)),
        row.price_breakdown.distance_km,
        row.price_breakdown.base_price_idr,
        row.price_breakdown.volumetric_surcharge_idr,
        row.price_breakdown.insurance_premium_idr,
        row.price_breakdown.dynamic_price_idr || 0,
        row.price_breakdown.total_price_idr,
        settlement.ppn_idr,
        settlement.mdr_idr,
        settlement.platform_commission_idr,
        settlement.courier_payout_estimate_idr,
        JSON.stringify(settlement.settlement_snapshot),
        row.has_insurance || false,
        row.item_value || 0,
        JSON.stringify({ category: row.category || 'bulk', weight_kg: row.weight_kg, dimensions: row.dimensions }),
        row.customer_notes || 'Bulk Order',
      ];

      const result = await client.query(insertQuery, values);
      createdOrders.push(result.rows[0]);
      await client.query(`
        INSERT INTO payments (
          order_id, payment_number, provider, method, status, amount_idr,
          mdr_amount_idr, ppn_amount_idr, weather_reserve_idr, insurance_reserve_idr,
          net_operational_idr, provider_reference, expires_at
        ) VALUES ($1, $2, 'midtrans', 'snap', 'pending', $3, $4, $5, 0, $6, $7, $8, NOW() + INTERVAL '30 minutes')
        ON CONFLICT (order_id) DO UPDATE SET
          status = 'pending',
          amount_idr = EXCLUDED.amount_idr,
          provider_reference = EXCLUDED.provider_reference,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
      `, [
        result.rows[0].id,
        `PAY-${order_number}`,
        row.price_breakdown.total_price_idr,
        settlement.mdr_idr,
        settlement.ppn_idr,
        settlement.insurance_reserve_idr,
        settlement.net_operational_idr,
        `PENDING-BULK-${job_id}`
      ]);

      await client.query(`
        INSERT INTO order_events (order_id, user_id, event_type, description)
        VALUES ($1, $2, 'created', 'Customer created order via Web Portal Bulk Upload')
      `, [result.rows[0].id, customer_id]);
    }

    const midtransOrderId = `LNC-BULK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const snap = await createSnapTransaction({
      orderId: midtransOrderId,
      grossAmount: totalAmount,
      itemDetails: [
        {
          id: `BULK-${job_id.slice(-12)}`,
          price: totalAmount,
          quantity: 1,
          name: `LANCAR Bulk Delivery (${validRows.length} paket)`
        }
      ],
      customerDetails: {
        first_name: 'LANCAR Customer'
      },
      customFields: {
        custom_field1: createdOrders.map((order: any) => order.id).join(',').slice(0, 255),
        custom_field2: 'bulk_order',
        custom_field3: String(customer_id || '')
      },
      expiryMinutes: 30
    });

    await client.query(
      `UPDATE payments SET provider_reference = $1, expires_at = $2, updated_at = NOW()
       WHERE order_id = ANY($3::uuid[])`,
      [snap.midtrans_order_id, snap.expires_at, createdOrders.map((order: any) => order.id)]
    );

    await client.query('COMMIT');
    
    // Clear Redis job
    await redis.del(job_id);

    res.status(201).json({
      success: true,
      processed_count: validRows.length,
      total_amount_idr: totalAmount,
      payment: {
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

  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};
