import { getActiveTraceContext, shutdownTracing } from './tracing';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino-http';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';
import CircuitBreaker from 'opossum';
import { validate } from './middleware/validator';
import jwt from 'jsonwebtoken';
import {
  applyInternalGatewayAuth,
  resolveInternalGatewaySecret,
  stripInternalIdentityHeaders,
} from './internalAuth';
import { validateProductionEnv } from './envValidation';
import { buildCorsOptions, rejectUnsafeCorsPreflight } from './corsPolicy';
import { createGatewayAuthMatrixMiddleware } from './routeAuthMatrix';
import { protectDocs, protectMetrics } from './opsSurfaceProtection';
import { verifyCsrfToken } from './middleware/csrf';
import {
  createMapsAbuseGuard,
  createPricingAbuseGuard,
  createPublicEndpointRateLimiter,
} from './publicEndpointAbuseProtection';
import {
  applyProxyObservabilityHeaders,
  requestObservabilityMiddleware,
  spanIdFromTraceparent,
  traceIdFromTraceparent,
} from './requestObservability';



import { PricingEstimateSchema, CreateOrderSchema } from './schemas/order.schema';
import {
  OTPSendSchema,
  OTPVerifySchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  RegisterSchema,
} from './schemas/auth.schema';

dotenv.config({ path: '../../.env' });
validateProductionEnv();

const app = express();

const resolveTrustProxy = (value?: string): boolean | number | string => {
  const rawValue = value?.trim();
  const normalized = rawValue?.toLowerCase();
  if (!rawValue || !normalized) {
    return 1;
  }
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  const hopCount = Number.parseInt(normalized, 10);
  if (Number.isFinite(hopCount) && hopCount > 0) {
    return hopCount;
  }
  return rawValue;
};

app.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY));

const logger = pino({
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'res.headers["set-cookie"]',
  ],
  customProps: (req) => {
    const activeTrace = getActiveTraceContext();
    return {
      correlation_id: req.headers['x-correlation-id'],
      request_id: req.headers['x-request-id'],
      trace_id: activeTrace?.traceId || traceIdFromTraceparent(req.headers.traceparent),
      span_id: activeTrace?.spanId || spanIdFromTraceparent(req.headers.traceparent),
    };
  },
});

// --- ENTERPRISE OBSERVABILITY (Prometheus) ---
const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpLatencyHistogram = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

const publicEndpointAbuseCounter = new Counter({
  name: 'public_endpoint_abuse_events_total',
  help: 'Public endpoint abuse-protection events',
  labelNames: ['endpoint', 'reason', 'action'],
  registers: [register],
});

const recordPublicAbuseEvent = (event: { endpoint: string; reason: string; action: string }) => {
  publicEndpointAbuseCounter.labels(event.endpoint, event.reason, event.action).inc();
};

// Request correlation boundary. Public clients may send a request ID, but only
// sanitized IDs and valid W3C trace context are propagated to downstream services.
app.use(requestObservabilityMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.path;
    httpRequestCounter.labels(req.method, route, res.statusCode.toString()).inc();
    httpLatencyHistogram.labels(req.method, route, res.statusCode.toString()).observe(duration);
  });
  next();
});

// Block external access to internal routes
app.use((req, res, next) => {
  if (req.path.includes('/api/v1/internal/')) {
    logger.logger.warn({ path: req.path, ip: req.ip }, 'Blocked external access to internal route');
    return res.status(403).json({
      status: 'error',
      code: 'ERR_FORBIDDEN',
      message: 'Access to internal routes is forbidden from external gateway'
    });
  }
  next();
});

// --- ENTERPRISE RESILIENCE (Circuit Breakers) ---
const breakerOptions = {
  timeout: 5000, // If service takes longer than 5s, trigger failure
  errorThresholdPercentage: 50, // If 50% of requests fail, open the circuit
  resetTimeout: 30000, // After 30s, try again (half-open)
};

const createServiceBreaker = (serviceName: string) => {
  const breaker = new CircuitBreaker(async (proxyReq: any) => {
    // This is a wrapper, the actual proxying is handled by http-proxy-middleware.
    // We use the breaker to track health.
    return true; 
  }, { ...breakerOptions, name: serviceName });

  breaker.fallback(() => ({
    error: true,
    message: `Service ${serviceName} is currently unavailable (Circuit Breaker Open)`,
  }));

  return breaker;
};

const authBreaker = createServiceBreaker('auth-service');
const orderBreaker = createServiceBreaker('order-service');
const adminBreaker = createServiceBreaker('admin-service');
const paymentBreaker = createServiceBreaker('payment-service');
const merchantBreaker = createServiceBreaker('merchant-service'); // FOOD-BIKE-019

const requestLogContext = (req: Request) => {
  const activeTrace = getActiveTraceContext();
  return {
    correlation_id: req.headers['x-correlation-id'],
    request_id: req.headers['x-request-id'],
    trace_id: activeTrace?.traceId || traceIdFromTraceparent(req.headers.traceparent),
    span_id: activeTrace?.spanId || spanIdFromTraceparent(req.headers.traceparent),
  };
};



app.use(helmet({
  // S2-BE-03: API gateway serves no HTML, so CSP is defensive-in-depth.
  // Remove 'unsafe-inline' from scriptSrc — there are zero server-rendered scripts here.
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],            // no unsafe-inline, no CDN
      styleSrc: ["'self'"],             // no unsafe-inline
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],       // clickjacking prevention
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 63072000, // 2 years — HSTS preload requirement
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// S2-BE-03: Permissions-Policy to restrict browser feature APIs on API gateway
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// CORS has to run before rate limiting and auth middleware. Browser preflights
// and throttled responses must still carry Access-Control-Allow-Origin.
app.use(rejectUnsafeCorsPreflight);
app.use(cors(buildCorsOptions()));

// --- ENTERPRISE SECURITY VALIDATION ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.logger.fatal({ event: 'startup_secret_missing', secret: 'JWT_SECRET' }, 'API Gateway cannot start without required secret');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !resolveInternalGatewaySecret()) {
  logger.logger.fatal({ event: 'startup_secret_missing', secret: 'INTERNAL_GATEWAY_SECRET' }, 'API Gateway cannot start without required internal secret');
  process.exit(1);
}

// Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 requests per 15 minutes
  keyGenerator: (req) => {
    return (req.headers['cf-connecting-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'ERR_TOO_MANY_REQUESTS',
    message: 'Too many authentication attempts, please try again later',
  },
});

const logProxyForward = (proxy: string, req: Request, target: string) => {
  logger.logger.debug({
    ...requestLogContext(req),
    event: 'proxy_forward',
    proxy,
    method: req.method,
    path: req.path || req.url?.split('?')[0],
    upstream_configured: Boolean(target),
  }, 'Gateway proxy forwarding');
};

const logProxyError = (proxy: string, target: string, err: Error, req?: Request) => {
  logger.logger.error({
    ...(req ? requestLogContext(req) : {}),
    event: 'proxy_error',
    proxy,
    upstream_configured: Boolean(target),
    error_name: err.name,
    error_message: err.message,
  }, 'Gateway proxy error');
};

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per minute
  keyGenerator: (req) => {
    return (req.headers['cf-connecting-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: {
    status: 'error',
    code: 'ERR_TOO_MANY_REQUESTS',
    message: 'Too many requests, please try again later',
  },
});

const publicMapsLimiter = createPublicEndpointRateLimiter('maps', { recordEvent: recordPublicAbuseEvent });
const publicPricingLimiter = createPublicEndpointRateLimiter('pricing', { recordEvent: recordPublicAbuseEvent });
const publicSystemLimiter = createPublicEndpointRateLimiter('system', { recordEvent: recordPublicAbuseEvent });
const publicMapsAbuseGuard = createMapsAbuseGuard({ recordEvent: recordPublicAbuseEvent });
const publicPricingAbuseGuard = createPricingAbuseGuard({ recordEvent: recordPublicAbuseEvent });

// 🛡️ Global DDoS & Brute-Force Defense Layer
app.use(generalLimiter);
app.use(stripInternalIdentityHeaders);

// JWT Authentication Middleware
// SECURITY 2026 (CVE-2025-30144 / Algorithm Confusion):
// jwt.verify tanpa opsi 'algorithms' rentan terhadap Algorithm Confusion Attack:
// penyerang yang menguasai key RS256 sendiri bisa forge token jika library
// fall-back ke algoritma lain. Tambah pin algorithms:['HS256'] dan validasi issuer.
const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    const expectedIssuer = process.env.JWT_ISSUER || 'tembus-auth-service';

    jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],   // Algorithm pinning — tolak RS256/none/HS384 dsb
      issuer: expectedIssuer,  // Validasi klaim 'iss' — cegah token cross-service
    }, (err: any, user: any) => {
      if (err) {
        // RFC 6750: access token invalid/expired → 401 (bukan 403).
        // OkHttp Authenticator & klien standar lain hanya memicu refresh pada 401.
        return res.status(401).json({ 
          status: 'error', 
          code: 'ERR_UNAUTHORIZED', 
          message: 'Invalid or expired token' 
        });
      }
      
      if (user && (user.user_id || user.id)) {
        req.headers['x-user-id'] = user.user_id || user.id;
      }
      if (user?.role) {
        req.headers['x-user-role'] = user.role;
      }
      if (user?.full_name || user?.name) {
        req.headers['x-user-full-name'] = user.full_name || user.name;
      }
      req.headers['x-totp-verified'] = String(Boolean(user?.totp_verified));
      next();
    });
  } else {
    res.status(401).json({ status: 'error', code: 'ERR_UNAUTHORIZED', message: 'Authentication required' });
  }
};

// S-AG-01 FIX: authenticateCustomerApi was removed.
// It only checked for the *presence* of a customer_session cookie without
// validating its value — providing zero real security.
// Authentication for /api/v1/customer/* is now handled entirely by:
//   1. createGatewayAuthMatrixMiddleware (web-session-or-jwt policy)
//   2. admin-service requireMobileOrWebAuth which validates the cookie against DB

app.use(logger);
app.use(createGatewayAuthMatrixMiddleware(authenticateJWT));

// Middleware to parse JSON only for specific routes that need validation in the gateway
const jsonParser = express.json({ limit: '16kb' });

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:8081';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:8083';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:8084';
const MERCHANT_SERVICE_URL = process.env.MERCHANT_SERVICE_URL || 'http://localhost:8085'; // FOOD-BIKE-019
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL || 'http://localhost:3000';
const ROUTING_SERVICE_URL = process.env.ROUTING_SERVICE_URL || 'http://localhost:8082';

logger.logger.info({
  event: 'gateway_upstream_configured',
  auth_service_configured: Boolean(AUTH_SERVICE_URL),
  admin_service_configured: Boolean(ADMIN_SERVICE_URL),
  order_service_configured: Boolean(ORDER_SERVICE_URL),
}, 'Gateway upstream services configured');

const phoneRegex = /^(08|628|\+628)[0-9]{8,11}$/;
function normalizePhoneString(phone: string): string {
  const p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('08')) return '+628' + p.substring(2);
  if (p.startsWith('628')) return '+' + p;
  if (p.startsWith('+628')) return p;
  return p;
}

function deepNormalizePhone(obj: any) {
  if (Array.isArray(obj)) {
    obj.forEach(deepNormalizePhone);
  } else if (obj !== null && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string' && (key.includes('phone') || phoneRegex.test(obj[key]))) {
        if (phoneRegex.test(obj[key])) {
          obj[key] = normalizePhoneString(obj[key]);
        }
      } else {
        deepNormalizePhone(obj[key]);
      }
    }
  }
}

const prepareProxyRequest = (proxyReq: any, req: Request) => {
  if (req.body) {
    deepNormalizePhone(req.body);
  }
  applyInternalGatewayAuth(proxyReq, req);
  applyProxyObservabilityHeaders(proxyReq, req);
  fixRequestBody(proxyReq, req);
};

// Helper for proxying with body fix and circuit breaker integration
const proxyWithResilience = (target: string, breaker: any) => 
  createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq: any, req: any, res: any) => {
        if (!breaker.opened) {
          // Transform 'phone' to 'phone_number' if present in the body
          if (req.body && req.body.phone && !req.body.phone_number) {
            req.body.phone_number = req.body.phone;
          }
          prepareProxyRequest(proxyReq, req);
        } else {
          res.status(503).json({
            status: 'error',
            code: 'ERR_CIRCUIT_OPEN',
            message: `Service at ${target} is struggling. Circuit breaker is OPEN.`,
          });
          proxyReq.destroy();
        }
      },
      proxyRes: (proxyRes: any, req: any, res: any) => {
        if (proxyRes.statusCode >= 500) {
          breaker.fire(); // Notify breaker of failure
        }
      },
      error: (err: Error, req: any, res: any) => {
        breaker.fire(); // Notify breaker of failure
        logProxyError('resilient_proxy', target, err, req as Request);
        if (res && typeof res.status === 'function') {
          res.status(502).json({
            status: 'error',
            code: 'ERR_BAD_GATEWAY',
            message: 'Service is currently unavailable',
          });
        }
      }
    }
  });


// WebSocket Proxy for Admin Service (Socket.io)
const adminWsProxy = createProxyMiddleware({
  pathFilter: '/socket.io',
  target: ADMIN_SERVICE_URL,
  ws: true,
  changeOrigin: true,
});

// Use the proxy for socket.io path
app.use(adminWsProxy);

// Static upload files served by Admin Service.
app.use(createProxyMiddleware({
  pathFilter: '/uploads',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true
}));

// FB-110: Merchant uploads (foto menu & dokumen registrasi) — path unik
// /merchant-uploads → merchant-service, PUBLIK (tanpa JWT) supaya gambar
// bisa tampil di app customer / web tanpa login.
app.use(createProxyMiddleware({
  pathFilter: '/merchant-uploads',
  target: MERCHANT_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('merchant_uploads', req, MERCHANT_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// --- VALIDATED ROUTES ---

// Auth Service (Gateway-level validation)
app.post(
  '/api/v1/auth/otp/send',
  authLimiter,
  jsonParser,
  validate(OTPSendSchema),
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/otp/verify',
  authLimiter,
  jsonParser,
  validate(OTPVerifySchema),
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/customer/login/start',
  authLimiter,
  jsonParser,
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

// Route eksplisit (bukan via app.use mount) — http-proxy-middleware v3 di Express 5
// tidak meneruskan app.use(path, proxy) untuk path ini (regresi; test 2026-08-10).
app.post(
  '/api/v1/auth/refresh',
  authLimiter,
  jsonParser,
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/logout',
  authLimiter,
  jsonParser,
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/customer/register/start',
  authLimiter,
  jsonParser,
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/customer/otp/send',
  authLimiter,
  jsonParser,
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/customer/otp/verify',
  authLimiter,
  jsonParser,
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/customer/google/start',
  authLimiter,
  jsonParser,
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/customer/google/complete',
  authLimiter,
  jsonParser,
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/password-reset/request',
  authLimiter,
  jsonParser,
  validate(PasswordResetRequestSchema),
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/password-reset/confirm',
  authLimiter,
  jsonParser,
  validate(PasswordResetConfirmSchema),
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

app.post(
  '/api/v1/auth/register',
  jsonParser,
  validate(RegisterSchema),
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

// Pricing Estimate (Validation in Gateway)
app.post(
  '/api/v1/pricing/estimate',
  publicPricingLimiter,
  jsonParser,
  publicPricingAbuseGuard,
  validate(PricingEstimateSchema),
  proxyWithResilience(ORDER_SERVICE_URL, orderBreaker)
);

// Order Creation (Validation in Gateway)
app.post(
  '/api/v1/orders',
  jsonParser,
  validate(CreateOrderSchema),
  proxyWithResilience(ORDER_SERVICE_URL, orderBreaker)
);

// --- PROXY ROUTES (Pass-through) ---

// Auth Service - Web/Admin Auth Routes (High Priority)
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/auth/web',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/auth/web': '/auth/web'
  },
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('admin_auth', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    },
    proxyRes: (proxyRes: any, req: any, res: any) => {
      if (proxyRes.headers['set-cookie']) {
        logger.logger.debug({
          event: 'proxy_set_cookie',
          proxy: 'admin_auth',
          set_cookie_count: Array.isArray(proxyRes.headers['set-cookie']) ? proxyRes.headers['set-cookie'].length : 1,
        }, 'Proxy response set-cookie detected');
      }
    }
  }
}));

// Courier Mobile Auth Routes (compatibility with Android courier app)
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/auth/courier',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('courier_auth', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// Merchant Public Web Registration (merchant.bawain.my.id)
// Upload dokumen + cek status pendaftaran → admin-service (pola courier).
// Diletakkan SEBELUM '/api/v1/auth' general (auth-service) supaya tidak
// ketimpa — endpoint ini hanya ada di admin-service.
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/auth/merchant',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('merchant_auth', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// Auth Service - General Routes
app.use('/api/v1/auth', proxyWithResilience(AUTH_SERVICE_URL, authBreaker));

// Public Mobile Update Metadata
app.use('/api/v1/system/latest-version', publicSystemLimiter);
app.use('/api/v1/config/runtime', publicSystemLimiter);
app.use(createProxyMiddleware({
  pathFilter: (pathname: string, req: Request) =>
    req.method === 'GET' && (pathname === '/api/v1/system/latest-version' || pathname === '/api/v1/config/runtime'),
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('system_update', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    },
    proxyRes: (proxyRes: any) => {
      if (proxyRes.statusCode >= 500) {
        adminBreaker.fire(null);
      }
    },
    error: (err: Error, req: any, res: any) => {
      adminBreaker.fire(null);
      logProxyError('system_update', ADMIN_SERVICE_URL, err, req as Request);
      if (res && typeof res.status === 'function') {
        res.status(502).json({
          status: 'error',
          code: 'ERR_BAD_GATEWAY',
          message: 'Mobile update service is currently unavailable',
        });
      }
    }
  }
}));

// Orders Service
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/orders',
  target: ORDER_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('orders', req, ORDER_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    },
    proxyRes: (proxyRes: any) => {
      if (proxyRes.statusCode >= 500) {
        orderBreaker.fire(null);
      }
    },
    error: (err: Error, req: any, res: any) => {
      orderBreaker.fire(null);
      logProxyError('orders', ORDER_SERVICE_URL, err, req as Request);
      if (res && typeof res.status === 'function') {
        res.status(502).json({
          status: 'error',
          code: 'ERR_BAD_GATEWAY',
          message: 'Service is currently unavailable',
        });
      }
    }
  }
}));

// Food Service (FOOD-BIKE-030b: customer mobile food merchant list/detail)
// FIX 2026-08-11: endpoint /api/v1/food/* belum di-proxy ke order-service
// sehingga app customer selalu dapat 404 "Cannot GET /api/v1/food/merchants".
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/food',
  target: ORDER_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('food', req, ORDER_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    },
    proxyRes: (proxyRes: any) => {
      if (proxyRes.statusCode >= 500) {
        orderBreaker.fire(null);
      }
    },
    error: (err: Error, req: any, res: any) => {
      orderBreaker.fire(null);
      logProxyError('food', ORDER_SERVICE_URL, err, req as Request);
      if (res && typeof res.status === 'function') {
        res.status(502).json({
          status: 'error',
          code: 'ERR_BAD_GATEWAY',
          message: 'Service is currently unavailable',
        });
      }
    }
  }
}));

// Couriers Service (Order-related actions)
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/couriers',
  target: ORDER_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('couriers', req, ORDER_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// Payment Links & Products Service (Routed via Admin Service for Session Verification)
app.use(createProxyMiddleware({
  pathFilter: ['/api/v1/payment-links', '/api/v1/products'],
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('admin_session_proxy', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    },
    proxyRes: (proxyRes: any) => {
      if (proxyRes.statusCode >= 500) {
        adminBreaker.fire(null);
      }
    },
    error: (err: Error, req: any, res: any) => {
      adminBreaker.fire(null);
      logProxyError('payment_links', ADMIN_SERVICE_URL, err, req as Request);
      if (res && typeof res.status === 'function') {
        res.status(502).json({
          status: 'error',
          code: 'ERR_BAD_GATEWAY',
          message: 'Payment link service is currently unavailable',
        });
      }
    }
  }
}));

// Tracking Service (Order & Courier tracking)
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/tracking',
  target: ORDER_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('tracking', req, ORDER_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// Public Maps Runtime Routes (provider config, geocode, reverse geocode, routes, and OSM tile proxy)
// These endpoints must stay unauthenticated because customer/courier apps need map runtime config
// before a booking flow can safely complete, while the admin-service owns provider policy.
app.use('/api/v1/maps', publicMapsLimiter, publicMapsAbuseGuard);
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/maps',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('maps', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    },
    proxyRes: (proxyRes: any) => {
      if (proxyRes.statusCode >= 500) {
        adminBreaker.fire(null);
      }
    },
    error: (err: Error, req: any, res: any) => {
      adminBreaker.fire(null);
      logProxyError('maps', ADMIN_SERVICE_URL, err, req as Request);
      if (res && typeof res.status === 'function') {
        res.status(502).json({
          status: 'error',
          code: 'ERR_BAD_GATEWAY',
          message: 'Maps service is currently unavailable',
        });
      }
    }
  }
}));

// Public customer handoff routes.
// Receiver location links are intentionally unauthenticated: the token is the access boundary
// and admin-service validates expiry/status before accepting any submitted location.
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/public',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('public', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    },
    proxyRes: (proxyRes: any) => {
      if (proxyRes.statusCode >= 500) {
        adminBreaker.fire(null);
      }
    },
    error: (err: Error, req: any, res: any) => {
      adminBreaker.fire(null);
      logProxyError('public', ADMIN_SERVICE_URL, err, req as Request);
      if (res && typeof res.status === 'function') {
        res.status(502).json({
          status: 'error',
          code: 'ERR_BAD_GATEWAY',
          message: 'Public customer service is currently unavailable',
        });
      }
    }
  }
}));

// Customer Mobile Portal Routes (JWT-authenticated, backed by Admin Service aggregates)
// S-AG-01 FIX: authenticateCustomerApi removed — see comment at line 300.
// Admin-service requireMobileOrWebAuth validates both cookies and JWTs against the DB.
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/customer',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('customer_mobile', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// Admin Service - Mobile & Courier Notifications
app.use(createProxyMiddleware({
  pathFilter: (pathname: string) =>
    pathname.startsWith('/api/v1/mobile/notifications') ||
    pathname.startsWith('/api/v1/courier/fcm') ||
    pathname.startsWith('/api/v1/courier/profile') ||
    pathname.startsWith('/api/v1/courier/duty') ||
    pathname.startsWith('/api/v1/courier/order-status-transitions') ||
    pathname.startsWith('/api/v1/courier/orders') ||
    pathname.startsWith('/api/v1/courier/offers') ||
    pathname.startsWith('/api/v1/courier/on-demand') ||
    pathname.startsWith('/api/v1/courier/performance') ||
    pathname.startsWith('/api/v1/courier/earnings-ledger') ||
    pathname.startsWith('/api/v1/courier/payout') ||
    pathname.startsWith('/api/v1/courier/capabilities') ||
    pathname.startsWith('/api/v1/courier/training') ||
    pathname.startsWith('/api/v1/courier/safety-events') ||
    pathname.startsWith('/api/v1/courier/trip-share'),
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('mobile_admin', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// Admin Service General Routes (Management API)
// S-AD-01 FIX: verifyCsrfToken middleware prevents Cross-Site Request Forgery.
// Admin routes use cookie-based sessions (withCredentials:true), making them
// susceptible to CSRF. The middleware verifies X-CSRF-Token header === cookie.
app.use('/api/v1/admin', verifyCsrfToken);

// Order Service Admin Routes (Domain-specific management APIs: courier performance, meeting points, relay scores, etc.)
app.use(createProxyMiddleware({
  pathFilter: (pathname: string, req: any) => {
    return pathname.startsWith('/api/v1/admin/couriers/performance') ||
           (pathname.startsWith('/api/v1/admin/couriers/') && pathname.endsWith('/tier')) ||
           pathname.startsWith('/api/v1/admin/relay-score/override') ||
           pathname.startsWith('/api/v1/admin/payouts/trigger') ||
           pathname.startsWith('/api/v1/admin/refunds/process') ||
           pathname === '/api/v1/admin/sla/dashboard' ||
           pathname.startsWith('/api/v1/admin/meeting-points') ||
           pathname.startsWith('/api/v1/admin/pricing/config') ||
           pathname.startsWith('/api/v1/admin/pricing/simulate');
  },
  target: ORDER_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('orders_admin', req, ORDER_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    },
    proxyRes: (proxyRes: any) => {
      if (proxyRes.statusCode >= 500) {
        orderBreaker.fire(null);
      }
    },
    error: (err: Error, req: any, res: any) => {
      orderBreaker.fire(null);
      logProxyError('orders_admin', ORDER_SERVICE_URL, err, req as Request);
      if (res && typeof res.status === 'function') {
        res.status(502).json({
          status: 'error',
          code: 'ERR_BAD_GATEWAY',
          message: 'Order service is currently unavailable',
        });
      }
    }
  }
}));

app.use(createProxyMiddleware({
  pathFilter: '/api/v1/admin',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/admin': '/admin'
  },
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('admin', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// Public payment webhooks handled by Admin Service
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/payments/midtrans',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/payments/midtrans': '/payments/midtrans'
  },
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('payment_webhook', req, ADMIN_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// Public payment webhooks handled by Payment Service (Xendit)
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/payments/xendit',
  target: PAYMENT_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/payments/xendit': '/webhooks/xendit'
  },
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('payment_xendit_webhook', req, PAYMENT_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// Routing Service
app.use('/api/v1/routing', createProxyMiddleware({
  target: ROUTING_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('routing', req, ROUTING_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));


// ─────────────────────────────────────────────
// API DOCUMENTATION ROUTES (SWAGGER UI)
// ─────────────────────────────────────────────

// Automatic redirects for clean URLs
app.get('/docs/auth', protectDocs, (req, res) => res.redirect('/docs/auth/swagger/index.html'));
app.get('/docs/orders', protectDocs, (req, res) => res.redirect('/docs/orders/swagger/index.html'));

// Auth Service Documentation
app.use('/docs/auth', protectDocs, createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  pathRewrite: { '^/docs/auth': '/swagger' },
  changeOrigin: true
}));

// Order Service Documentation
app.use('/docs/orders', protectDocs, createProxyMiddleware({
  target: ORDER_SERVICE_URL,
  pathRewrite: { '^/docs/orders': '/swagger' },
  changeOrigin: true
}));

// ─────────────────────────────────────────────
// Mobile Chat & Conversation API Bridge to Admin Service
// ─────────────────────────────────────────────
app.use('/api/v1/mobile/chats/orders', authenticateJWT);
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/mobile/chats/orders',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// ====================================================================================================
// Mobile Orders API Bridge to Admin Service (For Chat Conversation/Calls)
// ====================================================================================================
app.use('/api/v1/mobile/orders', authenticateJWT);
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/mobile/orders',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      prepareProxyRequest(proxyReq, req);
    }
  }
}));

// ─────────────────────────────────────────────
// Wallet Routes (Payment Service)
// ─────────────────────────────────────────────
app.use('/api/v1/wallet', authenticateJWT, proxyWithResilience(PAYMENT_SERVICE_URL, paymentBreaker));

// ─────────────────────────────────────────────
// Merchant Routes (Merchant Service — FOOD-BIKE-019)
// ─────────────────────────────────────────────
app.use('/api/v1/merchant', authenticateJWT);
// NOTE: pakai pathFilter (BUKAN express app.use prefix) supaya full path
// /api/v1/merchant/... diteruskan utuh — app.use prefix strip req.url jadi
// '/register' → merchant-service 404 "404 page not found" tanpa log.
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/merchant',
  target: MERCHANT_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      logProxyForward('merchant_register', req, MERCHANT_SERVICE_URL);
      prepareProxyRequest(proxyReq, req);
    }
  }
}));


// ─────────────────────────────────────────────
// HEALTH & UTILS
// ─────────────────────────────────────────────
// Metrics endpoint (Internal use)
app.get('/metrics', protectMetrics, async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/health', (req, res) => {

  res.json({ status: 'OK' });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.logger.error({
    ...requestLogContext(req),
    event: 'unhandled_error',
    path: req.path,
    method: req.method,
    error_name: err?.name,
    error_message: err?.message,
  }, 'Unhandled gateway error');
  res.status(500).json({
    status: 'error',
    code: 'ERR_INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    correlation_id: req.headers['x-correlation-id'],
    request_id: req.headers['x-request-id'],
    trace_id: traceIdFromTraceparent(req.headers.traceparent),
  });
});

const PORT = process.env.GATEWAY_PORT || 8080;
const server = app.listen(PORT, () => {
  logger.logger.info({ event: 'gateway_started', port: PORT }, 'API Gateway is running');
});
server.setMaxListeners(Math.max(server.getMaxListeners(), 64));

let shutdownInProgress = false;
const shutdownServer = (signal: string) => {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  logger.logger.info({ event: 'gateway_shutdown_started', signal }, 'API Gateway shutdown started');
  server.close(async () => {
    await shutdownTracing(logger.logger);
    logger.logger.info({ event: 'gateway_shutdown_complete', signal }, 'API Gateway shutdown complete');
    process.exit(0);
  });

  setTimeout(async () => {
    await shutdownTracing(logger.logger);
    logger.logger.error({ event: 'gateway_shutdown_timeout', signal }, 'API Gateway shutdown timed out');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdownServer('SIGTERM'));
process.on('SIGINT', () => shutdownServer('SIGINT'));

// Handle WebSocket upgrades
server.on('upgrade', (req: any, socket: any, head: any) => {
  if (req.url?.startsWith('/socket.io')) {
    adminWsProxy.upgrade(req, socket, head);
  }
});
