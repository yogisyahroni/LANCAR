const LOCAL_API_URL = 'http://localhost:8080/api/v1';
const LOCAL_SOCKET_URL = 'http://localhost:8080';

const isProductionBuild = process.env.NODE_ENV === 'production';
const allowLocalhostFallback =
  !isProductionBuild || process.env.NEXT_PUBLIC_ALLOW_LOCALHOST_FALLBACK === 'true';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const assertUsableUrl = (name: string, value: string) => {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
      throw new Error('unsupported protocol');
    }
    const hostname = parsed.hostname.toLowerCase();
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
    if (isProductionBuild && !allowLocalhostFallback && isLocalhost) {
      throw new Error('localhost is not allowed in production');
    }
  } catch {
    throw new Error(`${name} must be a valid http(s) or ws(s) URL.`);
  }
};

const resolveRequiredUrl = (name: string, value: string | undefined, localFallback: string) => {
  const configured = value?.trim();
  if (configured) {
    const normalized = trimTrailingSlash(configured);
    assertUsableUrl(name, normalized);
    return normalized;
  }

  if (allowLocalhostFallback) {
    return localFallback;
  }

  throw new Error(`${name} is required for production customer web builds.`);
};

export const customerApiUrl = resolveRequiredUrl(
  'NEXT_PUBLIC_API_URL',
  process.env.NEXT_PUBLIC_API_URL,
  LOCAL_API_URL
);

export const customerApiRootUrl = customerApiUrl.replace(/\/api\/v1\/?$/, '');

export const customerSocketUrl = resolveRequiredUrl(
  'NEXT_PUBLIC_SOCKET_URL',
  process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_WS_URL,
  LOCAL_SOCKET_URL
);

// URL to initiate Google OAuth from the backend (new PKCE/nonce flow)
export const customerGoogleAuthUrl = `${customerApiRootUrl}/api/v1/auth/customer/google/start`;

// The URL Google will redirect to after consent (must match Google Cloud Console)
export const customerGoogleCallbackUrl =
  typeof window !== 'undefined'
    ? `${window.location.origin}/google-callback`
    : (process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/google-callback');


export const getCustomerServerApiRootUrl = () => {
  const configured =
    process.env.SERVER_API_URL ||
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL;
  return resolveRequiredUrl('SERVER_API_URL or NEXT_PUBLIC_API_URL', configured, LOCAL_API_URL).replace(
    /\/api\/v1\/?$/,
    ''
  );
};
