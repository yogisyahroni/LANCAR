import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { db } from './db';

let io: SocketIOServer;

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

  io.use((socket, next) => {
    let token = socket.handshake.auth.token || socket.handshake.query.token;
    let adminSessionToken: string | undefined;
    
    // Try to extract token from cookies if not found in auth/query (for Next.js webapp)
    if (socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie.split(';').reduce((res: any, c) => {
        const [key, val] = c.trim().split('=').map(decodeURIComponent);
        res[key] = val;
        return res;
      }, {});
      token = token || cookies.accessToken || cookies.access_token || cookies.token || cookies.jwt;
      adminSessionToken = cookies.admin_session;
    }

    if (!token && !adminSessionToken) {
      return next(new Error('Authentication error: Token missing'));
    }

    if (adminSessionToken && !token) {
      db.query(
        `SELECT s.user_id AS id, u.role, u.full_name
         FROM admin_sessions s
         JOIN staff u ON s.user_id = u.id
         WHERE s.session_token = $1 AND s.expires_at > NOW()`,
        [adminSessionToken]
      )
        .then((result) => {
          if (result.rows.length === 0) {
            return next(new Error('Authentication error: Invalid session'));
          }
          (socket as any).user = result.rows[0];
          next();
        })
        .catch((err) => {
          console.error('WebSocket admin session verification failed', err);
          next(new Error('Internal server error'));
        });
      return;
    }

    const secret = process.env.JWT_SECRET || 'your-secret-key';
    import('jsonwebtoken').then(jwt => {
      jwt.default.verify(token as string, secret, (err: any, decoded: any) => {
        if (err) return next(new Error('Authentication error: Invalid token'));
        
        // Attach verified user info to socket
        (socket as any).user = decoded;
        next();
      });
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
      console.log(`[WebSocket] User ${userId} joined room. Socket: ${socket.id}`);
    } else {
      console.warn(`[WebSocket] Client connected without a valid User ID in token: ${socket.id}`);
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
