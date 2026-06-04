const mockGetActiveGoogleMapsServerCredential = jest.fn();
const mockListMapsRuntimeCredentials = jest.fn();
const mockGetMapsProviderOpsSnapshot = jest.fn();

jest.mock('./mapsRuntimeCredentials', () => ({
  getActiveGoogleMapsServerCredential: mockGetActiveGoogleMapsServerCredential,
  listMapsRuntimeCredentials: mockListMapsRuntimeCredentials,
}));

jest.mock('./mapsProviderConfig', () => ({
  getMapsProviderOpsSnapshot: mockGetMapsProviderOpsSnapshot,
}));

const { getMapsProductionReadiness } = require('./mapsProductionReadiness') as typeof import('./mapsProductionReadiness');

describe('mapsProductionReadiness', () => {
  const key = (suffix: string) => `AI${'za'}${suffix.padEnd(32, 'a')}`;
  const now = new Date('2026-06-04T00:00:00.000Z');

  const baseOpsSnapshot = {
    generated_at: now.toISOString(),
    status: 'operational',
    active_alerts: [],
    active_config: {
      enabled: true,
      active_provider: 'google_maps',
      fallback_provider: 'openstreetmap',
      google_maps_enabled: true,
      openstreetmap_enabled: true,
    },
    counters: {},
    latency: { sample_count: 0, average_ms: 0, p95_ms: 0 },
    cache: { hits: 0, misses: 0 },
    fallback: { total: 0, osm_fallbacks: 0, haversine_fallbacks: 0 },
    route_quality: {
      route_events: 0,
      road_route_successes: 0,
      distance_anomalies: 0,
      straight_line_fallbacks: 0,
      cache_hit_rate_percent: 0,
    },
    last_error: null,
    recent_events: [],
    quota: { google_remaining_percent: 80, status: 'healthy' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveGoogleMapsServerCredential.mockResolvedValue(null);
    mockListMapsRuntimeCredentials.mockResolvedValue([]);
    mockGetMapsProviderOpsSnapshot.mockResolvedValue(baseOpsSnapshot);
  });

  it('blocks production readiness when platform keys are missing', async () => {
    const readiness = await getMapsProductionReadiness(
      {
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv,
      now
    );

    expect(readiness.overall_status).toBe('blocked');
    expect(readiness.key_inventory.every((item) => item.configured === false)).toBe(true);
    expect(JSON.stringify(readiness)).not.toContain('apiKey');
  });

  it('passes when every surface is separated, restricted, and rotation metadata is current', async () => {
    const serverKey = key('server12345678901234567890123456');
    mockGetActiveGoogleMapsServerCredential.mockResolvedValue({
      source: 'runtime_store',
      apiKey: serverKey,
      keyAlias: 'tembus-staging-server-maps-key',
      credentialId: 'credential-1',
      cacheKey: 'runtime:credential-1:fingerprint',
    });
    mockListMapsRuntimeCredentials.mockResolvedValue([
      {
        id: 'credential-1',
        key_alias: 'tembus-staging-server-maps-key',
        enabled_apis: ['geocoding', 'routes'],
        restriction_type: 'server_ip',
        activated_at: '2026-05-01T00:00:00.000Z',
      },
    ]);

    const readiness = await getMapsProductionReadiness(
      {
        ENVIRONMENT: 'staging',
        GOOGLE_MAPS_ANDROID_COURIER_API_KEY: key('courier123456789012345678901234'),
        GOOGLE_MAPS_ANDROID_CUSTOMER_API_KEY: key('customer12345678901234567890123'),
        GOOGLE_MAPS_BROWSER_API_KEY: key('browser123456789012345678901234'),
        GOOGLE_MAPS_ANDROID_COURIER_KEY_RESTRICTION: 'android_package_sha1',
        GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_RESTRICTION: 'android_package_sha1',
        GOOGLE_MAPS_WEB_KEY_RESTRICTION: 'http_referrer',
        GOOGLE_MAPS_ANDROID_COURIER_KEY_APIS: 'maps_sdk_android',
        GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_APIS: 'maps_sdk_android',
        GOOGLE_MAPS_WEB_KEY_APIS: 'maps_javascript_api',
        GOOGLE_MAPS_ANDROID_COURIER_KEY_ROTATED_AT: '2026-05-01',
        GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_ROTATED_AT: '2026-05-01',
        GOOGLE_MAPS_WEB_KEY_ROTATED_AT: '2026-05-01',
      } as NodeJS.ProcessEnv,
      now
    );

    const serialized = JSON.stringify(readiness);
    expect(readiness.overall_status).toBe('ready');
    expect(readiness.shared_key_findings).toHaveLength(0);
    expect(readiness.key_inventory.every((item) => item.configured)).toBe(true);
    expect(serialized).not.toContain(serverKey);
    expect(serialized).not.toContain('courier123456789012345678901234');
  });

  it('detects one key reused across multiple surfaces without exposing the key', async () => {
    const shared = key('shared1234567890123456789012345');
    const readiness = await getMapsProductionReadiness(
      {
        ENVIRONMENT: 'staging',
        GOOGLE_MAPS_ANDROID_COURIER_API_KEY: shared,
        GOOGLE_MAPS_ANDROID_CUSTOMER_API_KEY: shared,
        GOOGLE_MAPS_ANDROID_COURIER_KEY_RESTRICTION: 'android_package_sha1',
        GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_RESTRICTION: 'android_package_sha1',
        GOOGLE_MAPS_ANDROID_COURIER_KEY_APIS: 'maps_sdk_android',
        GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_APIS: 'maps_sdk_android',
        GOOGLE_MAPS_ANDROID_COURIER_KEY_ROTATED_AT: '2026-05-01',
        GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_ROTATED_AT: '2026-05-01',
      } as NodeJS.ProcessEnv,
      now
    );

    expect(readiness.shared_key_findings).toHaveLength(1);
    expect(readiness.overall_status).toBe('blocked');
    expect(JSON.stringify(readiness)).not.toContain(shared);
  });

  it('marks old keys as degraded because rotation is overdue', async () => {
    const readiness = await getMapsProductionReadiness(
      {
        ENVIRONMENT: 'staging',
        GOOGLE_MAPS_ANDROID_COURIER_API_KEY: key('courier123456789012345678901234'),
        GOOGLE_MAPS_ANDROID_COURIER_KEY_RESTRICTION: 'android_package_sha1',
        GOOGLE_MAPS_ANDROID_COURIER_KEY_APIS: 'maps_sdk_android',
        GOOGLE_MAPS_ANDROID_COURIER_KEY_ROTATED_AT: '2025-01-01',
      } as NodeJS.ProcessEnv,
      now
    );

    const courier = readiness.key_inventory.find((item) => item.id === 'android_courier');
    expect(courier?.rotation.status).toBe('overdue');
    expect(courier?.issues.some((item) => item.code === 'maps_key_rotation_overdue')).toBe(true);
  });

  it('adds actionable diagnostics for denied Google provider errors', async () => {
    mockGetMapsProviderOpsSnapshot.mockResolvedValue({
      ...baseOpsSnapshot,
      status: 'critical',
      active_alerts: [
        {
          code: 'maps_provider_failure_high',
          severity: 'critical',
          message: 'Kegagalan provider maps tinggi. Cek key, quota, timeout, dan konektivitas provider.',
        },
      ],
      last_error: {
        recorded_at: now.toISOString(),
        operation: 'route',
        scope: 'tracking',
        requested_provider: 'google_maps',
        active_provider: 'google_maps',
        provider: 'google_routes_drive_traffic_aware',
        status: 'failure',
        latency_ms: 250,
        cache_hit: false,
        error_message: 'REQUEST_DENIED: This API project is not authorized to use this API.',
      },
    });

    const readiness = await getMapsProductionReadiness(
      {
        ENVIRONMENT: 'staging',
      } as NodeJS.ProcessEnv,
      now
    );

    const deniedIssue = readiness.active_alerts.find((item) => item.code === 'google_maps_request_denied');
    expect(deniedIssue?.severity).toBe('critical');
    expect(deniedIssue?.action).toContain('Admin Maps Runtime');
    expect(JSON.stringify(readiness)).not.toContain('AIza');
  });
});
