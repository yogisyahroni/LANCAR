import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketIOServer;

export const initWebSocket = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', // Adjust this for production security
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

export const closeWebSocket = async () => {
  if (io) {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    io = undefined as any;
    console.log('[WebSocket] Server closed');
  }
};
