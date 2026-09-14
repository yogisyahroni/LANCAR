const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  resolveGatewayRoutePolicy,
} = require('../dist/routeAuthMatrix');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');

const assertPolicy = (method, route, requirement, id) => {
  const policy = resolveGatewayRoutePolicy(method, route);
  assert.strictEqual(policy.requirement, requirement, `${method} ${route} requirement`);
  assert.strictEqual(policy.id, id, `${method} ${route} policy`);
};

// Authentication/abuse-sensitive entrypoints must remain explicitly covered,
// even when their downstream provider is not enabled in staging.
assertPolicy('POST', '/api/v1/auth/otp/send', 'public', 'auth-service-public');
assertPolicy('POST', '/api/v1/auth/customer/login/start', 'public', 'auth-service-public');
assertPolicy('GET', '/api/v1/search', 'web-session-or-jwt', 'search-api');
assertPolicy('GET', '/api/v1/maps/geocode', 'public', 'maps-public-runtime');
assertPolicy('POST', '/api/v1/pricing/estimate', 'public', 'pricing-estimate-public');
assertPolicy('GET', '/api/v1/tracking/public', 'public', 'public-tracking-lookup');
assertPolicy('POST', '/api/v1/payments/midtrans/notification', 'public', 'payment-provider-webhook');
assertPolicy('POST', '/api/v1/payments/xendit', 'public', 'payment-provider-webhook');

// Gateway source wiring is intentionally asserted as a contract: these
// route-specific controls must not regress into the broad 100/minute bucket.
assert(source.includes("app.use('/api/v1/auth/web', authLimiter);"));
assert(source.includes("app.use('/api/v1/auth/courier', authLimiter);"));
assert(source.includes("app.use('/api/v1/auth/merchant', authLimiter);"));
assert(source.includes("'/api/v1/auth/register',\n  authLimiter,"));
assert(source.includes("app.use('/api/v1/auth/providers/zenziva/webhook', providerWebhookLimiter);"));
assert(source.includes("app.use('/api/v1/payments/midtrans', providerWebhookLimiter);"));
assert(source.includes("app.use('/api/v1/payments/xendit', providerWebhookLimiter);"));
assert(source.includes("app.use('/api/v1/maps', publicMapsLimiter, publicMapsAbuseGuard);"));
assert(source.includes('publicPricingLimiter,\n  jsonParser,\n  publicPricingAbuseGuard'));
assert(source.includes("max: Number(process.env.PROVIDER_WEBHOOK_RATE_LIMIT_PER_MINUTE || 600)"));

console.log('edge security contract tests passed');
