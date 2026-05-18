import axios from 'axios';
import crypto from 'crypto';
import { redis } from '../redis';

type Queryable = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
};

export type TrackingPoint = {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp?: string;
};

export type LocationQualityResult = {
  accepted: boolean;
  severity: 'info' | 'medium' | 'high' | 'critical';
  reasons: string[];
  is_spoofed: boolean;
};

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const distanceKm = (a: TrackingPoint, b: TrackingPoint) => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const routeCacheKey = (from: TrackingPoint, to: TrackingPoint) => {
  const raw = [
    from.latitude.toFixed(5),
    from.longitude.toFixed(5),
    to.latitude.toFixed(5),
    to.longitude.toFixed(5),
  ].join(':');
  return `route:on-demand:${crypto.createHash('sha1').update(raw).digest('hex')}`;
};

export const evaluateLocationQuality = (
  current: TrackingPoint,
  previous?: TrackingPoint | null,
  flags: { is_mock?: boolean; is_rooted?: boolean } = {}
): LocationQualityResult => {
  const reasons: string[] = [];
  const recordedAt = current.timestamp ? new Date(current.timestamp).getTime() : Date.now();
  const ageMs = Date.now() - recordedAt;
  const accuracy = current.accuracy ?? 0;

  if (flags.is_mock) reasons.push('mock_location_detected');
  if (flags.is_rooted) reasons.push('rooted_device_signal');
  if (!Number.isFinite(current.latitude) || !Number.isFinite(current.longitude)) reasons.push('invalid_coordinates');
  if (Math.abs(current.latitude) > 90 || Math.abs(current.longitude) > 180) reasons.push('coordinates_out_of_bounds');
  if (accuracy > 100) reasons.push('poor_accuracy');
  if (ageMs > 5 * 60 * 1000) reasons.push('stale_timestamp');

  if (previous?.timestamp) {
    const previousAt = new Date(previous.timestamp).getTime();
    const seconds = Math.max(1, Math.abs(recordedAt - previousAt) / 1000);
    const jumpKmh = (distanceKm(previous, current) / seconds) * 3600;
    if (jumpKmh > 160) reasons.push('impossible_location_jump');
  }

  const critical = reasons.some((reason) => ['mock_location_detected', 'invalid_coordinates', 'coordinates_out_of_bounds'].includes(reason));
  const high = critical || reasons.includes('impossible_location_jump') || reasons.includes('stale_timestamp');

  return {
    accepted: reasons.length === 0,
    severity: critical ? 'critical' : high ? 'high' : reasons.length ? 'medium' : 'info',
    reasons,
    is_spoofed: reasons.length > 0,
  };
};

export const writeLocationSafetyEvent = async (
  client: Queryable,
  input: {
    order_id?: string | null;
    courier_id: string;
    location: TrackingPoint;
    quality: LocationQualityResult;
    device_id?: string | null;
  }
) => {
  if (input.quality.accepted) return;
  await client.query(
    `INSERT INTO courier_safety_events (
       order_id, courier_id, event_type, severity, latitude, longitude, accuracy_m, message, metadata
     )
     VALUES ($1, $2, 'location_quality_flag', $3, $4, $5, $6, $7, $8)`,
    [
      input.order_id || null,
      input.courier_id,
      input.quality.severity,
      input.location.latitude,
      input.location.longitude,
      input.location.accuracy ?? null,
      'Lokasi kurir ditahan dari tampilan customer karena kualitas data tidak memenuhi standar.',
      JSON.stringify({
        reasons: input.quality.reasons,
        device_id: input.device_id || null,
        recorded_at: input.location.timestamp || null,
      }),
    ]
  );
};

const getProofSummary = async (client: Queryable, orderId: string) => {
  const { rows } = await client.query(
    `SELECT
       BOOL_OR(scan_type IN ('pickup', 'pickup_scan')) AS pickup_scan_verified,
       BOOL_OR(scan_type = 'pickup_photo') AS pickup_photo_verified,
       BOOL_OR(scan_type = 'pod') AS pod_verified,
       BOOL_OR(scan_type = 'pickup_cancellation') AS pickup_cancelled
     FROM package_scans
     WHERE order_id = $1`,
    [orderId]
  );
  return {
    pickup_scan_verified: Boolean(rows[0]?.pickup_scan_verified),
    pickup_photo_verified: Boolean(rows[0]?.pickup_photo_verified),
    pod_verified: Boolean(rows[0]?.pod_verified),
    pickup_cancelled: Boolean(rows[0]?.pickup_cancelled),
  };
};

export const resolveTrackingStage = (status: string, proofs: ReturnType<typeof getProofSummary> extends Promise<infer T> ? T : never) => {
  if (proofs.pickup_cancelled || ['cancelled', 'failed'].includes(status)) return 'dibatalkan';
  if (['delivered', 'completed'].includes(status) || proofs.pod_verified) return 'selesai';
  if (status === 'in_transit' || (proofs.pickup_scan_verified && proofs.pickup_photo_verified)) return 'menuju_tujuan';
  if (status === 'accepted' || status === 'assigned' || status === 'matched') return 'kurir_menuju_pickup';
  if (status === 'pending' || status === 'paid' || status === 'offered' || status === 'dispatching') return 'mencari_kurir';
  return 'validasi_pickup';
};

const stageLabel = (stage: string) => {
  const labels: Record<string, string> = {
    mencari_kurir: 'Mencari kurir',
    kurir_menuju_pickup: 'Kurir menuju pickup',
    validasi_pickup: 'Validasi pickup',
    menuju_tujuan: 'Menuju tujuan',
    selesai: 'Selesai',
    dibatalkan: 'Dibatalkan',
  };
  return labels[stage] || 'Dalam proses';
};

const fetchRoute = async (from: TrackingPoint | null, to: TrackingPoint | null) => {
  if (!from || !to) return { eta: null, eta_minutes: null, route_polyline: null, provider: 'none' };
  const fallbackDistance = distanceKm(from, to);
  const fallbackEta = Math.max(3, Math.ceil((fallbackDistance / 24) * 60));
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY;
  if (!apiKey) {
    return { eta: `${fallbackEta} menit`, eta_minutes: fallbackEta, route_polyline: null, provider: 'fallback_haversine' };
  }

  const cacheKey = routeCacheKey(from, to);
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return { ...JSON.parse(cached), provider: 'google_directions_cache' };

    const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params: {
        origin: `${from.latitude},${from.longitude}`,
        destination: `${to.latitude},${to.longitude}`,
        mode: 'driving',
        key: apiKey,
      },
      timeout: 2500,
    });
    const route = response.data?.routes?.[0];
    const leg = route?.legs?.[0];
    if (!route || !leg) throw new Error(response.data?.status || 'NO_ROUTE');
    const payload = {
      eta: leg.duration?.text || `${fallbackEta} menit`,
      eta_minutes: Math.max(1, Math.ceil((leg.duration?.value || fallbackEta * 60) / 60)),
      route_polyline: route.overview_polyline?.points || null,
      provider: 'google_directions',
    };
    await redis.set(cacheKey, JSON.stringify(payload), 'EX', 60);
    return payload;
  } catch (error) {
    return { eta: `${fallbackEta} menit`, eta_minutes: fallbackEta, route_polyline: null, provider: 'fallback_haversine' };
  }
};

export const buildOnDemandTrackingSnapshot = async (
  client: Queryable,
  input: { orderId: string; userId: string; role?: string | null }
) => {
  const { rows: orderRows } = await client.query(
    `SELECT o.id,
            o.order_number,
            o.customer_id,
            o.status,
            o.pickup_address,
            o.dropoff_address,
            ST_Y(o.pickup_location::geometry) AS pickup_latitude,
            ST_X(o.pickup_location::geometry) AS pickup_longitude,
            ST_Y(o.dropoff_location::geometry) AS dropoff_latitude,
            ST_X(o.dropoff_location::geometry) AS dropoff_longitude,
            ol.courier_id,
            cp.id AS courier_profile_id
     FROM orders o
     LEFT JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
     LEFT JOIN courier_profiles cp ON cp.user_id = ol.courier_id
     WHERE o.id = $1
       AND (o.customer_id = $2 OR ol.courier_id = $2 OR $3::text = ANY(ARRAY['admin', 'super_admin', 'ops']))
     LIMIT 1`,
    [input.orderId, input.userId, input.role]
  );

  if (orderRows.length === 0) return null;
  const order = orderRows[0];
  const proofs = await getProofSummary(client, input.orderId);
  const stage = resolveTrackingStage(order.status, proofs);

  const { rows: locationRows } = await client.query(
    `WITH latest_order_location AS (
       SELECT courier_id,
              ST_Y(location::geometry) AS latitude,
              ST_X(location::geometry) AS longitude,
              heading_deg,
              speed_kmh,
              accuracy_m,
              recorded_at
       FROM courier_locations
       WHERE order_id = $1
         AND COALESCE(is_spoofed, FALSE) = FALSE
         AND COALESCE(accuracy_m, 0) <= 100
       ORDER BY recorded_at DESC
       LIMIT 1
     ),
     fallback_profile_location AS (
       SELECT id AS courier_id,
              ST_Y(current_location::geometry) AS latitude,
              ST_X(current_location::geometry) AS longitude,
              0::numeric AS heading_deg,
              0::numeric AS speed_kmh,
              NULL::numeric AS accuracy_m,
              last_location_at AS recorded_at
       FROM courier_profiles
       WHERE id = $2 AND current_location IS NOT NULL
       LIMIT 1
     )
     SELECT * FROM latest_order_location
     UNION ALL
     SELECT * FROM fallback_profile_location
     WHERE NOT EXISTS (SELECT 1 FROM latest_order_location)
     LIMIT 1`,
    [input.orderId, order.courier_profile_id]
  );

  const latest = locationRows[0] || null;
  const location = latest ? {
    latitude: toNumber(latest.latitude),
    longitude: toNumber(latest.longitude),
    heading: toNumber(latest.heading_deg),
    speed: toNumber(latest.speed_kmh),
    accuracy: latest.accuracy_m == null ? undefined : toNumber(latest.accuracy_m),
    timestamp: latest.recorded_at,
  } : null;

  const pickupTarget = Number.isFinite(Number(order.pickup_latitude)) && Number.isFinite(Number(order.pickup_longitude))
    ? { latitude: Number(order.pickup_latitude), longitude: Number(order.pickup_longitude), address: order.pickup_address, type: 'pickup' }
    : null;
  const dropoffTarget = Number.isFinite(Number(order.dropoff_latitude)) && Number.isFinite(Number(order.dropoff_longitude))
    ? { latitude: Number(order.dropoff_latitude), longitude: Number(order.dropoff_longitude), address: order.dropoff_address, type: 'dropoff' }
    : null;
  const target = ['menuju_tujuan', 'selesai'].includes(stage) ? dropoffTarget : pickupTarget;
  const route = await fetchRoute(location, target ? { latitude: target.latitude, longitude: target.longitude } : null);

  return {
    order_id: order.id,
    order_number: order.order_number,
    courier_id: latest?.courier_id || order.courier_profile_id,
    courier_user_id: order.courier_id,
    stage,
    stage_label: stageLabel(stage),
    status: order.status,
    location,
    target,
    proof_summary: proofs,
    eta: route.eta,
    eta_minutes: route.eta_minutes,
    route_polyline: route.route_polyline,
    route_provider: route.provider,
    quality: {
      source: location ? 'last_valid_location' : 'unavailable',
      customer_visible: Boolean(location),
    },
    timeline: [
      { key: 'mencari_kurir', label: stageLabel('mencari_kurir'), completed: !['mencari_kurir'].includes(stage) },
      { key: 'kurir_menuju_pickup', label: stageLabel('kurir_menuju_pickup'), completed: ['validasi_pickup', 'menuju_tujuan', 'selesai'].includes(stage) },
      { key: 'validasi_pickup', label: stageLabel('validasi_pickup'), completed: ['menuju_tujuan', 'selesai'].includes(stage) },
      { key: 'menuju_tujuan', label: stageLabel('menuju_tujuan'), completed: stage === 'selesai' },
      { key: 'selesai', label: stageLabel('selesai'), completed: stage === 'selesai' },
    ],
  };
};
