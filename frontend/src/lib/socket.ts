import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8080';

let socket: Socket | null = null;

export const getSocket = (userId?: string) => {
  if (socket && userId) {
    const currentQuery = socket.io.opts.query as any;
    if (currentQuery?.userId !== userId) {
      console.log('📡 [WebSocket] Identity changed, reconnecting...');
      socket.disconnect();
      socket = null;
    }
  }

  if (!socket && userId) {
    socket = io(SOCKET_URL, {
      query: { userId },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('📡 [WebSocket] Connected to server');
    });

    socket.on('disconnect', (reason) => {
      console.log('📡 [WebSocket] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('📡 [WebSocket] Connection error:', error);
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
