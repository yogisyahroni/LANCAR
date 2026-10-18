const assert = require('assert');
const { resolveClientIpForRateLimit } = require('../dist/rateLimitClientIp');

const originalTrustedProxyIp = process.env.TRUSTED_PROXY_IP;
const originalTrustedProxyIps = process.env.TRUSTED_PROXY_IPS;

const request = ({ remoteAddress, ip, headers = {} }) => ({
  socket: { remoteAddress },
  ip,
  headers,
});

try {
  delete process.env.TRUSTED_PROXY_IP;
  delete process.env.TRUSTED_PROXY_IPS;

  assert.strictEqual(
    resolveClientIpForRateLimit(request({
      remoteAddress: '203.0.113.10',
      headers: { 'x-forwarded-for': '198.51.100.20', 'cf-connecting-ip': '198.51.100.21' },
    })),
    '203.0.113.10',
    'untrusted peers must not control the rate-limit key through forwarding headers',
  );

  process.env.TRUSTED_PROXY_IP = '203.0.113.10';
  assert.strictEqual(
    resolveClientIpForRateLimit(request({
      remoteAddress: '203.0.113.10',
      headers: { 'x-forwarded-for': '198.51.100.20', 'cf-connecting-ip': '198.51.100.21' },
    })),
    '198.51.100.21',
    'trusted Cloudflare peers may provide a validated client IP',
  );

  assert.strictEqual(
    resolveClientIpForRateLimit(request({
      remoteAddress: '203.0.113.11',
      headers: { 'x-forwarded-for': '198.51.100.20' },
    })),
    '203.0.113.11',
    'a different proxy must not inherit the trusted proxy policy',
  );

  assert.strictEqual(
    resolveClientIpForRateLimit(request({
      remoteAddress: '::ffff:203.0.113.10',
      headers: { 'x-forwarded-for': '198.51.100.22' },
    })),
    '198.51.100.22',
    'IPv4-mapped proxy addresses must match the configured IPv4 allowlist',
  );

  console.log('Rate-limit client IP tests passed');
} finally {
  if (originalTrustedProxyIp === undefined) delete process.env.TRUSTED_PROXY_IP;
  else process.env.TRUSTED_PROXY_IP = originalTrustedProxyIp;
  if (originalTrustedProxyIps === undefined) delete process.env.TRUSTED_PROXY_IPS;
  else process.env.TRUSTED_PROXY_IPS = originalTrustedProxyIps;
}
