import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { redis } from '../redis';
import { createSnapTransaction, getMidtransClientKey, getMidtransSnapJsUrl } from '../midtrans';
import { calculateServiceSettlement, customerFacingService, DeliveryServiceProduct, findDeliveryServiceByCode } from './deliveryServices.controller';
import { buildMapsRouteEtaSnapshot, buildMapsMultiWaypointRouteEtaSnapshot, geocodeAddress, RouteEtaSnapshot } from '../services/mapsProviderConfig';

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

type BulkPricingResult = {
  price: Record<string, number | string | null>;
  errors: string[];
};

const calculateRowPrice = (
  service: DeliveryServiceProduct,
  route: RouteEtaSnapshot,
  weight_kg: number,
  dimensions?: any,
  has_insurance?: boolean,
  item_value?: number
): BulkPricingResult => {
  const errors: string[] = [];
  const distance = Number(route.distance_km || 0);
  const extraDistance = Math.max(0, distance - Number(service.included_distance_km || 0));
  const base_price = Math.ceil(
    (Number(service.base_fare_idr || 0) + (Math.ceil(extraDistance) * Number(service.per_km_idr || 0))) *
    Number(service.service_multiplier || 1)
  );
  let volumetric_surcharge = 0;
  const actualWeight = parseFloat(weight_kg as any) || 0;
  let volumetricWeight = 0;
  let chargeableWeight = actualWeight;
  const dimensionRules = service.dimension_rules || {};
  const volumetricDivisor = Number(dimensionRules.volumetric_divisor_cm3_per_kg || 0);
  const includedWeightKg = Number(dimensionRules.included_weight_kg || service.max_weight_kg || 0);
  const overweightSurcharge = Number(dimensionRules.overweight_surcharge_idr_per_kg || 0);

  if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
    if (!volumetricDivisor) {
      errors.push('Konfigurasi volumetric divisor layanan belum tersedia');
    } else {
      volumetricWeight = (dimensions.length * dimensions.width * dimensions.height) / volumetricDivisor;
    }
    chargeableWeight = Math.max(volumetricWeight, actualWeight);
  }
  if (includedWeightKg > 0 && chargeableWeight > includedWeightKg) {
    if (!overweightSurcharge) {
      errors.push('Konfigurasi surcharge berat layanan belum tersedia');
    } else {
      volumetric_surcharge = Math.ceil(chargeableWeight - includedWeightKg) * overweightSurcharge;
    }
  }

  let insurance_premium = 0;
  if (has_insurance && item_value) {
    const insuranceRate = Number(service.metadata?.insurance_premium_rate_percent || 0);
    const insuranceMinimum = Number(service.metadata?.insurance_min_premium_idr || 0);
    if (!insuranceRate) {
      errors.push('Konfigurasi premi asuransi layanan belum tersedia');
    } else {
      insurance_premium = Math.max(insuranceMinimum, Math.ceil((item_value * insuranceRate) / 100));
    }
  }

  const dynamic_price = 0;
  const eta_minutes = route.duration_seconds ? Math.ceil(route.duration_seconds / 60) : route.eta_minutes;

  return {
    errors,
    price: {
      distance_km: distance,
      distance_meters: route.distance_meters,
      duration_seconds: route.duration_seconds,
      route_provider: route.provider,
      route_profile: route.route_profile,
      route_fallback_reason: route.fallback_reason || null,
      service_code: service.code,
      base_price_idr: base_price,
      actual_weight_kg: Number(actualWeight.toFixed(2)),
      dimensional_weight_kg: Number(volumetricWeight.toFixed(2)),
      chargeable_weight_kg: Number(chargeableWeight.toFixed(2)),
      volumetric_surcharge_idr: volumetric_surcharge,
      insurance_premium_idr: insurance_premium,
      dynamic_price_idr: dynamic_price,
      delivery_model: service.route_model,
      eta_minutes,
      total_price_idr: base_price + volumetric_surcharge + insurance_premium + dynamic_price
    }
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

const parseCsvText = (text: string): Record<string, string>[] => {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  if (!headers || headers.length === 0) return [];

  const normalizedHeaders = headers.map((header) => header.trim());
  return dataRows.map((dataRow) => {
    const record: Record<string, string> = {};
    normalizedHeaders.forEach((header, index) => {
      record[header] = dataRow[index]?.trim() || '';
    });
    return record;
  });
};

const parseUploadedRows = (file: Express.Multer.File): any[] => {
  const originalName = file.originalname.toLowerCase();
  const isCsv = file.mimetype === 'text/csv' || originalName.endsWith('.csv');

  if (!isCsv) {
    throw new Error('Format file tidak didukung. Gunakan template CSV resmi TEMBUS.');
  }

  return parseCsvText(file.buffer.toString('utf8'));
};

const validatePhone = (value: string) => /^(\+?62|0)8[0-9]{8,13}$/.test(String(value || '').replace(/\s|-/g, ''));

const buildRowFromExcel = async (
  row: any,
  index: number,
  pickup: { address: string; lat: number; lng: number },
  service: DeliveryServiceProduct
) => {
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
  let dropoffLat = NaN;
  let dropoffLng = NaN;

  const errorMessages: string[] = [];
  if (!recipientName) errorMessages.push('Nama penerima harus diisi');
  if (!recipientPhone) errorMessages.push('Nomor HP penerima harus diisi');
  if (recipientPhone && !validatePhone(recipientPhone)) errorMessages.push('Nomor HP penerima tidak valid');
  if (!dropoffAddress) errorMessages.push('Alamat tujuan harus diisi');
  if (!weightKg || weightKg < 0.1) errorMessages.push('Berat minimal 0.1 kg');
  if (length < 0 || width < 0 || height < 0) errorMessages.push('Dimensi tidak boleh negatif');
  if (hasInsurance && itemValue < 1000) errorMessages.push('Nilai barang minimal Rp 1.000 jika asuransi aktif');
  if (notes.length > 200) errorMessages.push('Catatan maksimal 200 karakter');

  if (!Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) {
    errorMessages.push('Koordinat pickup harus berasal dari input pengguna atau alamat tersimpan');
  }

  // Geocoding since we no longer read coordinates from Excel
  if (dropoffAddress) {
    try {
      const results = await geocodeAddress(dropoffAddress, 'web_customer');
      if (results && results.length > 0) {
        dropoffLat = results[0].latitude;
        dropoffLng = results[0].longitude;
      } else {
        errorMessages.push('Gagal menemukan koordinat dari alamat tujuan. Silakan lengkapi alamat atau isi manual koordinat.');
      }
    } catch (err) {
      errorMessages.push('Layanan pencarian alamat (geocoding) sedang bermasalah.');
    }
  } else {
    errorMessages.push('Alamat tujuan kosong sehingga koordinat tidak dapat dicari.');
  }

  const dLat = dropoffLat;
  const dLon = dropoffLng;
  const dimensions = length && width && height ? { length, width, height } : undefined;
  
  // Default base price data (will be recalculated by multi-stop grouping later)
  const priceData: Record<string, number | string | null> = {
    distance_km: 0,
    base_price_idr: 0,
    actual_weight_kg: Number((weightKg || 0).toFixed(2)),
    dimensional_weight_kg: 0,
    chargeable_weight_kg: Number((weightKg || 0).toFixed(2)),
    volumetric_surcharge_idr: 0,
    insurance_premium_idr: 0,
    dynamic_price_idr: 0,
    delivery_model: service.route_model,
    eta_minutes: null,
    total_price_idr: 0,
    service_code: service.code, // Initial default
  };

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

const recalculateBulkJob = async (jobData: any, pLat: number, pLon: number, pickup_address: string) => {
  const pickup = { latitude: pLat, longitude: pLon };

  // Clear previous prices & routing errors
  jobData.rows.forEach((r: any) => {
    if (r.status === 'valid') {
      r.price_breakdown.distance_km = 0;
      r.price_breakdown.base_price_idr = 0;
      r.price_breakdown.total_price_idr = 0;
    }
  });

  const validRows = jobData.rows.filter((r: any) => r.status === 'valid' && r.dropoff_location?.lat && r.dropoff_location?.lng);
  
  // Group by service_code
  const grouped = validRows.reduce((acc: any, row: any) => {
    const s = row.price_breakdown?.service_code || 'tembus_instant';
    if (!acc[s]) acc[s] = [];
    acc[s].push(row);
    return acc;
  }, {});

  for (const [serviceCode, rows] of Object.entries(grouped) as [string, any[]][]) {
    const service = await findDeliveryServiceByCode(serviceCode);
    if (!service) {
      rows.forEach(r => {
        r.status = 'error';
        r.error_messages.push(`Layanan ${serviceCode} tidak tersedia`);
      });
      continue;
    }

    let maxPackages = 10;
    if (serviceCode.includes('instant') || serviceCode.includes('prioritas')) maxPackages = 2;
    else if (serviceCode.includes('hemat')) maxPackages = 3;
    else if (serviceCode.includes('sameday')) maxPackages = 5;
    else if (serviceCode.includes('mobil') || serviceCode.includes('bulky')) maxPackages = 10;
    
    // Split into chunks based on max capacity
    const chunks: any[][] = [];
    let currentChunk: any[] = [];
    let currentChunkWeight = 0;
    const maxWeight = serviceCode.includes('mobil') ? 500 : 20;

    for (const row of rows) {
      if (
        currentChunk.length >= maxPackages || 
        (currentChunkWeight + row.weight_kg > maxWeight && currentChunk.length > 0)
      ) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentChunkWeight = 0;
      }
      currentChunk.push(row);
      currentChunkWeight += row.weight_kg;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    for (const chunk of chunks) {
      const batchId = crypto.randomUUID();
      const dropoffs = chunk.map(r => ({ latitude: r.dropoff_location.lat, longitude: r.dropoff_location.lng }));
      const points = [pickup, ...dropoffs];
      
      try {
        const route = await buildMapsMultiWaypointRouteEtaSnapshot(points, 'web_customer', {
          serviceCode: service.code,
          vehicleType: serviceCode.includes('mobil') ? 'car' : 'motorcycle',
          routeProfile: serviceCode.includes('mobil') ? 'car' : 'motorcycle',
          requireRoadRoute: true,
          computeBestOrder: true
        });

        const distance = Number(route.distance_km || 0);
        const extraDistance = Math.max(0, distance - Number(service.included_distance_km || 0));
        const routeBasePrice = Math.ceil(
          (Number(service.base_fare_idr || 0) + (Math.ceil(extraDistance) * Number(service.per_km_idr || 0))) *
          Number(service.service_multiplier || 1)
        );

        // Distribute base price equally among packages in this chunk
        const basePricePerPackage = Math.ceil(routeBasePrice / chunk.length);

        for (let idx = 0; idx < chunk.length; idx++) {
          const row = chunk[idx];
          let sequence_no = idx + 1;
          
          if (route.optimized_waypoints && route.optimized_waypoints.length > 0) {
            if (idx === chunk.length - 1) {
              sequence_no = chunk.length;
            } else {
              const opt = route.optimized_waypoints.find((o: any) => o.providedIndex === idx);
              if (opt) {
                sequence_no = opt.optimizedIndex + 1;
              }
            }
          }
          
          row.sequence_no = sequence_no;
          row.batch_id = batchId;

          const pricing = calculateRowPrice(service, route, row.weight_kg, row.dimensions, row.has_insurance, row.item_value);
          row.price_breakdown = {
            ...pricing.price,
            base_price_idr: basePricePerPackage,
            total_price_idr: basePricePerPackage + Number(pricing.price.volumetric_surcharge_idr || 0) + Number(pricing.price.insurance_premium_idr || 0)
          };
          if (pricing.errors.length > 0) {
            row.status = 'error';
            row.error_messages.push(...pricing.errors);
          }
        }

      } catch (error: any) {
        for (const row of chunk) {
          row.status = 'error';
          row.error_messages.push(error?.message || 'Gagal menghitung rute multi-stop');
        }
      }
    }
  }
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

    const pLat = parseFloat(req.body.pickup_lat);
    const pLon = parseFloat(req.body.pickup_lng);
    const pickup_address = String(req.body.pickup_address || '').trim();
    if (!pickup_address || !Number.isFinite(pLat) || !Number.isFinite(pLon)) {
      res.status(400).json({ error: 'Pickup address and coordinates are required for production bulk pricing' });
      return;
    }

    const rawRows = parseUploadedRows(req.file);

    if (rawRows.length === 0) {
      res.status(400).json({ error: 'Template kosong. Isi minimal 1 baris order.' });
      return;
    }
    if (rawRows.length > 500) {
      res.status(400).json({ error: 'Maksimal 500 baris per upload.' });
      return;
    }

    const bulkService = await findDeliveryServiceByCode('tembus_instant');
    if (!bulkService) {
      res.status(400).json({ error: 'Layanan bulk default tidak tersedia' });
      return;
    }

    const jobId = `bulk_job_${crypto.randomUUID()}`;

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
        processedRows.push(await buildRowFromExcel(row, index, { address: pickup_address, lat: pLat, lng: pLon }, bulkService));

        completed++;
        // Update Redis frequently so progress bar is smooth
        if (completed % Math.max(1, Math.floor(rawRows.length / 20)) === 0 || completed === rawRows.length) {
          await redis.set(jobId, JSON.stringify({
            status: 'processing', // Keep processing until recalculation is done
            progress: Math.round((completed / rawRows.length) * 90), // up to 90%
            total: rawRows.length,
            total_rows: rawRows.length,
            processed_rows: completed,
            rows: processedRows
          }), 'EX', 3600);
        }
      }

      // After building rows, recalculate group pricing
      const jobData = {
        status: 'processing',
        progress: 95,
        total: rawRows.length,
        total_rows: rawRows.length,
        processed_rows: rawRows.length,
        rows: processedRows
      };
      
      await recalculateBulkJob(jobData, pLat, pLon, pickup_address);
      
      jobData.status = 'completed';
      jobData.progress = 100;

      await redis.set(jobId, JSON.stringify(jobData), 'EX', 3600);
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
        const requestedServiceCode = edits.service_code ?? row.price_breakdown?.service_code ?? 'tembus_instant';
        const bulkService = await findDeliveryServiceByCode(requestedServiceCode);
        if (!bulkService) {
          res.status(400).json({ error: 'Layanan bulk tidak tersedia untuk validasi ulang' });
          return;
        }
        jobData.rows[i] = {
          ...await buildRowFromExcel(mergedOriginal, Number(String(row.id).replace('row_', '')) || i, {
            address: row.pickup_address,
            lat: row.pickup_location.lat,
            lng: row.pickup_location.lng
          }, bulkService),
          id: row.id
        };
      }
    }

    const firstRow = jobData.rows[0];
    const pLat = firstRow?.pickup_location?.lat || 0;
    const pLon = firstRow?.pickup_location?.lng || 0;
    const pickup_address = firstRow?.pickup_address || '';

    // Need to reset errors before recalculating
    for (const r of jobData.rows) {
      if (r.error_messages.includes('Gagal menghitung rute multi-stop')) {
        r.error_messages = r.error_messages.filter((msg: string) => msg !== 'Gagal menghitung rute multi-stop');
        if (r.error_messages.length === 0) r.status = 'valid';
      }
    }

    if (pLat && pLon) {
      await recalculateBulkJob(jobData, pLat, pLon, pickup_address);
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
    const bulkService = await findDeliveryServiceByCode('tembus_instant');
    if (!bulkService) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Layanan bulk default tidak tersedia' });
      return;
    }

    const flagRes = await client.query("SELECT is_enabled FROM feature_flags WHERE key = 'require_payment_gateway' LIMIT 1");
    const requirePayment = flagRes.rows.length > 0 ? flagRes.rows[0].is_enabled : true;
    const initialStatus = requirePayment ? 'pending_payment' : 'pending_assignment';

    // Extract unique batch IDs to pass to Midtrans
    const batchIds = [...new Set(validRows.map((r: any) => r.batch_id))];
    
    // Bulk insert (using a loop for simplicity, can be optimized with UNNEST in prod)
    for (const row of validRows) {
      const order_number = `TMB-BLK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
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
          recipient_phone_hash,
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
          batch_id,
          created_at
        ) VALUES (
          $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326),
          $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10,
          $11, $12, $13, $14, $31, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, NOW()
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
        hashPhoneForPrivateLookup(row.recipient_phone),
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
        'now',
        row.batch_id,
        initialStatus
      ];

      const result = await client.query(insertQuery, values);
      createdOrders.push(result.rows[0]);
      await client.query(`
        INSERT INTO payments (
          order_id, payment_number, provider, method, status, amount_idr,
          mdr_amount_idr, ppn_amount_idr, weather_reserve_idr, insurance_reserve_idr,
          net_operational_idr, provider_reference, batch_id, expires_at
        ) VALUES ($1, $2, 'midtrans', 'snap', 'pending', $3, $4, $5, 0, $6, $7, $8, $9, NOW() + INTERVAL '30 minutes')
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
        `PENDING-BULK-${job_id}`,
        row.batch_id
      ]);

      await client.query(`
        INSERT INTO order_events (order_id, user_id, event_type, description)
        VALUES ($1, $2, 'created', 'Customer created order via Web Portal Bulk Upload')
      `, [result.rows[0].id, customer_id]);
    }

    if (!requirePayment) {
      await client.query('COMMIT');
      await redis.del(job_id);

      res.status(201).json({
        success: true,
        processed_count: validRows.length,
        total_amount_idr: totalAmount,
        payment: null
      });
      return;
    }

    const midtransOrderId = `TMB-BULK-${crypto.randomUUID()}`;
    const snap = await createSnapTransaction({
      orderId: midtransOrderId,
      grossAmount: totalAmount,
      itemDetails: [
        {
          id: `BULK-${job_id.slice(-12)}`,
          price: totalAmount,
          quantity: 1,
          name: `TEMBUS Bulk Delivery (${validRows.length} paket)`
        }
      ],
      customerDetails: {
        first_name: 'TEMBUS Customer'
      },
      customFields: {
        custom_field1: batchIds.join(',').slice(0, 255),
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
