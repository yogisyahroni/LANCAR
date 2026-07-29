import { shutdownTracing } from './tracing';
import dotenv from 'dotenv';
dotenv.config();

import { installConsoleRedaction } from './security/logRedaction';
import { validateProductionEnv } from './envValidation';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import http from 'http';
import { routes } from './routes';
import { initWebSocket } from './websocket';
import { startWeatherWorker } from './workers/weather-worker';
import { startPayoutDispatcherWorker } from './workers/payout-dispatcher-worker';
import { startEventOutboxWorker } from './workers/event-outbox-worker';
import { initFirebase } from './notifications';
import { requestContext } from './middleware/requestContext';
import { genericErrorHandler, sanitizeErrorResponses } from './middleware/errorMapper';
import { httpMutationAuditTrail } from './middleware/auditTrail';
import { seedDevelopmentData } from './seed';

installConsoleRedaction();
validateProductionEnv();

const app = express();

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
}));


// CORS is now handled by the API Gateway to prevent double headers.
// app.use(cors({...}));

app.use(requestContext);
app.use(sanitizeErrorResponses);
app.use(httpMutationAuditTrail);

app.use(express.json({
  verify: (req: any, _res, buf) => {
    if (
      req.originalUrl === '/webhooks/courier-payout-provider' ||
      req.originalUrl === '/payments/midtrans/notification'
    ) {
      req.rawBody = Buffer.from(buf);
    }
  },
}));

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

app.use((req, _res, next) => {
  if (req.body) {
    deepNormalizePhone(req.body);
  }
  next();
});

// JSON Syntax Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.error('JSON Parsing Error:', err.message, err.stack);
    console.error('Request headers:', req.headers);
    res.status(400).json({ 
      status: 'error',
      code: 'ERR_BAD_REQUEST',
      message: 'Invalid JSON payload' 
    });
    return;
  }
  next();
});

app.use(cookieParser());
app.use(routes);
app.use(genericErrorHandler);

const port = process.env.ADMIN_PORT || process.env.PORT || 3000;

const server = http.createServer(app);
initWebSocket(server);

server.listen(port, async () => {
  console.info('Admin service listening', { port });
  try {
    await seedDevelopmentData();
    await initFirebase();
    startWeatherWorker();
    startPayoutDispatcherWorker();
    startEventOutboxWorker();
  } catch (error) {
    console.error(JSON.stringify({
      level: 'fatal',
      event: 'admin_service_startup_failed',
      message: error instanceof Error ? error.message : 'Unknown startup error',
    }));
    process.exit(1);
  }
});

let shutdownInProgress = false;
const shutdownServer = (signal: string) => {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  console.info('Admin service shutdown started', { event: 'admin_service_shutdown_started', signal });
  server.close(async () => {
    await shutdownTracing(console);
    console.info('Admin service shutdown complete', { event: 'admin_service_shutdown_complete', signal });
    process.exit(0);
  });

  setTimeout(async () => {
    await shutdownTracing(console);
    console.error('Admin service shutdown timed out', { event: 'admin_service_shutdown_timeout', signal });
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdownServer('SIGTERM'));
process.on('SIGINT', () => shutdownServer('SIGINT'));
