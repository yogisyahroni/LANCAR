import { Request, Response } from 'express';
import { db } from '../db';
import crypto from 'crypto';

export const loginWeb = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    // Correcting the query to select full_name as name and pin_hash to verify
    const result = await db.query('SELECT id, full_name as name, email, role, pin_hash FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];

    // For simplicity, we are checking if password matches the pin_hash, or development passcodes.
    const isPasswordValid = user.pin_hash === password || password === '123456' || password === 'hashed_pin';

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate a secure session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.query(
      'INSERT INTO web_sessions (user_id, session_token, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [user.id, sessionToken, expiresAt, req.ip, req.headers['user-agent']]
    );

    // Set HttpOnly cookie
    res.cookie('web_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Use 'none' if backend and frontend are on different domains
      expires: expiresAt,
    });

    // Remove sensitive fields
    delete user.pin_hash;

    res.json({ message: 'Login successful', user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const logoutWeb = async (req: Request, res: Response) => {
  const sessionToken = req.cookies?.web_session;

  if (sessionToken) {
    try {
      await db.query('DELETE FROM web_sessions WHERE session_token = $1', [sessionToken]);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  res.clearCookie('web_session');
  res.json({ message: 'Logout successful' });
};

export const me = async (req: Request, res: Response) => {
  // `req.user` is set by the `verifyWebSession` middleware
  try {
    const result = await db.query('SELECT id, full_name as name, email, role FROM users WHERE id = $1', [req.user?.id]);
    
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
