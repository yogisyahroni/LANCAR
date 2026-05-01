import express from 'express';
import cors from 'cors';
import { routes } from './routes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// CORS — allow admin dashboard (local dev + staging)
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:3001',
    process.env.FRONTEND_URL || 'http://localhost:5175',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-user-id',
    'x-user-role',
    'x-totp-verified',
  ],
}));

app.use(express.json());
app.use(routes);

import http from 'http';
import { initWebSocket } from './websocket';

const port = process.env.PORT || 3000;

const server = http.createServer(app);
initWebSocket(server);

server.listen(port, () => {
  console.log(`Admin Service listening on port ${port}`);
});
