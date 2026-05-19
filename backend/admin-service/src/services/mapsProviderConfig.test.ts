import {
  buildMapsRouteEtaSnapshot,
  getMapsProviderOpsSnapshot,
  normalizeMapsProviderConfig,
  resetMapsProviderOpsForTests,
  resolvePublicMapsProviderConfig,
} from './mapsProviderConfig';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  },
}));

jest.mock('axios', () => ({
  get: jest.fn().mockRejectedValue(new Error('provider unavailable')),
}));

describe('mapsProviderConfig', () => {
  const { readDb } = jest.requireMock('../db');
  const { redis } = jest.requireMock('../redis');
  const axios = jest.requireMock('axios');

  const baseConfig = normalizeMapsProviderConfig({
    enabled: true,
    active_provider: 'openstreetmap',
    fallback_provider: 'openstreetmap',
    google_maps_enabled: false,
    openstreetmap_enabled: true,
    disabled_mode_enabled: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetMapsProviderOpsForTests();
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_DIRECTIONS_API_KEY;
    delete process.env.GOOGLE_MAPS_QUOTA_REMAINING_PERCENT;
    readDb.query.mockResolvedValue({
      rows: [{ value: baseConfig }],
    });
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');
    axios.get.mockRejectedValue(new Error('provider unavailable'));
  });

  it('resolves OpenStreetMap as the default public provider without exposing secrets', () => {
    const config = resolvePublicMapsProviderConfig(baseConfig, 'customer_mobile', { googleKeyAvailable: false });

    expect(config.active_provider).toBe('openstreetmap');
    expect(config.enabled).toBe(true);
    expect(config.openstreetmap.tile_url_template).toContain('openstreetmap.org');
    expect(JSON.stringify(config)).not.toContain('GOOGLE');
  });

  it('falls back from Google Maps to OpenStreetMap when server key is missing', () => {
    const config = resolvePublicMapsProviderConfig(
      normalizeMapsProviderConfig({
        ...baseConfig,
        google_maps_enabled: true,
        scopes: {
          ...baseConfig.scopes,
          customer_mobile: { enabled: true, provider: 'google_maps' },
        },
      }),
      'customer_mobile',
      { googleKeyAvailable: false }
    );

    expect(config.requested_provider).toBe('google_maps');
    expect(config.active_provider).toBe('openstreetmap');
    expect(config.reason).toBe('google_maps_server_key_missing');
  });

  it('supports admin disabled mode without crashing route calculation', async () => {
    readDb.query.mockResolvedValue({
      rows: [
        {
          value: normalizeMapsProviderConfig({
            enabled: false,
            active_provider: 'disabled',
            fallback_provider: 'disabled',
            openstreetmap_enabled: false,
          }),
        },
      ],
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'customer_mobile'
    );

    expect(route.provider).toContain('haversine');
    expect(route.eta_minutes).toBeGreaterThan(0);
    expect(route.route_polyline).toBeNull();
  });

  it('uses Google Directions when Google is enabled and a server key exists', async () => {
    process.env.GOOGLE_DIRECTIONS_API_KEY = 'test-google-key';
    readDb.query.mockResolvedValue({
      rows: [
        {
          value: normalizeMapsProviderConfig({
            ...baseConfig,
            active_provider: 'google_maps',
            fallback_provider: 'openstreetmap',
            google_maps_enabled: true,
            openstreetmap_enabled: true,
            scopes: {
              ...baseConfig.scopes,
              tracking: { enabled: true, provider: 'google_maps' },
            },
          }),
        },
      ],
    });
    axios.get.mockResolvedValue({
      data: {
        routes: [
          {
            overview_polyline: { points: 'encoded-google-polyline' },
            legs: [
              {
                duration: { text: '12 mins', value: 720 },
                distance: { value: 5400 },
              },
            ],
          },
        ],
      },
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking'
    );

    expect(route.provider).toBe('google_directions');
    expect(route.route_polyline).toBe('encoded-google-polyline');
    expect(redis.set).toHaveBeenCalled();
  });

  it('uses OpenStreetMap OSRM when OSM is enabled', async () => {
    axios.get.mockResolvedValue({
      data: {
        routes: [
          {
            duration: 900,
            distance: 6500,
            geometry: 'encoded-osm-polyline',
          },
        ],
      },
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking'
    );

    expect(route.provider).toBe('openstreetmap_osrm');
    expect(route.distance_km).toBe(6.5);
  });

  it('falls back to OpenStreetMap when Google is selected but disabled by policy', async () => {
    readDb.query.mockResolvedValue({
      rows: [
        {
          value: normalizeMapsProviderConfig({
            ...baseConfig,
            active_provider: 'google_maps',
            google_maps_enabled: false,
            openstreetmap_enabled: true,
            scopes: {
              ...baseConfig.scopes,
              tracking: { enabled: true, provider: 'google_maps' },
            },
          }),
        },
      ],
    });
    axios.get.mockResolvedValue({
      data: {
        routes: [
          {
            duration: 480,
            distance: 3100,
            geometry: 'encoded-osm-fallback-polyline',
          },
        ],
      },
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking'
    );

    expect(route.provider).toBe('openstreetmap_osrm');
  });

  it('records route failures and exposes provider ops alerts', async () => {
    axios.get.mockRejectedValue(new Error('OSRM_TIMEOUT'));

    for (let index = 0; index < 3; index += 1) {
      await buildMapsRouteEtaSnapshot(
        { latitude: -6.2088, longitude: 106.8456 },
        { latitude: -6.1754, longitude: 106.8272 },
        'tracking'
      );
    }

    const ops = await getMapsProviderOpsSnapshot();
    expect(ops.status).toBe('critical');
    expect(ops.active_alerts.some((alert) => alert.code === 'maps_provider_failure_high')).toBe(true);
    expect(ops.fallback.haversine_fallbacks).toBeGreaterThan(0);
  });

  it('alerts when Google quota is near limit', async () => {
    process.env.GOOGLE_MAPS_QUOTA_REMAINING_PERCENT = '9';

    const ops = await getMapsProviderOpsSnapshot();

    expect(ops.quota.status).toBe('near_limit');
    expect(ops.active_alerts.some((alert) => alert.code === 'google_maps_quota_near_limit')).toBe(true);
  });
});
