const assert = require('node:assert/strict');
const { Bulkhead, resolveBulkheadLimit } = require('../dist/resilience/bulkhead.js');

const bulkhead = new Bulkhead(2);
assert.equal(bulkhead.tryAcquire(), true);
assert.equal(bulkhead.tryAcquire(), true);
assert.equal(bulkhead.tryAcquire(), false);
assert.equal(bulkhead.activeRequests, 2);
bulkhead.release();
assert.equal(bulkhead.tryAcquire(), true);
bulkhead.release();
bulkhead.release();
bulkhead.release();
assert.equal(bulkhead.activeRequests, 0);

const previous = process.env.ORDER_SERVICE_BULKHEAD_LIMIT;
process.env.ORDER_SERVICE_BULKHEAD_LIMIT = '7';
assert.equal(resolveBulkheadLimit('order-service'), 7);
if (previous === undefined) delete process.env.ORDER_SERVICE_BULKHEAD_LIMIT;
else process.env.ORDER_SERVICE_BULKHEAD_LIMIT = previous;

console.log('bulkhead tests passed');
