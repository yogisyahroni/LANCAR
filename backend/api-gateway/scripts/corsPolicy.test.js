const assert = require('assert');
const {
  hasInternalRequestHeader,
  isOriginAllowed,
  parseAllowedOrigins,
  PUBLIC_ALLOWED_HEADERS,
  rejectUnsafeCorsPreflight,
} = require('../dist/corsPolicy');

const productionEnv = {
  NODE_ENV: 'production',
  ENVIRONMENT: 'production',
  ALLOWED_ORIGINS: 'https://app.tembus.test,https://admin.tembus.test',
};

assert.deepStrictEqual(parseAllowedOrigins(productionEnv), [
  'https://app.tembus.test',
  'https://admin.tembus.test',
]);

assert.strictEqual(isOriginAllowed('https://app.tembus.test', productionEnv), true);
assert.strictEqual(isOriginAllowed('https://evil.test', productionEnv), false);
assert.strictEqual(isOriginAllowed('http://localhost:3000', productionEnv), false);
assert.strictEqual(isOriginAllowed('http://localhost:3000', { NODE_ENV: 'development' }), true);

assert.strictEqual(hasInternalRequestHeader('content-type, authorization'), false);
assert.strictEqual(hasInternalRequestHeader('content-type, x-user-id'), true);
assert.strictEqual(hasInternalRequestHeader('X-Internal-Auth, x-device-id'), true);
assert.strictEqual(hasInternalRequestHeader(['content-type', 'x-totp-verified']), true);

const invokePreflightGuard = (headers) => {
  let nextCalled = false;
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  rejectUnsafeCorsPreflight(
    { method: 'OPTIONS', headers },
    response,
    () => {
      nextCalled = true;
    },
  );

  return { nextCalled, response };
};

process.env.NODE_ENV = 'production';
process.env.ENVIRONMENT = 'production';
process.env.ALLOWED_ORIGINS = productionEnv.ALLOWED_ORIGINS;

const forgedHeaderPreflight = invokePreflightGuard({
  origin: 'https://app.tembus.test',
  'access-control-request-headers': 'content-type, x-user-role',
});
assert.strictEqual(forgedHeaderPreflight.nextCalled, false);
assert.strictEqual(forgedHeaderPreflight.response.statusCode, 403);
assert.strictEqual(forgedHeaderPreflight.response.body.code, 'ERR_FORBIDDEN_CORS_HEADER');

const unknownOriginPreflight = invokePreflightGuard({
  origin: 'https://evil.test',
  'access-control-request-headers': 'content-type',
});
assert.strictEqual(unknownOriginPreflight.nextCalled, false);
assert.strictEqual(unknownOriginPreflight.response.statusCode, 403);
assert.strictEqual(unknownOriginPreflight.response.body.code, 'ERR_FORBIDDEN_ORIGIN');

const allowedPreflight = invokePreflightGuard({
  origin: 'https://admin.tembus.test',
  'access-control-request-headers': 'content-type, authorization',
});
assert.strictEqual(allowedPreflight.nextCalled, true);
assert.strictEqual(allowedPreflight.response.statusCode, 200);

for (const internalHeader of ['x-user-id', 'x-user-role', 'x-totp-verified', 'x-internal-auth']) {
  assert.strictEqual(
    PUBLIC_ALLOWED_HEADERS.map((header) => header.toLowerCase()).includes(internalHeader),
    false,
    `${internalHeader} must not be public CORS allowed header`,
  );
}

console.log('CORS policy tests passed');
