const assert = require('assert');
const {
  publicEndpointKey,
  validateMapsRequest,
  validatePricingPayload,
} = require('../dist/publicEndpointAbuseProtection');

assert.strictEqual(validateMapsRequest('/api/v1/maps/config?scope=web_customer'), null);
assert.strictEqual(
  validateMapsRequest('/api/v1/maps/geocode?query=Jl%20Sudirman%20Jakarta&scope=web_customer'),
  null,
);
assert.strictEqual(validateMapsRequest('/api/v1/maps/geocode?query=ab'), 'query_too_short');
assert.strictEqual(
  validateMapsRequest(`/api/v1/maps/geocode?query=${'a'.repeat(121)}`),
  'query_too_long',
);
assert.strictEqual(validateMapsRequest('/api/v1/maps/reverse-geocode?lat=-6.2&lng=106.8'), null);
assert.strictEqual(validateMapsRequest('/api/v1/maps/reverse-geocode?lat=-96&lng=106.8'), 'invalid_coordinates');
assert.strictEqual(
  validateMapsRequest('/api/v1/maps/route?from_lat=-6.2&from_lng=106.8&to_lat=-6.3&to_lng=106.9&route_profile=car'),
  null,
);
assert.strictEqual(
  validateMapsRequest('/api/v1/maps/route?from_lat=-6.2&from_lng=106.8&to_lat=1.0&to_lng=120.0'),
  'route_distance_too_large',
);
assert.strictEqual(validateMapsRequest('/api/v1/maps/tiles/20/1/1.png'), 'invalid_tile');

assert.strictEqual(validatePricingPayload({
  pickup_lat: -6.2,
  pickup_lng: 106.8,
  dropoff_lat: -6.3,
  dropoff_lng: 106.9,
  length: 20,
  width: 20,
  height: 20,
  weight: 5,
  models: ['p2p'],
}), null);

assert.strictEqual(validatePricingPayload({
  pickup_lat: -6.2,
  pickup_lng: 106.8,
  dropoff_lat: 1.0,
  dropoff_lng: 120.0,
  length: 20,
  width: 20,
  height: 20,
  weight: 5,
}), 'route_distance_too_large');

assert.strictEqual(validatePricingPayload({
  pickup_lat: -6.2,
  pickup_lng: 106.8,
  dropoff_lat: -6.3,
  dropoff_lng: 106.9,
  length: 301,
  width: 20,
  height: 20,
  weight: 5,
}), 'dimensions_too_large');

assert.strictEqual(
  publicEndpointKey({
    ip: '2001:db8::1',
    socket: {},
    headers: { 'x-device-id': 'device-123' },
  }, 'maps'),
  'maps:device:device-123',
);

assert.strictEqual(
  publicEndpointKey({
    ip: '127.0.0.1',
    socket: {},
    headers: { 'x-user-id': 'user-123', 'x-device-id': 'device-123' },
  }, 'pricing'),
  'pricing:user:user-123',
);

console.log('publicEndpointAbuseProtection tests passed');
