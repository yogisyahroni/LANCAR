const requiredUrls = [
  ['VITE_API_URL', process.env.VITE_API_URL],
  ['VITE_SOCKET_URL or VITE_WS_URL', process.env.VITE_SOCKET_URL || process.env.VITE_WS_URL],
];

const allowLocalhostFallback = process.env.VITE_ALLOW_LOCALHOST_FALLBACK === 'true';

const isLocalhost = (hostname) =>
  ['localhost', '127.0.0.1', '::1'].includes(hostname.toLowerCase());

for (const [name, value] of requiredUrls) {
  const configuredValue = value?.trim();

  if (!configuredValue) {
    console.error(`${name} is required for production admin dashboard builds.`);
    process.exit(1);
  }

  try {
    const parsed = new URL(configuredValue);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
      throw new Error('unsupported protocol');
    }
    if (!allowLocalhostFallback && isLocalhost(parsed.hostname)) {
      throw new Error('localhost is not allowed for production admin dashboard builds');
    }
  } catch (error) {
    console.error(`${name} must be a valid non-localhost http(s) or ws(s) URL.`);
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    process.exit(1);
  }
}
