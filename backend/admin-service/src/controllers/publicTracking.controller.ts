import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { readDb } from '../db';
import { redis } from '../redis';
import { customerOrderStatusLabel } from './order/_shared';

// ─── Rate limiting (aggressive, IP-based: 20 req/min/IP) ─────────────────────
// Mirrors the redis limiter pattern in src/rateLimit.ts (publicEndpointRateLimiter)
// but per-minute instead of per-hour because cek-resi is an interactive lookup.
const TRACKING_PUBLIC_LIMIT = (() => {
  const parsed = Number.parseInt(process.env.TRACKING_PUBLIC_RATE_LIMIT_PER_MINUTE || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 120) : 20;
})();
const TRACKING_PUBLIC_WINDOW_SECONDS = 60;

export const publicTrackingRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `rate_limit:tracking_public:${ip}`;

    const current = await redis.get(key);
    const currentCount = current ? Number.parseInt(current, 10) : 0;

    if (Number.isFinite(currentCount) && currentCount >= TRACKING_PUBLIC_LIMIT) {
      res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message: 'Terlalu banyak percobaan lacak resi. Silakan coba beberapa saat lagi.',
        code: 'ERR_RATE_LIMITED',
      });
      return;
    }

    const multi = redis.multi();
    multi.incr(key);
    if (!current) {
      multi.expire(key, TRACKING_PUBLIC_WINDOW_SECONDS);
    }
    await multi.exec();

    next();
  } catch (error) {
    // Redis failure must not take down a public read-only endpoint.
    console.error('Public tracking rate limiter error:', error);
    next();
  }
};

// ─── Input validation ─────────────────────────────────────────────────────────
const resiSchema = z
  .string()
  .trim()
  .min(4)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'Format nomor resi tidak valid');

type TrackingRow = {
  id: string;
  order_number: string;
  awb_number: string | null;
  status: string;
  model: string | null;
  chosen_service: string | null;
  service_snapshot: Record<string, unknown> | null;
  route_snapshot: Record<string, unknown> | null;
  pickup_city: string | null;
  dropoff_city: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  created_at: Date;
  courier_full_name: string | null;
};

type TimelineRow = {
  status: string;
  label: string | null;
  at: Date;
};

const addressCityPart = (address: string | null): string | null => {
  if (!address) return null;
  const firstPart = String(address).split(',')[0]?.trim();
  return firstPart ? firstPart.slice(0, 80) : null;
};

const firstNameOf = (fullName: string | null): string | null => {
  if (!fullName) return null;
  const first = String(fullName).trim().split(/\s+/)[0];
  return first ? first.slice(0, 80) : null;
};

const estimateDeliveryAt = (
  row: TrackingRow,
  timeline: Array<{ at: Date }>,
): string | null => {
  if (['delivered', 'completed', 'pod_completed', 'cancelled', 'failed'].includes(row.status)) {
    return null;
  }

  const etaMinutesRaw =
    row.route_snapshot && typeof row.route_snapshot === 'object'
      ? (row.route_snapshot as Record<string, unknown>).eta_minutes
      : null;
  const etaMinutes = Number(etaMinutesRaw);
  if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) return null;

  // ETA dihitung dari event tracking terakhir jika ada, jika tidak dari created_at.
  const baseAt = timeline.length > 0 ? new Date(timeline[0].at) : new Date(row.created_at);
  if (Number.isNaN(baseAt.getTime())) return null;

  return new Date(baseAt.getTime() + etaMinutes * 60 * 1000).toISOString();
};

export const getPublicTrackingByResi = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = resiSchema.safeParse(req.query.resi);
    if (!parsed.success) {
      res.status(400).json({
        found: false,
        message: 'Parameter resi wajib diisi (4-64 karakter alfanumerik).',
      });
      return;
    }
    const resi = parsed.data.toLowerCase();

    const orderResult = await readDb.query<TrackingRow>(
      `
      SELECT o.id,
             o.order_number,
             o.awb_number,
             o.status,
             o.model::text AS model,
             o.chosen_service,
             o.service_snapshot,
             o.route_snapshot,
             o.pickup_city,
             o.dropoff_city,
             o.pickup_address,
             o.dropoff_address,
             o.created_at,
             u.full_name AS courier_full_name
      FROM orders o
      LEFT JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
      LEFT JOIN users u ON u.id = ol.courier_id
      WHERE LOWER(TRIM(COALESCE(NULLIF(o.awb_number, ''), o.order_number))) = $1
         OR LOWER(o.order_number) = $1
      LIMIT 1
      `,
      [resi],
    );

    const row = orderResult.rows[0];
    if (!row) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({ found: false });
      return;
    }

    const eventsResult = await readDb.query<TimelineRow>(
      `
      SELECT event_type::text AS status,
             NULLIF(TRIM(description), '') AS label,
             COALESCE(created_at, NOW()) AS at
      FROM order_events
      WHERE order_id = $1
      ORDER BY created_at DESC
      LIMIT 5
      `,
      [row.id],
    );

    const serviceCode =
      (row.service_snapshot &&
        typeof row.service_snapshot === 'object' &&
        typeof (row.service_snapshot as Record<string, unknown>).service_code === 'string' &&
        ((row.service_snapshot as Record<string, unknown>).service_code as string)) ||
      row.chosen_service ||
      row.model ||
      null;

    res.setHeader('Cache-Control', 'public, max-age=15');
    res.json({
      found: true,
      data: {
        resi: row.awb_number || row.order_number,
        service_code: serviceCode,
        status: row.status,
        status_label: customerOrderStatusLabel(row.status),
        timeline: eventsResult.rows.map((event) => ({
          status: event.status,
          label: event.label || event.status,
          at: new Date(event.at).toISOString(),
        })),
        origin_city: row.pickup_city || addressCityPart(row.pickup_address),
        destination_city: row.dropoff_city || addressCityPart(row.dropoff_address),
        courier_first_name: firstNameOf(row.courier_full_name),
        estimated_delivery_at: estimateDeliveryAt(
          row,
          eventsResult.rows.map((event) => ({ at: event.at })),
        ),
      },
    });
  } catch (error: any) {
    console.error('[PublicTracking] lookup failed:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ found: false, message: 'Gagal melacak resi. Coba lagi nanti.' });
  }
};
