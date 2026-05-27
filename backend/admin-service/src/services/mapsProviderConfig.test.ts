import {
  buildMapsRouteEtaSnapshot,
  geocodeAddress,
  getMapsProviderOpsSnapshot,
  normalizeMapsProviderConfig,
  recordMapsProviderObservation,
  resetMapsProviderOpsForTests,
  resolvePublicMapsProviderConfig,
  reverseGeocodePoint,
  updateMapsProviderConfigValue,
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
  post: jest.fn().mockRejectedValue(new Error('provider unavailable')),
}));

describe('mapsProviderConfig', () => {
  const { db } = jest.requireMock('../db');
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
    delete process.env.GOOGLE_ROUTES_API_KEY;
    delete process.env.GOOGLE_ROUTES_API_URL;
    delete process.env.GOOGLE_ROUTES_ALLOWED_HOSTS;
    delete process.env.GOOGLE_ROUTES_TIMEOUT_MS;
    delete process.env.GOOGLE_DIRECTIONS_LEGACY_FALLBACK_DISABLED;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_DIRECTIONS_API_KEY;
    delete process.env.GOOGLE_MAPS_QUOTA_REMAINING_PERCENT;
    delete process.env.MAPS_GEOCODE_CACHE_TTL_SECONDS;
    delete process.env.OSM_ROUTING_BASE_URL;
    delete process.env.OSM_ROUTING_ALLOWED_HOSTS;
    delete process.env.OSM_ROUTING_PROFILE;
    delete process.env.OSM_ROUTING_CAR_BASE_URL;
    delete process.env.OSM_ROUTING_CAR_PROFILE;
    delete process.env.OSM_ROUTING_MOTORCYCLE_BASE_URL;
    delete process.env.OSM_ROUTING_MOTORCYCLE_PROFILE;
    delete process.env.OSM_CAR_ROUTING_BASE_URL;
    delete process.env.OSM_CAR_ROUTING_PROFILE;
    delete process.env.OSM_MOTORCYCLE_ROUTING_BASE_URL;
    delete process.env.OSM_MOTORCYCLE_ROUTING_PROFILE;
    readDb.query.mockResolvedValue({
      rows: [{ value: baseConfig }],
    });
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');
    axios.get.mockRejectedValue(new Error('provider unavailable'));
    axios.post.mockRejectedValue(new Error('provider unavailable'));
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

  it('serves geocode results from cache before calling an external provider', async () => {
    redis.get.mockImplementation(async (key: string) => {
      if (key.startsWith('maps:geocode:')) {
        return JSON.stringify([
          {
            label: 'Cached Jakarta address',
            latitude: -6.2,
            longitude: 106.8,
            provider: 'openstreetmap_nominatim',
            confidence: 0.8,
          },
        ]);
      }
      return null;
    });

    const results = await geocodeAddress('Jl Sudirman Jakarta', 'web_customer');

    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('Cached Jakarta address');
    expect(axios.get).not.toHaveBeenCalled();
    expect((await getMapsProviderOpsSnapshot()).cache.hits).toBeGreaterThan(0);
  });

  it('caches reverse geocode provider results for repeated public lookups', async () => {
    axios.get.mockResolvedValue({
      data: {
        display_name: 'Fresh Jakarta address',
        importance: 0.9,
      },
    });

    const result = await reverseGeocodePoint({ latitude: -6.2088, longitude: 106.8456 }, 'web_customer');

    expect(result?.label).toBe('Fresh Jakarta address');
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^maps:reverse_geocode:/),
      expect.stringContaining('Fresh Jakarta address'),
      'EX',
      3600
    );
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

  it('uses Google Routes API server-side when Google is enabled and a server key exists', async () => {
    process.env.GOOGLE_ROUTES_API_KEY = 'test-google-key';
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
    axios.post.mockResolvedValue({
      data: {
        routes: [
          {
            duration: '720s',
            staticDuration: '760s',
            distanceMeters: 5400,
            polyline: { encodedPolyline: 'encoded-google-routes-polyline' },
          },
        ],
      },
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking',
      { vehicleType: 'car', serviceCode: 'TEMBUS_MOBIL' }
    );

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('https://routes.googleapis.com/directions/v2:computeRoutes'),
      expect.objectContaining({
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Goog-Api-Key': 'test-google-key',
          'X-Goog-FieldMask': expect.stringContaining('routes.distanceMeters'),
        }),
      })
    );
    expect(route.provider).toBe('google_routes_drive_traffic_aware');
    expect(route.route_polyline).toBe('encoded-google-routes-polyline');
    expect(route.distance_meters).toBe(5400);
    expect(route.duration_seconds).toBe(720);
    expect(route.route_profile).toBe('car');
    expect(route.vehicle_type).toBe('car');
    expect(route.traffic_aware).toBe(true);
    expect(JSON.stringify(route)).not.toContain('test-google-key');
    expect(redis.set).toHaveBeenCalled();
  });

  it('uses Google two-wheeler traffic-aware optimal policy for urgent motorcycle services', async () => {
    process.env.GOOGLE_ROUTES_API_KEY = 'test-google-key';
    readDb.query.mockResolvedValue({
      rows: [
        {
          value: normalizeMapsProviderConfig({
            ...baseConfig,
            active_provider: 'google_maps',
            google_maps_enabled: true,
            scopes: {
              ...baseConfig.scopes,
              customer_mobile: { enabled: true, provider: 'google_maps' },
            },
          }),
        },
      ],
    });
    axios.post.mockResolvedValue({
      data: {
        routes: [
          {
            duration: '540s',
            distanceMeters: 3600,
            polyline: { encodedPolyline: 'encoded-google-two-wheeler-polyline' },
          },
        ],
      },
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'customer_mobile',
      { vehicleType: 'motorcycle', serviceCode: 'TEMBUS_INSTANT' }
    );

    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        travelMode: 'TWO_WHEELER',
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      }),
      expect.any(Object)
    );
    expect(route.provider).toBe('google_routes_two_wheeler_traffic_aware_optimal');
    expect(route.route_profile).toBe('motorcycle');
    expect(route.vehicle_type).toBe('motorcycle');
    expect(route.confidence).toBe('high');
    expect(route.fallback_reason).toBeNull();
  });

  it('falls back explicitly from Google two-wheeler to drive when the mode is unavailable', async () => {
    process.env.GOOGLE_ROUTES_API_KEY = 'test-google-key';
    readDb.query.mockResolvedValue({
      rows: [
        {
          value: normalizeMapsProviderConfig({
            ...baseConfig,
            active_provider: 'google_maps',
            google_maps_enabled: true,
            scopes: {
              ...baseConfig.scopes,
              tracking: { enabled: true, provider: 'google_maps' },
            },
          }),
        },
      ],
    });
    axios.post
      .mockRejectedValueOnce({
        response: {
          data: {
            error: {
              status: 'INVALID_ARGUMENT',
              message: 'TWO_WHEELER is not supported for this request.',
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          routes: [
            {
              duration: '660s',
              distanceMeters: 4700,
              polyline: { encodedPolyline: 'encoded-google-drive-fallback-polyline' },
            },
          ],
        },
      });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking',
      { routeProfile: 'motorcycle', serviceCode: 'TEMBUS_PRIORITAS' }
    );

    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ travelMode: 'TWO_WHEELER' }),
      expect.any(Object)
    );
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ travelMode: 'DRIVE' }),
      expect.any(Object)
    );
    expect(route.provider).toBe('google_routes_drive_traffic_aware_optimal');
    expect(route.route_polyline).toBe('encoded-google-drive-fallback-polyline');
    expect(route.fallback_reason).toBe('google_two_wheeler_unavailable_defaulted_to_drive');
    expect(route.confidence).toBe('medium');
  });

  it('falls back to legacy driving directions when two-wheeler and drive Routes calls both fail', async () => {
    process.env.GOOGLE_ROUTES_API_KEY = 'test-google-key';
    readDb.query.mockResolvedValue({
      rows: [
        {
          value: normalizeMapsProviderConfig({
            ...baseConfig,
            active_provider: 'google_maps',
            google_maps_enabled: true,
            scopes: {
              ...baseConfig.scopes,
              tracking: { enabled: true, provider: 'google_maps' },
            },
          }),
        },
      ],
    });
    axios.post
      .mockRejectedValueOnce({
        response: {
          data: {
            error: {
              status: 'INVALID_ARGUMENT',
              message: 'TWO_WHEELER is not supported for this request.',
            },
          },
        },
      })
      .mockRejectedValueOnce(new Error('GOOGLE_ROUTES_TIMEOUT'));
    axios.get.mockResolvedValue({
      data: {
        status: 'OK',
        routes: [
          {
            overview_polyline: { points: 'encoded-google-drive-legacy-after-two-wheeler-polyline' },
            legs: [
              {
                duration: { text: '12 mins', value: 720 },
                duration_in_traffic: { text: '11 mins', value: 660 },
                distance: { value: 4900 },
              },
            ],
          },
        ],
      },
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking',
      { routeProfile: 'motorcycle', serviceCode: 'TEMBUS_INSTANT' }
    );

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.get).toHaveBeenCalledWith(
      'https://maps.googleapis.com/maps/api/directions/json',
      expect.objectContaining({
        params: expect.objectContaining({
          mode: 'driving',
          traffic_model: 'best_guess',
        }),
      })
    );
    expect(route.provider).toBe('google_directions_driving_legacy');
    expect(route.route_polyline).toBe('encoded-google-drive-legacy-after-two-wheeler-polyline');
    expect(route.fallback_reason).toContain('google_two_wheeler_unavailable_drive_legacy_used');
    expect(route.confidence).toBe('medium');
  });

  it('uses legacy Google Directions as a controlled backend fallback when Routes API is unavailable', async () => {
    process.env.GOOGLE_ROUTES_API_KEY = 'test-google-key';
    readDb.query.mockResolvedValue({
      rows: [
        {
          value: normalizeMapsProviderConfig({
            ...baseConfig,
            active_provider: 'google_maps',
            google_maps_enabled: true,
            scopes: {
              ...baseConfig.scopes,
              tracking: { enabled: true, provider: 'google_maps' },
            },
          }),
        },
      ],
    });
    axios.post.mockRejectedValue(new Error('GOOGLE_ROUTES_QUOTA_EXHAUSTED'));
    axios.get.mockResolvedValue({
      data: {
        status: 'OK',
        routes: [
          {
            overview_polyline: { points: 'encoded-google-legacy-polyline' },
            legs: [
              {
                duration: { text: '15 mins', value: 900 },
                duration_in_traffic: { text: '14 mins', value: 840 },
                distance: { value: 6000 },
              },
            ],
          },
        ],
      },
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking',
      { vehicleType: 'car', serviceCode: 'TEMBUS_MOBIL' }
    );

    expect(axios.get).toHaveBeenCalledWith(
      'https://maps.googleapis.com/maps/api/directions/json',
      expect.objectContaining({
        params: expect.objectContaining({
          mode: 'driving',
          departure_time: 'now',
          key: 'test-google-key',
        }),
      })
    );
    expect(route.provider).toBe('google_directions_driving_legacy');
    expect(route.route_polyline).toBe('encoded-google-legacy-polyline');
    expect(route.fallback_reason).toContain('google_routes_api_unavailable_legacy_directions_used');
    expect(route.traffic_aware).toBe(true);
  });

  it('rejects non-allowlisted Google Routes hosts without leaking the API key', async () => {
    process.env.GOOGLE_ROUTES_API_KEY = 'test-google-key';
    process.env.GOOGLE_ROUTES_API_URL = 'https://evil.example.test/directions/v2:computeRoutes';
    process.env.GOOGLE_DIRECTIONS_LEGACY_FALLBACK_DISABLED = 'true';
    readDb.query.mockResolvedValue({
      rows: [
        {
          value: normalizeMapsProviderConfig({
            ...baseConfig,
            active_provider: 'google_maps',
            google_maps_enabled: true,
            scopes: {
              ...baseConfig.scopes,
              tracking: { enabled: true, provider: 'google_maps' },
            },
          }),
        },
      ],
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking',
      { vehicleType: 'car', serviceCode: 'TEMBUS_MOBIL' }
    );

    expect(axios.post).not.toHaveBeenCalled();
    expect(route.provider).toBe('google_maps_fallback_haversine');
    expect(route.fallback_reason).toBe('Google Routes host is not allowlisted');
    expect(JSON.stringify(route)).not.toContain('test-google-key');
  });

  it('uses OpenStreetMap OSRM road geometry when OSM is enabled', async () => {
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

    expect(route.provider).toBe('openstreetmap_osrm_driving_fallback');
    expect(route.route_polyline).toBe('encoded-osm-polyline');
    expect(route.distance_km).toBe(6.5);
    expect(route.distance_meters).toBe(6500);
    expect(route.duration_seconds).toBe(900);
    expect(route.fallback_reason).toBe('osm_route_profile_unknown');
  });

  it('uses a dedicated OpenStreetMap motorcycle routing profile when configured', async () => {
    process.env.OSM_ROUTING_MOTORCYCLE_BASE_URL = 'http://osrm-motorcycle:5000';
    process.env.OSM_ROUTING_MOTORCYCLE_PROFILE = 'motorcycle';
    axios.get.mockResolvedValue({
      data: {
        routes: [
          {
            duration: 720,
            distance: 4200,
            geometry: 'encoded-osm-motorcycle-road-polyline',
          },
        ],
      },
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'customer_mobile',
      { vehicleType: 'motorcycle', serviceCode: 'TEMBUS_INSTANT' }
    );

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('http://osrm-motorcycle:5000/route/v1/motorcycle/'),
      expect.any(Object)
    );
    expect(route.provider).toBe('openstreetmap_osrm_motorcycle_motorcycle');
    expect(route.route_profile).toBe('motorcycle');
    expect(route.vehicle_type).toBe('motorcycle');
    expect(route.service_code).toBe('TEMBUS_INSTANT');
    expect(route.route_polyline).toBe('encoded-osm-motorcycle-road-polyline');
    expect(route.fallback_reason).toBeNull();
    expect(route.confidence).toBe('high');
  });

  it('labels motorcycle OSM policy when only standard driving profile is available', async () => {
    axios.get.mockResolvedValue({
      data: {
        routes: [
          {
            duration: 780,
            distance: 4500,
            geometry: 'encoded-osm-driving-road-polyline',
          },
        ],
      },
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'customer_mobile',
      { routeProfile: 'motorcycle', serviceCode: 'TEMBUS_HEMAT', requireRoadRoute: true }
    );

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/route/v1/driving/'),
      expect.any(Object)
    );
    expect(route.provider).toBe('openstreetmap_osrm_driving_as_motorcycle');
    expect(route.route_polyline).toBe('encoded-osm-driving-road-polyline');
    expect(route.fallback_reason).toBe('osm_motorcycle_profile_defaulted_to_driving');
    expect(route.confidence).toBe('medium');
  });

  it('rejects straight-line fallback when customer pricing requires a road route', async () => {
    axios.get.mockRejectedValue(new Error('OSM_ROUTE_TIMEOUT'));

    await expect(buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'customer_mobile',
      { vehicleType: 'motorcycle', serviceCode: 'TEMBUS_SAME_DAY', requireRoadRoute: true }
    )).rejects.toMatchObject({
      message: 'Rute jalan belum tersedia dari provider peta. Harga tidak dihitung dari garis lurus agar tarif tetap akurat.',
      statusCode: 422,
      code: 'ERR_ROAD_ROUTE_REQUIRED',
    });
  });

  it('uses a car-specific OpenStreetMap routing engine for TEMBUS Mobil', async () => {
    process.env.OSM_ROUTING_CAR_BASE_URL = 'http://osrm-car:5000';
    process.env.OSM_ROUTING_CAR_PROFILE = 'car';
    axios.get.mockResolvedValue({
      data: {
        routes: [
          {
            duration: 1500,
            distance: 12000,
            geometry: 'encoded-osm-car-road-polyline',
          },
        ],
      },
    });

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'customer_mobile',
      { vehicleType: 'car', serviceCode: 'TEMBUS_MOBIL' }
    );

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('http://osrm-car:5000/route/v1/car/'),
      expect.any(Object)
    );
    expect(route.provider).toBe('openstreetmap_osrm_car_car');
    expect(route.route_profile).toBe('car');
    expect(route.vehicle_type).toBe('car');
    expect(route.distance_meters).toBe(12000);
    expect(route.route_polyline).toBe('encoded-osm-car-road-polyline');
  });

  it('keeps OpenStreetMap route cache separated by service and vehicle profile', async () => {
    axios.get.mockResolvedValue({
      data: {
        routes: [
          {
            duration: 900,
            distance: 6500,
            geometry: 'encoded-osm-cache-polyline',
          },
        ],
      },
    });

    await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking',
      { vehicleType: 'motorcycle', serviceCode: 'TEMBUS_INSTANT' }
    );
    await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking',
      { vehicleType: 'car', serviceCode: 'TEMBUS_MOBIL' }
    );

    const cacheKeys = redis.set.mock.calls.map((call: any[]) => call[0]);
    const primaryCacheKeys = cacheKeys.filter((key: string) => !key.endsWith(':stale'));
    const staleCacheKeys = cacheKeys.filter((key: string) => key.endsWith(':stale'));
    expect(primaryCacheKeys).toHaveLength(2);
    expect(staleCacheKeys).toHaveLength(2);
    expect(new Set(primaryCacheKeys).size).toBe(2);
    expect(staleCacheKeys).toEqual(primaryCacheKeys.map((key: string) => `${key}:stale`));
  });

  it('rejects non-allowlisted OSM routing hosts to prevent SSRF', async () => {
    process.env.OSM_ROUTING_BASE_URL = 'https://evil.example.test';

    const route = await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'tracking'
    );

    expect(axios.get).not.toHaveBeenCalled();
    expect(route.provider).toBe('openstreetmap_fallback_haversine');
    expect(route.fallback_reason).toBe('OSM routing host is not allowlisted');
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

    expect(route.provider).toBe('openstreetmap_osrm_driving_fallback');
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
    expect(ops.active_alerts.some((alert) => alert.code === 'maps_straight_line_fallback_high')).toBe(true);
    expect(ops.route_quality.straight_line_fallbacks).toBeGreaterThan(0);
  });

  it('alerts when Google quota is near limit', async () => {
    process.env.GOOGLE_MAPS_QUOTA_REMAINING_PERCENT = '9';

    const ops = await getMapsProviderOpsSnapshot();

    expect(ops.quota.status).toBe('near_limit');
    expect(ops.active_alerts.some((alert) => alert.code === 'google_maps_quota_near_limit')).toBe(true);
  });

  it('records structured route context for audit-grade ops visibility', async () => {
    process.env.OSM_ROUTING_MOTORCYCLE_BASE_URL = 'http://osrm-motorcycle:5000';
    process.env.OSM_ROUTING_MOTORCYCLE_PROFILE = 'motorcycle';
    axios.get.mockResolvedValue({
      data: {
        routes: [
          {
            duration: 600,
            distance: 4100,
            geometry: 'encoded-audit-polyline',
          },
        ],
      },
    });

    await buildMapsRouteEtaSnapshot(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.1754, longitude: 106.8272 },
      'customer_mobile',
      {
        vehicleType: 'motorcycle',
        serviceCode: 'TEMBUS_INSTANT',
        requestId: 'route-audit-req-1',
      }
    );

    const ops = await getMapsProviderOpsSnapshot();
    expect(ops.route_quality.route_events).toBe(1);
    expect(ops.route_quality.road_route_successes).toBe(1);
    expect(ops.route_quality.cache_hit_rate_percent).toBe(0);
    expect(ops.counters['request.with_id']).toBe(1);
    expect(ops.counters['service.TEMBUS_INSTANT']).toBe(1);
    expect(ops.recent_events[0]).toEqual(expect.objectContaining({
      request_id: 'route-audit-req-1',
      service_code: 'TEMBUS_INSTANT',
      route_profile: 'motorcycle',
      vehicle_type: 'motorcycle',
      distance_meters: 4100,
      duration_seconds: 600,
    }));
  });

  it('raises distance anomaly alerts from structured route observations', async () => {
    recordMapsProviderObservation({
      operation: 'route',
      scope: 'tracking',
      requested_provider: 'openstreetmap',
      active_provider: 'openstreetmap',
      provider: 'openstreetmap_osrm_driving_fallback',
      status: 'success',
      latency_ms: 120,
      cache_hit: false,
      request_id: 'distance-anomaly-1',
      service_code: 'TEMBUS_INSTANT',
      route_profile: 'motorcycle',
      vehicle_type: 'motorcycle',
      distance_meters: 400_000,
      distance_km: 400,
      duration_seconds: 1800,
      duration_minutes: 30,
    });

    const ops = await getMapsProviderOpsSnapshot();
    expect(ops.route_quality.distance_anomalies).toBe(1);
    expect(ops.active_alerts.some((alert) => alert.code === 'maps_distance_anomaly_detected')).toBe(true);
  });

  it('persists admin provider switch and records an auditable config event', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const updated = await updateMapsProviderConfigValue({
      active_provider: 'google_maps',
      fallback_provider: 'openstreetmap',
      google_maps_enabled: true,
      openstreetmap_enabled: true,
      scopes: {
        ...baseConfig.scopes,
        customer_mobile: { enabled: true, provider: 'google_maps' },
        courier_mobile: { enabled: true, provider: 'openstreetmap' },
        tracking: { enabled: true, provider: 'google_maps' },
      },
    });

    expect(updated.active_provider).toBe('google_maps');
    expect(updated.scopes.customer_mobile.provider).toBe('google_maps');
    expect(updated.scopes.courier_mobile.provider).toBe('openstreetmap');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO system_configs'),
      expect.arrayContaining(['maps_provider_config'])
    );

    const ops = await getMapsProviderOpsSnapshot();
    expect(ops.recent_events[0]).toEqual(expect.objectContaining({
      operation: 'config',
      scope: 'global',
      provider: 'google_maps',
      status: 'success',
    }));
  });
});
