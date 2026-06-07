import { db } from './db';
import { getIO } from './websocket';
import * as admin from 'firebase-admin';
import { recordPushDelivery, recordRealtimeMetric } from './services/realtimeObservability';
import { securityLog } from './security/logRedaction';

type FirebaseTarget = 'default' | 'customer' | 'courier';
type DeviceRecipient = {
  device_token: string;
  user_type: string;
};

const firebaseApps: Partial<Record<FirebaseTarget, admin.app.App>> = {};
let firebaseApp: admin.app.App | null = null;
const FCM_SEND_TIMEOUT_MS = Number(process.env.FCM_SEND_TIMEOUT_MS || 15000);

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const decodeBase64ServiceAccount = (encoded?: string): string | undefined => {
  if (!encoded || !encoded.trim()) return undefined;
  try {
    return Buffer.from(encoded.trim(), 'base64').toString('utf8');
  } catch (error) {
    securityLog.error('Firebase service account base64 decode failed', { error });
    return undefined;
  }
};

const getServiceAccountJson = (raw?: string, encoded?: string): string | undefined =>
  raw && raw.trim() ? raw : decodeBase64ServiceAccount(encoded);

const parseServiceAccountJson = (raw: string | undefined, label: string): admin.ServiceAccount | null => {
  if (!raw || !raw.trim()) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      securityLog.warn('Firebase service account missing required fields', { label });
      return null;
    }
    return parsed;
  } catch (error) {
    securityLog.error('Firebase service account parse failed', { label, error });
    return null;
  }
};

const initializeNamedFirebaseApp = (
  target: FirebaseTarget,
  appName: string,
  rawServiceAccount: string | undefined
): admin.app.App | null => {
  const serviceAccount = parseServiceAccountJson(rawServiceAccount, target);
  if (!serviceAccount) return null;

  const existingApp = admin.apps.find((app) => app?.name === appName);
  const app =
    existingApp ||
    admin.initializeApp(
      {
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.projectId
      },
      appName
    );

  firebaseApps[target] = app;
  securityLog.info('Firebase Admin initialized', { target });
  return app;
};

export const getFirebaseAppForUserType = (userType?: string): admin.app.App | null => {
  const normalized = (userType || '').toLowerCase();
  if (normalized === 'customer') return firebaseApps.customer || firebaseApps.default || null;
  if (normalized === 'courier') return firebaseApps.courier || firebaseApps.default || null;
  return firebaseApps.default || firebaseApps.customer || firebaseApps.courier || null;
};

export const getConfiguredFirebaseTargets = (): string[] =>
  Object.entries(firebaseApps)
    .filter(([, app]) => Boolean(app))
    .map(([target]) => target);

export const ensureUserDevicesTable = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_devices (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        device_token TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL,
        last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
    `);
    securityLog.info('User devices table verified');
  } catch (error) {
    securityLog.error('User devices table verification failed', { error });
  }
};

export const initFirebase = async () => {
  if (firebaseApp) return firebaseApp;

  const defaultServiceAccount = getServiceAccountJson(
    process.env.FIREBASE_SERVICE_ACCOUNT,
    process.env.FIREBASE_SERVICE_ACCOUNT_B64
  );
  const customerServiceAccount = getServiceAccountJson(
    process.env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT,
    process.env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT_B64
  );
  const courierServiceAccount = getServiceAccountJson(
    process.env.FIREBASE_COURIER_SERVICE_ACCOUNT,
    process.env.FIREBASE_COURIER_SERVICE_ACCOUNT_B64
  );

  initializeNamedFirebaseApp('default', 'tembus-default', defaultServiceAccount);
  initializeNamedFirebaseApp('customer', 'tembus-customer', customerServiceAccount || defaultServiceAccount);
  initializeNamedFirebaseApp('courier', 'tembus-courier', courierServiceAccount || defaultServiceAccount);

  firebaseApp = firebaseApps.default || firebaseApps.customer || firebaseApps.courier || null;

  if (firebaseApp) {
    await ensureUserDevicesTable();
    securityLog.info('Firebase targets ready', { targets: getConfiguredFirebaseTargets() });
    return firebaseApp;
  }

  securityLog.warn('Firebase Admin credentials not found. Push notifications will be skipped.');
  return null;
};

export interface NotificationPayload {
  user_id: string;
  title: string;
  body: string;
  type: string;
  order_id?: string;
  metadata?: any;
  deep_link?: string;
  category?: 'message' | 'activity' | 'promo' | 'support' | 'system';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  conversation_id?: string;
  promo_id?: string;
  expires_at?: string | Date;
}

const notificationCategories = new Set(['message', 'activity', 'promo', 'support', 'system']);
const notificationPriorities = new Set(['low', 'normal', 'high', 'urgent']);

type NotificationCategory = NonNullable<NotificationPayload['category']>;
type NotificationPriority = NonNullable<NotificationPayload['priority']>;

const inferNotificationCategory = (type: string): NotificationCategory => {
  const normalizedType = type.toLowerCase();
  if (normalizedType.includes('chat') || normalizedType.includes('call') || normalizedType.includes('message')) {
    return 'message';
  }
  if (normalizedType.includes('promo') || normalizedType.includes('voucher') || normalizedType.includes('campaign')) {
    return 'promo';
  }
  if (normalizedType.includes('support') || normalizedType.includes('dispute') || normalizedType.includes('help')) {
    return 'support';
  }
  if (normalizedType.includes('system') || normalizedType.includes('security')) {
    return 'system';
  }
  return 'activity';
};

const normalizeNotificationCategory = (category: unknown, type: string): NotificationCategory => {
  const normalized = typeof category === 'string' ? category.trim().toLowerCase() : '';
  return notificationCategories.has(normalized) ? normalized as NotificationCategory : inferNotificationCategory(type);
};

const normalizeNotificationPriority = (priority: unknown): NotificationPriority => {
  const normalized = typeof priority === 'string' ? priority.trim().toLowerCase() : '';
  return notificationPriorities.has(normalized) ? normalized as NotificationPriority : 'normal';
};

const toSafeFcmData = (metadata: unknown): Record<string, string> => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return Object.fromEntries(
    Object.entries(metadata as Record<string, unknown>)
      .filter(([key]) => /^[A-Za-z0-9_.:-]{1,64}$/.test(key))
      .map(([key, value]) => [key, value == null ? '' : String(value).slice(0, 512)])
  );
};

export const createNotification = async (payload: NotificationPayload) => {
  try {
    const {
      user_id,
      title,
      body,
      type,
      order_id,
      metadata,
      deep_link,
      conversation_id,
      promo_id,
      expires_at,
    } = payload;
    const category = normalizeNotificationCategory(payload.category, type);
    const priority = normalizeNotificationPriority(payload.priority);
    
    // 1. Save to Database
    const query = `
      INSERT INTO notifications (
        user_id,
        title,
        body,
        type,
        order_id,
        metadata,
        deep_link,
        channel,
        category,
        priority,
        conversation_id,
        promo_id,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'in_app', $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const values = [
      user_id,
      title,
      body,
      type,
      order_id,
      metadata ? JSON.stringify(metadata) : null,
      deep_link,
      category,
      priority,
      conversation_id || null,
      promo_id || null,
      expires_at || null,
    ];
    
    const result = await db.query(query, values);
    const notification = result.rows[0];

    // 2. Emit via WebSocket for Real-time (Web/Mobile Active)
    try {
      const io = getIO();
      io.to(user_id).emit('new_notification', notification);
      void recordRealtimeMetric('notification_socket_emitted', { type, category, has_order: Boolean(order_id) });
      securityLog.info('Notification emitted over WebSocket', { type, category, has_order: Boolean(order_id) });
    } catch (wsError) {
      void recordRealtimeMetric('notification_socket_failed', { type, category, has_order: Boolean(order_id) });
      securityLog.warn('Notification WebSocket emit failed', { type, category, has_order: Boolean(order_id), error: wsError });
    }

    // 3. Send via FCM (Push Notifications)
    if (firebaseApp) {
      try {
        // Fetch user devices
        const deviceResult = await db.query<DeviceRecipient>(
          `
          SELECT
            ud.device_token,
            CASE
              WHEN c.id IS NOT NULL THEN 'customer'
              WHEN cr.id IS NOT NULL THEN 'courier'
              ELSE COALESCE(u.role, 'unknown')
            END AS user_type
          FROM user_devices ud
          LEFT JOIN customers c ON c.id = ud.user_id
          LEFT JOIN couriers cr ON cr.id = ud.user_id
          LEFT JOIN users u ON u.id = ud.user_id
          WHERE ud.user_id = $1
          `,
          [user_id]
        );

        const devices = deviceResult.rows;
        
        if (devices.length > 0) {
          const metadataData = toSafeFcmData(metadata);

          const baseMessage = {
            notification: {
              title: title,
              body: body,
            },
            data: {
              ...metadataData,
              type: type,
              category,
              priority,
              order_id: order_id || '',
              notification_id: String(notification.id),
              deep_link: deep_link || '',
              conversation_id: conversation_id || '',
              promo_id: promo_id || ''
            },
            android: {
              priority: 'high' as const,
              notification: {
                channelId: category === 'message' ? 'tembus_customer_messages' : 'tembus_customer_updates',
                clickAction: 'TEMBUS_NOTIFICATION_OPEN',
                sound: 'default'
              }
            }
          };

          const groupedDevices = devices.reduce((groups, device) => {
            const targetApp = getFirebaseAppForUserType(device.user_type);
            if (!targetApp) return groups;
            const key = targetApp.name;
            const existing = groups.get(key) || { app: targetApp, tokens: [] as string[] };
            existing.tokens.push(device.device_token);
            groups.set(key, existing);
            return groups;
          }, new Map<string, { app: admin.app.App; tokens: string[] }>());

          let totalSuccessCount = 0;
          let totalFailureCount = 0;
          const invalidTokens: string[] = [];

          for (const group of groupedDevices.values()) {
            const message: admin.messaging.MulticastMessage = {
              ...baseMessage,
              tokens: group.tokens
            };

            const fcmResponse = await withTimeout(
              admin.messaging(group.app).sendEachForMulticast(message),
              FCM_SEND_TIMEOUT_MS,
              `FCM send (${group.app.name})`
            );
            totalSuccessCount += fcmResponse.successCount;
            totalFailureCount += fcmResponse.failureCount;

            fcmResponse.responses.forEach((resp, idx) => {
              if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
                invalidTokens.push(group.tokens[idx]);
              }
            });
          }

          recordPushDelivery({
            user_id,
            type,
            order_id,
            device_count: devices.length,
            success_count: totalSuccessCount,
            failure_count: totalFailureCount,
          });
          securityLog.info('FCM notification dispatch completed', {
            type,
            category,
            has_order: Boolean(order_id),
            device_count: devices.length,
            success_count: totalSuccessCount,
            failure_count: totalFailureCount,
          });
          
          // Cleanup invalid tokens
          if (invalidTokens.length > 0) {
            await db.query(
              'DELETE FROM user_devices WHERE device_token = ANY($1)',
              [invalidTokens]
            );
            securityLog.info('Invalid FCM tokens cleaned up', { invalid_token_count: invalidTokens.length });
          }
        } else {
          recordPushDelivery({
            user_id,
            type,
            order_id,
            device_count: 0,
            success_count: 0,
            failure_count: 0,
            skipped_reason: 'no_registered_devices',
          });
        }
      } catch (fcmError) {
        recordPushDelivery({
          user_id,
          type,
          order_id,
          device_count: 0,
          success_count: 0,
          failure_count: 1,
          skipped_reason: 'fcm_exception',
        });
        securityLog.error('FCM notification dispatch failed', { type, has_order: Boolean(order_id), error: fcmError });
      }
    } else {
      recordPushDelivery({
        user_id,
        type,
        order_id,
        device_count: 0,
        success_count: 0,
        failure_count: 0,
        skipped_reason: 'firebase_not_initialized',
      });
    }

    return notification;
  } catch (error) {
    securityLog.error('Notification creation failed', { error });
    throw error;
  }
};

export const sendEmailAlert = async (flagKey: string, oldState: boolean, newState: boolean, reason: string, user: string) => {
  const statusColor = newState ? '#22c55e' : '#ef4444';
  const htmlTemplate = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background-color: ${statusColor}; color: white; padding: 16px;">
        <h2 style="margin: 0;">TEMBUS Feature Flag Update</h2>
      </div>
      <div style="padding: 24px; color: #374151;">
        <p><strong>Flag Key:</strong> <code>${flagKey}</code></p>
        <p><strong>Status Changed:</strong> <span style="color: ${oldState ? '#22c55e' : '#ef4444'}; font-weight: bold;">${oldState ? 'ON' : 'OFF'}</span> &rarr; <span style="color: ${statusColor}; font-weight: bold;">${newState ? 'ON' : 'OFF'}</span></p>
        <p><strong>Changed By:</strong> ${user}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="margin-bottom: 8px;"><strong>Reason for Change:</strong></p>
        <blockquote style="margin: 0; padding: 12px; background-color: #f3f4f6; border-left: 4px solid #9ca3af; font-style: italic;">
          ${reason}
        </blockquote>
      </div>
    </div>
  `;

  securityLog.info('Feature flag email alert prepared', {
    flagKey,
    oldState,
    newState,
    user,
    reasonLength: reason.length,
    htmlLength: htmlTemplate.length,
  });
  return true;
};

export const sendSlackAlert = async (flagKey: string, oldState: boolean, newState: boolean, reason: string, user: string) => {
  securityLog.info('Feature flag Slack alert prepared', {
    flagKey,
    oldState,
    newState,
    user,
    reasonLength: reason.length,
  });
  return true;
};
