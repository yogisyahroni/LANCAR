import { Request, Response } from 'express';
import { db } from '../db';
import { redis } from '../redis';
import * as xlsx from 'xlsx';

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
  if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
    const volumetricWeight = (dimensions.length * dimensions.width * dimensions.height) / 6000;
    const actualWeight = parseFloat(weight_kg as any) || 0;
    const chargeableWeight = Math.max(volumetricWeight, actualWeight);
    if (chargeableWeight > 5) {
      volumetric_surcharge = Math.ceil(chargeableWeight - 5) * 2000;
    }
  } else {
    const actualWeight = parseFloat(weight_kg as any) || 0;
    if (actualWeight > 5) {
      volumetric_surcharge = Math.ceil(actualWeight - 5) * 2000;
    }
  }

  let insurance_premium = 0;
  if (has_insurance && item_value) {
    insurance_premium = Math.ceil((item_value * 0.2) / 100);
    if (insurance_premium < 1000) insurance_premium = 1000;
  }

  return {
    distance_km: distance,
    base_price_idr: base_price,
    volumetric_surcharge_idr: volumetric_surcharge,
    insurance_premium_idr: insurance_premium,
    total_price_idr: base_price + volumetric_surcharge + insurance_premium
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
    const pickup_address = req.body.pickup_address || 'Mock Pickup Address';

    // Parse Excel
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = xlsx.utils.sheet_to_json(worksheet) as any[];

    const jobId = `bulk_job_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Set initial job state
    await redis.set(jobId, JSON.stringify({
      status: 'processing',
      progress: 0,
      total: rawRows.length,
      rows: []
    }), 'EX', 3600); // 1 hour expiry

    res.status(202).json({ job_id: jobId, message: 'Processing started' });

    // Process asynchronously
    (async () => {
      const processedRows = [];
      let completed = 0;
      for (const [index, row] of rawRows.entries()) {
        const dropoffAddress = row['Tujuan'] || row['Alamat'] || row['Dropoff Address'];
        const recipientName = row['Penerima'] || row['Recipient Name'];
        const recipientPhone = row['HP'] || row['Phone'];
        const weightKg = parseFloat(row['Berat'] || row['Weight'] || '1');
        
        let status = 'valid';
        let errorMessages = [];

        if (!dropoffAddress) errorMessages.push('Alamat tujuan harus diisi');
        if (!recipientName) errorMessages.push('Nama penerima harus diisi');
        if (!recipientPhone) errorMessages.push('Nomor HP penerima harus diisi');
        
        // Mock geocoding for dropoff based on row index to give slight variation
        const dLat = -6.210000 - (index * 0.001);
        const dLon = 106.820000 + (index * 0.001);

        const priceData = calculateRowPrice(calculateDistance(pLat, pLon, dLat, dLon), weightKg);

        if (errorMessages.length > 0) {
          status = 'error';
        }

        processedRows.push({
          id: `row_${index}`,
          originalData: row,
          recipient_name: recipientName || '',
          recipient_phone: recipientPhone || '',
          dropoff_address: dropoffAddress || '',
          dropoff_location: { lat: dLat, lng: dLon },
          weight_kg: weightKg || 1,
          pickup_address,
          pickup_location: { lat: pLat, lng: pLon },
          price_breakdown: priceData,
          status,
          error_messages: errorMessages
        });

        completed++;
        // Update Redis periodically
        if (completed % 10 === 0 || completed === rawRows.length) {
          await redis.set(jobId, JSON.stringify({
            status: completed === rawRows.length ? 'completed' : 'processing',
            progress: Math.round((completed / rawRows.length) * 100),
            total: rawRows.length,
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
        row.recipient_name = edits.recipient_name;
        row.recipient_phone = edits.recipient_phone;
        row.dropoff_address = edits.dropoff_address;
        row.weight_kg = parseFloat(edits.weight_kg) || 1;

        // Revalidate
        let status = 'valid';
        let errorMessages = [];
        if (!row.dropoff_address) errorMessages.push('Alamat tujuan harus diisi');
        if (!row.recipient_name) errorMessages.push('Nama penerima harus diisi');
        if (!row.recipient_phone) errorMessages.push('Nomor HP penerima harus diisi');
        
        row.status = errorMessages.length > 0 ? 'error' : 'valid';
        row.error_messages = errorMessages;

        // Recalculate price
        row.price_breakdown = calculateRowPrice(
          row.price_breakdown.distance_km, // Mock keeping same distance
          row.weight_kg
        );
      }
    }

    // Save back to Redis
    await redis.set(job_id, JSON.stringify(jobData), 'EX', 3600);
    
    res.json({ success: true, rows: jobData.rows });
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

    // Bulk insert (using a loop for simplicity, can be optimized with UNNEST in prod)
    for (const row of validRows) {
      const order_number = `LNC-BLK-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
      totalAmount += row.price_breakdown.total_price_idr;

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
          created_at
        ) VALUES (
          $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326),
          $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10,
          'relay', 'pending', $11, $12, $13, $14, $15, $16, $17, $18, $19, 'now', NOW()
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
        row.price_breakdown.distance_km,
        row.price_breakdown.base_price_idr,
        row.price_breakdown.volumetric_surcharge_idr,
        row.price_breakdown.insurance_premium_idr,
        row.price_breakdown.total_price_idr,
        false, // has_insurance
        0,     // insured_value
        JSON.stringify({ category: 'bulk', weight_kg: row.weight_kg }),
        'Bulk Order',
      ];

      const result = await client.query(insertQuery, values);
      createdOrders.push(result.rows[0]);

      await client.query(`
        INSERT INTO order_events (order_id, user_id, event_type, description)
        VALUES ($1, $2, 'created', 'Customer created order via Web Portal Bulk Upload')
      `, [result.rows[0].id, customer_id]);
    }

    await client.query('COMMIT');
    
    // Clear Redis job
    await redis.del(job_id);

    res.status(201).json({
      success: true,
      processed_count: validRows.length,
      total_amount_idr: totalAmount,
      payment: {
        method: 'QRIS',
        qris_string: '00020101021126590013ID.CO.GOJEK.WWW011893600915300000001020900000000000052045499530336054061200005802ID5914LANCAR LOGISTIK6015JAKARTA SELATAN61051212062330729QRIS202405030000000000000000016304',
        expires_in: 1800 // 30 mins
      }
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};
