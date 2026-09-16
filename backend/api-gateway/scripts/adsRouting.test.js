const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');

const adsPolicy = source.indexOf("pathname.startsWith('/api/v1/admin/ads')");
const adminPolicy = source.indexOf("pathFilter: '/api/v1/admin'");
const merchantPolicy = source.indexOf("pathFilter: '/api/v1/merchant'");

assert.ok(adsPolicy >= 0, 'gateway must route /api/v1/admin/ads');
assert.ok(adminPolicy >= 0, 'gateway must have admin proxy');
assert.ok(adsPolicy < adminPolicy, 'ads proxy must precede generic /api/v1/admin proxy');
assert.ok(adsPolicy < merchantPolicy, 'ads proxy must precede generic /api/v1/merchant proxy');
assert.ok(source.includes("logProxyForward('ads_service', req, ADS_SERVICE_URL)"), 'ads proxy must target ADS_SERVICE_URL');

console.log('ads routing contract passed');
