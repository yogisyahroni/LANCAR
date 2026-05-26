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
  await initFirebase();
  startWeatherWorker();
  startPayoutDispatcherWorker();
  startEventOutboxWorker();
});
