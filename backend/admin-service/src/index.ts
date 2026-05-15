import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { routes } from './routes';
import { initWebSocket } from './websocket';
import { startWeatherWorker } from './workers/weather-worker';
import { initFirebase } from './notifications';

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


app.use(express.json());
fs.mkdirSync(path.join(process.cwd(), 'public/uploads/courier-documents'), { recursive: true });
app.use('/uploads', express.static('public/uploads'));



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
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.url.includes('/auth/web')) {
    console.log(`\x1b[36m[Admin Debug]\x1b[0m ${req.method} ${req.url} - Cookie Header: ${req.headers.cookie || 'none'}`);
    console.log(`[Admin Debug] Cookies Parsed:`, req.cookies);
  }
  next();
});
app.use(routes);

const port = process.env.ADMIN_PORT || process.env.PORT || 3000;

const server = http.createServer(app);
initWebSocket(server);

server.listen(port, async () => {
  console.log(`Admin Service listening on port ${port}`);
  await initFirebase();
  startWeatherWorker();
});
