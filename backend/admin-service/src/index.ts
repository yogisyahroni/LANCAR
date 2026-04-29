import express from 'express';
import { routes } from './routes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
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
