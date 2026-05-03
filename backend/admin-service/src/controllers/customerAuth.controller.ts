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
    // For simplicity, we are assuming users exist and checking plaintext passwords.
    // In a real application, you should hash and compare passwords!
    const result = await db.query('SELECT id, name, email, role FROM users WHERE email = $1 AND password_hash = $2', [email, password]);

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];

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
    const result = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user?.id]);
    
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
