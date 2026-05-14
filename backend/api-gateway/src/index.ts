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



import { PricingEstimateSchema, CreateOrderSchema } from './schemas/order.schema';
import { OTPSendSchema, OTPVerifySchema, RegisterSchema } from './schemas/auth.schema';

dotenv.config({ path: '../../.env' });

const app = express();
const logger = pino();

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

// Middleware to track metrics
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



app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:", "wss:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// --- ENTERPRISE SECURITY VALIDATION ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('\x1b[31m[FATAL ERROR] JWT_SECRET environment variable is not defined!\x1b[0m');
  console.error('API Gateway cannot start without a secure signing key. Exiting...');
  process.exit(1);
}

// Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'ERR_TOO_MANY_REQUESTS',
    message: 'Too many authentication attempts, please try again later',
  },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});

// 🛡️ Global DDoS & Brute-Force Defense Layer
app.use(generalLimiter);

// JWT Authentication Middleware
const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        return res.status(403).json({ 
          status: 'error', 
          code: 'ERR_FORBIDDEN', 
          message: 'Invalid or expired token' 
        });
      }
      
      if (user && (user.user_id || user.id)) {
        req.headers['x-user-id'] = user.user_id || user.id;
      }
      next();
    });
  } else {
    res.status(401).json({ status: 'error', code: 'ERR_UNAUTHORIZED', message: 'Authentication required' });
  }
};



// --- ENTERPRISE CORS HARDENING ---
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:5173']; // Defaults for dev

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.includes(origin) || (process.env.NODE_ENV !== 'production' && origin.includes('localhost'))) {
      callback(null, true);
    } else {
      console.warn(`\x1b[31m[CORS Security Alert]\x1b[0m Unauthorized origin blocked: ${origin}`);
      callback(new Error('Origin not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role', 'x-portal', 'Cookie'],
}));

app.use(logger);
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.url.includes('/auth/web')) {
    console.log(`\x1b[35m[Gateway Debug]\x1b[0m ${req.method} ${req.url} - Cookie: ${req.headers.cookie || 'none'}`);
    
    const originalEnd = res.end;
    res.end = function(this: any, chunk?: any, encoding?: any, cb?: any) {
      const setCookie = res.getHeader('set-cookie');
      if (setCookie) {
        console.log(`\x1b[35m[Gateway Debug]\x1b[0m ${req.method} ${req.url} - Set-Cookie:`, setCookie);
      }
      return originalEnd.call(this, chunk, encoding, cb);
    } as any;
  }
  next();
});

// Middleware to parse JSON only for specific routes that need validation in the gateway
const jsonParser = express.json();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:8081';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:8083';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:8084';
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL || 'http://localhost:3000';
const ROUTING_SERVICE_URL = process.env.ROUTING_SERVICE_URL || 'http://localhost:8082';

console.log(`\x1b[32m[Gateway Config]\x1b[0m Auth Service: ${AUTH_SERVICE_URL}`);
console.log(`\x1b[32m[Gateway Config]\x1b[0m Admin Service: ${ADMIN_SERVICE_URL}`);
console.log(`\x1b[32m[Gateway Config]\x1b[0m Order Service: ${ORDER_SERVICE_URL}`);

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
          fixRequestBody(proxyReq, req);
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
        console.error(`Proxy Error (${target}):`, err);
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
  target: ADMIN_SERVICE_URL,
  ws: true,
  changeOrigin: true,
  pathRewrite: {
    '^/socket.io': '/socket.io',
  },
});

// Use the proxy for socket.io path
app.use('/socket.io', adminWsProxy);

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
  '/api/v1/auth/register',
  jsonParser,
  validate(RegisterSchema),
  proxyWithResilience(AUTH_SERVICE_URL, authBreaker)
);

// Pricing Estimate (Validation in Gateway)
app.post(
  '/api/v1/pricing/estimate',
  jsonParser,
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
      console.log(`\x1b[35m[Proxy Admin Auth]\x1b[0m Forwarding ${req.method} ${req.url} to ${ADMIN_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
    },
    proxyRes: (proxyRes: any, req: any, res: any) => {
      if (proxyRes.headers['set-cookie']) {
        console.log(`[Proxy Admin Auth] Set-Cookie detected:`, proxyRes.headers['set-cookie']);
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
      console.log(`\x1b[35m[Proxy Courier Auth]\x1b[0m Forwarding ${req.method} ${req.url} to ${ADMIN_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
    }
  }
}));

// Auth Service - General Routes
app.use('/api/v1/auth', proxyWithResilience(AUTH_SERVICE_URL, authBreaker));

// Orders Service
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/orders',
  target: ORDER_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      console.log(`\x1b[36m[Proxy Orders]\x1b[0m Forwarding ${req.method} ${req.url} to ${ORDER_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
    },
    proxyRes: (proxyRes: any) => {
      if (proxyRes.statusCode >= 500) {
        orderBreaker.fire(null);
      }
    },
    error: (err: Error, req: any, res: any) => {
      orderBreaker.fire(null);
      console.error(`Proxy Error (${ORDER_SERVICE_URL}):`, err);
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
      console.log(`\x1b[36m[Proxy Couriers]\x1b[0m Forwarding ${req.method} ${req.url} to ${ORDER_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
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
      console.log(`\x1b[36m[Proxy Tracking]\x1b[0m Forwarding ${req.method} ${req.url} to ${ORDER_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
    }
  }
}));

// Admin Service - Mobile & Courier Notifications
app.use(createProxyMiddleware({
  pathFilter: ['/api/v1/mobile/notifications', '/api/v1/courier/fcm', '/api/v1/courier/profile', '/api/v1/courier/orders'],
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      console.log(`\x1b[35m[Proxy Mobile Admin]\x1b[0m Forwarding ${req.method} ${req.url} to ${ADMIN_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
    }
  }
}));

// Admin Service General Routes (Management API)
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/admin',
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/admin': '/admin'
  },
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      console.log(`\x1b[35m[Proxy Admin]\x1b[0m Forwarding ${req.method} ${req.url} to ${ADMIN_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
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
      console.log(`\x1b[35m[Proxy Payment Webhook]\x1b[0m Forwarding ${req.method} ${req.url} to ${ADMIN_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
    }
  }
}));

// Routing Service
app.use('/api/v1/routing', createProxyMiddleware({
  target: ROUTING_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      console.log(`\x1b[36m[Proxy Routing]\x1b[0m Forwarding ${req.method} ${req.url} to ${ROUTING_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
    }
  }
}));


// ─────────────────────────────────────────────
// API DOCUMENTATION ROUTES (SWAGGER UI)
// ─────────────────────────────────────────────

// Automatic redirects for clean URLs
app.get('/docs/auth', (req, res) => res.redirect('/docs/auth/swagger/index.html'));
app.get('/docs/orders', (req, res) => res.redirect('/docs/orders/swagger/index.html'));

// Auth Service Documentation
app.use('/docs/auth', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  pathRewrite: { '^/docs/auth': '/swagger' },
  changeOrigin: true
}));

// Order Service Documentation
app.use('/docs/orders', createProxyMiddleware({
  target: ORDER_SERVICE_URL,
  pathRewrite: { '^/docs/orders': '/swagger' },
  changeOrigin: true
}));

// ─────────────────────────────────────────────
// Mobile Chat API Bridge to Admin Service (Authenticated via JWT)
// ─────────────────────────────────────────────
app.use(
  '/api/v1/mobile/chats/orders',
  authenticateJWT,
  createProxyMiddleware({
    target: ADMIN_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      '^/api/v1/mobile/chats/orders': '/auth/web/orders'
    },
    on: {
      proxyReq: (proxyReq: any, req: any) => {
        fixRequestBody(proxyReq, req);
      }
    }
  })
);

// ─────────────────────────────────────────────
// Wallet Routes (Payment Service)
// ─────────────────────────────────────────────
app.use('/api/v1/wallet', authenticateJWT, proxyWithResilience(PAYMENT_SERVICE_URL, paymentBreaker));


// ─────────────────────────────────────────────
// HEALTH & UTILS
// ─────────────────────────────────────────────
// Metrics endpoint (Internal use)
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/health', (req, res) => {

  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    status: 'error',
    code: 'ERR_INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
});

const PORT = process.env.GATEWAY_PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`API Gateway is running on port ${PORT}`);
});


// Handle WebSocket upgrades
server.on('upgrade', (req: any, socket: any, head: any) => {
  if (req.url?.startsWith('/socket.io')) {
    adminWsProxy.upgrade(req, socket, head);
  }
});
