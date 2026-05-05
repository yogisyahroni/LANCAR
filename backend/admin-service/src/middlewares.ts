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

// Admin Auth middleware - checks for admin_session cookie or explicit headers
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

  // 2. Fallback to Admin Web Session verification
  return verifyAdminSession(req, res, next);
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

// Specifically for Customer Portal
export const verifyWebSession = async (req: Request, res: Response, next: NextFunction) => {
  // Use customer_session to avoid collision with admin_session
  const sessionToken = req.cookies?.customer_session;
  console.log(`[verifyWebSession] URL: ${req.url}, Session Token present: ${!!sessionToken}`);

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No customer session token provided' });
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
      res.status(401).json({ error: 'Unauthorized: Invalid or expired customer session' });
      return;
    }

    const user = result.rows[0];

    // CRITICAL: Ensure this session belongs to a customer ONLY
    if (['super_admin', 'admin', 'manager', 'finance'].includes(user.role)) {
      console.warn(`[verifyWebSession] FORBIDDEN: Admin user ${user.user_id} tried to use customer portal`);
      res.status(403).json({ error: 'Forbidden: Admin cannot access customer portal' });
      return;
    }

    req.user = {
      id: user.user_id,
      role: user.role,
      full_name: user.full_name,
      totp_verified: true,
    };

    next();
  } catch (error) {
    console.error('Customer session verification error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Specifically for Admin Dashboard
export const verifyAdminSession = async (req: Request, res: Response, next: NextFunction) => {
  // Use admin_session to avoid collision with customer_session
  const sessionToken = req.cookies?.admin_session;
  console.log(`[verifyAdminSession] URL: ${req.url}, Session Token present: ${!!sessionToken}`);

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No admin session token provided' });
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
      res.status(401).json({ error: 'Unauthorized: Invalid or expired admin session' });
      return;
    }

    const user = result.rows[0];

    // CRITICAL: Ensure this is an admin session
    if (!['super_admin', 'admin', 'manager', 'finance'].includes(user.role)) {
      console.warn(`[verifyAdminSession] FORBIDDEN: User ${user.user_id} with role ${user.role} tried to use admin session`);
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    req.user = {
      id: user.user_id,
      role: user.role,
      full_name: user.full_name,
      totp_verified: true,
    };

    next();
  } catch (error) {
    console.error('Admin session verification error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Generic session verification for shared routes (like /me)
export const verifySession = async (req: Request, res: Response, next: NextFunction) => {
  const sessionToken = req.cookies?.admin_session || req.cookies?.customer_session;
  console.log(`[verifySession] URL: ${req.url}, Session Token present: ${!!sessionToken}`);

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

    const user = result.rows[0];

    req.user = {
      id: user.user_id,
      role: user.role,
      full_name: user.full_name,
      totp_verified: true,
    };

    next();
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
