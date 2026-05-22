import axios from 'axios';
import { redis } from '../redis';
import { buildRouteEtaSnapshot, evaluateLocationQuality, resolveTrackingStage } from './onDemandTracking';

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

describe('on-demand tracking policy', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_ROUTES_API_KEY;
    delete process.env.GOOGLE_ROUTES_API_URL;
    delete process.env.GOOGLE_ROUTES_ALLOWED_HOSTS;
    delete process.env.GOOGLE_DIRECTIONS_LEGACY_FALLBACK_DISABLED;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_DIRECTIONS_API_KEY;
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

    expect(route.provider).toBe('fallback_haversine');
    expect(route.eta_minutes).toEqual(expect.any(Number));
    expect(route.route_polyline).toBeNull();
  });

  it('uses cached Google route when available without exposing the API key', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'AIza-real-staging-key';
    (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({
      eta: '12 mins',
      eta_minutes: 12,
      route_polyline: 'cached-polyline',
      provider: 'google_directions',
    }));

    const route = await buildRouteEtaSnapshot(
      { latitude: -6.175392, longitude: 106.827153 },
      { latitude: -6.218285, longitude: 106.802433 }
    );

    expect(route.provider).toBe('google_directions_cache');
    expect(route.route_polyline).toBe('cached-polyline');
    expect(axios.get).not.toHaveBeenCalled();
    expect(JSON.stringify(route)).not.toContain('AIza-real-staging-key');
  });

  it('caches successful Google route and falls back safely on provider errors', async () => {
    process.env.GOOGLE_ROUTES_API_KEY = 'routes-real-key';
    (redis.get as jest.Mock).mockResolvedValueOnce(null);
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: {
        routes: [{
          duration: '540s',
          distanceMeters: 5100,
          polyline: { encodedPolyline: 'fresh-polyline' },
        }],
      },
    });

    const route = await buildRouteEtaSnapshot(
      { latitude: -6.175392, longitude: 106.827153 },
      { latitude: -6.218285, longitude: 106.802433 }
    );

    expect(route).toEqual(expect.objectContaining({
      provider: 'google_routes_drive_traffic_aware_fallback',
      eta_minutes: 9,
      route_polyline: 'fresh-polyline',
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

    process.env.GOOGLE_DIRECTIONS_LEGACY_FALLBACK_DISABLED = 'true';
    (redis.get as jest.Mock).mockResolvedValueOnce(null);
    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('provider down'));

    const fallback = await buildRouteEtaSnapshot(
      { latitude: -6.175392, longitude: 106.827153 },
      { latitude: -6.218285, longitude: 106.802433 }
    );

    expect(fallback.provider).toContain('fallback_haversine');
    expect(fallback.eta_minutes).toEqual(expect.any(Number));
    expect(fallback.route_polyline).toBeNull();
  });
});
