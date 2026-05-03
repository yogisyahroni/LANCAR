import { Request, Response, NextFunction } from 'express';
import { db } from './db';
// Extend Express Request interface to include mock user
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      role: string;
      totp_verified: boolean;
    };
  }
}

// Mock auth middleware - reads from headers for testing purposes
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const userId = req.headers['x-user-id'] as string;
  const role = req.headers['x-user-role'] as string;
  const totpVerified = req.headers['x-totp-verified'] === 'true';

  // For testing, we just trust the headers if provided, otherwise default to a mock super_admin
  req.user = {
    id: userId || 'mock_user_1',
    role: role || 'super_admin',
    totp_verified: totpVerified !== undefined ? totpVerified : true,
  };

  next();
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
       res.status(403).json({ error: 'Forbidden: Insufficient role permissions' });
       return;
    }
    next();
  };
};

export const requireTotp = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.totp_verified) {
     res.status(403).json({ error: 'Forbidden: 2FA/TOTP verification required in session' });
     return;
  }
  next();
};

export const verifyWebSession = async (req: Request, res: Response, next: NextFunction) => {
  const sessionToken = req.cookies?.web_session;

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No session token provided' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT w.user_id, u.role 
       FROM web_sessions w
       JOIN users u ON w.user_id = u.id
       WHERE w.session_token = $1 AND w.expires_at > NOW()`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
      return;
    }

    req.user = {
      id: result.rows[0].user_id,
      role: result.rows[0].role,
      totp_verified: true, // Assuming true for now, can be updated later if needed
    };

    next();
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

