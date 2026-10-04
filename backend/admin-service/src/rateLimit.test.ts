import { publicEndpointRateLimitScope, publicEndpointRateLimiter } from './rateLimit';
import { redis } from './redis';

jest.mock('./redis', () => ({
  redis: {
    get: jest.fn(),
    multi: jest.fn(),
  },
}));

describe('public endpoint rate-limit scopes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shares one bucket across rotating public tracking tokens', () => {
    expect(publicEndpointRateLimitScope('/track/token-a')).toBe('/track');
    expect(publicEndpointRateLimitScope('/track/token-b')).toBe('/track');
  });

  it('shares one bucket across rotating handoff tokens but isolates endpoint families', () => {
    expect(publicEndpointRateLimitScope('/api/v1/public/location-requests/token-a'))
      .toBe('/api/v1/public/location-requests');
    expect(publicEndpointRateLimitScope('/api/v1/public/location-requests/token-b'))
      .toBe('/api/v1/public/location-requests');
    expect(publicEndpointRateLimitScope('/api/v1/public/business/api-requests'))
      .not.toBe('/api/v1/public/location-requests');
  });

  it('blocks public status enumeration after the shared IP budget is exhausted', async () => {
    (redis.get as jest.Mock).mockResolvedValue('20');
    const response: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await publicEndpointRateLimiter({
      path: '/api/v1/auth/merchant/registration-status',
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
    } as any, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'ERR_RATE_LIMITED',
      message: 'Telah mencapai batas percobaan. Silakan coba beberapa saat lagi.',
    }));
    expect(next).not.toHaveBeenCalled();
    expect(redis.multi).not.toHaveBeenCalled();
  });

  it('uses one IP bucket for every status lookup and advances it atomically', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const multi = {
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec,
    };
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.multi as jest.Mock).mockReturnValue(multi);
    const next = jest.fn();

    await publicEndpointRateLimiter({
      path: '/api/v1/auth/merchant/registration-status',
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
    } as any, {} as any, next);

    expect(redis.get).toHaveBeenCalledWith(
      'rate_limit:public:/api/v1/auth/merchant/registration-status:203.0.113.10',
    );
    expect(multi.incr).toHaveBeenCalledWith(
      'rate_limit:public:/api/v1/auth/merchant/registration-status:203.0.113.10',
    );
    expect(multi.expire).toHaveBeenCalledWith(
      'rate_limit:public:/api/v1/auth/merchant/registration-status:203.0.113.10',
      3600,
    );
    expect(exec).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
