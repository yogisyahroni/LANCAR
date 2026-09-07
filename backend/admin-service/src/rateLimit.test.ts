import { publicEndpointRateLimitScope } from './rateLimit';

describe('public endpoint rate-limit scopes', () => {
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
});
