const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
const reputationPolicy = source.indexOf("path.startsWith('/api/v1/reputation') || path.startsWith('/api/v1/merchant/reputation')");
const merchantPolicy = source.indexOf("matches: (path) => path.startsWith('/api/v1/merchant')");

assert.ok(reputationPolicy >= 0, 'gateway must route public reputation paths');
assert.ok(merchantPolicy < 0 || reputationPolicy < merchantPolicy, 'reputation policy must precede broad merchant proxy');
assert.ok(source.includes("logProxyForward('reputation', req, ADMIN_SERVICE_URL)"), 'reputation proxy must target admin-service');
console.log('reputation routing contract passed');
