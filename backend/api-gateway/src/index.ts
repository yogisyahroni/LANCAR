import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino-http';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import { validate } from './middleware/validator';
import { PricingEstimateSchema, CreateOrderSchema } from './schemas/order.schema';
import { OTPSendSchema, OTPVerifySchema, RegisterSchema } from './schemas/auth.schema';

dotenv.config({ path: '../../.env' });

const app = express();
const logger = pino();

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000', // frontend (customer portal)
      'http://localhost:3001', // admin-service backend
      'http://localhost:3002', // admin-dashboard UI
      'http://localhost:5173', 
      'http://localhost:5174', 
      'http://localhost:5175', 
      'http://localhost:5176', 
      'http://127.0.0.1:3000', 
      'http://127.0.0.1:3001', 
      'http://127.0.0.1:3002', // admin-dashboard UI (127)
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5175',
      'http://localhost:8080'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role', 'x-totp-verified']
}));
app.use(logger);
app.use((req, res, next) => {
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

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:8081';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:8083';
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL || 'http://admin-service:3000';
const ROUTING_SERVICE_URL = process.env.ROUTING_SERVICE_URL || 'http://routing-service:8082';

// Helper for proxying with body fix
const proxyWithBodyFix = (target: string) => 
  createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: any, res) => {
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

// Auth Service (other routes)
app.use('/api/v1/auth/web', createProxyMiddleware({
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/auth/web': '/auth/web',
  },
  on: {
    proxyReq: fixRequestBody,
    proxyRes: (proxyRes, req, res) => {
      if (proxyRes.headers['set-cookie']) {
        console.log(`[Proxy] Set-Cookie detected for ${req.url}:`, proxyRes.headers['set-cookie']);
      }
    }
  }
}));

app.use('/api/v1/auth', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: fixRequestBody
  }
}));

// Orders Service (other routes)
app.use('/api/v1/orders', createProxyMiddleware({
  target: ORDER_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: fixRequestBody
  }
}));

// Admin Service
app.use('/api/v1/admin', createProxyMiddleware({
  target: ADMIN_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/admin': '/admin',
  },
  on: {
    proxyReq: fixRequestBody
  }
}));

// Routing Service
app.use('/api/v1/routing', createProxyMiddleware({
  target: ROUTING_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: fixRequestBody
  }
}));

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'UP', service: 'api-gateway' });
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
server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/socket.io')) {
    adminWsProxy.upgrade(req, socket as any, head);
  }
});




