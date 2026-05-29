import { io, Socket } from 'socket.io-client';
import { clientLog } from './clientLogger';
import { customerSocketUrl } from './runtimeConfig';

const SOCKET_URL = customerSocketUrl;

let socket: Socket | null = null;

export const getSocket = (userId?: string, role: string = 'customer') => {
  if (socket && userId) {
    const currentQuery = socket.io.opts.query as any;
    if (currentQuery?.userId !== userId || currentQuery?.role !== role) {
      clientLog.debug('WebSocket identity changed, reconnecting', { role });
      socket.disconnect();
      socket = null;
    }
  }

  if (!socket && userId) {
    socket = io(SOCKET_URL, {
      query: { userId, role },
      withCredentials: true,
      transports: ['polling', 'websocket'],
    });

    socket.on('connect', () => {
      clientLog.debug('WebSocket connected', { role });
    });

    socket.on('disconnect', (reason) => {
      clientLog.debug('WebSocket disconnected', { reason, role });
    });

    socket.on('connect_error', (error) => {
      clientLog.error('WebSocket connection error', { error, role });
    });
  }
  return socket;
};

export const joinOrderRoom = (orderId?: string) => {
  if (socket && orderId) {
    socket.emit('join_order_room', { order_id: orderId });
  }
};

export const leaveOrderRoom = (orderId?: string) => {
  if (socket && orderId) {
    socket.emit('leave_order_room', { order_id: orderId });
  }
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
