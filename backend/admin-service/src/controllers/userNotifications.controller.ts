import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { ensureUserDevicesTable } from '../notifications';
import { securityLog } from '../security/logRedaction';

const ALLOWED_DEVICE_PLATFORMS = new Set(['android', 'ios', 'web']);
const FCM_TOKEN_PATTERN = /^[A-Za-z0-9:_-]{80,4096}$/;
const ALLOWED_NOTIFICATION_CATEGORIES = new Set(['message', 'activity', 'promo', 'support', 'system']);
const ALLOWED_NOTIFICATION_PREFERENCES = ['message', 'activity', 'promo', 'support', 'system'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_NOTIFICATION_LIMIT = 50;
const MAX_NOTIFICATION_LIMIT = 100;

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
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }

    const rawCategory = typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : '';
    const category = ALLOWED_NOTIFICATION_CATEGORIES.has(rawCategory) ? rawCategory : null;
    const rawLimit = Number.parseInt(String(req.query.limit || DEFAULT_NOTIFICATION_LIMIT), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_NOTIFICATION_LIMIT) : DEFAULT_NOTIFICATION_LIMIT;

    const result = await readDb.query(`
      SELECT
        id,
        title,
        body,
        type,
        category,
        priority,
        is_read,
        read_at,
        archived_at,
        expires_at,
        (expires_at IS NOT NULL AND expires_at <= NOW()) AS is_expired,
        created_at,
        order_id,
        conversation_id,
        promo_id,
        metadata,
        deep_link
      FROM notifications
      WHERE user_id = $1
        AND archived_at IS NULL
        AND ($2::TEXT IS NULL OR category = $2)
      ORDER BY created_at DESC
      LIMIT $3
    `, [user_id, category, limit]);

    res.json({ success: true, data: result.rows, notifications: result.rows });
  } catch (error: any) {
    securityLog.error('Failed to fetch user notifications', { error });
    res.status(500).json({ success: false, data: null, message: 'Failed to fetch notifications', code: 'ERR_NOTIFICATIONS_FETCH_FAILED' });
  }
};

export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    const { id } = req.params;

    if (!user_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }

    if (!UUID_PATTERN.test(String(id))) {
      res.status(400).json({ success: false, data: null, message: 'Notification id is invalid', code: 'ERR_INVALID_NOTIFICATION_ID' });
      return;
    }

    const result = await db.query(`
      UPDATE notifications
      SET is_read = true, read_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, is_read, read_at
    `, [id, user_id]);

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, data: null, message: 'Notification not found', code: 'ERR_NOTIFICATION_NOT_FOUND' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('Failed to mark notification read', { error });
    res.status(500).json({ success: false, data: null, message: 'Failed to update notification', code: 'ERR_NOTIFICATION_UPDATE_FAILED' });
  }
};

export const clearNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;

    if (!user_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }
    
    const result = await db.query(`
      UPDATE notifications
      SET archived_at = NOW()
      WHERE user_id = $1
        AND archived_at IS NULL
    `, [user_id]);

    res.json({ success: true, data: { archived_count: result.rowCount || 0 } });
  } catch (error: any) {
    securityLog.error('Failed to archive user notifications', { error });
    res.status(500).json({ success: false, data: null, message: 'Failed to archive notifications', code: 'ERR_NOTIFICATIONS_ARCHIVE_FAILED' });
  }
};

export const getNotificationUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    if (!user_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }

    const result = await readDb.query(`
      SELECT
        category,
        COUNT(*)::INT AS count
      FROM notifications
      WHERE user_id = $1
        AND is_read = FALSE
        AND archived_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      GROUP BY category
    `, [user_id]);

    const byCategory = ALLOWED_NOTIFICATION_PREFERENCES.reduce<Record<string, number>>((acc, item) => {
      acc[item] = 0;
      return acc;
    }, {});

    let total = 0;
    result.rows.forEach((row) => {
      const count = Number(row.count || 0);
      byCategory[row.category] = count;
      total += count;
    });

    res.json({ success: true, data: { total, by_category: byCategory } });
  } catch (error) {
    securityLog.error('Failed to fetch notification unread count', { error });
    res.status(500).json({ success: false, data: null, message: 'Failed to fetch unread count', code: 'ERR_NOTIFICATION_COUNT_FAILED' });
  }
};

export const markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    if (!user_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }

    const rawCategory = typeof req.body?.category === 'string' ? req.body.category.trim().toLowerCase() : '';
    const category = ALLOWED_NOTIFICATION_CATEGORIES.has(rawCategory) ? rawCategory : null;
    const result = await db.query(`
      UPDATE notifications
      SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
      WHERE user_id = $1
        AND is_read = FALSE
        AND archived_at IS NULL
        AND ($2::TEXT IS NULL OR category = $2)
    `, [user_id, category]);

    res.json({ success: true, data: { updated_count: result.rowCount || 0 } });
  } catch (error) {
    securityLog.error('Failed to mark all notifications read', { error });
    res.status(500).json({ success: false, data: null, message: 'Failed to update notifications', code: 'ERR_NOTIFICATIONS_UPDATE_FAILED' });
  }
};

export const archiveNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    const { id } = req.params;
    if (!user_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }

    if (!UUID_PATTERN.test(String(id))) {
      res.status(400).json({ success: false, data: null, message: 'Notification id is invalid', code: 'ERR_INVALID_NOTIFICATION_ID' });
      return;
    }

    const result = await db.query(`
      UPDATE notifications
      SET archived_at = NOW()
      WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
      RETURNING id, archived_at
    `, [id, user_id]);

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, data: null, message: 'Notification not found', code: 'ERR_NOTIFICATION_NOT_FOUND' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    securityLog.error('Failed to archive notification', { error });
    res.status(500).json({ success: false, data: null, message: 'Failed to archive notification', code: 'ERR_NOTIFICATION_ARCHIVE_FAILED' });
  }
};

export const getNotificationPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    if (!user_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }

    const result = await readDb.query(`
      SELECT category, push_enabled, in_app_enabled, marketing_enabled, quiet_hours_start, quiet_hours_end
      FROM notification_preferences
      WHERE user_id = $1
      ORDER BY category ASC
    `, [user_id]);

    const preferences = ALLOWED_NOTIFICATION_PREFERENCES.map((category) => {
      const existing = result.rows.find((row) => row.category === category);
      return existing || {
        category,
        push_enabled: true,
        in_app_enabled: true,
        marketing_enabled: category === 'promo' ? false : true,
        quiet_hours_start: '21:00',
        quiet_hours_end: '08:00',
      };
    });

    res.json({ success: true, data: preferences });
  } catch (error) {
    securityLog.error('Failed to fetch notification preferences', { error });
    res.status(500).json({ success: false, data: null, message: 'Failed to fetch notification preferences', code: 'ERR_NOTIFICATION_PREFS_FETCH_FAILED' });
  }
};

export const updateNotificationPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = req.user?.id;
    if (!user_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }

    const preferences = Array.isArray(req.body?.preferences) ? req.body.preferences : [];
    if (preferences.length === 0 || preferences.length > ALLOWED_NOTIFICATION_PREFERENCES.length) {
      res.status(400).json({ success: false, data: null, message: 'preferences must contain 1-5 items', code: 'ERR_INVALID_NOTIFICATION_PREFS' });
      return;
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const savedPreferences = [];

      for (const preference of preferences) {
        const category = typeof preference?.category === 'string' ? preference.category.trim().toLowerCase() : '';
        if (!ALLOWED_NOTIFICATION_CATEGORIES.has(category)) {
          await client.query('ROLLBACK');
          res.status(400).json({ success: false, data: null, message: 'Notification category is invalid', code: 'ERR_INVALID_NOTIFICATION_CATEGORY' });
          return;
        }

        const pushEnabled = preference.push_enabled !== false;
        const inAppEnabled = preference.in_app_enabled !== false;
        const marketingEnabled = category === 'promo' ? preference.marketing_enabled === true : preference.marketing_enabled !== false;
        const quietHoursStart = typeof preference.quiet_hours_start === 'string' ? preference.quiet_hours_start.slice(0, 5) : '21:00';
        const quietHoursEnd = typeof preference.quiet_hours_end === 'string' ? preference.quiet_hours_end.slice(0, 5) : '08:00';

        if (!/^\d{2}:\d{2}$/.test(quietHoursStart) || !/^\d{2}:\d{2}$/.test(quietHoursEnd)) {
          await client.query('ROLLBACK');
          res.status(400).json({ success: false, data: null, message: 'Quiet hours must use HH:mm format', code: 'ERR_INVALID_QUIET_HOURS' });
          return;
        }

        const result = await client.query(`
          INSERT INTO notification_preferences (
            user_id,
            category,
            push_enabled,
            in_app_enabled,
            marketing_enabled,
            quiet_hours_start,
            quiet_hours_end,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (user_id, category)
          DO UPDATE SET
            push_enabled = EXCLUDED.push_enabled,
            in_app_enabled = EXCLUDED.in_app_enabled,
            marketing_enabled = EXCLUDED.marketing_enabled,
            quiet_hours_start = EXCLUDED.quiet_hours_start,
            quiet_hours_end = EXCLUDED.quiet_hours_end,
            updated_at = NOW()
          RETURNING category, push_enabled, in_app_enabled, marketing_enabled, quiet_hours_start, quiet_hours_end
        `, [
          user_id,
          category,
          pushEnabled,
          inAppEnabled,
          marketingEnabled,
          quietHoursStart,
          quietHoursEnd,
        ]);

        savedPreferences.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.json({ success: true, data: savedPreferences });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    securityLog.error('Failed to update notification preferences', { error });
    res.status(500).json({ success: false, data: null, message: 'Failed to update notification preferences', code: 'ERR_NOTIFICATION_PREFS_UPDATE_FAILED' });
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

    securityLog.info('Device token registered', {
      platform: validation.platform,
      hasUser: Boolean(user_id)
    });
    res.json({
      success: true,
      message: 'Device token registered successfully',
      data: true
    });
  } catch (error: any) {
    if (error?.code === '42P01') {
      securityLog.warn('Device token registration skipped because user_devices is unavailable');
      res.json({ success: true, message: 'Device token registration skipped: table not available' });
      return;
    }

    securityLog.error('Error registering device token', { error });
    res.status(500).json({ error: 'Failed to register device token' });
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

    securityLog.info('Device token unregistered', { hasUser: Boolean(user_id) });
    res.json({ success: true, message: 'Device token unregistered successfully' });
  } catch (error: any) {
    if (error?.code === '42P01') {
      securityLog.warn('Device token unregister skipped because user_devices is unavailable');
      res.json({ success: true, message: 'Device token unregister skipped: table not available' });
      return;
    }

    securityLog.error('Error unregistering device token', { error });
    res.status(500).json({ error: 'Failed to unregister device token' });
  }
};
