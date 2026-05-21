import axios from 'axios';
import crypto from 'crypto';
import { db, readDb } from '../db';
import { redis } from '../redis';

export type MapProviderId = 'google_maps' | 'openstreetmap' | 'disabled';
export type MapProviderScope = 'global' | 'customer_mobile' | 'courier_mobile' | 'web_customer' | 'tracking';
export type RouteVehicleType = 'motorcycle' | 'car' | 'unknown';
export type RouteProfile = 'motorcycle' | 'car' | 'fallback';

export type MapPoint = {
  latitude: number;
  longitude: number;
};

export type MapsProviderConfigValue = {
  enabled: boolean;
  active_provider: MapProviderId;
  fallback_provider: MapProviderId;
  google_maps_enabled: boolean;
  openstreetmap_enabled: boolean;
  disabled_mode_enabled: boolean;
  config_ttl_seconds: number;
  scopes: Record<string, { enabled: boolean; provider: MapProviderId }>;
  providers: {
    google_maps?: {
      requires_server_key?: boolean;
      tiles_enabled?: boolean;
      routing_enabled?: boolean;
      geocoding_enabled?: boolean;
    };
    openstreetmap?: {
      requires_server_key?: boolean;
      tile_url_template?: string;
      attribution?: string;
      routing_enabled?: boolean;
      geocoding_enabled?: boolean;
    };
  };
};

export type PublicMapsProviderConfig = {
  enabled: boolean;
  requested_provider: MapProviderId;
  active_provider: MapProviderId;
  fallback_provider: MapProviderId;
  scope: MapProviderScope;
  ttl_seconds: number;
  reason: string | null;
  capabilities: {
    tiles: boolean;
    routing: boolean;
    geocoding: boolean;
  };
  openstreetmap: {
    tile_url_template: string | null;
    attribution: string | null;
  };
};

export type RouteEtaSnapshot = {
  generated_at: string;
  eta: string | null;
  eta_minutes: number | null;
  distance_km: number;
  distance_meters: number;
  duration_seconds: number | null;
  route_polyline: string | null;
  route_geometry: string | null;
  provider: string;
  requested_provider: MapProviderId;
  active_provider: MapProviderId;
  scope: MapProviderScope;
  route_profile: RouteProfile;
  vehicle_type: RouteVehicleType;
  service_code: string | null;
  traffic_aware: boolean;
  confidence: 'high' | 'medium' | 'low';
  fallback_reason?: string | null;
};

export type RouteSnapshotOptions = {
  serviceCode?: string | null;
  vehicleType?: RouteVehicleType | string | null;
  routeProfile?: RouteProfile | string | null;
  requireRoadRoute?: boolean;
  requestId?: string | null;
};

export type MapsGeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
  provider: string;
  confidence?: number | null;
};

export type MapsTileSnapshot = {
  body: Buffer;
  contentType: string;
  cacheControl: string;
};

export type MapsProviderObservationStatus = 'success' | 'failure' | 'fallback' | 'disabled' | 'cache_hit';

export type MapsProviderObservation = {
  recorded_at: string;
  request_id?: string | null;
  operation: 'config' | 'route' | 'geocode' | 'reverse_geocode';
  scope: MapProviderScope;
  requested_provider: MapProviderId;
  active_provider: MapProviderId;
  provider: string;
  status: MapsProviderObservationStatus;
  latency_ms: number;
  cache_hit: boolean;
  fallback_reason?: string | null;
  error_message?: string | null;
  result_count?: number | null;
  service_code?: string | null;
  route_profile?: RouteProfile | null;
  vehicle_type?: RouteVehicleType | null;
  distance_meters?: number | null;
  distance_km?: number | null;
  duration_seconds?: number | null;
  duration_minutes?: number | null;
  traffic_aware?: boolean | null;
  confidence?: RouteEtaSnapshot['confidence'] | null;
};

export type MapsProviderOpsSnapshot = {
  generated_at: string;
  status: 'operational' | 'degraded' | 'disabled' | 'critical';
  active_alerts: Array<{
    code: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
  }>;
  active_config: {
    enabled: boolean;
    active_provider: MapProviderId;
    fallback_provider: MapProviderId;
    google_maps_enabled: boolean;
    openstreetmap_enabled: boolean;
  };
  counters: Record<string, number>;
  latency: {
    sample_count: number;
    average_ms: number;
    p95_ms: number;
  };
  cache: {
    hits: number;
    misses: number;
  };
  fallback: {
    total: number;
    osm_fallbacks: number;
    haversine_fallbacks: number;
  };
  route_quality: {
    route_events: number;
    road_route_successes: number;
    distance_anomalies: number;
    straight_line_fallbacks: number;
    cache_hit_rate_percent: number;
  };
  last_error: MapsProviderObservation | null;
  recent_events: MapsProviderObservation[];
  quota: {
    google_remaining_percent: number | null;
    status: 'not_configured' | 'healthy' | 'near_limit';
  };
};

const DEFAULT_CONFIG: MapsProviderConfigValue = {
  enabled: true,
  active_provider: 'openstreetmap',
  fallback_provider: 'openstreetmap',
  google_maps_enabled: false,
  openstreetmap_enabled: true,
  disabled_mode_enabled: true,
  config_ttl_seconds: 300,
  scopes: {
    global: { enabled: true, provider: 'openstreetmap' },
    customer_mobile: { enabled: true, provider: 'openstreetmap' },
    courier_mobile: { enabled: true, provider: 'openstreetmap' },
    web_customer: { enabled: true, provider: 'openstreetmap' },
    tracking: { enabled: true, provider: 'openstreetmap' },
  },
  providers: {
    google_maps: {
      requires_server_key: true,
      tiles_enabled: true,
      routing_enabled: true,
      geocoding_enabled: true,
    },
    openstreetmap: {
      requires_server_key: false,
      tile_url_template: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      routing_enabled: true,
      geocoding_enabled: true,
    },
  },
};

const VALID_PROVIDERS = new Set<MapProviderId>(['google_maps', 'openstreetmap', 'disabled']);
const VALID_SCOPES = new Set<MapProviderScope>(['global', 'customer_mobile', 'courier_mobile', 'web_customer', 'tracking']);
const VALID_ROUTE_PROFILES = new Set<RouteProfile>(['motorcycle', 'car', 'fallback']);
const VALID_VEHICLE_TYPES = new Set<RouteVehicleType>(['motorcycle', 'car', 'unknown']);
const MAPS_OBSERVATION_LIMIT = 200;

const mapsProviderOpsState = {
  counters: new Map<string, number>(),
  latencySamples: [] as number[],
  recentEvents: [] as MapsProviderObservation[],
};

const googleServerApiKey = () => (
  envText('GOOGLE_ROUTES_API_KEY') || envText('GOOGLE_MAPS_API_KEY') || envText('GOOGLE_DIRECTIONS_API_KEY')
);

const googleServerKeyAvailable = () => Boolean(googleServerApiKey());

const parseTileCoordinate = (value: string, name: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid OSM tile ${name}`);
  }
  return parsed;
};

const buildOsmTileUrl = (z: number, x: number, y: number): string => {
  if (z < 0 || z > 19) {
    throw new Error('Invalid OSM tile zoom');
  }
  const scale = 2 ** z;
  if (y < 0 || y >= scale) {
    throw new Error('Invalid OSM tile y');
  }
  const wrappedX = ((x % scale) + scale) % scale;
  const baseUrl = (process.env.OSM_TILE_BASE_URL || 'https://tile.openstreetmap.org').replace(/\/$/, '');
  const allowedHosts = new Set(
    (process.env.OSM_TILE_ALLOWED_HOSTS || 'tile.openstreetmap.org,a.tile.openstreetmap.org,b.tile.openstreetmap.org,c.tile.openstreetmap.org')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
  );
  const url = new URL(`${baseUrl}/${z}/${wrappedX}/${y}.png`);
  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error('OSM tile host is not allowlisted');
  }
  return url.toString();
};

export const fetchOpenStreetMapTile = async (zParam: string, xParam: string, yParam: string): Promise<MapsTileSnapshot> => {
  const z = parseTileCoordinate(zParam, 'z');
  const x = parseTileCoordinate(xParam, 'x');
  const y = parseTileCoordinate(yParam, 'y');
  const tileUrl = buildOsmTileUrl(z, x, y);
  const startedAt = Date.now();

  try {
    const response = await axios.get<ArrayBuffer>(tileUrl, {
      responseType: 'arraybuffer',
      timeout: 3500,
      headers: {
        'User-Agent': process.env.OSM_TILE_USER_AGENT || 'LANCAR-Logistics/1.0 ops@lancar.com',
        Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
      },
      validateStatus: (status) => status >= 200 && status < 500,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`OSM tile provider returned ${response.status}`);
    }

    recordMapsProviderObservation({
      operation: 'config',
      scope: 'global',
      requested_provider: 'openstreetmap',
      active_provider: 'openstreetmap',
      provider: 'openstreetmap_tile_proxy',
      status: 'success',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
    });

    return {
      body: Buffer.from(response.data),
      contentType: String(response.headers['content-type'] || 'image/png'),
      cacheControl: 'public, max-age=86400, stale-while-revalidate=604800',
    };
  } catch (error) {
    recordMapsProviderObservation({
      operation: 'config',
      scope: 'global',
      requested_provider: 'openstreetmap',
      active_provider: 'openstreetmap',
      provider: 'openstreetmap_tile_proxy',
      status: 'failure',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      error_message: error,
    });
    throw error;
  }
};

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const distanceKm = (a: MapPoint, b: MapPoint) => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const normalizeVehicleType = (value?: RouteSnapshotOptions['vehicleType']): RouteVehicleType => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'motor' || normalized === 'motorcycle' || normalized === 'bike' || normalized === 'two_wheeler') return 'motorcycle';
  if (normalized === 'mobil' || normalized === 'car' || normalized === 'auto') return 'car';
  return VALID_VEHICLE_TYPES.has(normalized as RouteVehicleType) ? (normalized as RouteVehicleType) : 'unknown';
};

const normalizeRouteProfile = (value: RouteSnapshotOptions['routeProfile'], vehicleType: RouteVehicleType): RouteProfile => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'motor' || normalized === 'motorcycle' || normalized === 'two_wheeler') return 'motorcycle';
  if (normalized === 'mobil' || normalized === 'car' || normalized === 'auto') return 'car';
  if (VALID_ROUTE_PROFILES.has(normalized as RouteProfile)) return normalized as RouteProfile;
  if (vehicleType === 'car') return 'car';
  if (vehicleType === 'motorcycle') return 'motorcycle';
  return 'fallback';
};

const routeContext = (scope: MapProviderScope, options: RouteSnapshotOptions = {}) => {
  const vehicleType = normalizeVehicleType(options.vehicleType);
  const routeProfile = normalizeRouteProfile(options.routeProfile, vehicleType);
  return {
    scope,
    vehicle_type: vehicleType,
    route_profile: routeProfile,
    service_code: options.serviceCode ? String(options.serviceCode) : null,
  };
};

const fallbackRoute = (
  from: MapPoint,
  to: MapPoint,
  provider: string,
  fallbackReason?: string | null,
  context = routeContext('tracking')
): RouteEtaSnapshot => {
  const distance = distanceKm(from, to);
  const distanceMeters = Math.max(1, Math.round(distance * 1000));
  const etaMinutes = Math.max(3, Math.ceil((distance / 24) * 60));
  return {
    generated_at: new Date().toISOString(),
    eta: `${etaMinutes} menit`,
    eta_minutes: etaMinutes,
    distance_km: Number(distance.toFixed(2)),
    distance_meters: distanceMeters,
    duration_seconds: etaMinutes * 60,
    route_polyline: null,
    route_geometry: null,
    provider,
    requested_provider: 'disabled',
    active_provider: 'disabled',
    scope: context.scope,
    route_profile: context.route_profile,
    vehicle_type: context.vehicle_type,
    service_code: context.service_code,
    traffic_aware: false,
    confidence: 'low',
    fallback_reason: fallbackReason || null,
  };
};

const routeCacheKey = (provider: string, from: MapPoint, to: MapPoint, context = routeContext('tracking')) => {
  const raw = [
    provider,
    context.scope,
    context.route_profile,
    context.vehicle_type,
    context.service_code || 'none',
    from.latitude.toFixed(5),
    from.longitude.toFixed(5),
    to.latitude.toFixed(5),
    to.longitude.toFixed(5),
  ].join(':');
  return `route:on-demand:${crypto.createHash('sha1').update(raw).digest('hex')}`;
};

type OpenStreetMapRouteEngine = {
  baseUrl: string;
  profile: string;
  provider: string;
  confidence: RouteEtaSnapshot['confidence'];
  fallbackReason: string | null;
};

type GoogleTravelMode = 'DRIVE' | 'TWO_WHEELER';
type GoogleRoutingPreference = 'TRAFFIC_AWARE' | 'TRAFFIC_AWARE_OPTIMAL';

type GoogleRoutePolicy = {
  travelMode: GoogleTravelMode;
  routingPreference: GoogleRoutingPreference;
  provider: string;
  fallbackReason: string | null;
};

const envText = (name: string): string | null => {
  const value = process.env[name]?.trim();
  return value ? value : null;
};

const sanitizeOsmRouteProfile = (value: string | null, fallback: string): string => {
  const candidate = (value || fallback).trim().toLowerCase();
  return /^[a-z0-9_-]{2,40}$/.test(candidate) ? candidate : fallback;
};

const assertAllowlistedOsmRoutingBaseUrl = (baseUrl: string): string => {
  const normalized = baseUrl.replace(/\/$/, '');
  const parsed = new URL(normalized);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('OSM routing protocol is not allowed');
  }
  const allowedHosts = new Set(
    (process.env.OSM_ROUTING_ALLOWED_HOSTS || [
      'router.project-osrm.org',
      'localhost',
      '127.0.0.1',
      'host.docker.internal',
      'osrm',
      'osrm-car',
      'osrm-motorcycle',
      'valhalla',
      'graphhopper',
      'maps-router',
    ].join(','))
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
  );
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error('OSM routing host is not allowlisted');
  }
  return normalized;
};

const assertAllowlistedGoogleRoutesUrl = (endpoint: string): string => {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('Google Routes endpoint protocol is not allowed');
  }
  const allowedHosts = new Set(
    (process.env.GOOGLE_ROUTES_ALLOWED_HOSTS || 'routes.googleapis.com,localhost,127.0.0.1,host.docker.internal')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
  );
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error('Google Routes host is not allowlisted');
  }
  return parsed.toString();
};

const resolveOpenStreetMapRouteEngine = (context: ReturnType<typeof routeContext>): OpenStreetMapRouteEngine => {
  const genericBaseUrl = envText('OSM_ROUTING_BASE_URL') || 'https://router.project-osrm.org';
  const genericProfile = sanitizeOsmRouteProfile(
    envText('OSM_ROUTING_PROFILE') || envText('OSM_ROUTING_DEFAULT_PROFILE'),
    'driving'
  );

  if (context.route_profile === 'car') {
    const baseUrl = envText('OSM_CAR_ROUTING_BASE_URL') || envText('OSM_ROUTING_CAR_BASE_URL') || genericBaseUrl;
    const profile = sanitizeOsmRouteProfile(
      envText('OSM_CAR_ROUTING_PROFILE') || envText('OSM_ROUTING_CAR_PROFILE'),
      genericProfile
    );
    return {
      baseUrl: assertAllowlistedOsmRoutingBaseUrl(baseUrl),
      profile,
      provider: `openstreetmap_osrm_${profile}_car`,
      confidence: 'high',
      fallbackReason: null,
    };
  }

  if (context.route_profile === 'motorcycle') {
    const motorcycleBaseUrl = envText('OSM_MOTORCYCLE_ROUTING_BASE_URL') || envText('OSM_ROUTING_MOTORCYCLE_BASE_URL');
    const motorcycleProfile = envText('OSM_MOTORCYCLE_ROUTING_PROFILE') || envText('OSM_ROUTING_MOTORCYCLE_PROFILE');
    const hasDedicatedMotorcyclePolicy = Boolean(motorcycleBaseUrl || motorcycleProfile);
    const profile = sanitizeOsmRouteProfile(motorcycleProfile, hasDedicatedMotorcyclePolicy ? 'motorcycle' : genericProfile);
    return {
      baseUrl: assertAllowlistedOsmRoutingBaseUrl(motorcycleBaseUrl || genericBaseUrl),
      profile,
      provider: hasDedicatedMotorcyclePolicy
        ? `openstreetmap_osrm_${profile}_motorcycle`
        : `openstreetmap_osrm_${profile}_as_motorcycle`,
      confidence: hasDedicatedMotorcyclePolicy ? 'high' : 'medium',
      fallbackReason: hasDedicatedMotorcyclePolicy ? null : 'osm_motorcycle_profile_defaulted_to_driving',
    };
  }

  return {
    baseUrl: assertAllowlistedOsmRoutingBaseUrl(genericBaseUrl),
    profile: genericProfile,
    provider: `openstreetmap_osrm_${genericProfile}_fallback`,
    confidence: 'medium',
    fallbackReason: 'osm_route_profile_unknown',
  };
};

const resolveGoogleRoutePolicy = (context: ReturnType<typeof routeContext>, overrideTravelMode?: GoogleTravelMode): GoogleRoutePolicy => {
  const serviceCode = String(context.service_code || '').toUpperCase();
  const trafficPreference: GoogleRoutingPreference =
    serviceCode.includes('PRIORITAS') || serviceCode.includes('PRIORITY') || serviceCode.includes('INSTANT')
      ? 'TRAFFIC_AWARE_OPTIMAL'
      : 'TRAFFIC_AWARE';

  if (overrideTravelMode) {
    return {
      travelMode: overrideTravelMode,
      routingPreference: trafficPreference,
      provider: `google_routes_${overrideTravelMode.toLowerCase()}_${trafficPreference.toLowerCase()}`,
      fallbackReason: overrideTravelMode === 'DRIVE' && context.route_profile === 'motorcycle'
        ? 'google_two_wheeler_unavailable_defaulted_to_drive'
        : null,
    };
  }

  if (context.route_profile === 'motorcycle' || context.vehicle_type === 'motorcycle') {
    return {
      travelMode: 'TWO_WHEELER',
      routingPreference: trafficPreference,
      provider: `google_routes_two_wheeler_${trafficPreference.toLowerCase()}`,
      fallbackReason: null,
    };
  }

  if (context.route_profile === 'car' || context.vehicle_type === 'car' || serviceCode.includes('MOBIL')) {
    return {
      travelMode: 'DRIVE',
      routingPreference: trafficPreference,
      provider: `google_routes_drive_${trafficPreference.toLowerCase()}`,
      fallbackReason: null,
    };
  }

  return {
    travelMode: 'DRIVE',
    routingPreference: trafficPreference,
    provider: `google_routes_drive_${trafficPreference.toLowerCase()}_fallback`,
    fallbackReason: 'google_route_profile_unknown_defaulted_to_drive',
  };
};

const parseGoogleDurationSeconds = (value: unknown, fallbackSeconds: number): number => {
  if (typeof value === 'string') {
    const match = value.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
    if (match) return Math.max(1, Math.ceil(Number(match[1])));
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : fallbackSeconds;
};

const googleRoutesErrorCode = (error: any): string => (
  String(error?.response?.data?.error?.status || error?.response?.data?.status || error?.code || error?.message || 'GOOGLE_ROUTES_ERROR')
);

const shouldRetryGoogleTwoWheelerAsDrive = (policy: GoogleRoutePolicy, error: any): boolean => {
  if (policy.travelMode !== 'TWO_WHEELER') return false;
  const message = JSON.stringify(error?.response?.data || error?.message || '').toUpperCase();
  return ['TWO_WHEELER', 'INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'UNIMPLEMENTED', 'NOT_FOUND'].some((marker) => message.includes(marker));
};

const parseProvider = (value: unknown, fallback: MapProviderId): MapProviderId => {
  if (value === 'open_street_map') return 'openstreetmap';
  if (value === 'text_only') return 'disabled';
  return typeof value === 'string' && VALID_PROVIDERS.has(value as MapProviderId) ? (value as MapProviderId) : fallback;
};

const redactErrorMessage = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value || 'provider_error');
  return message
    .replace(/key=([^&\s]+)/gi, 'key=[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted_google_key]')
    .slice(0, 280);
};

const sanitizeObservationText = (value: unknown, maxLength = 128): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const normalizeObservationNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const routeRequestId = (options: RouteSnapshotOptions): string => (
  sanitizeObservationText(options.requestId, 128) || crypto.randomUUID()
);

const routeObservationFields = (
  route: Partial<RouteEtaSnapshot> | null,
  context: ReturnType<typeof routeContext>,
  requestId: string
) => {
  const durationSeconds = normalizeObservationNumber(route?.duration_seconds);
  const etaMinutes = normalizeObservationNumber(route?.eta_minutes);
  return {
    request_id: requestId,
    service_code: context.service_code,
    route_profile: context.route_profile,
    vehicle_type: context.vehicle_type,
    distance_meters: normalizeObservationNumber(route?.distance_meters),
    distance_km: normalizeObservationNumber(route?.distance_km),
    duration_seconds: durationSeconds,
    duration_minutes: durationSeconds !== null ? Math.max(1, Math.ceil(durationSeconds / 60)) : etaMinutes,
    traffic_aware: route?.traffic_aware ?? false,
    confidence: route?.confidence ?? null,
  };
};

const countEvents = (predicate: (event: MapsProviderObservation) => boolean) => (
  mapsProviderOpsState.recentEvents.filter(predicate).length
);

const percentile = (values: number[], percent: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1));
  return sorted[index];
};

const incrementCounter = (key: string) => {
  mapsProviderOpsState.counters.set(key, (mapsProviderOpsState.counters.get(key) || 0) + 1);
};

export const resetMapsProviderOpsForTests = () => {
  mapsProviderOpsState.counters.clear();
  mapsProviderOpsState.latencySamples = [];
  mapsProviderOpsState.recentEvents = [];
};

export const recordMapsProviderObservation = (event: Omit<MapsProviderObservation, 'recorded_at' | 'error_message'> & { error_message?: unknown }) => {
  const normalized: MapsProviderObservation = {
    ...event,
    recorded_at: new Date().toISOString(),
    request_id: sanitizeObservationText(event.request_id, 128),
    latency_ms: Math.max(0, Math.round(event.latency_ms || 0)),
    cache_hit: Boolean(event.cache_hit),
    fallback_reason: sanitizeObservationText(event.fallback_reason, 220),
    error_message: event.error_message ? redactErrorMessage(event.error_message) : null,
    result_count: Number.isFinite(Number(event.result_count)) ? Number(event.result_count) : null,
    service_code: sanitizeObservationText(event.service_code, 80),
    route_profile: VALID_ROUTE_PROFILES.has(event.route_profile as RouteProfile) ? event.route_profile as RouteProfile : null,
    vehicle_type: VALID_VEHICLE_TYPES.has(event.vehicle_type as RouteVehicleType) ? event.vehicle_type as RouteVehicleType : null,
    distance_meters: normalizeObservationNumber(event.distance_meters),
    distance_km: normalizeObservationNumber(event.distance_km),
    duration_seconds: normalizeObservationNumber(event.duration_seconds),
    duration_minutes: normalizeObservationNumber(event.duration_minutes),
    traffic_aware: event.traffic_aware === null || event.traffic_aware === undefined ? null : Boolean(event.traffic_aware),
    confidence: ['high', 'medium', 'low'].includes(String(event.confidence)) ? event.confidence as RouteEtaSnapshot['confidence'] : null,
  };

  mapsProviderOpsState.recentEvents.unshift(normalized);
  mapsProviderOpsState.recentEvents = mapsProviderOpsState.recentEvents.slice(0, MAPS_OBSERVATION_LIMIT);
  mapsProviderOpsState.latencySamples.push(normalized.latency_ms);
  mapsProviderOpsState.latencySamples = mapsProviderOpsState.latencySamples.slice(-MAPS_OBSERVATION_LIMIT);

  incrementCounter(`operation.${normalized.operation}`);
  incrementCounter(`provider.${normalized.provider}`);
  incrementCounter(`status.${normalized.status}`);
  incrementCounter(`scope.${normalized.scope}.${normalized.status}`);
  incrementCounter(normalized.cache_hit ? 'cache.hit' : 'cache.miss');
  if (normalized.request_id) incrementCounter('request.with_id');
  if (normalized.service_code) incrementCounter(`service.${normalized.service_code}`);
  if (normalized.route_profile) incrementCounter(`route_profile.${normalized.route_profile}`);
  if (normalized.vehicle_type) incrementCounter(`vehicle.${normalized.vehicle_type}`);
  const normalizedDistanceMeters = normalized.distance_meters ?? null;
  if (
    normalized.operation === 'route' &&
    normalizedDistanceMeters !== null &&
    (normalizedDistanceMeters <= 0 || normalizedDistanceMeters > 300_000)
  ) {
    incrementCounter('route.distance_anomaly');
  }
  if (normalized.operation === 'route' && normalized.provider.includes('haversine')) {
    incrementCounter('route.straight_line_fallback');
  }

  const logPayload = {
    domain: 'maps_provider',
    request_id: normalized.request_id,
    operation: normalized.operation,
    scope: normalized.scope,
    provider: normalized.provider,
    status: normalized.status,
    latency_ms: normalized.latency_ms,
    cache_hit: normalized.cache_hit,
    service_code: normalized.service_code,
    route_profile: normalized.route_profile,
    vehicle_type: normalized.vehicle_type,
    distance_meters: normalized.distance_meters,
    duration_seconds: normalized.duration_seconds,
    fallback_reason: normalized.fallback_reason,
    event: normalized,
  };
  if (normalized.status === 'failure') {
    console.error(JSON.stringify(logPayload));
    return;
  }
  if (normalized.status === 'fallback' || normalized.status === 'disabled') {
    console.warn(JSON.stringify(logPayload));
    return;
  }
  console.info(JSON.stringify(logPayload));
};

export const normalizeMapsProviderConfig = (value?: Partial<MapsProviderConfigValue> | null): MapsProviderConfigValue => {
  const normalized: MapsProviderConfigValue = {
    ...DEFAULT_CONFIG,
    ...value,
    active_provider: parseProvider(value?.active_provider, DEFAULT_CONFIG.active_provider),
    fallback_provider: parseProvider(value?.fallback_provider, DEFAULT_CONFIG.fallback_provider),
    config_ttl_seconds: Math.max(30, Math.min(3600, toNumber(value?.config_ttl_seconds, DEFAULT_CONFIG.config_ttl_seconds))),
    scopes: {
      ...DEFAULT_CONFIG.scopes,
      ...(value?.scopes || {}),
    },
    providers: {
      google_maps: {
        ...DEFAULT_CONFIG.providers.google_maps,
        ...(value?.providers?.google_maps || {}),
      },
      openstreetmap: {
        ...DEFAULT_CONFIG.providers.openstreetmap,
        ...(value?.providers?.openstreetmap || {}),
      },
    },
  };

  for (const scope of Object.keys(normalized.scopes)) {
    const scoped = normalized.scopes[scope];
    normalized.scopes[scope] = {
      enabled: scoped?.enabled !== false,
      provider: parseProvider(scoped?.provider, normalized.active_provider),
    };
  }

  return normalized;
};

export const resolvePublicMapsProviderConfig = (
  rawConfig: MapsProviderConfigValue,
  requestedScope: string | undefined,
  options: { googleKeyAvailable?: boolean } = {}
): PublicMapsProviderConfig => {
  const normalized = normalizeMapsProviderConfig(rawConfig);
  const scope = VALID_SCOPES.has(requestedScope as MapProviderScope) ? (requestedScope as MapProviderScope) : 'global';
  const scopedConfig = normalized.scopes[scope] || normalized.scopes.global;
  const requestedProvider = scopedConfig?.provider || normalized.active_provider;
  const googleAvailable = options.googleKeyAvailable ?? googleServerKeyAvailable();

  let activeProvider: MapProviderId = normalized.enabled && scopedConfig?.enabled !== false ? requestedProvider : 'disabled';
  let reason: string | null = null;

  if (activeProvider === 'google_maps' && (!normalized.google_maps_enabled || !googleAvailable)) {
    activeProvider = normalized.openstreetmap_enabled ? 'openstreetmap' : 'disabled';
    reason = googleAvailable ? 'google_maps_disabled_by_admin' : 'google_maps_server_key_missing';
  }

  if (activeProvider === 'openstreetmap' && !normalized.openstreetmap_enabled) {
    activeProvider = normalized.disabled_mode_enabled ? 'disabled' : normalized.fallback_provider;
    reason = 'openstreetmap_disabled_by_admin';
  }

  if (!normalized.enabled || activeProvider === 'disabled') {
    activeProvider = 'disabled';
    reason = reason || 'maps_disabled_by_admin';
  }

  const osm = normalized.providers.openstreetmap || DEFAULT_CONFIG.providers.openstreetmap;
  return {
    enabled: activeProvider !== 'disabled',
    requested_provider: requestedProvider,
    active_provider: activeProvider,
    fallback_provider: normalized.fallback_provider,
    scope,
    ttl_seconds: normalized.config_ttl_seconds,
    reason,
    capabilities: {
      tiles: activeProvider === 'google_maps' || (activeProvider === 'openstreetmap' && Boolean(osm?.tile_url_template)),
      routing: activeProvider === 'google_maps' || (activeProvider === 'openstreetmap' && osm?.routing_enabled !== false),
      geocoding: activeProvider === 'google_maps' || (activeProvider === 'openstreetmap' && osm?.geocoding_enabled !== false),
    },
    openstreetmap: {
      tile_url_template: activeProvider === 'openstreetmap' ? osm?.tile_url_template || null : null,
      attribution: activeProvider === 'openstreetmap' ? osm?.attribution || null : null,
    },
  };
};

export const getMapsProviderConfigValue = async (): Promise<MapsProviderConfigValue> => {
  const queryClient = readDb;
  if (!queryClient?.query) {
    return normalizeMapsProviderConfig({
      ...DEFAULT_CONFIG,
      active_provider: 'google_maps',
      fallback_provider: 'disabled',
      google_maps_enabled: googleServerKeyAvailable(),
      openstreetmap_enabled: false,
      scopes: {
        ...DEFAULT_CONFIG.scopes,
        global: { enabled: true, provider: 'google_maps' },
        customer_mobile: { enabled: true, provider: 'google_maps' },
        courier_mobile: { enabled: true, provider: 'google_maps' },
        web_customer: { enabled: true, provider: 'google_maps' },
        tracking: { enabled: true, provider: 'google_maps' },
      },
    });
  }
  const result = await queryClient.query('SELECT value FROM system_configs WHERE key = $1 LIMIT 1', ['maps_provider_config']);
  if (result.rows[0]?.value) {
    return normalizeMapsProviderConfig(result.rows[0].value);
  }
  return normalizeMapsProviderConfig({
    ...DEFAULT_CONFIG,
    active_provider: 'google_maps',
    fallback_provider: 'disabled',
    google_maps_enabled: googleServerKeyAvailable(),
    openstreetmap_enabled: false,
    scopes: {
      ...DEFAULT_CONFIG.scopes,
      global: { enabled: true, provider: 'google_maps' },
      customer_mobile: { enabled: true, provider: 'google_maps' },
      courier_mobile: { enabled: true, provider: 'google_maps' },
      web_customer: { enabled: true, provider: 'google_maps' },
      tracking: { enabled: true, provider: 'google_maps' },
    },
  });
};

export const getPublicMapsProviderConfig = async (scope?: string): Promise<PublicMapsProviderConfig> => {
  const config = await getMapsProviderConfigValue();
  return resolvePublicMapsProviderConfig(config, scope);
};

export const getMapsProviderOpsSnapshot = async (): Promise<MapsProviderOpsSnapshot> => {
  const config = await getMapsProviderConfigValue();
  const normalized = normalizeMapsProviderConfig(config);
  const counters = Object.fromEntries(mapsProviderOpsState.counters.entries());
  const failures = countEvents((event) => event.status === 'failure' || (event.status === 'fallback' && Boolean(event.error_message)));
  const fallbacks = countEvents((event) => event.status === 'fallback');
  const osmFallbacks = countEvents((event) => event.status === 'fallback' && event.active_provider === 'openstreetmap');
  const haversineFallbacks = countEvents((event) => event.provider.includes('haversine'));
  const routeEvents = countEvents((event) => event.operation === 'route');
  const roadRouteSuccesses = countEvents((event) => event.operation === 'route' && ['success', 'cache_hit'].includes(event.status) && !event.provider.includes('haversine'));
  const distanceAnomalies = countEvents((event) => (
    event.operation === 'route' &&
    event.distance_meters !== null &&
    event.distance_meters !== undefined &&
    (event.distance_meters <= 0 || event.distance_meters > 300_000)
  ));
  const straightLineFallbacks = countEvents((event) => event.operation === 'route' && event.provider.includes('haversine'));
  const disabledEvents = countEvents((event) => event.status === 'disabled');
  const averageMs = mapsProviderOpsState.latencySamples.length === 0
    ? 0
    : Math.round(mapsProviderOpsState.latencySamples.reduce((sum, item) => sum + item, 0) / mapsProviderOpsState.latencySamples.length);
  const p95Ms = percentile(mapsProviderOpsState.latencySamples, 95);
  const quotaValue = process.env.GOOGLE_MAPS_QUOTA_REMAINING_PERCENT || process.env.MAPS_PROVIDER_QUOTA_REMAINING_PERCENT;
  const quotaRemaining = quotaValue === undefined ? null : Number(quotaValue);
  const googleQuotaPercent = Number.isFinite(quotaRemaining) ? Number(quotaRemaining) : null;
  const cacheHits = counters['cache.hit'] || 0;
  const cacheMisses = counters['cache.miss'] || 0;
  const cacheTotal = cacheHits + cacheMisses;
  const cacheHitRatePercent = cacheTotal > 0 ? Math.round((cacheHits / cacheTotal) * 100) : 0;

  const activeAlerts: MapsProviderOpsSnapshot['active_alerts'] = [];
  if (!normalized.enabled || normalized.active_provider === 'disabled' || disabledEvents > 0) {
    activeAlerts.push({
      code: 'maps_disabled_mode_active',
      severity: normalized.enabled ? 'info' : 'warning',
      message: 'Maps disabled mode aktif untuk minimal satu scope. Client tetap memakai text ETA dan koordinat.',
    });
  }
  if (failures >= 3) {
    activeAlerts.push({
      code: 'maps_provider_failure_high',
      severity: 'critical',
      message: 'Kegagalan provider maps tinggi. Cek key, quota, timeout, dan konektivitas provider.',
    });
  }
  if (fallbacks >= 5 || osmFallbacks >= 5) {
    activeAlerts.push({
      code: 'maps_fallback_rate_high',
      severity: 'warning',
      message: 'Fallback maps terlalu sering. Google/OSM mungkin tidak stabil atau policy provider salah.',
    });
  }
  if (routeEvents >= 3 && straightLineFallbacks / routeEvents >= 0.5) {
    activeAlerts.push({
      code: 'maps_straight_line_fallback_high',
      severity: 'warning',
      message: 'Straight-line ETA terlalu sering dipakai. Routing jalan perlu dipulihkan sebelum traffic produksi dinaikkan.',
    });
  }
  if (distanceAnomalies > 0) {
    activeAlerts.push({
      code: 'maps_distance_anomaly_detected',
      severity: 'warning',
      message: 'Ada route dengan jarak tidak wajar. Audit koordinat, profile kendaraan, dan provider route.',
    });
  }
  if (p95Ms >= 2000) {
    activeAlerts.push({
      code: 'maps_latency_high',
      severity: 'warning',
      message: 'Latency provider maps tinggi. Mobile/web bisa terasa lambat saat memuat route atau geocode.',
    });
  }
  if (googleQuotaPercent !== null && googleQuotaPercent <= 10) {
    activeAlerts.push({
      code: 'google_maps_quota_near_limit',
      severity: 'critical',
      message: 'Quota Google Maps mendekati limit. Pertimbangkan fallback OSM atau tambah quota sebelum traffic nasional.',
    });
  }

  const hasCriticalAlert = activeAlerts.some((alert) => alert.severity === 'critical');
  const hasWarningAlert = activeAlerts.some((alert) => alert.severity === 'warning');
  const status: MapsProviderOpsSnapshot['status'] = !normalized.enabled || normalized.active_provider === 'disabled'
    ? 'disabled'
    : hasCriticalAlert
      ? 'critical'
      : hasWarningAlert
        ? 'degraded'
        : 'operational';

  return {
    generated_at: new Date().toISOString(),
    status,
    active_alerts: activeAlerts,
    active_config: {
      enabled: normalized.enabled,
      active_provider: normalized.active_provider,
      fallback_provider: normalized.fallback_provider,
      google_maps_enabled: normalized.google_maps_enabled,
      openstreetmap_enabled: normalized.openstreetmap_enabled,
    },
    counters,
    latency: {
      sample_count: mapsProviderOpsState.latencySamples.length,
      average_ms: averageMs,
      p95_ms: p95Ms,
    },
    cache: {
      hits: cacheHits,
      misses: cacheMisses,
    },
    fallback: {
      total: fallbacks,
      osm_fallbacks: osmFallbacks,
      haversine_fallbacks: haversineFallbacks,
    },
    route_quality: {
      route_events: routeEvents,
      road_route_successes: roadRouteSuccesses,
      distance_anomalies: distanceAnomalies,
      straight_line_fallbacks: straightLineFallbacks,
      cache_hit_rate_percent: cacheHitRatePercent,
    },
    last_error: mapsProviderOpsState.recentEvents.find((event) => event.status === 'failure' || event.status === 'fallback') || null,
    recent_events: mapsProviderOpsState.recentEvents.slice(0, 20),
    quota: {
      google_remaining_percent: googleQuotaPercent,
      status: googleQuotaPercent === null ? 'not_configured' : googleQuotaPercent <= 10 ? 'near_limit' : 'healthy',
    },
  };
};

export const updateMapsProviderConfigValue = async (patch: Partial<MapsProviderConfigValue>) => {
  const current = await getMapsProviderConfigValue();
  const next = normalizeMapsProviderConfig({
    ...current,
    ...patch,
    scopes: {
      ...current.scopes,
      ...(patch.scopes || {}),
    },
    providers: {
      ...current.providers,
      ...(patch.providers || {}),
    },
  });

  if (!VALID_PROVIDERS.has(next.active_provider) || !VALID_PROVIDERS.has(next.fallback_provider)) {
    throw new Error('Invalid maps provider selected');
  }

  await db.query(
    `INSERT INTO system_configs (key, value, description, category, updated_at)
     VALUES ($1, $2::jsonb, $3, 'maps', NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, category = EXCLUDED.category, updated_at = NOW()`,
    [
      'maps_provider_config',
      JSON.stringify(next),
      'Runtime maps provider policy for web, customer mobile, and courier mobile clients.',
    ]
  );

  recordMapsProviderObservation({
    operation: 'config',
    scope: 'global',
    requested_provider: next.active_provider,
    active_provider: next.active_provider,
    provider: next.active_provider,
    status: next.active_provider === 'disabled' || !next.enabled ? 'disabled' : 'success',
    latency_ms: 0,
    cache_hit: false,
    fallback_reason: next.active_provider === 'disabled' || !next.enabled ? 'admin_runtime_policy_update' : null,
  });

  return next;
};

const enrichRouteSnapshot = (
  route: Partial<RouteEtaSnapshot>,
  fallback: RouteEtaSnapshot,
  providerConfig: PublicMapsProviderConfig,
  context: ReturnType<typeof routeContext>,
  confidence: RouteEtaSnapshot['confidence']
): RouteEtaSnapshot => ({
  generated_at: new Date().toISOString(),
  eta: route.eta ?? fallback.eta,
  eta_minutes: route.eta_minutes ?? fallback.eta_minutes,
  distance_km: Number((route.distance_km ?? fallback.distance_km).toFixed(2)),
  distance_meters: Math.max(1, Math.round(route.distance_meters ?? ((route.distance_km ?? fallback.distance_km) * 1000))),
  duration_seconds: route.duration_seconds ?? (((route.eta_minutes ?? fallback.eta_minutes) || 0) * 60),
  route_polyline: route.route_polyline ?? null,
  route_geometry: route.route_geometry ?? (route.route_polyline ?? null),
  provider: route.provider || fallback.provider,
  requested_provider: providerConfig.requested_provider,
  active_provider: providerConfig.active_provider,
  scope: context.scope,
  route_profile: context.route_profile,
  vehicle_type: context.vehicle_type,
  service_code: context.service_code,
  traffic_aware: Boolean(route.traffic_aware),
  confidence,
  fallback_reason: route.fallback_reason ?? null,
});

const googleRoutesEndpoint = () => assertAllowlistedGoogleRoutesUrl(
  envText('GOOGLE_ROUTES_API_URL') || 'https://routes.googleapis.com/directions/v2:computeRoutes'
);

const googleRoutesTimeoutMs = () => {
  const parsed = Number(process.env.GOOGLE_ROUTES_TIMEOUT_MS || process.env.GOOGLE_DIRECTIONS_TIMEOUT_MS || 2800);
  return Number.isFinite(parsed) && parsed >= 500 && parsed <= 15000 ? parsed : 2800;
};

const osmRoutingTimeoutMs = () => {
  const parsed = Number(process.env.OSM_ROUTING_TIMEOUT_MS || 6000);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 20000 ? parsed : 6000;
};

const routeHasRoadGeometry = (route: RouteEtaSnapshot): boolean => {
  const encodedRoute = typeof route.route_polyline === 'string' ? route.route_polyline.trim() : '';
  return encodedRoute.length > 0 && !route.provider.includes('haversine') && route.distance_meters > 0;
};

const buildRoadRouteRequiredError = (reason?: string | null) => {
  const error = new Error(
    'Rute jalan belum tersedia dari provider peta. Harga tidak dihitung dari garis lurus agar tarif tetap akurat.'
  );
  (error as any).statusCode = 422;
  (error as any).code = 'ERR_ROAD_ROUTE_REQUIRED';
  (error as any).fallbackReason = reason || 'road_route_required';
  return error;
};

const googleRouteFieldMask = [
  'routes.duration',
  'routes.staticDuration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.travelAdvisory',
  'routes.routeLabels',
  'routes.warnings',
].join(',');

const googleLegacyDirectionsMode = (policy: GoogleRoutePolicy) => (
  policy.travelMode === 'TWO_WHEELER' ? 'two-wheeler' : 'driving'
);

const buildGoogleRoutesPayload = (from: MapPoint, to: MapPoint, policy: GoogleRoutePolicy) => ({
  origin: {
    location: {
      latLng: {
        latitude: from.latitude,
        longitude: from.longitude,
      },
    },
  },
  destination: {
    location: {
      latLng: {
        latitude: to.latitude,
        longitude: to.longitude,
      },
    },
  },
  travelMode: policy.travelMode,
  routingPreference: policy.routingPreference,
  computeAlternativeRoutes: false,
  polylineQuality: 'OVERVIEW',
  polylineEncoding: 'ENCODED_POLYLINE',
  languageCode: 'id-ID',
  units: 'METRIC',
});

const routeFromGoogleRoutesApi = async (
  from: MapPoint,
  to: MapPoint,
  fallback: RouteEtaSnapshot,
  providerConfig: PublicMapsProviderConfig,
  context: ReturnType<typeof routeContext>,
  apiKey: string,
  policy: GoogleRoutePolicy
): Promise<RouteEtaSnapshot> => {
  const response = await axios.post(googleRoutesEndpoint(), buildGoogleRoutesPayload(from, to, policy), {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': googleRouteFieldMask,
    },
    timeout: googleRoutesTimeoutMs(),
  });
  const route = response.data?.routes?.[0];
  const distanceMeters = Number(route?.distanceMeters);
  const routePolyline = String(route?.polyline?.encodedPolyline || '').trim();
  if (!route) throw new Error('GOOGLE_ROUTES_NO_ROUTE');
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error('GOOGLE_ROUTES_DISTANCE_INVALID');
  if (!routePolyline) throw new Error('GOOGLE_ROUTES_POLYLINE_MISSING');

  const durationSeconds = parseGoogleDurationSeconds(
    route.duration,
    parseGoogleDurationSeconds(route.staticDuration, (fallback.eta_minutes || 3) * 60)
  );
  return enrichRouteSnapshot({
    eta: `${Math.max(1, Math.ceil(durationSeconds / 60))} menit`,
    eta_minutes: Math.max(1, Math.ceil(durationSeconds / 60)),
    distance_km: Number((distanceMeters / 1000).toFixed(2)),
    distance_meters: distanceMeters,
    duration_seconds: durationSeconds,
    route_polyline: routePolyline,
    route_geometry: routePolyline,
    provider: policy.provider,
    traffic_aware: true,
    fallback_reason: policy.fallbackReason,
  }, fallback, providerConfig, context, policy.fallbackReason ? 'medium' : 'high');
};

const routeFromGoogleLegacyDirections = async (
  from: MapPoint,
  to: MapPoint,
  fallback: RouteEtaSnapshot,
  providerConfig: PublicMapsProviderConfig,
  context: ReturnType<typeof routeContext>,
  apiKey: string,
  policy: GoogleRoutePolicy,
  fallbackReason: string | null
): Promise<RouteEtaSnapshot> => {
  const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
    params: {
      origin: `${from.latitude},${from.longitude}`,
      destination: `${to.latitude},${to.longitude}`,
      mode: googleLegacyDirectionsMode(policy),
      departure_time: 'now',
      traffic_model: policy.routingPreference === 'TRAFFIC_AWARE_OPTIMAL' ? 'best_guess' : 'optimistic',
      key: apiKey,
    },
    timeout: googleRoutesTimeoutMs(),
  });
  const route = response.data?.routes?.[0];
  const leg = route?.legs?.[0];
  const distanceMeters = Number(leg?.distance?.value);
  const routePolyline = String(route?.overview_polyline?.points || '').trim();
  if (!route || !leg) throw new Error(response.data?.status || 'GOOGLE_DIRECTIONS_NO_ROUTE');
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error('GOOGLE_DIRECTIONS_DISTANCE_INVALID');
  if (!routePolyline) throw new Error('GOOGLE_DIRECTIONS_POLYLINE_MISSING');

  const durationSeconds = Number(leg.duration_in_traffic?.value || leg.duration?.value || (fallback.eta_minutes || 3) * 60);
  return enrichRouteSnapshot({
    eta: leg.duration_in_traffic?.text || leg.duration?.text || `${Math.max(1, Math.ceil(durationSeconds / 60))} menit`,
    eta_minutes: Math.max(1, Math.ceil(durationSeconds / 60)),
    distance_km: Number((distanceMeters / 1000).toFixed(2)),
    distance_meters: distanceMeters,
    duration_seconds: durationSeconds,
    route_polyline: routePolyline,
    route_geometry: routePolyline,
    provider: `google_directions_${googleLegacyDirectionsMode(policy)}_legacy`,
    traffic_aware: Boolean(leg.duration_in_traffic?.value || policy.routingPreference),
    fallback_reason: fallbackReason,
  }, fallback, providerConfig, context, fallbackReason ? 'medium' : 'high');
};

const buildGoogleRoute = async (
  from: MapPoint,
  to: MapPoint,
  fallback: RouteEtaSnapshot,
  providerConfig: PublicMapsProviderConfig,
  context: ReturnType<typeof routeContext>
): Promise<RouteEtaSnapshot> => {
  const apiKey = googleServerApiKey();
  if (!apiKey) {
    return enrichRouteSnapshot(
      { ...fallback, provider: 'fallback_haversine', fallback_reason: 'google_maps_server_key_missing' },
      fallback,
      providerConfig,
      context,
      'low'
    );
  }

  const initialPolicy = resolveGoogleRoutePolicy(context);
  const cacheKey = routeCacheKey(initialPolicy.provider, from, to, context);
  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    return { ...parsed, provider: `${parsed.provider || initialPolicy.provider}_cache` };
  }

  let payload: RouteEtaSnapshot;
  try {
    payload = await routeFromGoogleRoutesApi(from, to, fallback, providerConfig, context, apiKey, initialPolicy);
  } catch (routesError: any) {
    if (shouldRetryGoogleTwoWheelerAsDrive(initialPolicy, routesError)) {
      const drivePolicy = resolveGoogleRoutePolicy(context, 'DRIVE');
      try {
        payload = await routeFromGoogleRoutesApi(from, to, fallback, providerConfig, context, apiKey, drivePolicy);
      } catch (driveRoutesError: any) {
        if (String(process.env.GOOGLE_DIRECTIONS_LEGACY_FALLBACK_DISABLED || '').toLowerCase() === 'true') {
          throw driveRoutesError;
        }
        const fallbackReason = `google_two_wheeler_unavailable_drive_legacy_used:${googleRoutesErrorCode(driveRoutesError)}`;
        payload = await routeFromGoogleLegacyDirections(
          from,
          to,
          fallback,
          providerConfig,
          context,
          apiKey,
          drivePolicy,
          fallbackReason
        );
      }
    } else if (String(process.env.GOOGLE_DIRECTIONS_LEGACY_FALLBACK_DISABLED || '').toLowerCase() === 'true') {
      throw routesError;
    } else {
      const fallbackReason = `google_routes_api_unavailable_legacy_directions_used:${googleRoutesErrorCode(routesError)}`;
      payload = await routeFromGoogleLegacyDirections(
        from,
        to,
        fallback,
        providerConfig,
        context,
        apiKey,
        initialPolicy,
        fallbackReason
      );
    }
  }
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 60);
  return payload;
};

const buildOpenStreetMapRoute = async (
  from: MapPoint,
  to: MapPoint,
  fallback: RouteEtaSnapshot,
  providerConfig: PublicMapsProviderConfig,
  context: ReturnType<typeof routeContext>
): Promise<RouteEtaSnapshot> => {
  const engine = resolveOpenStreetMapRouteEngine(context);
  const cacheKey = routeCacheKey(engine.provider, from, to, context);
  const cached = await redis.get(cacheKey);
  if (cached) return { ...JSON.parse(cached), provider: `${engine.provider}_cache` };

  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const response = await axios.get(`${engine.baseUrl}/route/v1/${engine.profile}/${coordinates}`, {
    params: {
      overview: 'full',
      geometries: 'polyline',
      steps: false,
    },
    headers: {
      'User-Agent': process.env.OSM_USER_AGENT || 'LANCAR-Logistics/1.0 maps-runtime',
    },
    timeout: osmRoutingTimeoutMs(),
  });

  const route = response.data?.routes?.[0];
  if (!route) throw new Error(response.data?.code || 'OSM_NO_ROUTE');

  const geometry = typeof route.geometry === 'string' ? route.geometry.trim() : '';
  if (!geometry) throw new Error('OSM_ROUTE_GEOMETRY_MISSING');

  const durationSeconds = Number(route.duration);
  const distanceMeters = Number(route.distance);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('OSM_ROUTE_DURATION_INVALID');
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error('OSM_ROUTE_DISTANCE_INVALID');

  const payload: RouteEtaSnapshot = enrichRouteSnapshot({
    eta: `${Math.max(1, Math.ceil(durationSeconds / 60))} menit`,
    eta_minutes: Math.max(1, Math.ceil(durationSeconds / 60)),
    distance_km: Number((distanceMeters / 1000).toFixed(2)),
    distance_meters: distanceMeters,
    duration_seconds: durationSeconds,
    route_polyline: geometry,
    route_geometry: geometry,
    provider: engine.provider,
    fallback_reason: engine.fallbackReason,
  }, fallback, providerConfig, context, engine.confidence);
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 60);
  return payload;
};

export const buildMapsRouteEtaSnapshot = async (
  from: MapPoint | null,
  to: MapPoint | null,
  scope: MapProviderScope = 'tracking',
  options: RouteSnapshotOptions = {}
): Promise<RouteEtaSnapshot> => {
  const startedAt = Date.now();
  const context = routeContext(scope, options);
  const requestId = routeRequestId(options);
  if (!from || !to) {
    const emptyRoute: RouteEtaSnapshot = {
      generated_at: new Date().toISOString(),
      eta: null,
      eta_minutes: null,
      distance_km: 0,
      distance_meters: 0,
      duration_seconds: null,
      route_polyline: null,
      route_geometry: null,
      provider: 'none',
      requested_provider: 'disabled',
      active_provider: 'disabled',
      scope,
      route_profile: context.route_profile,
      vehicle_type: context.vehicle_type,
      service_code: context.service_code,
      traffic_aware: false,
      confidence: 'low',
      fallback_reason: 'missing_coordinates',
    };
    recordMapsProviderObservation({
      operation: 'route',
      scope,
      requested_provider: 'disabled',
      active_provider: 'disabled',
      provider: 'none',
      status: 'disabled',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      fallback_reason: 'missing_coordinates',
      ...routeObservationFields(emptyRoute, context, requestId),
    });
    return emptyRoute;
  }

  const fallback = fallbackRoute(from, to, 'fallback_haversine', null, context);
  const providerConfig = await getPublicMapsProviderConfig(scope);

  if (providerConfig.active_provider === 'disabled') {
    const provider = providerConfig.requested_provider === 'disabled' && providerConfig.reason === 'maps_disabled_by_admin'
      ? 'disabled_haversine'
      : 'fallback_haversine';
    const disabledRoute = enrichRouteSnapshot(
      { ...fallback, provider, fallback_reason: providerConfig.reason || 'maps_disabled' },
      fallback,
      providerConfig,
      context,
      'low'
    );
    recordMapsProviderObservation({
      operation: 'route',
      scope,
      requested_provider: providerConfig.requested_provider,
      active_provider: providerConfig.active_provider,
      provider,
      status: 'disabled',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      fallback_reason: providerConfig.reason || 'maps_disabled',
      ...routeObservationFields(disabledRoute, context, requestId),
    });
    return disabledRoute;
  }

  try {
    let route = fallback;
    if (providerConfig.active_provider === 'google_maps') {
      route = await buildGoogleRoute(from, to, fallback, providerConfig, context);
    } else if (providerConfig.active_provider === 'openstreetmap') {
      route = await buildOpenStreetMapRoute(from, to, fallback, providerConfig, context);
    }
    const cacheHit = route.provider.endsWith('_cache');
    const isFallback = route.provider.includes('fallback') || Boolean(route.fallback_reason);
    if (options.requireRoadRoute && !routeHasRoadGeometry(route)) {
      throw buildRoadRouteRequiredError(route.fallback_reason || route.provider);
    }
    recordMapsProviderObservation({
      operation: 'route',
      scope,
      requested_provider: providerConfig.requested_provider,
      active_provider: providerConfig.active_provider,
      provider: route.provider,
      status: cacheHit ? 'cache_hit' : isFallback ? 'fallback' : 'success',
      latency_ms: Date.now() - startedAt,
      cache_hit: cacheHit,
      fallback_reason: route.fallback_reason || null,
      ...routeObservationFields(route, context, requestId),
    });
    return route;
  } catch (error: any) {
    const fallbackPayload = enrichRouteSnapshot(
      {
        ...fallback,
        provider: `${providerConfig.active_provider}_fallback_haversine`,
        fallback_reason: error?.message || 'route_provider_failed',
      },
      fallback,
      providerConfig,
      context,
      'low'
    );
    recordMapsProviderObservation({
      operation: 'route',
      scope,
      requested_provider: providerConfig.requested_provider,
      active_provider: providerConfig.active_provider,
      provider: `${providerConfig.active_provider}_fallback_haversine`,
      status: 'fallback',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      fallback_reason: error?.message || 'route_provider_failed',
      error_message: error,
      ...routeObservationFields(fallbackPayload, context, requestId),
    });
    if (options.requireRoadRoute) {
      throw buildRoadRouteRequiredError(error?.message || 'route_provider_failed');
    }
    return fallbackPayload;
  }
};

export const geocodeAddress = async (query: string, scope: MapProviderScope = 'web_customer'): Promise<MapsGeocodeResult[]> => {
  const startedAt = Date.now();
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3) return [];

  const providerConfig = await getPublicMapsProviderConfig(scope);
  if (providerConfig.active_provider === 'disabled') {
    recordMapsProviderObservation({
      operation: 'geocode',
      scope,
      requested_provider: providerConfig.requested_provider,
      active_provider: providerConfig.active_provider,
      provider: 'disabled_geocode',
      status: 'disabled',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      fallback_reason: providerConfig.reason || 'maps_disabled',
      result_count: 0,
    });
    return [];
  }

  try {
    let results: MapsGeocodeResult[] = [];
    if (providerConfig.active_provider === 'google_maps') {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY;
      if (!apiKey) throw new Error('google_maps_server_key_missing');
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address: normalizedQuery,
          key: apiKey,
        },
        timeout: 2500,
      });
      results = (response.data?.results || []).slice(0, 8).map((item: any) => ({
        label: item.formatted_address,
        latitude: Number(item.geometry?.location?.lat),
        longitude: Number(item.geometry?.location?.lng),
        provider: 'google_geocoding',
        confidence: null,
      })).filter((item: MapsGeocodeResult) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    } else {
      const baseUrl = process.env.OSM_GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org';
      const response = await axios.get(`${baseUrl.replace(/\/$/, '')}/search`, {
        params: {
          q: normalizedQuery,
          format: 'jsonv2',
          limit: 8,
          addressdetails: 1,
        },
        headers: {
          'User-Agent': process.env.OSM_USER_AGENT || 'LANCAR-Logistics/1.0 maps-runtime',
        },
        timeout: 2500,
      });
      results = (response.data || []).map((item: any) => ({
        label: item.display_name,
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        provider: 'openstreetmap_nominatim',
        confidence: item.importance ? Number(item.importance) : null,
      })).filter((item: MapsGeocodeResult) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    }
    recordMapsProviderObservation({
      operation: 'geocode',
      scope,
      requested_provider: providerConfig.requested_provider,
      active_provider: providerConfig.active_provider,
      provider: providerConfig.active_provider === 'google_maps' ? 'google_geocoding' : 'openstreetmap_nominatim',
      status: 'success',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      result_count: results.length,
    });
    return results;
  } catch (error) {
    recordMapsProviderObservation({
      operation: 'geocode',
      scope,
      requested_provider: providerConfig.requested_provider,
      active_provider: providerConfig.active_provider,
      provider: `${providerConfig.active_provider}_geocode_failed`,
      status: 'failure',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      fallback_reason: 'geocode_provider_failed',
      error_message: error,
      result_count: 0,
    });
    return [];
  }
};

export const reverseGeocodePoint = async (point: MapPoint, scope: MapProviderScope = 'web_customer'): Promise<MapsGeocodeResult | null> => {
  const startedAt = Date.now();
  if (![point.latitude, point.longitude].every(Number.isFinite)) return null;

  const providerConfig = await getPublicMapsProviderConfig(scope);
  if (providerConfig.active_provider === 'disabled') {
    recordMapsProviderObservation({
      operation: 'reverse_geocode',
      scope,
      requested_provider: providerConfig.requested_provider,
      active_provider: providerConfig.active_provider,
      provider: 'disabled_reverse_geocode',
      status: 'disabled',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      fallback_reason: providerConfig.reason || 'maps_disabled',
      result_count: 0,
    });
    return null;
  }

  try {
    let result: MapsGeocodeResult | null = null;
    if (providerConfig.active_provider === 'google_maps') {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY;
      if (!apiKey) throw new Error('google_maps_server_key_missing');
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          latlng: `${point.latitude},${point.longitude}`,
          key: apiKey,
        },
        timeout: 2500,
      });
      const item = response.data?.results?.[0];
      if (!item) return null;
      result = {
        label: item.formatted_address,
        latitude: point.latitude,
        longitude: point.longitude,
        provider: 'google_reverse_geocoding',
        confidence: null,
      };
    } else {
      const baseUrl = process.env.OSM_GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org';
      const response = await axios.get(`${baseUrl.replace(/\/$/, '')}/reverse`, {
        params: {
          lat: point.latitude,
          lon: point.longitude,
          format: 'jsonv2',
          zoom: 18,
          addressdetails: 1,
        },
        headers: {
          'User-Agent': process.env.OSM_USER_AGENT || 'LANCAR-Logistics/1.0 maps-runtime',
        },
        timeout: 2500,
      });
      if (!response.data?.display_name) return null;
      result = {
        label: response.data.display_name,
        latitude: point.latitude,
        longitude: point.longitude,
        provider: 'openstreetmap_reverse_nominatim',
        confidence: response.data.importance ? Number(response.data.importance) : null,
      };
    }
    recordMapsProviderObservation({
      operation: 'reverse_geocode',
      scope,
      requested_provider: providerConfig.requested_provider,
      active_provider: providerConfig.active_provider,
      provider: result.provider,
      status: 'success',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      result_count: 1,
    });
    return result;
  } catch (error) {
    recordMapsProviderObservation({
      operation: 'reverse_geocode',
      scope,
      requested_provider: providerConfig.requested_provider,
      active_provider: providerConfig.active_provider,
      provider: `${providerConfig.active_provider}_reverse_geocode_failed`,
      status: 'failure',
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      fallback_reason: 'reverse_geocode_provider_failed',
      error_message: error,
      result_count: 0,
    });
    return null;
  }
};
