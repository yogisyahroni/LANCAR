import { buildMapsRouteEtaSnapshot } from './mapsProviderConfig';

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

export const TRACKING_STALE_AFTER_SECONDS = 90;

export type TrackingFreshness = {
  is_stale: boolean;
  age_seconds: number | null;
  stale_reason: 'location_unavailable' | 'timestamp_invalid' | 'location_expired' | null;
};

export const getTrackingFreshness = (timestamp?: string | Date | null, now = Date.now()): TrackingFreshness => {
  if (!timestamp) {
    return { is_stale: true, age_seconds: null, stale_reason: 'location_unavailable' };
  }

  const recordedAt = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  if (!Number.isFinite(recordedAt)) {
    return { is_stale: true, age_seconds: null, stale_reason: 'timestamp_invalid' };
  }

  const ageSeconds = Math.max(0, Math.floor((now - recordedAt) / 1000));
  return {
    is_stale: ageSeconds > TRACKING_STALE_AFTER_SECONDS,
    age_seconds: ageSeconds,
    stale_reason: ageSeconds > TRACKING_STALE_AFTER_SECONDS ? 'location_expired' : null,
  };
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

const parseJsonObject = (value: unknown): Record<string, any> | null => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

const isTowingService = (serviceType?: string | null) =>
  String(serviceType || '').toLowerCase().includes('towing');

export const resolveTowingTrackingStage = (status: string) => {
  switch (String(status || '').toLowerCase()) {
    case 'cancelled':
    case 'failed':
      return 'dibatalkan';
    case 'completed':
    case 'delivered':
      return 'selesai';
    case 'unloading':
    case 'arrived_dropoff':
      return 'unloading';
    case 'in_transit':
      return 'perjalanan';
    case 'loading':
      return 'loading';
    case 'arrived_pickup':
    case 'service_started':
      return 'inspeksi';
    case 'accepted':
    case 'assigned':
    case 'matched':
    case 'picking_up':
      return 'menuju_pickup';
    case 'pending':
    case 'paid':
    case 'offered':
    case 'dispatching':
      return 'mencari_kurir';
    default:
      return 'mencari_kurir';
  }
};

export const resolveTrackingStage = (
  status: string,
  proofs: ReturnType<typeof getProofSummary> extends Promise<infer T> ? T : never,
  serviceType?: string | null,
) => {
  if (isTowingService(serviceType)) return resolveTowingTrackingStage(status);
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
    menuju_pickup: 'Driver towing menuju pickup',
    validasi_pickup: 'Validasi pickup',
    inspeksi: 'Inspeksi kendaraan di pickup',
    loading: 'Loading kendaraan',
    menuju_tujuan: 'Menuju tujuan',
    perjalanan: 'Perjalanan towing',
    unloading: 'Unloading kendaraan di tujuan',
    selesai: 'Selesai',
    dibatalkan: 'Dibatalkan',
  };
  return labels[stage] || 'Dalam proses';
};

export const buildRouteEtaSnapshot = async (from: TrackingPoint | null, to: TrackingPoint | null) => {
  return buildMapsRouteEtaSnapshot(from, to, 'tracking');
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
             o.route_snapshot,
             o.route_provider,
             o.route_profile,
             o.route_distance_meters,
             o.route_duration_seconds,
             o.route_polyline,
             COALESCE(o.service_sub_type, o.service_code) AS service_type,
             o.package_details,
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
  const stage = resolveTrackingStage(order.status, proofs, order.service_type);

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
  const freshness = getTrackingFreshness(location?.timestamp ?? null);

  const pickupTarget = Number.isFinite(Number(order.pickup_latitude)) && Number.isFinite(Number(order.pickup_longitude))
    ? { latitude: Number(order.pickup_latitude), longitude: Number(order.pickup_longitude), address: order.pickup_address, type: 'pickup' }
    : null;
  const dropoffTarget = Number.isFinite(Number(order.dropoff_latitude)) && Number.isFinite(Number(order.dropoff_longitude))
    ? { latitude: Number(order.dropoff_latitude), longitude: Number(order.dropoff_longitude), address: order.dropoff_address, type: 'dropoff' }
    : null;
  const target = ['menuju_tujuan', 'perjalanan', 'unloading', 'selesai'].includes(stage) ? dropoffTarget : pickupTarget;
  const route = await buildRouteEtaSnapshot(location, target ? { latitude: target.latitude, longitude: target.longitude } : null);
  const packageResult = await client.query(
    `SELECT id AS package_id,
            package_index,
            package_code,
            description,
            size_tier,
            weight_kg,
            status,
            pickup_scan_verified_at,
            pickup_photo_verified_at,
            delivery_pod_verified_at
     FROM order_packages
     WHERE order_id = $1
     ORDER BY package_index ASC`,
    [input.orderId]
  );
  const packageRows = Array.isArray(packageResult?.rows) ? packageResult.rows : [];
  const orderRouteSnapshot = parseJsonObject(order.route_snapshot);
  const packageDetails = parseJsonObject(order.package_details);
  const fallbackPackageCount = Math.max(1, toNumber(packageDetails?.package_count, toNumber(packageDetails?.count, 1)));
  const customerPackages = packageRows.map((row) => ({
    package_id: row.package_id,
    package_index: Number(row.package_index),
    package_code: row.package_code,
    description: row.description,
    size_tier: row.size_tier,
    weight_kg: toNumber(row.weight_kg),
    status: row.status,
    pickup_scan_verified_at: row.pickup_scan_verified_at,
    pickup_photo_verified_at: row.pickup_photo_verified_at,
    delivery_pod_verified_at: row.delivery_pod_verified_at,
  }));

  return {
    order_id: order.id,
    order_number: order.order_number,
    package_count: customerPackages.length > 0 ? customerPackages.length : fallbackPackageCount,
    packages: customerPackages,
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
    order_route_snapshot: orderRouteSnapshot,
    order_route_provider: order.route_provider || orderRouteSnapshot?.provider || null,
    order_route_profile: order.route_profile || orderRouteSnapshot?.route_profile || null,
    order_route_polyline: order.route_polyline || orderRouteSnapshot?.route_polyline || null,
    order_route_distance_meters: toNumber(order.route_distance_meters, toNumber(orderRouteSnapshot?.distance_meters, 0)),
    order_route_duration_seconds: toNumber(order.route_duration_seconds, toNumber(orderRouteSnapshot?.duration_seconds, 0)),
    order_route_snapshot_hash: orderRouteSnapshot?.snapshot_hash || null,
    order_route_version: orderRouteSnapshot?.route_version || null,
    privacy_scope: {
      route_scope: 'single_order',
      excludes_other_customer_stops: true,
      package_scope: 'same_order_only',
      customer_visible: Boolean(input.userId),
    },
    quality: {
      source: location ? 'last_valid_location' : 'unavailable',
      customer_visible: Boolean(location),
      ...freshness,
    },
    location_stale: freshness.is_stale,
    location_age_seconds: freshness.age_seconds,
    location_stale_reason: freshness.stale_reason,
    timeline: isTowingService(order.service_type)
      ? [
          { key: 'mencari_kurir', label: stageLabel('mencari_kurir'), completed: !['mencari_kurir'].includes(stage) },
          { key: 'menuju_pickup', label: stageLabel('menuju_pickup'), completed: ['inspeksi', 'loading', 'perjalanan', 'unloading', 'selesai'].includes(stage) },
          { key: 'inspeksi', label: stageLabel('inspeksi'), completed: ['loading', 'perjalanan', 'unloading', 'selesai'].includes(stage) },
          { key: 'loading', label: stageLabel('loading'), completed: ['perjalanan', 'unloading', 'selesai'].includes(stage) },
          { key: 'perjalanan', label: stageLabel('perjalanan'), completed: ['unloading', 'selesai'].includes(stage) },
          { key: 'unloading', label: stageLabel('unloading'), completed: stage === 'selesai' },
          { key: 'selesai', label: stageLabel('selesai'), completed: stage === 'selesai' },
        ]
      : [
          { key: 'mencari_kurir', label: stageLabel('mencari_kurir'), completed: !['mencari_kurir'].includes(stage) },
          { key: 'kurir_menuju_pickup', label: stageLabel('kurir_menuju_pickup'), completed: ['validasi_pickup', 'menuju_tujuan', 'selesai'].includes(stage) },
          { key: 'validasi_pickup', label: stageLabel('validasi_pickup'), completed: ['menuju_tujuan', 'selesai'].includes(stage) },
          { key: 'menuju_tujuan', label: stageLabel('menuju_tujuan'), completed: stage === 'selesai' },
          { key: 'selesai', label: stageLabel('selesai'), completed: stage === 'selesai' },
        ],
  };
};
