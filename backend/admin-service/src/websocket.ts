import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { db } from './db';
import { redis } from './redis';
import { authorizeCallSocketRoom, getConversationAccess } from './services/orderCommunication';
import { recordRealtimeMetric, realtimeStructuredLog } from './services/realtimeObservability';

let io: SocketIOServer;
let socketRedisPubClient: ReturnType<typeof redis.duplicate> | undefined;
let socketRedisSubClient: ReturnType<typeof redis.duplicate> | undefined;

const ADMIN_SOCKET_ROLES = [
  'super_admin',
  'admin',
  'manager',
  'finance',
  'ops_security',
  'ops_admin',
  'finance_admin',
  'cs_agent',
  'zone_manager',
];

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

const CALL_SIGNAL_EVENTS = new Set([
  'call:offer',
  'call:answer',
  'call:ice_candidate',
  'call:ringing',
  'call:accepted',
  'call:rejected',
  'call:missed',
  'call:ended',
  'call:failed',
]);

const MAX_SDP_LENGTH = 128_000;
const MAX_ICE_CANDIDATE_LENGTH = 8_000;

const compactString = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const sanitizeCallSignalPayload = (event: string, payload: any, senderId: string) => {
  const basePayload: Record<string, unknown> = {
    order_id: compactString(payload?.order_id || payload?.orderId, 80),
    call_id: compactString(payload?.call_id || payload?.callId, 80),
    sender_id: senderId,
    sent_at: new Date().toISOString(),
  };

  if (event === 'call:offer' || event === 'call:answer') {
    basePayload.sdp = compactString(payload?.sdp, MAX_SDP_LENGTH);
    basePayload.type = event === 'call:offer' ? 'offer' : 'answer';
  }

  if (event === 'call:ice_candidate') {
    basePayload.sdp_mid = compactString(payload?.sdp_mid || payload?.sdpMid, 64);
    basePayload.sdp_m_line_index = Number.isInteger(Number(payload?.sdp_m_line_index ?? payload?.sdpMLineIndex))
      ? Number(payload?.sdp_m_line_index ?? payload?.sdpMLineIndex)
      : 0;
    basePayload.candidate = compactString(payload?.candidate, MAX_ICE_CANDIDATE_LENGTH);
  }

  if (['call:ringing', 'call:accepted', 'call:rejected', 'call:missed', 'call:ended', 'call:failed'].includes(event)) {
    basePayload.status = event.replace('call:', '');
    basePayload.reason = compactString(payload?.reason, 120);
  }

  return basePayload;
};

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
      db.query(
        `SELECT s.user_id AS id, u.role, u.full_name
         FROM web_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1
           AND s.expires_at > NOW()
           AND u.deleted_at IS NULL
           AND (
             ($2::boolean = true AND u.role = 'customer')
             OR ($2::boolean = false AND u.role = ANY($3::text[]))
           )
         LIMIT 1`,
        [sessionToken, isCustomerSession, ADMIN_SOCKET_ROLES]
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
               AND u.deleted_at IS NULL
             UNION ALL
             SELECT s.user_id AS id, u.role, u.full_name
             FROM web_sessions s
             JOIN users u ON s.user_id = u.id
             WHERE s.session_token = $1
               AND s.expires_at > NOW()
               AND u.deleted_at IS NULL
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
    // S3-CW-01 Fix: userId and role MUST come from the verified JWT/session payload
    // set by the io.use() middleware above — NEVER from client-supplied query parameters.
    // The client sends query: { userId, role } only as hints for legacy compatibility,
    // but they are never trusted for authorization decisions.
    const user = (socket as any).user;
    const userId = user?.id || user?.user_id;
    // role is ONLY taken from verified token — do NOT fall back to socket.handshake.query.role
    const role = user?.role;
    
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
        const access = await getConversationAccess(targetOrderId, {
          id: String(userId),
          role: role || undefined,
          full_name: user?.full_name,
        });
        const room = `order:${access.orderId}`;
        socket.join(room);
        void recordRealtimeMetric('order_room_joined', { role: role || 'unknown' });
        ack?.({
          success: true,
          room,
          conversation_id: access.conversationId,
          member_type: access.memberType,
        });
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

    socket.on('join_call_room', async ({ order_id, orderId, call_id, callId }, ack) => {
      const targetOrderId = order_id || orderId;
      const targetCallId = call_id || callId;
      if (!targetOrderId || !targetCallId) {
        void recordRealtimeMetric('call_room_join_failed', { reason: 'missing_payload', role: role || 'unknown' });
        ack?.({ success: false, message: 'order_id and call_id are required' });
        return;
      }

      try {
        const access = await authorizeCallSocketRoom(targetOrderId, targetCallId, {
          id: String(userId),
          role: role || undefined,
          full_name: user?.full_name,
        });
        socket.join(access.room);
        socket.join(`order:${access.access.orderId}`);
        void recordRealtimeMetric('call_room_joined', { role: role || 'unknown' });
        ack?.({ success: true, room: access.room, member_type: access.access.memberType });
        realtimeStructuredLog('info', 'socket_call_room_joined', {
          role: role || 'unknown',
          has_order: true,
          has_user: true,
        });
      } catch (error) {
        realtimeStructuredLog('warn', 'socket_call_room_join_denied', {
          role: role || 'unknown',
          error_name: error instanceof Error ? error.name : 'Error',
        });
        void recordRealtimeMetric('call_room_join_failed', { reason: 'access_denied', role: role || 'unknown' });
        ack?.({ success: false, message: 'Call access denied' });
      }
    });

    CALL_SIGNAL_EVENTS.forEach((event) => {
      socket.on(event, async (payload, ack) => {
        const targetOrderId = payload?.order_id || payload?.orderId;
        const targetCallId = payload?.call_id || payload?.callId;
        if (!targetOrderId || !targetCallId) {
          ack?.({ success: false, message: 'order_id and call_id are required' });
          return;
        }

        try {
          const access = await authorizeCallSocketRoom(targetOrderId, targetCallId, {
            id: String(userId),
            role: role || undefined,
            full_name: user?.full_name,
          });
          const safePayload = sanitizeCallSignalPayload(event, payload, String(userId));
          socket.to(access.room).emit(event, safePayload);
          void recordRealtimeMetric('call_signal_forwarded', { role: role || 'unknown', event });
          ack?.({ success: true });
        } catch (error) {
          realtimeStructuredLog('warn', 'socket_call_signal_denied', {
            role: role || 'unknown',
            event,
            error_name: error instanceof Error ? error.name : 'Error',
          });
          void recordRealtimeMetric('call_signal_failed', { reason: 'access_denied', role: role || 'unknown', event });
          ack?.({ success: false, message: 'Call signal denied' });
        }
      });
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
