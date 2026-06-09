import { NextFunction, Request, Response } from 'express';

export type GatewayRouteAuthRequirement =
  | 'public'
  | 'ops-protected'
  | 'jwt'
  | 'web-session-or-jwt'
  | 'admin-session-or-jwt';

export type GatewayRoutePolicy = {
  id: string;
  requirement: GatewayRouteAuthRequirement;
  publicReason?: string;
};

type GatewayRouteRule = GatewayRoutePolicy & {
  matches: (method: string, path: string) => boolean;
};

type JwtAuthenticator = (req: Request, res: Response, next: NextFunction) => void;

const normalizeMethod = (method: string) => method.toUpperCase();

const exact = (expectedPath: string, methods?: string[]) => (method: string, path: string) => {
  const methodMatches = !methods || methods.includes(normalizeMethod(method));
  return methodMatches && path === expectedPath;
};

const prefix = (expectedPrefix: string, methods?: string[]) => (method: string, path: string) => {
  const methodMatches = !methods || methods.includes(normalizeMethod(method));
  return methodMatches && (path === expectedPrefix || path.startsWith(`${expectedPrefix}/`));
};

const authWebPublic = (method: string, path: string) => {
  const normalizedMethod = normalizeMethod(method);
  const publicExactRoutes = [
    { method: 'POST', path: '/api/v1/auth/web/login' },
    { method: 'POST', path: '/api/v1/auth/web/session/exchange' },
    { method: 'POST', path: '/api/v1/auth/web/logout' },
    { method: 'GET', path: '/api/v1/auth/web/delivery-services' },
  ];

  return publicExactRoutes.some((route) => route.method === normalizedMethod && route.path === path);
};

const authServicePublic = (method: string, path: string) => {
  const normalizedMethod = normalizeMethod(method);
  const publicExactRoutes = [
    { method: 'POST', path: '/api/v1/auth/otp/send' },
    { method: 'POST', path: '/api/v1/auth/otp/verify' },
    { method: 'POST', path: '/api/v1/auth/customer/login/start' },
    { method: 'POST', path: '/api/v1/auth/customer/register/start' },
    { method: 'POST', path: '/api/v1/auth/password-reset/request' },
    { method: 'POST', path: '/api/v1/auth/password-reset/confirm' },
    { method: 'POST', path: '/api/v1/auth/refresh' },
    { method: 'POST', path: '/api/v1/auth/logout' },
    { method: 'POST', path: '/api/v1/auth/2fa/complete' },
  ];

  return publicExactRoutes.some((route) => route.method === normalizedMethod && route.path === path);
};

export const GATEWAY_ROUTE_AUTH_MATRIX: GatewayRouteRule[] = [
  {
    id: 'cors-preflight',
    requirement: 'public',
    publicReason: 'CORS preflight is validated by the CORS policy guard before route auth.',
    matches: (method) => normalizeMethod(method) === 'OPTIONS',
  },
  {
    id: 'gateway-health',
    requirement: 'public',
    publicReason: 'Health endpoint is needed by load balancers and container health checks.',
    matches: exact('/health', ['GET']),
  },
  {
    id: 'gateway-metrics',
    requirement: 'ops-protected',
    publicReason: 'Passed through to the dedicated metrics protection middleware.',
    matches: exact('/metrics', ['GET']),
  },
  {
    id: 'swagger-docs',
    requirement: 'ops-protected',
    publicReason: 'Passed through to the dedicated documentation protection middleware.',
    matches: prefix('/docs'),
  },
  {
    id: 'socket-handshake',
    requirement: 'public',
    publicReason: 'Socket.IO performs token/session validation during the connection handshake.',
    matches: prefix('/socket.io'),
  },
  {
    id: 'uploaded-assets',
    requirement: 'public',
    publicReason: 'Compatibility path for existing uploaded assets; upload hardening is tracked separately.',
    matches: prefix('/uploads', ['GET', 'HEAD']),
  },
  {
    id: 'auth-service-public',
    requirement: 'public',
    publicReason: 'Login, OTP, refresh, and logout endpoints must be reachable before authentication.',
    matches: authServicePublic,
  },
  {
    id: 'courier-auth-public',
    requirement: 'public',
    publicReason: 'Courier login, OTP verification, and onboarding links are public entrypoints.',
    matches: prefix('/api/v1/auth/courier'),
  },
  {
    id: 'web-auth-public',
    requirement: 'public',
    publicReason: 'Web login/session exchange and public delivery-service discovery are pre-auth flows.',
    matches: authWebPublic,
  },
  {
    id: 'mobile-update-version-public',
    requirement: 'public',
    publicReason: 'Mobile apps need latest-version metadata before a user can complete an app update.',
    matches: exact('/api/v1/system/latest-version', ['GET']),
  },
  {
    id: 'maps-public-runtime',
    requirement: 'public',
    publicReason: 'Customer and courier clients need maps runtime config before order placement.',
    matches: prefix('/api/v1/maps', ['GET', 'POST']),
  },
  {
    id: 'customer-public-handoff',
    requirement: 'public',
    publicReason: 'Receiver handoff links use a scoped token in the URL and are validated downstream.',
    matches: prefix('/api/v1/public'),
  },
  {
    id: 'payment-provider-webhook',
    requirement: 'public',
    publicReason: 'Payment provider webhook is authenticated by provider signature downstream.',
    matches: prefix('/api/v1/payments/midtrans'),
  },
  {
    id: 'pricing-estimate-public',
    requirement: 'public',
    publicReason: 'Pricing estimate is a public quote endpoint with gateway payload validation.',
    matches: exact('/api/v1/pricing/estimate', ['POST']),
  },
  {
    id: 'admin-management',
    requirement: 'admin-session-or-jwt',
    matches: prefix('/api/v1/admin'),
  },
  {
    id: 'web-session-routes',
    requirement: 'web-session-or-jwt',
    matches: prefix('/api/v1/auth/web'),
  },
  {
    id: 'customer-portal-api',
    requirement: 'web-session-or-jwt',
    matches: prefix('/api/v1/customer'),
  },
  {
    id: 'mobile-courier-api',
    requirement: 'jwt',
    matches: (method, path) =>
      prefix('/api/v1/mobile')(method, path) ||
      prefix('/api/v1/courier')(method, path),
  },
  {
    id: 'order-domain-api',
    requirement: 'jwt',
    matches: (method, path) =>
      prefix('/api/v1/orders')(method, path) ||
      prefix('/api/v1/couriers')(method, path) ||
      prefix('/api/v1/tracking')(method, path) ||
      prefix('/api/v1/meeting-points')(method, path) ||
      prefix('/api/v1/notifications')(method, path) ||
      prefix('/api/v1/insurance')(method, path),
  },
  {
    id: 'routing-api',
    requirement: 'jwt',
    matches: prefix('/api/v1/routing'),
  },
  {
    id: 'wallet-api',
    requirement: 'jwt',
    matches: prefix('/api/v1/wallet'),
  },
  {
    id: 'auth-service-protected',
    requirement: 'jwt',
    matches: (method, path) =>
      prefix('/api/v1/auth')(method, path) ||
      prefix('/api/v1/users')(method, path),
  },
  {
    id: 'payment-api',
    requirement: 'jwt',
    matches: prefix('/api/v1/payments'),
  },
  {
    id: 'api-default-deny-anonymous',
    requirement: 'jwt',
    matches: prefix('/api/v1'),
  },
];

export const resolveGatewayRoutePolicy = (method: string, path: string): GatewayRoutePolicy => {
  const matchedRule = GATEWAY_ROUTE_AUTH_MATRIX.find((rule) => rule.matches(method, path));

  if (matchedRule) {
    return {
      id: matchedRule.id,
      requirement: matchedRule.requirement,
      publicReason: matchedRule.publicReason,
    };
  }

  return {
    id: 'non-api-public',
    requirement: 'public',
    publicReason: 'Non-API paths are not proxied to protected service resources by default.',
  };
};

const hasBearerToken = (req: Request) => {
  const authHeader = req.headers.authorization || '';
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
};

const hasCookie = (req: Request, cookieName: string) => {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Array.isArray(cookieHeader) ? cookieHeader.join(';') : cookieHeader;
  return cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .some((cookie) => cookie.startsWith(`${cookieName}=`));
};

const hasWebSessionCookie = (req: Request) =>
  hasCookie(req, 'customer_session') || hasCookie(req, 'admin_session') || hasCookie(req, 'web_session');

const hasAdminSessionCookie = (req: Request) => hasCookie(req, 'admin_session');

const rejectAnonymous = (res: Response, policy: GatewayRoutePolicy) =>
  res.status(401).json({
    status: 'error',
    code: 'ERR_ROUTE_AUTH_REQUIRED',
    message: 'Authentication required for this route',
    route_policy: policy.id,
  });

export const createGatewayAuthMatrixMiddleware = (authenticateJwt: JwtAuthenticator) => (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const policy = resolveGatewayRoutePolicy(req.method, req.path);
  res.locals.gatewayRoutePolicy = policy.id;

  if (policy.requirement === 'public' || policy.requirement === 'ops-protected') {
    return next();
  }

  if (policy.requirement === 'jwt') {
    return authenticateJwt(req, res, next);
  }

  if (policy.requirement === 'web-session-or-jwt') {
    if (hasBearerToken(req)) {
      return authenticateJwt(req, res, next);
    }
    if (hasWebSessionCookie(req)) {
      // S-AG-01 FIX: Cookie presence alone is NOT treated as authentication.
      // We mark the request so admin-service knows it must perform its own
      // DB-backed cookie verification (via requireMobileOrWebAuth / verifyWebSession).
      // admin-service validates: session_token exists in web_sessions, not expired,
      // user role matches 'customer', user not deleted.
      req.headers['x-auth-via-cookie'] = '1';
      return next();
    }
    return rejectAnonymous(res, policy);
  }

  if (policy.requirement === 'admin-session-or-jwt') {
    if (hasBearerToken(req)) {
      return authenticateJwt(req, res, next);
    }
    if (hasAdminSessionCookie(req)) {
      // S-AG-02 FIX: Same as web-session — mark for downstream verification.
      // admin-service validates: session exists, role is admin-level, not expired.
      req.headers['x-auth-via-cookie'] = '1';
      return next();
    }
    return rejectAnonymous(res, policy);
  }

  return rejectAnonymous(res, policy);
};
