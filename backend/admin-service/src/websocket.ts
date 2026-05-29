import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { db } from './db';
import { redis } from './redis';
import { recordRealtimeMetric, realtimeStructuredLog } from './services/realtimeObservability';

let io: SocketIOServer;
let socketRedisPubClient: ReturnType<typeof redis.duplicate> | undefined;
let socketRedisSubClient: ReturnType<typeof redis.duplicate> | undefined;

const isProductionRuntime = () =>
  process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

const DEFAULT_DEVELOPMENT_SOCKET_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
];

const getSocketAllowedOrigins = () => {
  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  return isProductionRuntime() ? [] : DEFAULT_DEVELOPMENT_SOCKET_ORIGINS;
};

const getJwtSecrets = () => {
  const secrets = [process.env.JWT_SECRET].filter(Boolean) as string[];

  if (!isProductionRuntime()) {
    secrets.push('tembus_secret_key_change_me', 'your-secret-key');
  }

  return Array.from(new Set(secrets));
};

export const initWebSocket = (server: HttpServer) => {
  const socketAllowedOrigins = getSocketAllowedOrigins();

  io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || socketAllowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        realtimeStructuredLog('warn', 'socket_cors_origin_blocked', { has_origin: Boolean(origin) });
        return callback(null, false);
      },
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
          realtimeStructuredLog('error', 'socket_session_verification_failed', {
            reason: isCustomerSession ? 'customer_session_lookup_error' : 'admin_session_lookup_error',
            error_name: err instanceof Error ? err.name : 'Error',
            error_message: err instanceof Error ? err.message : 'Unknown websocket session error',
          });
          void recordRealtimeMetric('socket_auth_failed', { reason: isCustomerSession ? 'customer_session_lookup_error' : 'admin_session_lookup_error' });
          next(new Error('Internal server error'));
        });
      return;
    }

    const jwtSecrets = getJwtSecrets();
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
          realtimeStructuredLog('error', 'socket_session_token_verification_failed', {
            error_name: sessionError instanceof Error ? sessionError.name : 'Error',
            error_message: sessionError instanceof Error ? sessionError.message : 'Unknown websocket token error',
          });
          void recordRealtimeMetric('socket_auth_failed', { reason: 'session_lookup_error' });
          return next(new Error('Internal server error'));
        }
      }

      // Attach verified user info to socket
      (socket as any).user = decodedPayload;
      next();
    }).catch(err => {
      realtimeStructuredLog('error', 'socket_jwt_module_load_failed', {
        error_name: err instanceof Error ? err.name : 'Error',
        error_message: err instanceof Error ? err.message : 'Unknown jsonwebtoken load error',
      });
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
      realtimeStructuredLog('info', 'socket_user_room_joined', {
        role: role || 'unknown',
        has_user: true,
      });
    } else {
      realtimeStructuredLog('warn', 'socket_missing_verified_user', {
        role: role || 'unknown',
      });
      void recordRealtimeMetric('socket_disconnected_invalid_user', { role: role || 'unknown' });
      socket.disconnect();
      return;
    }
    
    if (role) {
      socket.join(String(role));
      realtimeStructuredLog('info', 'socket_role_room_joined', { role });
    }

    // Dispute Rooms
    socket.on('join_dispute_room', ({ dispute_id }) => {
      socket.join(dispute_id);
      realtimeStructuredLog('info', 'socket_dispute_room_joined', {
        role: role || 'unknown',
        has_dispute: Boolean(dispute_id),
      });
    });

    socket.on('leave_dispute_room', ({ dispute_id }) => {
      socket.leave(dispute_id);
      realtimeStructuredLog('info', 'socket_dispute_room_left', {
        role: role || 'unknown',
        has_dispute: Boolean(dispute_id),
      });
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
            role: role || null,
            has_order: true,
            has_user: true,
          });
          ack?.({ success: false, message: 'Order access denied' });
          return;
        }

        const room = `order:${targetOrderId}`;
        socket.join(room);
        void recordRealtimeMetric('order_room_joined', { role: role || 'unknown' });
        ack?.({ success: true, room });
        realtimeStructuredLog('info', 'socket_order_room_joined', {
          role: role || 'unknown',
          has_order: true,
          has_user: true,
        });
      } catch (error) {
        realtimeStructuredLog('error', 'socket_order_room_join_failed', {
          role: role || 'unknown',
          error_name: error instanceof Error ? error.name : 'Error',
          error_message: error instanceof Error ? error.message : 'Unknown order room error',
        });
        void recordRealtimeMetric('order_room_join_failed', { reason: 'internal_error', role: role || 'unknown' });
        ack?.({ success: false, message: 'Internal server error' });
      }
    });

    socket.on('leave_order_room', ({ order_id, orderId }) => {
      const targetOrderId = order_id || orderId;
      if (!targetOrderId) return;
      const room = `order:${targetOrderId}`;
      socket.leave(room);
      realtimeStructuredLog('info', 'socket_order_room_left', {
        role: role || 'unknown',
        has_order: true,
        has_user: true,
      });
    });

    socket.on('disconnect', () => {
      void recordRealtimeMetric('socket_disconnected', { role: role || 'unknown' });
      realtimeStructuredLog('info', 'socket_disconnected', { role: role || 'unknown' });
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
    realtimeStructuredLog('info', 'socket_server_closed', {});
  }
};
