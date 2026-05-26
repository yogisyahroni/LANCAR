const assert = require('assert');
const { protectDocs, protectMetrics } = require('../dist/opsSurfaceProtection');

const originalEnv = { ...process.env };

const invokeMiddleware = (middleware, headers = {}) => {
  let nextCalled = false;
  const response = {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  middleware(
    { headers },
    response,
    () => {
      nextCalled = true;
    },
  );

  return { nextCalled, response };
};

const setProductionEnv = () => {
  process.env.NODE_ENV = 'production';
  process.env.ENVIRONMENT = 'production';
};

try {
  process.env = { ...originalEnv };
  process.env.NODE_ENV = 'development';
  delete process.env.ENVIRONMENT;

  let result = invokeMiddleware(protectDocs);
  assert.strictEqual(result.nextCalled, true);

  result = invokeMiddleware(protectMetrics);
  assert.strictEqual(result.nextCalled, true);

  process.env = { ...originalEnv };
  setProductionEnv();
  delete process.env.DOCS_BASIC_AUTH_USERNAME;
  delete process.env.DOCS_BASIC_AUTH_PASSWORD;

  result = invokeMiddleware(protectDocs);
  assert.strictEqual(result.nextCalled, false);
  assert.strictEqual(result.response.statusCode, 404);

  process.env.DOCS_BASIC_AUTH_USERNAME = 'docs-admin';
  process.env.DOCS_BASIC_AUTH_PASSWORD = 'docs-password-very-strong';

  result = invokeMiddleware(protectDocs);
  assert.strictEqual(result.nextCalled, false);
  assert.strictEqual(result.response.statusCode, 401);
  assert.ok(result.response.headers['www-authenticate'].includes('LANCAR API Docs'));

  const validBasicAuth = Buffer.from('docs-admin:docs-password-very-strong').toString('base64');
  result = invokeMiddleware(protectDocs, { authorization: `Basic ${validBasicAuth}` });
  assert.strictEqual(result.nextCalled, true);

  process.env = { ...originalEnv };
  setProductionEnv();
  process.env.METRICS_BEARER_TOKEN = 'metrics-token-very-strong-32-bytes';

  result = invokeMiddleware(protectMetrics);
  assert.strictEqual(result.nextCalled, false);
  assert.strictEqual(result.response.statusCode, 401);

  result = invokeMiddleware(protectMetrics, { authorization: 'Bearer wrong-token' });
  assert.strictEqual(result.nextCalled, false);
  assert.strictEqual(result.response.statusCode, 401);

  result = invokeMiddleware(protectMetrics, {
    authorization: 'Bearer metrics-token-very-strong-32-bytes',
  });
  assert.strictEqual(result.nextCalled, true);

  console.log('Ops surface protection tests passed');
} finally {
  process.env = originalEnv;
}
