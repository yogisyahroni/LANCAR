import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { ensureUserDevicesTable } from '../notifications';

const ALLOWED_DEVICE_PLATFORMS = new Set(['android', 'ios', 'web']);
const FCM_TOKEN_PATTERN = /^[A-Za-z0-9:_-]{80,4096}$/;

export const validateDeviceTokenRegistrationInput = (input: {
  device_token?: string;
  fcm_token?: string;
  fcmToken?: string;
  platform?: string;
}) => {
  const finalToken = input.device_token || input.fcm_token || input.fcmToken;
  const platform = typeof input.platform === 'string' && input.platform.trim().length > 0
    ? input.platform.trim().toLowerCase()
    : finalToken
      ? 'android'
      : '';

  if (!finalToken || !platform) {
    return {
      valid: false,
      error: 'device_token (or fcmToken) and platform are required',
      token: null,
      platform: null
    };
  }

  const token = String(finalToken).trim();
  if (!FCM_TOKEN_PATTERN.test(token)) {
    return {
      valid: false,
      error: 'device_token format is invalid',
      token: null,
      platform: null
    };
  }

  if (!ALLOWED_DEVICE_PLATFORMS.has(platform)) {
    return {
      valid: false,
      error: 'platform must be one of android, ios, or web',
      token: null,
      platform: null
    };
  }

  return {
    valid: true,
    error: null,
    token,
    platform
  };
};

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

    if (!user_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const validation = validateDeviceTokenRegistrationInput(req.body || {});
    if (!validation.valid || !validation.token || !validation.platform) {
      res.status(400).json({ error: validation.error });
      return;
    }

    await ensureUserDevicesTable();

    // Upsert device token
    await db.query(`
      INSERT INTO user_devices (user_id, device_token, platform, last_active_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (device_token) 
      DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_active_at = NOW()
    `, [user_id, validation.token, validation.platform]);

    console.log(`[Notification] Device token registered for user ${user_id} (${validation.platform})`);
    res.json({
      success: true,
      message: 'Device token registered successfully',
      data: true
    });
  } catch (error: any) {
    if (error?.code === '42P01') {
      console.warn('[Notification] user_devices table not found. Skipping device token registration.');
      res.json({ success: true, message: 'Device token registration skipped: table not available' });
      return;
    }

    console.error('Error registering device token:', error);
    res.status(500).json({ error: error.message });
  }
};

export const unregisterDeviceToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    const { device_token, fcm_token, fcmToken } = req.body;
    const finalToken = device_token || fcm_token || fcmToken;

    if (!user_id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!finalToken) {
      res.status(400).json({ error: 'device_token (or fcmToken) is required' });
      return;
    }

    await ensureUserDevicesTable();

    await db.query(`
      DELETE FROM user_devices 
      WHERE device_token = $1 AND user_id = $2
    `, [finalToken, user_id]);

    console.log(`[Notification] Device token unregistered for user ${user_id}`);
    res.json({ success: true, message: 'Device token unregistered successfully' });
  } catch (error: any) {
    if (error?.code === '42P01') {
      console.warn('[Notification] user_devices table not found. Skipping device token unregister.');
      res.json({ success: true, message: 'Device token unregister skipped: table not available' });
      return;
    }

    console.error('Error unregistering device token:', error);
    res.status(500).json({ error: error.message });
  }
};
