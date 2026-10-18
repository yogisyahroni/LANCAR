import net from 'node:net';
import { Request } from 'express';

const TRUSTED_PROXY_ENV_NAMES = ['TRUSTED_PROXY_IP', 'TRUSTED_PROXY_IPS'] as const;

const normalizeIpAddress = (value: string | undefined): string | null => {
  if (!value) return null;

  let candidate = value.trim();
  if (!candidate) return null;

  if (candidate.startsWith('[') && candidate.endsWith(']')) {
    candidate = candidate.slice(1, -1);
  }

  // Node may expose an IPv4 peer as an IPv4-mapped IPv6 address.
  if (candidate.startsWith('::ffff:') && net.isIP(candidate.slice('::ffff:'.length)) === 4) {
    candidate = candidate.slice('::ffff:'.length);
  }

  return net.isIP(candidate) ? candidate.toLowerCase() : null;
};

const configuredTrustedProxyIps = (): Set<string> => {
  const values = TRUSTED_PROXY_ENV_NAMES
    .flatMap((name) => (process.env[name] || '').split(','))
    .map((value) => normalizeIpAddress(value))
    .filter((value): value is string => Boolean(value));

  return new Set(values);
};

const firstForwardedIp = (value: string | string[] | undefined): string | null => {
  const firstValue = Array.isArray(value) ? value[0] : value;
  if (!firstValue) return null;
  return normalizeIpAddress(firstValue.split(',')[0]);
};

/**
 * Resolve the client IP used by gateway rate limiters.
 *
 * Forwarding headers are trusted only when the immediate TCP peer is an
 * explicitly configured proxy. Otherwise the peer address is used and
 * client-controlled CF/XFF headers are ignored.
 */
export const resolveClientIpForRateLimit = (req: Request): string => {
  const remoteAddress = normalizeIpAddress(req.socket?.remoteAddress);
  const trustedProxies = configuredTrustedProxyIps();

  if (remoteAddress && trustedProxies.has(remoteAddress)) {
    const forwardedIp = firstForwardedIp(req.headers['cf-connecting-ip'])
      || firstForwardedIp(req.headers['x-forwarded-for'])
      || firstForwardedIp(req.headers['x-real-ip']);
    if (forwardedIp) return forwardedIp;
  }

  // req.ip is retained only as a test/fallback value when no socket address
  // exists. In a real HTTP request Node always provides remoteAddress.
  return remoteAddress || normalizeIpAddress(req.ip) || 'unknown';
};

export const trustedProxyAddressesForRateLimit = (): string[] =>
  Array.from(configuredTrustedProxyIps()).sort();
