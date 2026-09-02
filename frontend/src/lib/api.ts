import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { customerApiUrl } from './runtimeConfig';

const API_URL = customerApiUrl;

export type RecoverableApiError = {
  code: string;
  message: string;
  action?: string;
  retryable: boolean;
  correlationId?: string;
};

export const getRecoverableApiError = (error: any): RecoverableApiError | null => {
  const data = error?.response?.data;
  if (!data || typeof data.code !== 'string') return null;
  return {
    code: data.code,
    message: typeof data.message === 'string' ? data.message : 'Permintaan belum dapat diproses.',
    action: typeof data.action === 'string' ? data.action : undefined,
    retryable: data.retryable === true,
    correlationId: typeof data.correlation_id === 'string' ? data.correlation_id : undefined,
  };
};

const PUBLIC_AUTH_PATHS = [
  '/auth/customer/login/start',
  '/auth/customer/register/start',
  '/auth/customer/google/start',
  '/auth/customer/google/complete',
  '/auth/customer/otp/send',
  '/auth/customer/otp/verify',
  '/auth/customer/apple/start',
  '/auth/customer/apple/complete',
  '/auth/otp/send',
  '/auth/otp/verify',
  '/auth/web/session/exchange',
  '/auth/web/login',
];

const isPublicAuthRequest = (url?: string) => {
  if (!url) return false;
  return PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
};

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_SAFE_METHODS = new Set(['get', 'head', 'options']);

const readCsrfTokenFromCookie = (): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE_NAME.length + 1)) : null;
};

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const safeRequestId = (value: unknown) => {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return SAFE_REQUEST_ID_PATTERN.test(candidate) ? candidate : undefined;
};

const getHeader = (headers: any, name: string) => {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()];
};

const setHeader = (headers: any, name: string, value: string) => {
  if (typeof headers?.set === 'function') {
    headers.set(name, value);
    return headers;
  }
  return {
    ...(headers ?? {}),
    [name]: value,
  };
};

const shortRequestReference = (requestId: string) => `Ref ${requestId.slice(-12).toUpperCase()}`;

const attachErrorReference = (error: any) => {
  const requestId =
    safeRequestId(getHeader(error.response?.headers, 'x-request-id')) ||
    safeRequestId(getHeader(error.config?.headers, 'X-Request-ID'));

  if (!requestId) return error;

  const reference = shortRequestReference(requestId);
  error.requestId = requestId;
  error.referenceCode = reference;

  if (typeof error.response?.data?.message === 'string' && !error.response.data.message.includes(reference)) {
    error.response.data.message = `${error.response.data.message} (${reference})`;
  }
  if (typeof error.message === 'string' && !error.message.includes(reference)) {
    error.message = `${error.message} (${reference})`;
  }

  return error;
};

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for HttpOnly cookies
  headers: {
    'Content-Type': 'application/json',
    'X-Portal': 'customer',
  },
});

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use((config) => {
  // Compatibility bridge for the current aggregator wizard. The gateway already
  // owns /payment-links while the broader /logistics tariff prefix is not yet
  // part of its allowlisted proxy surface. Both admin routes resolve to the same
  // authoritative tariff controller.
  if (config.url === '/logistics/check-tariff' || config.url === '/logistics/tariff') {
    config.url = '/payment-links/tariff';
  }

  config.headers = setHeader(config.headers, 'X-Request-ID', createRequestId());

  const method = (config.method ?? 'get').toLowerCase();
  if (!CSRF_SAFE_METHODS.has(method)) {
    const csrfToken = readCsrfTokenFromCookie();
    if (csrfToken) {
      config.headers = setHeader(config.headers, 'X-CSRF-Token', csrfToken);
    }
  }

  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (typeof config.headers?.delete === 'function') {
      config.headers.delete('Content-Type');
    } else if (config.headers) {
      delete (config.headers as Record<string, unknown>)['Content-Type'];
    }
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    attachErrorReference(error);
    error.recoverable = getRecoverableApiError(error);
    if (error.recoverable?.action && typeof error.response?.data?.message === 'string') {
      const action = error.recoverable.action;
      if (!error.response.data.message.includes(action)) {
        error.response.data.message = `${error.response.data.message} ${action}`;
      }
    }
    const originalRequest = error.config;

    // Check if error is due to expired or missing token (401 Unauthorized)
    if (
      error.response &&
      error.response.status === 401 &&
      !originalRequest._retry &&
      !isPublicAuthRequest(originalRequest.url)
    ) {
      if (originalRequest.url?.includes('/auth/web/refresh-token')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post('/auth/web/refresh-token');
        isRefreshing = false;
        processQueue(null);
        return api(originalRequest);
      } catch (err: any) {
        isRefreshing = false;
        processQueue(err);

        if (!originalRequest.url?.includes('/auth/web/logout')) {
          const { setAuth } = useAuthStore.getState();
          setAuth(false, null);
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.href = '/login?reason=session-expired';
          }
        }
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  }
);
