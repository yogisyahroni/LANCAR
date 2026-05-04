import { Request, Response } from 'express';
import { db, readDb } from '../db';

export const getUserNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    if (!user_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await readDb.query(`
      SELECT 
        id, title, body, type, is_read, created_at, 
        order_id, metadata, deep_link
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [user_id]);

    res.json({ notifications: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    const { id } = req.params;

    await db.query(`
      UPDATE notifications
      SET is_read = true, read_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, [id, user_id]);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const clearNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    
    await db.query(`
      DELETE FROM notifications
      WHERE user_id = $1
    `, [user_id]);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
