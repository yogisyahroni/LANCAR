const assert = require('assert');
const { resolveGatewayRoutePolicy } = require('../dist/routeAuthMatrix');

const assertPolicy = (method, path, requirement, id) => {
  const policy = resolveGatewayRoutePolicy(method, path);
  assert.strictEqual(policy.requirement, requirement, `${method} ${path} requirement`);
  assert.strictEqual(policy.id, id, `${method} ${path} policy id`);
};

assertPolicy('GET', '/api/v1/compliance/policy', 'public', 'compliance-policy-public-runtime');
assertPolicy('POST', '/api/v1/compliance/consents', 'web-session-or-jwt', 'compliance-user-api');
assertPolicy('GET', '/api/v1/compliance/consents', 'web-session-or-jwt', 'compliance-user-api');
assertPolicy('GET', '/api/v1/compliance/policy/unknown', 'web-session-or-jwt', 'compliance-user-api');

console.log('Compliance boundary gateway tests passed');
