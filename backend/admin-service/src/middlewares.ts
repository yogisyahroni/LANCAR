import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { verifyInternalGatewayAuth } from './internalAuth';
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
  const internalAuth = verifyInternalGatewayAuth(req.headers);
  if (internalAuth.status === 'invalid') {
    console.warn(`[requireAuth] Blocked forged internal headers: ${internalAuth.reason}`);
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
    console.log(`[requireAuth] Authenticated via Gateway: UserID=${internalAuth.identity.userId}, Role=${internalAuth.identity.role}`);
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
    console.warn(`[requireMobileOrWebAuth] Blocked forged internal headers: ${internalAuth.reason}`);
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
    console.log(`[requireMobileOrWebAuth] Authenticated Mobile via Gateway: UserID=${internalAuth.identity.userId}`);
    return next();
  }

  // 2. Check for mobile Bearer session token issued by courier login.
  const authHeader = req.headers.authorization || '';
  const bearerPrefix = 'Bearer ';
  if (authHeader.startsWith(bearerPrefix)) {
    const token = authHeader.slice(bearerPrefix.length).trim();

    try {
      const result = await db.query(
        `SELECT s.user_id, u.role, u.full_name
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.refresh_token = $1
           AND s.expires_at > NOW()
           AND s.is_revoked = false`,
        [token]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        req.user = {
          id: user.user_id,
          role: user.role,
          full_name: user.full_name,
          totp_verified: true,
        };
        console.log(`[requireMobileOrWebAuth] Authenticated Mobile via Bearer: UserID=${user.user_id}`);
        return next();
      }
    } catch (error) {
      console.error('Mobile bearer session verification error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
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
  console.warn(`[requireMobileOrWebAuth] Blocked Access. No headers or sessions provided. URL: ${req.url}`);
  res.status(401).json({ error: 'Unauthorized: Authentication required' });
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
  const sessionToken = req.cookies?.customer_session;
  console.log(`[verifyWebSession] URL: ${req.url}, Session Token present: ${!!sessionToken}`);

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No customer session token provided' });
    return;
  }

  try {
    // STRICT: Only query web_sessions joined with customer users.
    const result = await db.query(
      `SELECT s.user_id, u.role, u.full_name 
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
  const sessionToken = req.cookies?.admin_session;
  console.log(`[verifyAdminSession] URL: ${req.url}, Session Token present: ${!!sessionToken}`);

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No admin session token provided' });
    return;
  }

  try {
    const adminRoles = ['super_admin', 'admin', 'manager', 'finance', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'];
    const result = await db.query(
      `SELECT s.user_id, u.role, u.full_name 
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
      totp_verified: true,
    };

    next();
  } catch (error) {
    console.error('Admin session verification error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Generic session verification for shared routes (hardened)
export const verifySession = async (req: Request, res: Response, next: NextFunction) => {
  const portal = req.headers['x-portal'] as string;
  const adminToken = req.cookies?.admin_session;
  const customerToken = req.cookies?.customer_session;

  console.log(`[verifySession] Portal: ${portal}, URL: ${req.url}`);

  try {
    // 1. If Portal is explicitly Admin
    if (portal === 'admin') {
      if (!adminToken) {
        return res.status(401).json({ error: 'Unauthorized: No admin session' });
      }
      const adminRoles = ['super_admin', 'admin', 'manager', 'finance', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'];
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

    // 3. Fallback/Legacy: If no X-Portal header, try to infer from Referer
    const referer = req.headers.referer || '';
    if (referer.includes(':3002') || referer.includes('/admin')) {
       // Likely Admin
       console.log('[verifySession] Inferring ADMIN portal from referer');
       // ... repeat admin check logic if we want to be permissive during transition
    }

    // For security, if no portal is specified, we reject or require one
    res.status(400).json({ error: 'Bad Request: X-Portal header is required for session verification' });
  } catch (error) {
    console.error('Generic session verification error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
