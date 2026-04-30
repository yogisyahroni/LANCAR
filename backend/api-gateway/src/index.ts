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
app.use(cors());
app.use(logger);

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
    onProxyReq: fixRequestBody,
    onError: (err: Error, req: Request, res: Response) => {
      console.error(`Proxy Error (${target}):`, err);
      res.status(502).json({
        status: 'error',
        code: 'ERR_BAD_GATEWAY',
        message: 'Service is currently unavailable',
      });
    }
  });

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
app.use(
  '/api/v1/auth',
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
  })
);

// Orders Service (other routes)
app.use(
  '/api/v1/orders',
  createProxyMiddleware({
    target: ORDER_SERVICE_URL,
    changeOrigin: true,
  })
);

// Admin Service
app.use(
  '/api/v1/admin',
  createProxyMiddleware({
    target: ADMIN_SERVICE_URL,
    changeOrigin: true,
  })
);

// Routing Service
app.use(
  '/api/v1/routing',
  createProxyMiddleware({
    target: ROUTING_SERVICE_URL,
    changeOrigin: true,
  })
);

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
app.listen(PORT, () => {
  console.log(`API Gateway is running on port ${PORT}`);
});

