import { Request, Response } from 'express';
import { db } from '../db';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  AuthProtectionError,
  assertAuthAttemptAllowed,
  getRequestIpAddress,
  recordAuthFailure,
  recordAuthSuccess,
  sendAuthProtectionError,
} from '../security/bruteForceProtection';

type CustomerJwtPayload = {
  user_id?: string;
  id?: string;
  role?: string;
};

const resolveCookieSameSite = (): 'strict' | 'lax' =>
  process.env.NODE_ENV === 'production' ? 'strict' : 'lax';

const customerCookieOptions = (expiresAt: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: resolveCookieSameSite(),
  path: '/',
  expires: expiresAt,
});

const isDevelopmentMode = () => process.env.NODE_ENV !== 'production';

const getDevAdminLoginPasswords = () => {
  if (!isDevelopmentMode()) return new Set<string>();
  return new Set(
    String(process.env.DEV_ADMIN_LOGIN_PASSWORDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
};

const createCustomerWebSession = async (req: Request, customerId: string) => {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO web_sessions (user_id, session_token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [customerId, sessionToken, expiresAt, req.ip, req.headers['user-agent']]
  );

  return { sessionToken, expiresAt };
};

export const loginWeb = async (req: Request, res: Response) => {
  const { email, password, portal } = req.body; // portal: 'admin' or 'customer'
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const ipAddress = getRequestIpAddress(req);

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  if (portal !== 'admin') {
    res.status(410).json({
      error: 'Customer web login requires the customer OTP flow',
      next: '/api/v1/auth/customer/login/start',
    });
    return;
  }

  try {
    await assertAuthAttemptAllowed({
      scope: 'admin_web_login',
      identifier: normalizedEmail,
      ipAddress,
    });

    const adminRoles = ['super_admin', 'admin', 'manager', 'finance', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'];
    const result = await db.query(
      `SELECT id, full_name as name, email, role, pin_hash
       FROM users
       WHERE email = $1
         AND role = ANY($2::text[])
         AND deleted_at IS NULL`,
      [normalizedEmail, adminRoles]
    );

    if (result.rows.length === 0) {
      await recordAuthFailure({
        scope: 'admin_web_login',
        identifier: normalizedEmail,
        ipAddress,
        reason: 'user_not_found',
      });
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];

    const devAdminPasswords = getDevAdminLoginPasswords();
    const isPasswordValid = user.pin_hash === password || devAdminPasswords.has(password);

    if (!isPasswordValid) {
      await recordAuthFailure({
        scope: 'admin_web_login',
        identifier: normalizedEmail,
        ipAddress,
        reason: 'invalid_password',
      });
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate a secure session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const isAdminRole = adminRoles.includes(user.role);
    const sessionTable = 'web_sessions';

    await db.query(
      `INSERT INTO ${sessionTable} (user_id, session_token, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [user.id, sessionToken, expiresAt, req.ip, req.headers['user-agent']]
    );

    const cookieName = isAdminRole ? 'admin_session' : 'customer_session';

    // Set HttpOnly cookie with explicit path for gateway cross-path support
    await recordAuthSuccess({
      scope: 'admin_web_login',
      identifier: normalizedEmail,
      ipAddress,
    });
    
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: resolveCookieSameSite(),
      path: '/', // Crucial: must be root
      expires: expiresAt,
    };

    res.cookie(cookieName, sessionToken, cookieOptions);

    // Remove sensitive fields
    delete user.pin_hash;

    res.json({ message: 'Login successful', user });
  } catch (error) {
    if (error instanceof AuthProtectionError) {
      sendAuthProtectionError(res, error);
      return;
    }

    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const exchangeCustomerJwtForWebSession = async (req: Request, res: Response) => {
  const token = typeof req.body?.access_token === 'string' ? req.body.access_token.trim() : '';
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    res.status(500).json({ error: 'Authentication service is not configured' });
    return;
  }

  if (!token) {
    res.status(400).json({ error: 'Access token is required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as CustomerJwtPayload;
    const customerId = decoded.user_id || decoded.id;

    if (!customerId || decoded.role !== 'customer') {
      res.status(403).json({ error: 'Only customer tokens can create customer web sessions' });
      return;
    }

    const result = await db.query(
      `SELECT id, full_name as name, email, role, status
       FROM users
       WHERE id = $1
         AND role = 'customer'
         AND deleted_at IS NULL`,
      [customerId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Customer account not found' });
      return;
    }

    const user = result.rows[0];
    if (user.status !== 'active') {
      res.status(403).json({ error: 'Customer account is not active' });
      return;
    }

    const { sessionToken, expiresAt } = await createCustomerWebSession(req, user.id);
    res.cookie('customer_session', sessionToken, customerCookieOptions(expiresAt));
    res.json({ message: 'Customer web session created', user });
  } catch (error) {
    console.error('Customer JWT exchange error:', error);
    res.status(401).json({ error: 'Invalid or expired customer token' });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  const portal = typeof req.headers['x-portal'] === 'string' ? req.headers['x-portal'] : '';
  const adminSessionToken = req.cookies?.admin_session;
  const customerSessionToken = req.cookies?.customer_session;
  const sessionToken = portal === 'customer'
    ? customerSessionToken
    : portal === 'admin'
      ? adminSessionToken
      : adminSessionToken || customerSessionToken || req.cookies?.web_session;

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No session' });
    return;
  }

  try {
    const adminRoles = ['super_admin', 'admin', 'manager', 'finance', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'];
    const adminResult = portal === 'customer'
      ? { rows: [] }
      : await db.query(
        `SELECT s.user_id, s.expires_at, u.email, u.role
         FROM web_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1
           AND s.expires_at > NOW()
           AND u.role = ANY($2::text[])
           AND u.deleted_at IS NULL`,
        [sessionToken, adminRoles]
      );

    const customerResult = portal === 'admin'
      ? { rows: [] }
      : await db.query(
        `SELECT s.user_id, s.expires_at, u.email, u.role
         FROM web_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1
           AND s.expires_at > NOW()
           AND u.role = 'customer'
           AND u.deleted_at IS NULL`,
        [sessionToken]
      );

    const user = adminResult.rows[0] || customerResult.rows[0];
    const sessionTable = 'web_sessions';

    if (!user) {
      res.status(401).json({ error: 'Unauthorized: Session expired' });
      return;
    }
    const isAdmin = ['super_admin', 'admin', 'manager', 'finance', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'].includes(user.role);
    const cookieName = isAdmin ? 'admin_session' : 'customer_session';

    // Refresh expiry: Add another 7 days from now
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      `UPDATE ${sessionTable} SET expires_at = $1 WHERE session_token = $2`,
      [newExpiresAt, sessionToken]
    );

    console.log(`\x1b[36m[Auth Refresh]\x1b[0m User: ${user.email}, Refreshing cookie: ${cookieName}`);

    res.cookie(cookieName, sessionToken, customerCookieOptions(newExpiresAt));

    res.json({ message: 'Session refreshed' });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const logoutWeb = async (req: Request, res: Response) => {
  const sessionToken = req.cookies?.admin_session || req.cookies?.customer_session || req.cookies?.web_session;

  if (sessionToken) {
    try {
      // Clean up from both tables to be safe
      await db.query('DELETE FROM web_sessions WHERE session_token = $1', [sessionToken]);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  res.clearCookie('admin_session');
  res.clearCookie('customer_session');
  res.json({ message: 'Logout successful' });
};

export const me = async (req: Request, res: Response) => {
  // `req.user` is set by the `verifyWebSession` middleware
  try {
    const userRole = req.user?.role || '';
    const result = await db.query(
      `SELECT id, full_name as name, email, role
       FROM users
       WHERE id = $1
         AND role = $2
         AND deleted_at IS NULL`,
      [req.user?.id, userRole]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const subscribePush = async (req: Request, res: Response) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys) {
    res.status(400).json({ error: 'Endpoint and keys are required' });
    return;
  }

  try {
    await db.query(
      `INSERT INTO web_push_subscriptions (user_id, endpoint, auth_keys)
       VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET auth_keys = EXCLUDED.auth_keys, updated_at = NOW()`,
      [req.user?.id, endpoint, JSON.stringify(keys)]
    );
    res.json({ success: true, message: 'Push subscription saved successfully' });
  } catch (error: any) {
    console.error('Subscribe push error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};

export const unsubscribePush = async (req: Request, res: Response) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    res.status(400).json({ error: 'Endpoint is required to unsubscribe' });
    return;
  }

  try {
    await db.query('DELETE FROM web_push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user?.id, endpoint]);
    res.json({ success: true, message: 'Push subscription removed successfully' });
  } catch (error: any) {
    console.error('Unsubscribe push error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};
