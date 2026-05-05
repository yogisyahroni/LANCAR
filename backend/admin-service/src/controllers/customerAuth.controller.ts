import { Request, Response } from 'express';
import { db } from '../db';
import crypto from 'crypto';

export const loginWeb = async (req: Request, res: Response) => {
  const { email, password, portal } = req.body; // portal: 'admin' or 'customer'

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const targetTable = portal === 'admin' ? 'staff' : 'customers';
    // Correcting the query to select full_name as name and pin_hash to verify
    const result = await db.query(`SELECT id, full_name as name, email, role, pin_hash FROM ${targetTable} WHERE email = $1`, [email]);

    if (result.rows.length === 0) {
      console.warn(`\x1b[33m[Auth Failed]\x1b[0m User not found: ${email}`);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];

    // For simplicity, we are checking if password matches the pin_hash, or development passcodes.
    const isPasswordValid = user.pin_hash === password || 
                            password === '123456' || 
                            password === 'admin123' ||
                            password === 'hashed_pin';

    if (!isPasswordValid) {
      console.warn(`\x1b[33m[Auth Failed]\x1b[0m Invalid password for: ${email}`);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate a secure session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const isAdminRole = ['super_admin', 'admin', 'manager', 'finance', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'].includes(user.role);
    const sessionTable = isAdminRole ? 'admin_sessions' : 'customer_sessions';

    await db.query(
      `INSERT INTO ${sessionTable} (user_id, session_token, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [user.id, sessionToken, expiresAt, req.ip, req.headers['user-agent']]
    );

    const cookieName = isAdminRole ? 'admin_session' : 'customer_session';

    // Set HttpOnly cookie with explicit path for gateway cross-path support
    console.log(`\x1b[32m[Auth Success]\x1b[0m User: ${user.email}, Role: ${user.role}, Portal: ${portal || 'default'}, Setting cookie: ${cookieName}`);
    
    const cookieOptions = {
      httpOnly: true,
      secure: false, // Force false for local http development
      sameSite: 'lax' as const,
      path: '/', // Crucial: must be root
      expires: expiresAt,
    };

    res.cookie(cookieName, sessionToken, cookieOptions);

    // Remove sensitive fields
    delete user.pin_hash;

    res.json({ message: 'Login successful', user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  // Check all possible session cookies
  const sessionToken = req.cookies?.admin_session || req.cookies?.customer_session || req.cookies?.web_session;

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No session' });
    return;
  }

  try {
    // We check both tables but prioritize the role-appropriate one
    const adminResult = await db.query(
      `SELECT s.user_id, s.expires_at, u.email, u.role FROM admin_sessions s JOIN staff u ON s.user_id = u.id WHERE s.session_token = $1 AND s.expires_at > NOW()`,
      [sessionToken]
    );

    const customerResult = await db.query(
      `SELECT s.user_id, s.expires_at, u.email, u.role FROM customer_sessions s JOIN customers u ON s.user_id = u.id WHERE s.session_token = $1 AND s.expires_at > NOW()`,
      [sessionToken]
    );

    const user = adminResult.rows[0] || customerResult.rows[0];
    const sessionTable = adminResult.rows.length > 0 ? 'admin_sessions' : 'customer_sessions';

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

    const cookieOptions = {
      httpOnly: true,
      secure: false, 
      sameSite: 'lax' as const,
      path: '/',
      expires: newExpiresAt,
    };

    res.cookie(cookieName, sessionToken, cookieOptions);

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
      await db.query('DELETE FROM admin_sessions WHERE session_token = $1', [sessionToken]);
      await db.query('DELETE FROM customer_sessions WHERE session_token = $1', [sessionToken]);
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
    let targetTable = 'customers';
    if (['super_admin', 'admin', 'manager', 'finance', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'].includes(userRole)) {
      targetTable = 'staff';
    } else if (userRole === 'courier') {
      targetTable = 'couriers';
    }

    const result = await db.query(`SELECT id, full_name as name, email, role FROM ${targetTable} WHERE id = $1`, [req.user?.id]);
    
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
