import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import { db } from '../db';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import { issueCsrfTokenCookie, clearCsrfTokenCookie } from '../middleware/csrfProtection';
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

// Use FORCE_SECURE_COOKIES=true when running behind an HTTPS tunnel/proxy
// (e.g. Cloudflare Tunnel, ngrok) even if NODE_ENV is not 'production'.
// SameSite=none is required when frontend and API are on different subdomains.
const isSecureCookieContext = (): boolean =>
  process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true';

const customerCookieOptions = (expiresAt: Date) => ({
  httpOnly: true,
  secure: isSecureCookieContext(),
  sameSite: (isSecureCookieContext() ? 'none' : 'lax') as 'none' | 'lax',
  domain: process.env.COOKIE_DOMAIN || undefined,
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

    const adminRoles = ['super_admin', 'admin', 'manager', 'finance', 'ops_security', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'];
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
      secure: isSecureCookieContext(),
      sameSite: (isSecureCookieContext() ? 'none' : 'lax') as 'none' | 'lax',
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/', // Crucial: must be root
      expires: expiresAt,
    };

    res.cookie(cookieName, sessionToken, cookieOptions);
    issueCsrfTokenCookie(res, sessionToken, expiresAt);

    // Remove sensitive fields
    delete user.pin_hash;

    res.json({ message: 'Login successful', user });
  } catch (error) {
    if (error instanceof AuthProtectionError) {
      sendAuthProtectionError(res, error);
      return;
    }

    securityLog.error('Login error:', error);
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
      `SELECT id, full_name as name, email, role, status, store_name
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
    issueCsrfTokenCookie(res, sessionToken, expiresAt);
    res.json({ message: 'Customer web session created', user });
  } catch (error) {
    securityLog.error('Customer JWT exchange error:', error);
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
    const adminRoles = ['super_admin', 'admin', 'manager', 'finance', 'ops_security', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'];
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
    const isAdmin = ['super_admin', 'admin', 'manager', 'finance', 'ops_security', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'].includes(user.role);
    const cookieName = isAdmin ? 'admin_session' : 'customer_session';

    // Refresh expiry: Add another 7 days from now
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      `UPDATE ${sessionTable} SET expires_at = $1 WHERE session_token = $2`,
      [newExpiresAt, sessionToken]
    );

    console.log(`\x1b[36m[Auth Refresh]\x1b[0m User: ${user.email}, Refreshing cookie: ${cookieName}`);

    res.cookie(cookieName, sessionToken, customerCookieOptions(newExpiresAt));
    issueCsrfTokenCookie(res, sessionToken, newExpiresAt);

    res.json({ message: 'Session refreshed' });
  } catch (error) {
    securityLog.error('Refresh token error:', error);
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
      securityLog.error('Logout error:', error);
    }
  }

  res.clearCookie('admin_session');
  res.clearCookie('customer_session');
  clearCsrfTokenCookie(res);
  res.json({ message: 'Logout successful' });
};

export const getCustomerSessions = async (req: Request, res: Response) => {
  const sessionToken = req.cookies?.customer_session;
  if (!req.user?.id || !sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No customer session token provided' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT id, session_token, ip_address, user_agent, created_at
       FROM web_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id]
    );

    const sessions = result.rows.map((session) => ({
      id: session.id,
      device: session.user_agent || 'Perangkat tidak diketahui',
      ip: session.ip_address || 'IP tidak tersedia',
      location: 'Lokasi tidak tersedia',
      timestamp: session.created_at,
      is_current: session.session_token === sessionToken,
    }));

    res.json({ sessions });
  } catch (error) {
    securityLog.error('Customer sessions lookup error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const logoutOtherCustomerSessions = async (req: Request, res: Response) => {
  const sessionToken = req.cookies?.customer_session;
  if (!req.user?.id || !sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No customer session token provided' });
    return;
  }

  try {
    const result = await db.query(
      `DELETE FROM web_sessions
       WHERE user_id = $1 AND session_token <> $2
       RETURNING id`,
      [req.user.id, sessionToken]
    );
    res.json({ message: 'Other customer sessions logged out', revoked_count: result.rowCount || 0 });
  } catch (error) {
    securityLog.error('Customer sessions revoke error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const changeCustomerPin = async (req: Request, res: Response) => {
  const currentPin = typeof req.body?.current_pin === 'string' ? req.body.current_pin : '';
  const newPin = typeof req.body?.new_pin === 'string' ? req.body.new_pin : '';

  if (!req.user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
    res.status(400).json({ error: 'PIN must be exactly 6 digits' });
    return;
  }
  if (currentPin === newPin) {
    res.status(400).json({ error: 'New PIN must be different from current PIN' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT pin_hash FROM users
       WHERE id = $1 AND role = 'customer' AND deleted_at IS NULL`,
      [req.user.id]
    );
    const storedHash = result.rows[0]?.pin_hash;
    if (!storedHash) {
      res.status(400).json({ error: 'Customer PIN has not been configured' });
      return;
    }

    const isValid = storedHash.startsWith('$argon2')
      ? await argon2.verify(storedHash, currentPin)
      : await bcrypt.compare(currentPin, storedHash);
    if (!isValid) {
      res.status(401).json({ error: 'Current PIN is incorrect' });
      return;
    }

    const nextHash = await argon2.hash(newPin, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 2,
      hashLength: 32,
    });
    await db.query(
      `UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2`,
      [nextHash, req.user.id]
    );

    res.json({ message: 'Customer PIN changed successfully' });
  } catch (error) {
    securityLog.error('Customer PIN change error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const me = async (req: Request, res: Response) => {
  // `req.user` is set by the `verifyWebSession` middleware
  try {
    const userRole = req.user?.role || '';
    const result = await db.query(
      `SELECT id, full_name as name, email, role, store_name
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
    securityLog.error('Me error:', error);
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
    securityLog.error('Subscribe push error:', error);
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
    securityLog.error('Unsubscribe push error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};
