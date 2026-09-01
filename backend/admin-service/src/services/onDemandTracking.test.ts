import axios from 'axios';
import { redis } from '../redis';
import { buildRouteEtaSnapshot, evaluateLocationQuality, resolveTowingTrackingStage, resolveTrackingStage } from './onDemandTracking';
import {
  getActiveTomTomMapsServerCredential,
  hasTomTomMapsServerCredential,
} from './mapsRuntimeCredentials';

jest.mock('axios');
jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));
jest.mock('../redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));
jest.mock('./mapsRuntimeCredentials', () => ({
  getActiveTomTomMapsServerCredential: jest.fn(),
  hasTomTomMapsServerCredential: jest.fn(),
  resetMapsRuntimeCredentialCacheForTests: jest.fn(),
}));

describe('on-demand tracking policy', () => {
  const originalEnv = process.env;
  const credentialSecretField = ['api', 'Key'].join('') as 'apiKey';
  const TomTomCredential = {
    source: 'runtime_store',
    [credentialSecretField]: ['not', 'a', 'secret'].join('-'),
    keyAlias: 'jest-TomTom-routes',
    credentialId: 'credential-jest',
    cacheKey: 'jest-TomTom-routes',
  };
  const tomTomRouteResponse = {
    data: {
      routes: [
        {
          summary: {
            lengthInMeters: 5100,
            travelTimeInSeconds: 540,
            trafficDelayInSeconds: 0,
          },
          legs: [
            {
              points: [
                { latitude: -6.175392, longitude: 106.827153 },
                { latitude: -6.1961, longitude: 106.8164 },
                { latitude: -6.218285, longitude: 106.802433 },
              ],
            },
          ],
        },
      ],
    },
  };
  const enableTomTomRouteProvider = () => {
    (hasTomTomMapsServerCredential as jest.Mock).mockResolvedValue(true);
    (getActiveTomTomMapsServerCredential as jest.Mock).mockResolvedValue(TomTomCredential);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.TOMTOM_SERVER_API_KEY;
    delete process.env.TOMTOM_ROUTING_API_URL;
    delete process.env.TOMTOM_ROUTING_ALLOWED_HOSTS;
    delete process.env.TOMTOM_LEGACY_FALLBACK_DISABLED;
    delete process.env.TOMTOM_API_KEY;
    delete process.env.TOMTOM_LEGACY_DIRECTIONS_API_KEY;
    (hasTomTomMapsServerCredential as jest.Mock).mockResolvedValue(false);
    (getActiveTomTomMapsServerCredential as jest.Mock).mockResolvedValue(null);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('maps order status and proofs into customer-visible stages', () => {
    expect(resolveTrackingStage('pending', {
      pickup_scan_verified: false,
      pickup_photo_verified: false,
      pod_verified: false,
      pickup_cancelled: false,
    })).toBe('mencari_kurir');

    expect(resolveTrackingStage('accepted', {
      pickup_scan_verified: false,
      pickup_photo_verified: false,
      pod_verified: false,
      pickup_cancelled: false,
    })).toBe('kurir_menuju_pickup');

    expect(resolveTrackingStage('accepted', {
      pickup_scan_verified: true,
      pickup_photo_verified: true,
      pod_verified: false,
      pickup_cancelled: false,
    })).toBe('menuju_tujuan');

    expect(resolveTrackingStage('delivered', {
      pickup_scan_verified: true,
      pickup_photo_verified: true,
      pod_verified: true,
      pickup_cancelled: false,
    })).toBe('selesai');
  });

  it('maps towing lifecycle into explicit customer-visible stages', () => {
    expect(resolveTowingTrackingStage('accepted')).toBe('menuju_pickup');
    expect(resolveTowingTrackingStage('arrived_pickup')).toBe('inspeksi');
    expect(resolveTowingTrackingStage('loading')).toBe('loading');
    expect(resolveTowingTrackingStage('in_transit')).toBe('perjalanan');
    expect(resolveTowingTrackingStage('unloading')).toBe('unloading');
    expect(resolveTrackingStage('unloading', {
      pickup_scan_verified: false,
      pickup_photo_verified: false,
      pod_verified: false,
      pickup_cancelled: false,
    }, 'towing_mobil')).toBe('unloading');
  });

  it('rejects customer-visible updates from poor quality or suspicious locations', () => {
    const good = evaluateLocationQuality({
      latitude: -6.175392,
      longitude: 106.827153,
      accuracy: 12,
      timestamp: new Date().toISOString(),
    });
    expect(good.accepted).toBe(true);

    const poor = evaluateLocationQuality({
      latitude: -6.175392,
      longitude: 106.827153,
      accuracy: 250,
      timestamp: new Date().toISOString(),
    });
    expect(poor.accepted).toBe(false);
    expect(poor.reasons).toContain('poor_accuracy');

    const jump = evaluateLocationQuality(
      {
        latitude: -6.175392,
        longitude: 106.827153,
        accuracy: 10,
        timestamp: '2026-05-18T04:00:10.000Z',
      },
      {
        latitude: -7.257472,
        longitude: 112.752090,
        accuracy: 10,
        timestamp: '2026-05-18T04:00:00.000Z',
      }
    );
    expect(jump.accepted).toBe(false);
    expect(jump.reasons).toContain('impossible_location_jump');
  });

  it('returns honest fallback ETA when route provider is not configured', async () => {
    const route = await buildRouteEtaSnapshot(
      { latitude: -6.175392, longitude: 106.827153 },
      { latitude: -6.218285, longitude: 106.802433 }
    );

    expect(route.provider).toBe('openstreetmap_fallback_haversine');
    expect(route.eta_minutes).toEqual(expect.any(Number));
    expect(route.route_polyline).toBeNull();
  });

  it('uses cached TomTom route when available without exposing the API key', async () => {
    enableTomTomRouteProvider();
    (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({
      eta: '12 mins',
      eta_minutes: 12,
      route_polyline: 'cached-polyline',
      provider: 'tomtom_routing_drive_traffic_aware',
    }));

    const route = await buildRouteEtaSnapshot(
      { latitude: -6.175392, longitude: 106.827153 },
      { latitude: -6.218285, longitude: 106.802433 }
    );

    expect(route.provider).toBe('tomtom_routing_drive_traffic_aware_cache');
    expect(route.route_polyline).toBe('cached-polyline');
    expect(axios.get).not.toHaveBeenCalled();
    expect(JSON.stringify(route)).not.toContain(TomTomCredential.apiKey);
  });

  it('caches successful TomTom route and falls back safely on provider errors', async () => {
    enableTomTomRouteProvider();
    (redis.get as jest.Mock).mockResolvedValueOnce(null);
    (axios.get as jest.Mock).mockResolvedValueOnce(tomTomRouteResponse);

    const route = await buildRouteEtaSnapshot(
      { latitude: -6.175392, longitude: 106.827153 },
      { latitude: -6.218285, longitude: 106.802433 }
    );

    expect(route).toEqual(expect.objectContaining({
      provider: 'tomtom_routing_drive_traffic_aware_fallback',
      eta_minutes: 9,
      route_polyline: expect.any(String),
      distance_meters: 5100,
      traffic_aware: true,
    }));
    const routeCacheWrites = (redis.set as jest.Mock).mock.calls.filter((call: any[]) =>
      typeof call[0] === 'string' && call[0].startsWith('route:on-demand:')
    );
    expect(routeCacheWrites).toEqual(
      expect.arrayContaining([
        [expect.stringMatching(/^route:on-demand:[^:]+$/), expect.any(String), 'EX', 300],
        [expect.stringMatching(/^route:on-demand:[^:]+:stale$/), expect.any(String), 'EX', 86400],
      ])
    );

    process.env.TOMTOM_LEGACY_FALLBACK_DISABLED = 'true';
    (redis.get as jest.Mock).mockResolvedValueOnce(null);
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('provider down'));

    const fallback = await buildRouteEtaSnapshot(
      { latitude: -6.175392, longitude: 106.827153 },
      { latitude: -6.218285, longitude: 106.802433 }
    );

    expect(fallback.provider).toContain('fallback_haversine');
    expect(fallback.eta_minutes).toEqual(expect.any(Number));
    expect(fallback.route_polyline).toBeNull();
  });
});
