import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { verifyInternalGatewayAuth } from './internalAuth';
import { securityLog } from './security/logRedaction';
import jwt from 'jsonwebtoken';
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

const requestLogMeta = (req: Request, extra?: Record<string, unknown>) => ({
  method: req.method,
  path: req.path,
  portal: req.headers['x-portal'],
  ...extra,
});

// Admin Auth middleware - checks for admin_session cookie or explicit headers
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const internalAuth = verifyInternalGatewayAuth(req.headers);
  if (internalAuth.status === 'invalid') {
    securityLog.warn('Blocked forged internal auth headers', requestLogMeta(req, { reason: internalAuth.reason }));
    res.status(401).json({ error: 'Unauthorized: Invalid internal authentication context' });
    return;
  }

  // 1. Check for Gateway-signed identity headers.
  if (internalAuth.status === 'valid' && internalAuth.identity.userId && internalAuth.identity.role) {
    req.user = {
      id: internalAuth.identity.userId,
      role: internalAuth.identity.role,
      full_name: internalAuth.identity.fullName,
      totp_verified: internalAuth.identity.totpVerified,
    };
    securityLog.info('Authenticated admin via gateway identity', requestLogMeta(req, { role: internalAuth.identity.role }));
    return next();
  }

  // 2. Fallback to Admin Web Session verification
  return verifyAdminSession(req, res, next);
};

// Flexible middleware that accepts injected Gateway Headers (Mobile Bearer JWT) 
// OR Web Customer Cookies OR Web Admin Cookies to protect shared resources.
export const requireMobileOrWebAuth = async (req: Request, res: Response, next: NextFunction) => {
  const internalAuth = verifyInternalGatewayAuth(req.headers);
  if (internalAuth.status === 'invalid') {
    securityLog.warn('Blocked forged internal auth headers', requestLogMeta(req, { reason: internalAuth.reason }));
    res.status(401).json({ error: 'Unauthorized: Invalid internal authentication context' });
    return;
  }

  // 1. Check for Gateway-signed identity headers (Mobile Apps authenticated via JWT)
  if (internalAuth.status === 'valid' && internalAuth.identity.userId) {
    req.user = {
      id: internalAuth.identity.userId,
      role: internalAuth.identity.role || 'user',
      full_name: internalAuth.identity.fullName,
      totp_verified: internalAuth.identity.totpVerified,
    };
    securityLog.info('Authenticated mobile or web request via gateway identity', requestLogMeta(req, { role: req.user.role }));
    return next();
  }

  // 2. Check for mobile Bearer session token issued by courier login.
  const authHeader = req.headers.authorization || '';
  const bearerPrefix = 'Bearer ';
  if (authHeader.startsWith(bearerPrefix)) {
    const token = authHeader.slice(bearerPrefix.length).trim();
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      securityLog.error('JWT_SECRET not configured for mobile auth', requestLogMeta(req));
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      const userId = decoded.user_id || decoded.id;
      
      if (!userId) {
        throw new Error('Invalid JWT payload missing user ID');
      }

      // Validate against users table to get latest role and 2fa status
      const result = await db.query(
        `SELECT id, role, full_name, is_2fa_enabled, deleted_at
         FROM users
         WHERE id = $1 AND deleted_at IS NULL`,
        [userId]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        req.user = {
          id: user.id,
          role: user.role,
          full_name: user.full_name,
          totp_verified: Boolean(user.is_2fa_enabled),
        };
        securityLog.info('Authenticated mobile request via bearer JWT access token', requestLogMeta(req, { role: user.role }));
        return next();
      } else {
        throw new Error('User not found or deleted');
      }
    } catch (error) {
      securityLog.error('Mobile bearer session verification failed', requestLogMeta(req, { error }));
      // We don't return 500 here, we just fall through to the Web session checks or 401
      // If it's a mobile client with an invalid token, it will ultimately hit 401.
    }
  }

  // 3. Check for Web Customer Session cookie
  if (req.cookies?.customer_session) {
    return verifyWebSession(req, res, next);
  }

  // 4. Check for Web Admin Session cookie
  if (req.cookies?.admin_session) {
    return verifyAdminSession(req, res, next);
  }

  // 5. Reject if no authentication mechanism provided
  securityLog.warn('Blocked unauthenticated mobile or web request', requestLogMeta(req));
  res.status(401).json({ error: 'Unauthorized: Authentication required' });
};


export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    securityLog.info('Checking role access', requestLogMeta(req, { role: req.user?.role, allowedRoles }));
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      securityLog.warn('Role access denied', requestLogMeta(req, { role: req.user?.role, allowedRoles }));
      res.status(403).json({ error: 'Forbidden: Insufficient role permissions' });
      return;
    }
    securityLog.info('Role access passed', requestLogMeta(req, { role: req.user.role }));
    next();
  };
};

export const requireTotp = (req: Request, res: Response, next: NextFunction) => {
  securityLog.info('Checking TOTP requirement', requestLogMeta(req, { hasUser: Boolean(req.user), totpVerified: Boolean(req.user?.totp_verified) }));
  if (!req.user || !req.user.totp_verified) {
    securityLog.warn('TOTP requirement denied', requestLogMeta(req, { hasUser: Boolean(req.user), totpVerified: Boolean(req.user?.totp_verified) }));
    res.status(403).json({ error: 'Forbidden: 2FA/TOTP verification required in session' });
    return;
  }
  securityLog.info('TOTP requirement passed', requestLogMeta(req));
  next();
};

// Specifically for Customer Portal
export const verifyWebSession = async (req: Request, res: Response, next: NextFunction) => {
  const sessionToken = req.cookies?.customer_session;
  securityLog.info('Verifying customer web session', requestLogMeta(req, { hasSessionToken: Boolean(sessionToken) }));

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No customer session token provided' });
    return;
  }

  try {
    // STRICT: Only query web_sessions joined with customer users.
    const result = await db.query(
      `SELECT s.user_id, u.role, u.full_name, u.is_2fa_enabled
       FROM web_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.session_token = $1
         AND s.expires_at > NOW()
         AND u.role = 'customer'
         AND u.deleted_at IS NULL`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired customer session' });
      return;
    }

    const user = result.rows[0];

    req.user = {
      id: user.user_id,
      role: user.role,
      full_name: user.full_name,
      // SECURITY 2026: customer web session totp_verified hardcoded true.
      // Customer tidak pernah punya TOTP — ini masih acceptable, tapi untuk
      // konsistensi dan audit trail, gunakan nilai dari DB.
      totp_verified: Boolean(user.is_2fa_enabled),
    };

    next();
  } catch (error) {
    securityLog.error('Customer session verification failed', requestLogMeta(req, { error }));
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Specifically for Admin Dashboard
export const verifyAdminSession = async (req: Request, res: Response, next: NextFunction) => {
  const sessionToken = req.cookies?.admin_session;
  securityLog.info('Verifying admin web session', requestLogMeta(req, { hasSessionToken: Boolean(sessionToken) }));

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No admin session token provided' });
    return;
  }

  try {
    const adminRoles = ['super_admin', 'admin', 'manager', 'finance', 'ops_security', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'];
    const result = await db.query(
      `SELECT s.user_id, u.role, u.full_name, u.is_2fa_enabled 
       FROM web_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.session_token = $1
         AND s.expires_at > NOW()
         AND u.role = ANY($2::text[])
         AND u.deleted_at IS NULL`,
      [sessionToken, adminRoles]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired admin session' });
      return;
    }

    const user = result.rows[0];

    req.user = {
      id: user.user_id,
      role: user.role,
      full_name: user.full_name,
      // SECURITY 2026: admin web session totp_verified hardcoded true.
      // Admin yang 2FA-nya dinonaktifkan tetap mendapat totp_verified=true.
      // Fix: ambil is_2fa_enabled dari DB — jika admin disable 2FA,
      // requireTotp akan memblokir akses ke endpoint finansial.
      totp_verified: Boolean(user.is_2fa_enabled),
    };

    next();
  } catch (error) {
    securityLog.error('Admin session verification failed', requestLogMeta(req, { error }));
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Generic session verification for shared routes (hardened)
export const verifySession = async (req: Request, res: Response, next: NextFunction) => {
  const portal = req.headers['x-portal'] as string;
  const adminToken = req.cookies?.admin_session;
  const customerToken = req.cookies?.customer_session;

  securityLog.info('Verifying shared web session', requestLogMeta(req, { hasAdminSession: Boolean(adminToken), hasCustomerSession: Boolean(customerToken) }));

  try {
    // 1. If Portal is explicitly Admin
    if (portal === 'admin') {
      if (!adminToken) {
        return res.status(401).json({ error: 'Unauthorized: No admin session' });
      }
      const adminRoles = ['super_admin', 'admin', 'manager', 'finance', 'ops_security', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'];
      const adminResult = await db.query(
        `SELECT s.user_id, u.role, u.full_name
         FROM web_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1
           AND s.expires_at > NOW()
           AND u.role = ANY($2::text[])
           AND u.deleted_at IS NULL`,
        [adminToken, adminRoles]
      );
      if (adminResult.rows.length > 0) {
        const user = adminResult.rows[0];
        req.user = { id: user.user_id, role: user.role, full_name: user.full_name, totp_verified: true };
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized: Invalid admin session' });
    }

    // 2. If Portal is explicitly Customer
    if (portal === 'customer') {
      if (!customerToken) {
        return res.status(401).json({ error: 'Unauthorized: No customer session' });
      }
      const customerResult = await db.query(
        `SELECT s.user_id, u.role, u.full_name
         FROM web_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1
           AND s.expires_at > NOW()
           AND u.role = 'customer'
           AND u.deleted_at IS NULL`,
        [customerToken]
      );
      if (customerResult.rows.length > 0) {
        const user = customerResult.rows[0];
        req.user = { id: user.user_id, role: user.role, full_name: user.full_name, totp_verified: true };
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized: Invalid customer session' });
    }

    // 3. Reject if no valid portal header is provided or no session matched
    securityLog.warn('Blocked shared session request without valid portal header or session', requestLogMeta(req));
    res.status(401).json({ error: 'Unauthorized: Valid portal header and session required' });
  } catch (error) {
    securityLog.error('Shared session verification failed', requestLogMeta(req, { error }));
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
