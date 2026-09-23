import { Request, Response } from 'express';
import { db } from '../../db';
import { securityLog } from '../../security/logRedaction';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';
import { sha256 } from './_shared';

const ROADSIDE_SERVICES = new Set(['tambal_ban', 'towing']);
const ARRIVAL_STATUSES = new Set([
  'arrived',
  'arrived_pickup',
  'pickup_arrived',
  'verifying',
  'inspecting',
  'picking_up',
]);

const clean = (value: unknown) => String(value ?? '').trim();
const identity = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const sendBadRequest = (res: Response, message: string, code: string, status = 400) => {
  res.status(status).json({ success: false, data: null, message, code });
};

export const submitCourierRoadsideVehicleVerification = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    sendBadRequest(res, 'Unauthorized', 'ERR_UNAUTHORIZED', 401);
    return;
  }

  const orderId = clean(req.body?.order_id || req.body?.orderId);
  const requestedService = clean(req.body?.service_type || req.body?.serviceType).toLowerCase();
  const requestedMatch = clean(req.body?.match_status || req.body?.matchStatus).toLowerCase();
  const observedType = clean(req.body?.observed_type || req.body?.observedType);
  const observedMake = clean(req.body?.observed_make || req.body?.observedMake);
  const observedModel = clean(req.body?.observed_model || req.body?.observedModel);
  const observedPlate = clean(req.body?.observed_plate || req.body?.observedPlate) || null;
  const notes = clean(req.body?.notes) || null;

  if (!orderId || !ROADSIDE_SERVICES.has(requestedService)) {
    sendBadRequest(res, 'Order dan tipe layanan roadside wajib dikirim.', 'ERR_BAD_REQUEST');
    return;
  }
  if (!['matched', 'mismatch'].includes(requestedMatch)) {
    sendBadRequest(res, 'Status kecocokan kendaraan tidak valid.', 'ERR_INVALID_MATCH_STATUS');
    return;
  }
  if (!observedType || !observedMake || !observedModel || !req.file) {
    sendBadRequest(res, 'Jenis, merek, model, dan foto kendaraan wajib diisi.', 'ERR_VEHICLE_EVIDENCE_REQUIRED');
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const access = await client.query(
      `SELECT o.id,
              COALESCE(NULLIF(dsp.service_category, 'on_demand'), NULLIF(o.service_sub_type, ''), NULLIF(o.service_code, '')) AS service_category,
              LOWER(COALESCE(ol.status, o.status, '')) AS leg_status,
              COALESCE(o.package_details->'vehicle_details', '{}'::jsonb) AS customer_vehicle
         FROM orders o
         JOIN order_legs ol ON ol.order_id = o.id AND ol.courier_id = $2
         LEFT JOIN delivery_service_products dsp
           ON dsp.code = COALESCE(NULLIF(o.service_code, ''), o.service_sub_type)
        WHERE o.id = $1
        LIMIT 1`,
      [orderId, req.user.id],
    );

    const order = access.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      sendBadRequest(res, 'Order tidak tersedia untuk akun petugas ini.', 'ERR_ORDER_FORBIDDEN', 403);
      return;
    }

    const actualService = clean(order.service_category).toLowerCase();
    if (actualService !== requestedService && !actualService.startsWith(`${requestedService}_`)) {
      await client.query('ROLLBACK');
      sendBadRequest(res, 'Tipe layanan tidak sesuai dengan order.', 'ERR_SERVICE_MISMATCH', 409);
      return;
    }
    if (!ARRIVAL_STATUSES.has(clean(order.leg_status))) {
      await client.query('ROLLBACK');
      sendBadRequest(res, 'Verifikasi kendaraan hanya bisa dilakukan saat petugas sudah tiba di lokasi.', 'ERR_INVALID_SERVICE_STAGE', 409);
      return;
    }

    const customerVehicle = order.customer_vehicle || {};
    const serverMismatch = [
      ['type', customerVehicle.type, observedType],
      ['make', customerVehicle.make, observedMake],
      ['model', customerVehicle.model, observedModel],
    ].some(([, expected, observed]) => clean(expected) && identity(expected) !== identity(observed));
    const matchStatus = requestedMatch === 'mismatch' || serverMismatch ? 'mismatch' : 'matched';
    const savedUpload = saveSecureUploadBuffer(req.file, 'roadside-vehicle-verifications');

    const result = await client.query(
      `INSERT INTO roadside_vehicle_verifications (
         order_id, courier_id, service_category, match_status,
         observed_type, observed_make, observed_model, observed_plate,
         notes, customer_vehicle_snapshot, photo_url, photo_checksum_sha256
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
       ON CONFLICT (order_id, service_category)
       DO UPDATE SET
         courier_id = EXCLUDED.courier_id,
         match_status = EXCLUDED.match_status,
         observed_type = EXCLUDED.observed_type,
         observed_make = EXCLUDED.observed_make,
         observed_model = EXCLUDED.observed_model,
         observed_plate = EXCLUDED.observed_plate,
         notes = EXCLUDED.notes,
         customer_vehicle_snapshot = EXCLUDED.customer_vehicle_snapshot,
         photo_url = EXCLUDED.photo_url,
         photo_checksum_sha256 = EXCLUDED.photo_checksum_sha256,
         updated_at = NOW()
       RETURNING id, order_id, service_category, match_status,
                 observed_type, observed_make, observed_model, observed_plate,
                 notes, photo_url, created_at, updated_at`,
      [
        orderId,
        req.user.id,
        requestedService,
        matchStatus,
        observedType,
        observedMake,
        observedModel,
        observedPlate,
        notes,
        JSON.stringify(customerVehicle),
        savedUpload.fileUrl,
        req.file.checksumSha256 || sha256(savedUpload.fileUrl),
      ],
    );
    await client.query('COMMIT');

    const verification = result.rows[0];
    if (matchStatus === 'mismatch') {
      res.status(409).json({
        success: false,
        data: { verification, customer_vehicle: customerVehicle },
        message: 'Kendaraan yang datang tidak cocok dengan detail order. Layanan ditahan untuk pemeriksaan.',
        code: 'ERR_VEHICLE_MISMATCH',
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: { verification, customer_vehicle: customerVehicle },
      message: 'Verifikasi kendaraan berhasil disimpan.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Submit roadside vehicle verification error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

export const getCourierServicePrices = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    sendBadRequest(res, 'Unauthorized', 'ERR_UNAUTHORIZED', 401);
    return;
  }
  try {
    const result = await db.query(
      `SELECT csp.service_code,
              COALESCE(dsp.name, csp.service_code) AS service_name,
              csp.price_amount,
              csp.min_price,
              csp.max_price,
              csp.is_active,
              csp.updated_at
         FROM courier_service_prices csp
         JOIN courier_profiles cp ON cp.id = csp.courier_id AND cp.user_id = $1
         LEFT JOIN delivery_service_products dsp ON dsp.code = csp.service_code
        WHERE csp.service_code LIKE 'tambal_ban%'
           OR csp.service_code LIKE 'towing%'
        ORDER BY csp.service_code`,
      [req.user.id],
    );
    res.json({ success: true, data: result.rows, message: 'Harga layanan roadside loaded' });
  } catch (error) {
    securityLog.error('Get courier service prices error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const updateCourierServicePrice = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    sendBadRequest(res, 'Unauthorized', 'ERR_UNAUTHORIZED', 401);
    return;
  }
  const serviceCode = clean(req.body?.service_code || req.body?.serviceCode);
  const priceAmount = Number(req.body?.price_amount ?? req.body?.priceAmount);
  const isActive = req.body?.is_active == null ? true : Boolean(req.body.is_active);
  if (!serviceCode || !/^((tambal_ban)|(towing))/.test(serviceCode) || !Number.isSafeInteger(priceAmount)) {
    sendBadRequest(res, 'Kode layanan dan harga jasa yang valid wajib dikirim.', 'ERR_BAD_REQUEST');
    return;
  }
  try {
    const result = await db.query(
      `UPDATE courier_service_prices csp
          SET price_amount = $3,
              is_active = $4,
              updated_at = NOW()
        FROM courier_profiles cp
       WHERE csp.courier_id = cp.id
         AND cp.user_id = $1
         AND csp.service_code = $2
         AND $3 BETWEEN csp.min_price AND csp.max_price
       RETURNING csp.service_code, csp.price_amount, csp.min_price, csp.max_price, csp.is_active, csp.updated_at`,
      [req.user.id, serviceCode, priceAmount, isActive],
    );
    if (result.rows.length === 0) {
      sendBadRequest(res, 'Harga di luar batas admin atau layanan belum dikonfigurasi untuk akun ini.', 'ERR_SERVICE_PRICE_BOUNDS', 422);
      return;
    }
    res.json({ success: true, data: result.rows[0], message: 'Harga jasa berhasil disimpan.' });
  } catch (error) {
    securityLog.error('Update courier service price error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};
