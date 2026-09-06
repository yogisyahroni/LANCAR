import type { NextFunction, Request, Response } from 'express';
import { db } from '../db';

type PreferredCourierEligibilitySnapshot = {
  courier_id?: string | null;
  verification_status?: string | null;
  is_online?: boolean | null;
  location_fresh?: boolean | null;
  capability_ok?: boolean | null;
  zone_ok?: boolean | null;
  distance_m?: number | string | null;
  assignment_radius_pickup_km?: number | string | null;
  active_count?: number | string | null;
  max_active_orders_on_demand?: number | string | null;
};

export type PreferredCourierEligibilityDecision = {
  ok: boolean;
  statusCode: number;
  code?: 'CAPABILITY_MISMATCH' | 'NO_COURIER';
  message?: string;
};

const roadsideService = (serviceCode: string): boolean =>
  serviceCode.startsWith('tambal_ban_') || serviceCode.startsWith('towing_');

const finiteNumber = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const parsePickup = (value: unknown): { lat: number; lng: number } | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const lat = finiteNumber(record.lat ?? record.latitude);
  const lng = finiteNumber(record.lng ?? record.longitude);
  if (lat === null || lng === null || lat === 0 || lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

export const evaluatePreferredCourierEligibility = (
  snapshot: PreferredCourierEligibilitySnapshot | null | undefined,
): PreferredCourierEligibilityDecision => {
  if (!snapshot?.courier_id) {
    return {
      ok: false,
      statusCode: 409,
      code: 'CAPABILITY_MISMATCH',
      message: 'Teknisi pilihan tidak lagi terdaftar untuk layanan ini. Pilih teknisi lain atau gunakan pencarian otomatis.',
    };
  }

  if (snapshot.verification_status !== 'approved' || snapshot.capability_ok !== true) {
    return {
      ok: false,
      statusCode: 409,
      code: 'CAPABILITY_MISMATCH',
      message: 'Teknisi pilihan tidak lagi memiliki capability/kendaraan yang sesuai. Pilih teknisi lain atau gunakan pencarian otomatis.',
    };
  }

  const distanceM = finiteNumber(snapshot.distance_m) ?? Number.POSITIVE_INFINITY;
  const assignmentRadiusKm = finiteNumber(snapshot.assignment_radius_pickup_km) ?? 0;
  const activeCount = finiteNumber(snapshot.active_count) ?? Number.POSITIVE_INFINITY;
  const maxActive = finiteNumber(snapshot.max_active_orders_on_demand) ?? 0;
  const operationallyAvailable =
    snapshot.is_online === true &&
    snapshot.location_fresh === true &&
    snapshot.zone_ok === true &&
    assignmentRadiusKm > 0 &&
    distanceM <= assignmentRadiusKm * 1000 &&
    maxActive > 0 &&
    activeCount < maxActive;

  if (!operationallyAvailable) {
    return {
      ok: false,
      statusCode: 409,
      code: 'NO_COURIER',
      message: 'Teknisi pilihan sedang tidak tersedia di pickup terbaru. Pilih teknisi lain atau gunakan pencarian otomatis.',
    };
  }

  return { ok: true, statusCode: 200 };
};

const preferredCourierEligibilityQuery = `
  WITH target_service AS (
    SELECT
      code,
      service_category,
      vehicle_types,
      COALESCE(max_active_orders_on_demand, 1)::int AS max_active_orders_on_demand,
      COALESCE(assignment_radius_pickup_km, 2)::float8 AS assignment_radius_pickup_km
    FROM delivery_service_products
    WHERE code = $2
      AND is_enabled = TRUE
    LIMIT 1
  ),
  active_jobs AS (
    SELECT COUNT(*)::int AS active_count
    FROM order_legs ol
    JOIN orders ao ON ao.id = ol.order_id
    WHERE ol.courier_id = $1
      AND COALESCE(ol.status, ao.status) NOT IN (
        'delivered', 'completed', 'failed', 'cancelled', 'rejected', 'return_required'
      )
  )
  SELECT
    cp.user_id AS courier_id,
    cp.verification_status,
    cp.is_online,
    (
      cp.current_location IS NOT NULL
      AND cp.last_location_at IS NOT NULL
      AND cp.last_location_at >= NOW() - INTERVAL '10 minutes'
    ) AS location_fresh,
    COALESCE(
      ST_Distance(
        cp.current_location,
        ST_SetSRID(ST_MakePoint($4, $3), 4326)
      ),
      999999999
    )::float8 AS distance_m,
    ts.assignment_radius_pickup_km,
    aj.active_count,
    ts.max_active_orders_on_demand,
    EXISTS (
      SELECT 1
      FROM courier_service_capabilities csc
      JOIN courier_vehicles cv
        ON cv.courier_profile_id = cp.id
       AND cv.verification_status = 'approved'
       AND (csc.vehicle_id IS NULL OR cv.id = csc.vehicle_id)
      WHERE csc.courier_profile_id = cp.id
        AND csc.service_code = ts.code
        AND csc.application_channel = 'on_demand'
        AND csc.status = 'enabled'
        AND (
          (
            ts.service_category = 'towing'
            AND (
              (ts.code = 'towing_motor'
                AND LOWER(COALESCE(NULLIF(cv.vehicle_category, ''), NULLIF(cp.vehicle_type_car, ''), '')) IN ('pickup', 'van'))
              OR
              (ts.code = 'towing_mobil'
                AND LOWER(COALESCE(NULLIF(cv.vehicle_category, ''), NULLIF(cp.vehicle_type_car, ''), '')) IN ('towing_truck', 'towing truck'))
            )
          )
          OR
          (
            ts.service_category <> 'towing'
            AND (
              COALESCE(array_length(ts.vehicle_types, 1), 0) = 0
              OR cv.vehicle_type = ANY(ts.vehicle_types)
              OR (cv.vehicle_type = 'motor' AND 'bike' = ANY(ts.vehicle_types))
              OR (cv.vehicle_type = 'car' AND 'mobil' = ANY(ts.vehicle_types))
            )
          )
        )
    ) AS capability_ok,
    EXISTS (
      SELECT 1
      FROM zones z
      WHERE z.id = cp.current_zone_id
        AND z.is_active = TRUE
        AND ST_Covers(z.polygon, ST_SetSRID(ST_MakePoint($4, $3), 4326))
    ) AS zone_ok
  FROM courier_profiles cp
  CROSS JOIN target_service ts
  CROSS JOIN active_jobs aj
  WHERE cp.user_id = $1
  LIMIT 1
`;

/**
 * Revalidate a customer-selected roadside technician against the latest pickup
 * before pricing or order persistence. Dispatch performs the same class of
 * checks again later, so a courier that changes state between create and
 * assignment still cannot be forced through a stale client selection.
 */
export const validatePreferredCourierForCreate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const preferredCourierId = String(req.body?.preferred_courier_id || '').trim();
  const serviceCode = String(req.body?.price_breakdown?.service_code || req.body?.service_code || '')
    .trim()
    .toLowerCase();

  if (!preferredCourierId || !roadsideService(serviceCode)) {
    next();
    return;
  }

  const pickup = parsePickup(req.body?.pickup_location);
  if (!pickup) {
    res.status(400).json({
      success: false,
      code: 'ERR_ORDER_ROUTE_REQUIRED',
      error: 'Koordinat pickup valid wajib tersedia sebelum teknisi pilihan dapat diverifikasi.',
    });
    return;
  }

  try {
    const result = await db.query(preferredCourierEligibilityQuery, [
      preferredCourierId,
      serviceCode,
      pickup.lat,
      pickup.lng,
    ]);
    const decision = evaluatePreferredCourierEligibility(result.rows[0]);
    if (!decision.ok) {
      res.status(decision.statusCode).json({
        success: false,
        code: decision.code,
        error: decision.message,
        next_action: 'Pilih teknisi lain atau gunakan pencarian otomatis.',
        preferred_courier_id: preferredCourierId,
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Preferred courier pre-create validation error:', error);
    res.status(503).json({
      success: false,
      code: 'NO_COURIER',
      error: 'Ketersediaan teknisi pilihan belum dapat diverifikasi. Coba lagi atau gunakan pencarian otomatis.',
      next_action: 'Coba lagi atau gunakan pencarian otomatis.',
    });
  }
};
