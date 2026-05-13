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

export const registerDeviceToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    const { device_token, fcmToken, platform } = req.body;
    const finalToken = device_token || fcmToken;

    if (!user_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!finalToken || !platform) {
      res.status(400).json({ error: 'device_token (or fcmToken) and platform are required' });
      return;
    }

    // Upsert device token
    await db.query(`
      INSERT INTO user_devices (user_id, device_token, platform, last_active_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (device_token) 
      DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_active_at = NOW()
    `, [user_id, finalToken, platform]);

    console.log(`[Notification] Device token registered for user ${user_id} (${platform})`);
    res.json({ success: true, message: 'Device token registered successfully' });
  } catch (error: any) {
    console.error('Error registering device token:', error);
    res.status(500).json({ error: error.message });
  }
};

export const unregisterDeviceToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    const { device_token, fcmToken } = req.body;
    const finalToken = device_token || fcmToken;

    if (!user_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!finalToken) {
      res.status(400).json({ error: 'device_token (or fcmToken) is required' });
      return;
    }

    await db.query(`
      DELETE FROM user_devices 
      WHERE device_token = $1 AND user_id = $2
    `, [finalToken, user_id]);

    console.log(`[Notification] Device token unregistered for user ${user_id}`);
    res.json({ success: true, message: 'Device token unregistered successfully' });
  } catch (error: any) {
    console.error('Error unregistering device token:', error);
    res.status(500).json({ error: error.message });
  }
};

