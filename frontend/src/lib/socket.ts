import { io, Socket } from 'socket.io-client';
import { clientLog } from './clientLogger';
import { customerSocketUrl } from './runtimeConfig';

const SOCKET_URL = customerSocketUrl;

// S3-CW-04: Validate order IDs are proper UUIDs before emitting socket events
// Prevents injection of crafted order_id values via DevTools console
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let socket: Socket | null = null;

export const getSocket = (userId?: string, role: string = 'customer') => {
  if (socket && userId) {
    const currentQuery = socket.io.opts.query as any;
    // Only reconnect if userId changes (for detecting user switching)
    if (currentQuery?.userId !== userId) {
      clientLog.debug('WebSocket identity changed, reconnecting');
      socket.disconnect();
      socket = null;
    }
  }

  if (!socket && userId) {
    // S3-CW-01 Fix: Do NOT send userId or role in query params — these values
    // are client-controlled and can be spoofed via DevTools.
    // Authentication is handled server-side using the HttpOnly session cookie
    // that is automatically sent with `withCredentials: true`.
    socket = io(SOCKET_URL, {
      withCredentials: true, // HttpOnly session cookie carries the identity
      transports: ['polling', 'websocket'],
      // No query.userId / query.role — backend derives identity from verified cookie
    });

    socket.on('connect', () => {
      clientLog.debug('WebSocket connected');
    });

    socket.on('disconnect', (reason) => {
      clientLog.debug('WebSocket disconnected', { reason });
    });

    socket.on('connect_error', (error) => {
      clientLog.error('WebSocket connection error', { error });
    });
  }
  return socket;
};

export const joinOrderRoom = (orderId?: string) => {
  // S3-CW-04: Validate UUID format to prevent socket event injection
  if (socket && orderId && UUID_PATTERN.test(orderId)) {
    socket.emit('join_order_room', { order_id: orderId });
  }
};

export const leaveOrderRoom = (orderId?: string) => {
  // S3-CW-04: Validate UUID format to prevent socket event injection
  if (socket && orderId && UUID_PATTERN.test(orderId)) {
    socket.emit('leave_order_room', { order_id: orderId });
  }
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
