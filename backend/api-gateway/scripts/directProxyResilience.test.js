const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDirectProxyResilienceMiddleware } = require('../dist/resilience/directProxy.js');

const makePolicy = (overrides = {}) => {
  const breaker = { opened: false, failures: [], fire(error) { this.failures.push(error); } };
  const bulkhead = {
    active: 0,
    tryAcquire() { this.active += 1; return true; },
    release() { this.active -= 1; },
  };
  return {
    matches: (path) => path.startsWith('/legacy'),
    serviceName: 'legacy-service',
    breaker,
    bulkhead,
    observeResponse: true,
    ...overrides,
  };
};

const makeResponse = () => {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.status = (code) => { response.statusCode = code; return response; };
  response.json = (body) => { response.body = body; return response; };
  return response;
};

const policy = makePolicy();
const middleware = createDirectProxyResilienceMiddleware([policy], (breaker, message) => {
  breaker.fire(new Error(message));
});
const req = { path: '/legacy/orders' };
const res = makeResponse();
let downstreamCalled = false;
middleware(req, res, () => {
  downstreamCalled = true;
});
assert.equal(policy.bulkhead.active, 1);
assert.equal(downstreamCalled, true);
res.statusCode = 502;
res.emit('finish');
res.emit('close');
assert.equal(policy.bulkhead.active, 0);
assert.equal(policy.breaker.failures.length, 1);

const abortedPolicy = makePolicy();
const abortedResponse = makeResponse();
createDirectProxyResilienceMiddleware([abortedPolicy], (breaker, message) => {
  breaker.fire(new Error(message));
})(
  { path: '/legacy/aborted' },
  abortedResponse,
  () => {},
);
abortedResponse.emit('close');
assert.equal(abortedPolicy.bulkhead.active, 0);
assert.equal(abortedPolicy.breaker.failures.length, 1);

const fullPolicy = makePolicy({
  bulkhead: { tryAcquire: () => false, release: () => { throw new Error('must not release'); } },
});
const fullResponse = makeResponse();
let fullNextCalled = false;
createDirectProxyResilienceMiddleware([fullPolicy], () => {})(
  { path: '/legacy/full' },
  fullResponse,
  () => { fullNextCalled = true; },
);
assert.equal(fullNextCalled, false);
assert.equal(fullResponse.statusCode, 503);
assert.equal(fullResponse.body.error.code, 'ERR_BULKHEAD_FULL');

const openPolicy = makePolicy({ breaker: { opened: true, fire() {} } });
const openResponse = makeResponse();
let openNextCalled = false;
createDirectProxyResilienceMiddleware([openPolicy], () => {})(
  { path: '/legacy/orders' },
  openResponse,
  () => { openNextCalled = true; },
);
assert.equal(openNextCalled, false);
assert.equal(openResponse.statusCode, 503);
assert.equal(openResponse.body.error.code, 'ERR_CIRCUIT_OPEN');

console.log('direct proxy resilience tests passed');
