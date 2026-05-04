import { Request, Response, NextFunction } from 'express';
import { db } from './db';
// Extend Express Request interface to include mock user
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      role: string;
      full_name: string;
      totp_verified: boolean;
    };
  }
}

// Mock auth middleware - reads from headers for testing purposes
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.headers['x-user-id'] as string;
  const role = req.headers['x-user-role'] as string;
  const fullName = req.headers['x-user-full-name'] as string || 'User';
  const totpVerifiedHeader = req.headers['x-totp-verified'];
  const totpVerified = totpVerifiedHeader === 'true';

  // 1. Check for explicit headers (usually injected by Gateway or Service-to-Service)
  if (userId && role) {
    req.user = {
      id: userId,
      role: role,
      full_name: fullName,
      totp_verified: totpVerifiedHeader !== undefined ? totpVerified : true,
    };
    console.log(`[requireAuth] Authenticated via Headers: UserID=${userId}, Role=${role}`);
    return next();
  }

  // 2. Fallback to Web Session verification (for the Admin Dashboard)
  // This will check req.cookies.web_session against the database
  return verifyWebSession(req, res, next);
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(`[requireRole] Checking Role: '${req.user?.role}' against [${allowedRoles.join(', ')}] for ${req.url}`);
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      console.warn(`[requireRole] FORBIDDEN: User Role '${req.user?.role}' not in [${allowedRoles.join(', ')}]. URL: ${req.url}`);
      res.status(403).json({ error: 'Forbidden: Insufficient role permissions' });
      return;
    }
    console.log(`[requireRole] PASSED for ${req.url}`);
    next();
  };
};

export const requireTotp = (req: Request, res: Response, next: NextFunction) => {
  console.log(`[requireTotp] Checking TOTP for ${req.url}. User present: ${!!req.user}, Verified: ${req.user?.totp_verified}`);
  if (!req.user || !req.user.totp_verified) {
    console.warn(`[requireTotp] FORBIDDEN: User defined? ${!!req.user}, TOTP verified? ${req.user?.totp_verified}. URL: ${req.url}`);
    res.status(403).json({ error: 'Forbidden: 2FA/TOTP verification required in session' });
    return;
  }
  console.log(`[requireTotp] PASSED for ${req.url}`);
  next();
};

export const verifyWebSession = async (req: Request, res: Response, next: NextFunction) => {
  const sessionToken = req.cookies?.web_session;
  console.log(`[verifyWebSession] URL: ${req.url}, Session Token present: ${!!sessionToken}`);

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No session token provided' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT w.user_id, u.role, u.full_name 
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
      full_name: result.rows[0].full_name,
      totp_verified: true, // Assuming true for now, can be updated later if needed
    };

    next();
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

