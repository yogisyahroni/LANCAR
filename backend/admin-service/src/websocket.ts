import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketIOServer;

export const initWebSocket = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:5175',
        'http://127.0.0.1:5176',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId as string;
    const role = socket.handshake.query.role as string;
    
    if (userId) {
      socket.join(userId);
      console.log(`[WebSocket] User ${userId} joined room. Socket: ${socket.id}`);
    }
    
    if (role) {
      socket.join(role);
      console.log(`[WebSocket] User joined role room: ${role}. Socket: ${socket.id}`);
    }

    if (!userId && !role) {
      console.log(`[WebSocket] Client connected without identification: ${socket.id}`);
    }

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
