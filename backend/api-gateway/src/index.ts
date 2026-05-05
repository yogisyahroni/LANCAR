import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino-http';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import { validate } from './middleware/validator';
import { PricingEstimateSchema, CreateOrderSchema } from './schemas/order.schema';
import { OTPSendSchema, OTPVerifySchema, RegisterSchema } from './schemas/auth.schema';

dotenv.config({ path: '../../../.env' });

const app = express();
const logger = pino();

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // Disable CSP in dev to avoid issues
}));

// Robust CORS with logging and preflight handling
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    console.log(`\x1b[36m[CORS Debug]\x1b[0m Origin: ${origin} - Method: ${req.method} - Path: ${req.path}`);
  }
  
  // Explicitly handle preflight for any localhost or 127.0.0.1
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('0.0.0.0'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-role, x-totp-verified, Cookie');
    
    if (req.method === 'OPTIONS') {
      console.log(`\x1b[32m[CORS Preflight Success]\x1b[0m Returning 204 for ${origin}`);
      res.sendStatus(204);
      return;
    }
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('0.0.0.0')) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now to fix login
    }
  },
  credentials: true,
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
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL || 'http://localhost:3000';
const ROUTING_SERVICE_URL = process.env.ROUTING_SERVICE_URL || 'http://localhost:8082';

console.log(`\x1b[32m[Gateway Config]\x1b[0m Auth Service: ${AUTH_SERVICE_URL}`);
console.log(`\x1b[32m[Gateway Config]\x1b[0m Admin Service: ${ADMIN_SERVICE_URL}`);
console.log(`\x1b[32m[Gateway Config]\x1b[0m Order Service: ${ORDER_SERVICE_URL}`);

// Helper for proxying with body fix
const proxyWithBodyFix = (target: string) => 
  createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq: any, req: any, res: any) => {
        // Transform 'phone' to 'phone_number' if present in the body
        if (req.body && req.body.phone && !req.body.phone_number) {
          req.body.phone_number = req.body.phone;
        }
        fixRequestBody(proxyReq, req);
      },
      error: (err: Error, req: any, res: any) => {
        console.error(`Proxy Error (${target}):`, err);
        if (res && typeof res.status === 'function') {
          res.status(502).json({
            status: 'error',
            code: 'ERR_BAD_GATEWAY',
            message: 'Service is currently unavailable',
          });
        } else if (res && typeof res.end === 'function') {
          res.end('Service unavailable');
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
  jsonParser,
  validate(OTPSendSchema),
  proxyWithBodyFix(AUTH_SERVICE_URL)
);

app.post(
  '/api/v1/auth/otp/verify',
  jsonParser,
  validate(OTPVerifySchema),
  proxyWithBodyFix(AUTH_SERVICE_URL)
);

app.post(
  '/api/v1/auth/register',
  jsonParser,
  validate(RegisterSchema),
  proxyWithBodyFix(AUTH_SERVICE_URL)
);

// Pricing Estimate (Validation in Gateway)
app.post(
  '/api/v1/pricing/estimate',
  jsonParser,
  validate(PricingEstimateSchema),
  proxyWithBodyFix(ORDER_SERVICE_URL)
);

// Order Creation (Validation in Gateway)
app.post(
  '/api/v1/orders',
  jsonParser,
  validate(CreateOrderSchema),
  proxyWithBodyFix(ORDER_SERVICE_URL)
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

// Auth Service - General Routes
app.use('/api/v1/auth', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      console.log(`\x1b[34m[Proxy Auth]\x1b[0m Forwarding ${req.method} ${req.url} to ${AUTH_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
    }
  }
}));

// Orders Service
app.use('/api/v1/orders', createProxyMiddleware({
  target: ORDER_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      console.log(`\x1b[32m[Proxy Order]\x1b[0m Forwarding ${req.method} ${req.url} to ${ORDER_SERVICE_URL}`);
      fixRequestBody(proxyReq, req);
    }
  }
}));

// Couriers Service (Order-related actions)
app.use('/api/v1/couriers', createProxyMiddleware({
  target: ORDER_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      console.log(`\x1b[32m[Proxy Courier]\x1b[0m Forwarding ${req.method} ${req.url} to ${ORDER_SERVICE_URL}`);
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
// HEALTH & UTILS
// ─────────────────────────────────────────────
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




