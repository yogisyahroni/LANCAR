import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { db } from './db';
import { redis } from './redis';
import { recordRealtimeMetric, realtimeStructuredLog } from './services/realtimeObservability';

let io: SocketIOServer;
let socketRedisPubClient: ReturnType<typeof redis.duplicate> | undefined;
let socketRedisSubClient: ReturnType<typeof redis.duplicate> | undefined;

export const initWebSocket = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3002',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:5175',
        'http://127.0.0.1:5176',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  if (process.env.SOCKET_REDIS_ADAPTER_ENABLED === 'true') {
    socketRedisPubClient = redis.duplicate();
    socketRedisSubClient = redis.duplicate();
    io.adapter(createAdapter(socketRedisPubClient, socketRedisSubClient));
    realtimeStructuredLog('info', 'socket_redis_adapter_enabled', {
      redis_url_configured: Boolean(process.env.REDIS_URL),
    });

    socketRedisPubClient.on('error', (error) => {
      void recordRealtimeMetric('socket_redis_adapter_error', { role: 'pub' });
      realtimeStructuredLog('error', 'socket_redis_adapter_pub_error', { message: error.message });
    });
    socketRedisSubClient.on('error', (error) => {
      void recordRealtimeMetric('socket_redis_adapter_error', { role: 'sub' });
      realtimeStructuredLog('error', 'socket_redis_adapter_sub_error', { message: error.message });
    });
  }

  io.use((socket, next) => {
    let token = socket.handshake.auth.token || socket.handshake.query.token;
    let adminSessionToken: string | undefined;
    let customerSessionToken: string | undefined;
    
    // Try to extract token from cookies if not found in auth/query (for Next.js webapp)
    if (socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie.split(';').reduce((res: any, c) => {
        const [key, val] = c.trim().split('=').map(decodeURIComponent);
        res[key] = val;
        return res;
      }, {});
      token = token || cookies.accessToken || cookies.access_token || cookies.token || cookies.jwt;
      adminSessionToken = cookies.admin_session;
      customerSessionToken = cookies.customer_session || cookies.web_session;
    }

    if (!token && !adminSessionToken && !customerSessionToken) {
      void recordRealtimeMetric('socket_auth_failed', { reason: 'token_missing' });
      return next(new Error('Authentication error: Token missing'));
    }

    if ((adminSessionToken || customerSessionToken) && !token) {
      const sessionToken = adminSessionToken || customerSessionToken;
      const isCustomerSession = Boolean(customerSessionToken && !adminSessionToken);
      const sessionQuery = isCustomerSession
        ? `SELECT s.user_id AS id, u.role, u.full_name
           FROM customer_sessions s
           JOIN customers u ON s.user_id = u.id
           WHERE s.session_token = $1 AND s.expires_at > NOW()`
        : `SELECT s.user_id AS id, u.role, u.full_name
           FROM admin_sessions s
           JOIN staff u ON s.user_id = u.id
           WHERE s.session_token = $1 AND s.expires_at > NOW()`;

      db.query(
        sessionQuery,
        [sessionToken]
      )
        .then((result) => {
          if (result.rows.length === 0) {
            void recordRealtimeMetric('socket_auth_failed', { reason: isCustomerSession ? 'invalid_customer_session' : 'invalid_admin_session' });
            return next(new Error('Authentication error: Invalid session'));
          }
          (socket as any).user = result.rows[0];
          next();
        })
        .catch((err) => {
          console.error('WebSocket session verification failed', err);
          void recordRealtimeMetric('socket_auth_failed', { reason: isCustomerSession ? 'customer_session_lookup_error' : 'admin_session_lookup_error' });
          next(new Error('Internal server error'));
        });
      return;
    }

    const jwtSecrets = Array.from(new Set([
      process.env.JWT_SECRET,
      'lancar_secret_key_change_me',
      'your-secret-key',
    ].filter(Boolean))) as string[];
    import('jsonwebtoken').then(async jwt => {
      let decodedPayload: any = null;
      for (const secret of jwtSecrets) {
        try {
          decodedPayload = jwt.default.verify(token as string, secret);
          break;
        } catch {
          decodedPayload = null;
        }
      }

      if (!decodedPayload) {
        try {
          const sessionResult = await db.query(
            `SELECT s.user_id AS id, u.role, u.full_name
             FROM user_sessions s
             JOIN users u ON s.user_id = u.id
             WHERE s.refresh_token = $1
               AND s.expires_at > NOW()
               AND s.is_revoked = false
             UNION ALL
             SELECT s.user_id AS id, c.role, c.full_name
             FROM customer_sessions s
             JOIN customers c ON s.user_id = c.id
             WHERE s.session_token = $1
               AND s.expires_at > NOW()
             LIMIT 1`,
            [token]
          );

          if (sessionResult.rows.length === 0) {
            void recordRealtimeMetric('socket_auth_failed', { reason: 'invalid_token' });
            return next(new Error('Authentication error: Invalid token'));
          }

          decodedPayload = sessionResult.rows[0];
        } catch (sessionError) {
          console.error('WebSocket session token verification failed', sessionError);
          void recordRealtimeMetric('socket_auth_failed', { reason: 'session_lookup_error' });
          return next(new Error('Internal server error'));
        }
      }

      // Attach verified user info to socket
      (socket as any).user = decodedPayload;
      next();
    }).catch(err => {
      console.error('Failed to load jsonwebtoken for websocket auth', err);
      next(new Error('Internal server error'));
    });
  });

  io.on('connection', (socket) => {
    // Extract userId from verified JWT payload, fallback to query for backward compatibility during transition if needed
    // However, for strict security, we should ONLY use the decoded token.
    const user = (socket as any).user;
    const userId = user?.id || user?.user_id;
    const role = user?.role || socket.handshake.query.role as string;
    
    if (userId) {
      socket.join(String(userId));
      void recordRealtimeMetric('socket_connected', { role: role || 'unknown' });
      console.log(`[WebSocket] User ${userId} joined room. Socket: ${socket.id}`);
    } else {
      console.warn(`[WebSocket] Client connected without a valid User ID in token: ${socket.id}`);
      void recordRealtimeMetric('socket_disconnected_invalid_user', { role: role || 'unknown' });
      socket.disconnect();
      return;
    }
    
    if (role) {
      socket.join(String(role));
      console.log(`[WebSocket] User joined role room: ${role}. Socket: ${socket.id}`);
    }

    // Dispute Rooms
    socket.on('join_dispute_room', ({ dispute_id }) => {
      socket.join(dispute_id);
      console.log(`[Socket] User ${userId} joined dispute room: ${dispute_id}`);
    });

    socket.on('leave_dispute_room', ({ dispute_id }) => {
      socket.leave(dispute_id);
      console.log(`[Socket] User ${userId} left dispute room: ${dispute_id}`);
    });

    socket.on('join_order_room', async ({ order_id, orderId }, ack) => {
      const targetOrderId = order_id || orderId;
      if (!targetOrderId) {
        void recordRealtimeMetric('order_room_join_failed', { reason: 'missing_order_id', role: role || 'unknown' });
        ack?.({ success: false, message: 'order_id is required' });
        return;
      }

      try {
        const access = await db.query(
          `SELECT o.id
           FROM orders o
           LEFT JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
           WHERE o.id = $1
             AND (
               o.customer_id = $2
               OR ol.courier_id = $2
               OR $3::text = ANY(ARRAY['admin', 'super_admin', 'ops'])
             )
           LIMIT 1`,
          [targetOrderId, userId, role]
        );

        if (access.rows.length === 0) {
          void recordRealtimeMetric('order_room_join_failed', { reason: 'access_denied', role: role || 'unknown' });
          realtimeStructuredLog('warn', 'order_room_join_denied', {
            order_id: targetOrderId,
            user_id: userId,
            role: role || null,
          });
          ack?.({ success: false, message: 'Order access denied' });
          return;
        }

        const room = `order:${targetOrderId}`;
        socket.join(room);
        void recordRealtimeMetric('order_room_joined', { role: role || 'unknown' });
        ack?.({ success: true, room });
        console.log(`[Socket] User ${userId} joined order room: ${room}`);
      } catch (error) {
        console.error('[Socket] Failed to join order room', error);
        void recordRealtimeMetric('order_room_join_failed', { reason: 'internal_error', role: role || 'unknown' });
        ack?.({ success: false, message: 'Internal server error' });
      }
    });

    socket.on('leave_order_room', ({ order_id, orderId }) => {
      const targetOrderId = order_id || orderId;
      if (!targetOrderId) return;
      const room = `order:${targetOrderId}`;
      socket.leave(room);
      console.log(`[Socket] User ${userId} left order room: ${room}`);
    });

    socket.on('disconnect', () => {
      void recordRealtimeMetric('socket_disconnected', { role: role || 'unknown' });
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
    if (socketRedisPubClient) {
      socketRedisPubClient.disconnect();
      socketRedisPubClient = undefined;
    }
    if (socketRedisSubClient) {
      socketRedisSubClient.disconnect();
      socketRedisSubClient = undefined;
    }
    console.log('[WebSocket] Server closed');
  }
};
