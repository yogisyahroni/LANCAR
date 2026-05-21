import axios from 'axios';
import crypto from 'crypto';
import { db, readDb } from '../db';
import { redis } from '../redis';

export type MapProviderId = 'google_maps' | 'openstreetmap' | 'disabled';
export type MapProviderScope = 'global' | 'customer_mobile' | 'courier_mobile' | 'web_customer' | 'tracking';

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
  eta: string | null;
  eta_minutes: number | null;
  distance_km: number;
  route_polyline: string | null;
  provider: string;
  fallback_reason?: string | null;
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
const MAPS_OBSERVATION_LIMIT = 200;

const mapsProviderOpsState = {
  counters: new Map<string, number>(),
  latencySamples: [] as number[],
  recentEvents: [] as MapsProviderObservation[],
};

const googleServerKeyAvailable = () => Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY);

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

const fallbackRoute = (from: MapPoint, to: MapPoint, provider: string, fallbackReason?: string | null): RouteEtaSnapshot => {
  const distance = distanceKm(from, to);
  const etaMinutes = Math.max(3, Math.ceil((distance / 24) * 60));
  return {
    eta: `${etaMinutes} menit`,
    eta_minutes: etaMinutes,
    distance_km: Number(distance.toFixed(2)),
    route_polyline: null,
    provider,
    fallback_reason: fallbackReason || null,
  };
};

const routeCacheKey = (provider: string, from: MapPoint, to: MapPoint) => {
  const raw = [
    provider,
    from.latitude.toFixed(5),
    from.longitude.toFixed(5),
    to.latitude.toFixed(5),
    to.longitude.toFixed(5),
  ].join(':');
  return `route:on-demand:${crypto.createHash('sha1').update(raw).digest('hex')}`;
};

const parseProvider = (value: unknown, fallback: MapProviderId): MapProviderId => {
  return typeof value === 'string' && VALID_PROVIDERS.has(value as MapProviderId) ? (value as MapProviderId) : fallback;
};

const redactErrorMessage = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value || 'provider_error');
  return message
    .replace(/key=([^&\s]+)/gi, 'key=[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted_google_key]')
    .slice(0, 280);
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
    latency_ms: Math.max(0, Math.round(event.latency_ms || 0)),
    cache_hit: Boolean(event.cache_hit),
    fallback_reason: event.fallback_reason || null,
    error_message: event.error_message ? redactErrorMessage(event.error_message) : null,
    result_count: Number.isFinite(Number(event.result_count)) ? Number(event.result_count) : null,
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

  const logPayload = {
    domain: 'maps_provider',
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
  const disabledEvents = countEvents((event) => event.status === 'disabled');
  const averageMs = mapsProviderOpsState.latencySamples.length === 0
    ? 0
    : Math.round(mapsProviderOpsState.latencySamples.reduce((sum, item) => sum + item, 0) / mapsProviderOpsState.latencySamples.length);
  const p95Ms = percentile(mapsProviderOpsState.latencySamples, 95);
  const quotaValue = process.env.GOOGLE_MAPS_QUOTA_REMAINING_PERCENT || process.env.MAPS_PROVIDER_QUOTA_REMAINING_PERCENT;
  const quotaRemaining = quotaValue === undefined ? null : Number(quotaValue);
  const googleQuotaPercent = Number.isFinite(quotaRemaining) ? Number(quotaRemaining) : null;

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
      hits: counters['cache.hit'] || 0,
      misses: counters['cache.miss'] || 0,
    },
    fallback: {
      total: fallbacks,
      osm_fallbacks: osmFallbacks,
      haversine_fallbacks: haversineFallbacks,
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

const buildGoogleRoute = async (from: MapPoint, to: MapPoint, fallback: RouteEtaSnapshot): Promise<RouteEtaSnapshot> => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY;
  if (!apiKey) return { ...fallback, provider: 'fallback_haversine', fallback_reason: 'google_maps_server_key_missing' };

  const cacheKey = routeCacheKey('google_maps', from, to);
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

  const payload: RouteEtaSnapshot = {
    eta: leg.duration?.text || fallback.eta,
    eta_minutes: Math.max(1, Math.ceil((leg.duration?.value || (fallback.eta_minutes || 3) * 60) / 60)),
    distance_km: Number(((leg.distance?.value || fallback.distance_km * 1000) / 1000).toFixed(2)),
    route_polyline: route.overview_polyline?.points || null,
    provider: 'google_directions',
    fallback_reason: null,
  };
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 60);
  return payload;
};

const buildOpenStreetMapRoute = async (from: MapPoint, to: MapPoint, fallback: RouteEtaSnapshot): Promise<RouteEtaSnapshot> => {
  const cacheKey = routeCacheKey('openstreetmap', from, to);
  const cached = await redis.get(cacheKey);
  if (cached) return { ...JSON.parse(cached), provider: 'openstreetmap_osrm_cache' };

  const baseUrl = process.env.OSM_ROUTING_BASE_URL || 'https://router.project-osrm.org';
  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const response = await axios.get(`${baseUrl.replace(/\/$/, '')}/route/v1/driving/${coordinates}`, {
    params: {
      overview: 'full',
      geometries: 'polyline',
      steps: false,
    },
    headers: {
      'User-Agent': process.env.OSM_USER_AGENT || 'LANCAR-Logistics/1.0 maps-runtime',
    },
    timeout: 2500,
  });

  const route = response.data?.routes?.[0];
  if (!route) throw new Error(response.data?.code || 'OSM_NO_ROUTE');

  const payload: RouteEtaSnapshot = {
    eta: `${Math.max(1, Math.ceil((route.duration || (fallback.eta_minutes || 3) * 60) / 60))} menit`,
    eta_minutes: Math.max(1, Math.ceil((route.duration || (fallback.eta_minutes || 3) * 60) / 60)),
    distance_km: Number(((route.distance || fallback.distance_km * 1000) / 1000).toFixed(2)),
    route_polyline: route.geometry || null,
    provider: 'openstreetmap_osrm',
    fallback_reason: null,
  };
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 60);
  return payload;
};

export const buildMapsRouteEtaSnapshot = async (
  from: MapPoint | null,
  to: MapPoint | null,
  scope: MapProviderScope = 'tracking'
): Promise<RouteEtaSnapshot> => {
  const startedAt = Date.now();
  if (!from || !to) {
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
    });
    return {
      eta: null,
      eta_minutes: null,
      distance_km: 0,
      route_polyline: null,
      provider: 'none',
      fallback_reason: 'missing_coordinates',
    };
  }

  const fallback = fallbackRoute(from, to, 'fallback_haversine');
  const providerConfig = await getPublicMapsProviderConfig(scope);

  if (providerConfig.active_provider === 'disabled') {
    const provider = providerConfig.requested_provider === 'disabled' && providerConfig.reason === 'maps_disabled_by_admin'
      ? 'disabled_haversine'
      : 'fallback_haversine';
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
    });
    return { ...fallback, provider, fallback_reason: providerConfig.reason || 'maps_disabled' };
  }

  try {
    let route = fallback;
    if (providerConfig.active_provider === 'google_maps') {
      route = await buildGoogleRoute(from, to, fallback);
    } else if (providerConfig.active_provider === 'openstreetmap') {
      route = await buildOpenStreetMapRoute(from, to, fallback);
    }
    const cacheHit = route.provider.endsWith('_cache');
    const isFallback = route.provider.includes('fallback') || Boolean(route.fallback_reason);
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
    });
    return route;
  } catch (error: any) {
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
    });
    return {
      ...fallback,
      provider: `${providerConfig.active_provider}_fallback_haversine`,
      fallback_reason: error?.message || 'route_provider_failed',
    };
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
