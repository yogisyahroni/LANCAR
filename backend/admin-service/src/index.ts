import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { routes } from './routes';

const app = express();

// CORS is now handled by the API Gateway to prevent double headers.
// app.use(cors({...}));


app.use(express.json());

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
app.use((req, res, next) => {
  if (req.url.includes('/auth/web')) {
    console.log(`\x1b[36m[Admin Debug]\x1b[0m ${req.method} ${req.url} - Cookie Header: ${req.headers.cookie || 'none'}`);
    console.log(`[Admin Debug] Cookies Parsed:`, req.cookies);
  }
  next();
});
app.use(routes);

import http from 'http';
import { initWebSocket } from './websocket';

const port = process.env.ADMIN_PORT || process.env.PORT || 3000;

const server = http.createServer(app);
initWebSocket(server);

server.listen(port, () => {
  console.log(`Admin Service listening on port ${port}`);
});
