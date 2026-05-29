const assert = require('assert');
const {
  applyProxyObservabilityHeaders,
  requestObservabilityMiddleware,
  spanIdFromTraceparent,
  traceIdFromTraceparent,
} = require('../dist/requestObservability');

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRACEPARENT_PATTERN = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

const createResponse = () => ({
  headers: {},
  locals: {},
  setHeader(name, value) {
    this.headers[name] = value;
  },
});

const runMiddleware = (headers) => {
  const req = { headers: { ...headers } };
  const res = createResponse();
  let nextCalled = false;

  requestObservabilityMiddleware(req, res, () => {
    nextCalled = true;
  });

  return { req, res, nextCalled };
};

const invalidHeaderResult = runMiddleware({
  'x-request-id': 'bad id with spaces and symbols !@#',
  'x-correlation-id': 'bad correlation !',
  traceparent: '00-00000000000000000000000000000000-0000000000000000-01',
});

assert.strictEqual(invalidHeaderResult.nextCalled, true);
assert.match(invalidHeaderResult.req.headers['x-request-id'], SAFE_ID_PATTERN);
assert.match(invalidHeaderResult.req.headers['x-correlation-id'], SAFE_ID_PATTERN);
assert.match(invalidHeaderResult.req.headers.traceparent, TRACEPARENT_PATTERN);
assert.notStrictEqual(invalidHeaderResult.req.headers['x-request-id'], 'bad id with spaces and symbols !@#');
assert.notStrictEqual(
  invalidHeaderResult.req.headers.traceparent,
  '00-00000000000000000000000000000000-0000000000000000-01',
);
assert.strictEqual(
  invalidHeaderResult.res.headers['X-Request-ID'],
  invalidHeaderResult.req.headers['x-request-id'],
);
assert.strictEqual(
  invalidHeaderResult.res.headers['X-Trace-ID'],
  traceIdFromTraceparent(invalidHeaderResult.req.headers.traceparent),
);

const validTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const validHeaderResult = runMiddleware({
  'x-request-id': 'support-ref-123',
  'x-correlation-id': 'correlation-ref-123',
  traceparent: validTraceparent,
});

assert.strictEqual(validHeaderResult.req.headers['x-request-id'], 'support-ref-123');
assert.strictEqual(validHeaderResult.req.headers['x-correlation-id'], 'correlation-ref-123');
assert.strictEqual(validHeaderResult.req.headers.traceparent, validTraceparent);
assert.strictEqual(validHeaderResult.res.headers['X-Trace-ID'], '4bf92f3577b34da6a3ce929d0e0e4736');
assert.strictEqual(validHeaderResult.res.locals.spanId, '00f067aa0ba902b7');
assert.strictEqual(spanIdFromTraceparent(validTraceparent), '00f067aa0ba902b7');

const proxyReq = {
  headers: {},
  setHeader(name, value) {
    this.headers[name] = value;
  },
};

applyProxyObservabilityHeaders(proxyReq, validHeaderResult.req);

assert.strictEqual(proxyReq.headers['X-Request-ID'], 'support-ref-123');
assert.strictEqual(proxyReq.headers['X-Correlation-ID'], 'correlation-ref-123');
assert.strictEqual(proxyReq.headers.traceparent, validTraceparent);
assert.strictEqual(proxyReq.headers['X-Trace-ID'], '4bf92f3577b34da6a3ce929d0e0e4736');

console.log('Request observability tests passed');
