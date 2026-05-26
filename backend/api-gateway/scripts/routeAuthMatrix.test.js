const assert = require('assert');
const {
  createGatewayAuthMatrixMiddleware,
  resolveGatewayRoutePolicy,
} = require('../dist/routeAuthMatrix');

const assertPolicy = (method, path, requirement, id) => {
  const policy = resolveGatewayRoutePolicy(method, path);
  assert.strictEqual(policy.requirement, requirement, `${method} ${path} requirement`);
  if (id) {
    assert.strictEqual(policy.id, id, `${method} ${path} policy id`);
  }
};

assertPolicy('POST', '/api/v1/auth/otp/send', 'public', 'auth-service-public');
assertPolicy('POST', '/api/v1/auth/courier/login', 'public', 'courier-auth-public');
assertPolicy('GET', '/api/v1/maps/config', 'public', 'maps-public-runtime');
assertPolicy('POST', '/api/v1/public/location-requests/token-1', 'public', 'customer-public-handoff');
assertPolicy('POST', '/api/v1/pricing/estimate', 'public', 'pricing-estimate-public');
assertPolicy('GET', '/api/v1/auth/web/delivery-services', 'public', 'web-auth-public');
assertPolicy('GET', '/api/v1/auth/web/orders', 'web-session-or-jwt', 'web-session-routes');
assertPolicy('POST', '/api/v1/auth/web/orders', 'web-session-or-jwt', 'web-session-routes');
assertPolicy('GET', '/api/v1/customer/orders', 'web-session-or-jwt', 'customer-portal-api');
assertPolicy('GET', '/api/v1/admin/orders', 'admin-session-or-jwt', 'admin-management');
assertPolicy('POST', '/api/v1/orders', 'jwt', 'order-domain-api');
assertPolicy('GET', '/api/v1/orders/detail', 'jwt', 'order-domain-api');
assertPolicy('POST', '/api/v1/orders/status', 'jwt', 'order-domain-api');
assertPolicy('GET', '/api/v1/couriers/me', 'jwt', 'order-domain-api');
assertPolicy('POST', '/api/v1/tracking/sync', 'jwt', 'order-domain-api');
assertPolicy('POST', '/api/v1/routing/plan', 'jwt', 'routing-api');
assertPolicy('GET', '/api/v1/wallet/balance', 'jwt', 'wallet-api');
assertPolicy('GET', '/docs/auth', 'ops-protected', 'swagger-docs');
assertPolicy('GET', '/metrics', 'ops-protected', 'gateway-metrics');

const invokeGuard = ({ method = 'GET', path, headers = {} }) => {
  let jwtCalled = false;
  let nextCalled = false;
  const authenticateJwt = (req, res, next) => {
    jwtCalled = true;
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      res.status(401).json({
        status: 'error',
        code: 'ERR_UNAUTHORIZED',
        message: 'Authentication required',
      });
      return;
    }
    next();
  };
  const guard = createGatewayAuthMatrixMiddleware(authenticateJwt);
  const response = {
    statusCode: 200,
    body: undefined,
    locals: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  guard(
    { method, path, headers },
    response,
    () => {
      nextCalled = true;
    },
  );

  return { jwtCalled, nextCalled, response };
};

let result = invokeGuard({ method: 'POST', path: '/api/v1/orders' });
assert.strictEqual(result.jwtCalled, true);
assert.strictEqual(result.nextCalled, false);
assert.strictEqual(result.response.statusCode, 401);

result = invokeGuard({
  method: 'POST',
  path: '/api/v1/orders',
  headers: { authorization: 'Bearer valid-token' },
});
assert.strictEqual(result.jwtCalled, true);
assert.strictEqual(result.nextCalled, true);

result = invokeGuard({ method: 'GET', path: '/api/v1/auth/web/orders' });
assert.strictEqual(result.jwtCalled, false);
assert.strictEqual(result.nextCalled, false);
assert.strictEqual(result.response.statusCode, 401);
assert.strictEqual(result.response.body.route_policy, 'web-session-routes');

result = invokeGuard({
  method: 'GET',
  path: '/api/v1/auth/web/orders',
  headers: { cookie: 'customer_session=session-token' },
});
assert.strictEqual(result.jwtCalled, false);
assert.strictEqual(result.nextCalled, true);

result = invokeGuard({ method: 'GET', path: '/api/v1/admin/orders' });
assert.strictEqual(result.nextCalled, false);
assert.strictEqual(result.response.statusCode, 401);
assert.strictEqual(result.response.body.route_policy, 'admin-management');

result = invokeGuard({
  method: 'GET',
  path: '/api/v1/admin/orders',
  headers: { cookie: 'admin_session=session-token' },
});
assert.strictEqual(result.nextCalled, true);

result = invokeGuard({ method: 'GET', path: '/api/v1/maps/config' });
assert.strictEqual(result.jwtCalled, false);
assert.strictEqual(result.nextCalled, true);

console.log('Route auth matrix tests passed');
