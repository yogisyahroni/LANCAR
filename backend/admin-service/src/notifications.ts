import { db } from './db';
import { getIO } from './websocket';
import * as admin from 'firebase-admin';
import { recordPushDelivery, recordRealtimeMetric } from './services/realtimeObservability';

// Initialize Firebase Admin SDK
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
let firebaseApp: admin.app.App | null = null;

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
    console.log('[Notification] user_devices table verified');
  } catch (error) {
    console.error('[Notification] Error ensuring user_devices table:', error);
  }
};

export const initFirebase = async () => {
  if (firebaseApp) return firebaseApp;

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('[Notification] Firebase Admin initialized successfully');
      
      // Ensure DB table exists
      await ensureUserDevicesTable();
      
      return firebaseApp;
    } catch (error) {
      console.error('[Notification] Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
    }
  } else {
    console.warn('[Notification] FIREBASE_SERVICE_ACCOUNT not found. Push notifications will be skipped.');
  }
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
}

export const createNotification = async (payload: NotificationPayload) => {
  try {
    const { user_id, title, body, type, order_id, metadata, deep_link } = payload;
    
    // 1. Save to Database
    const query = `
      INSERT INTO notifications (user_id, title, body, type, order_id, metadata, deep_link, channel)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'in_app')
      RETURNING *
    `;
    const values = [user_id, title, body, type, order_id, metadata ? JSON.stringify(metadata) : null, deep_link];
    
    const result = await db.query(query, values);
    const notification = result.rows[0];

    // 2. Emit via WebSocket for Real-time (Web/Mobile Active)
    try {
      const io = getIO();
      io.to(user_id).emit('new_notification', notification);
      void recordRealtimeMetric('notification_socket_emitted', { type, has_order: Boolean(order_id) });
      console.log(`[WebSocket] Notification emitted to user ${user_id}`);
    } catch (wsError) {
      void recordRealtimeMetric('notification_socket_failed', { type, has_order: Boolean(order_id) });
      console.warn('[WebSocket] Could not emit notification via WebSocket');
    }

    // 3. Send via FCM (Push Notifications)
    if (firebaseApp) {
      try {
        // Fetch user devices
        const deviceResult = await db.query(
          'SELECT device_token FROM user_devices WHERE user_id = $1',
          [user_id]
        );
        
        const tokens = deviceResult.rows.map(r => r.device_token);
        
        if (tokens.length > 0) {
          const metadataData = Object.fromEntries(
            Object.entries(metadata || {}).map(([key, value]) => [key, value == null ? '' : String(value)])
          );

          const message: admin.messaging.MulticastMessage = {
            tokens: tokens,
            notification: {
              title: title,
              body: body,
            },
            data: {
              ...metadataData,
              type: type,
              order_id: order_id || '',
              notification_id: String(notification.id),
              deep_link: deep_link || ''
            },
            android: {
              priority: 'high',
              notification: {
                clickAction: 'FLUTTER_NOTIFICATION_CLICK', // For common framework compatibility
                sound: 'default'
              }
            }
          };

          const fcmResponse = await admin.messaging().sendEachForMulticast(message);
          recordPushDelivery({
            user_id,
            type,
            order_id,
            device_count: tokens.length,
            success_count: fcmResponse.successCount,
            failure_count: fcmResponse.failureCount,
          });
          console.log(`[FCM] Sent to ${fcmResponse.successCount} devices for user ${user_id}. Failures: ${fcmResponse.failureCount}`);
          
          // Cleanup invalid tokens
          if (fcmResponse.failureCount > 0) {
            const invalidTokens: string[] = [];
            fcmResponse.responses.forEach((resp, idx) => {
              if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
                invalidTokens.push(tokens[idx]);
              }
            });
            
            if (invalidTokens.length > 0) {
              await db.query(
                'DELETE FROM user_devices WHERE device_token = ANY($1)',
                [invalidTokens]
              );
              console.log(`[FCM] Cleaned up ${invalidTokens.length} invalid tokens`);
            }
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
        console.error('[FCM] Error sending push notification:', fcmError);
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
    console.error('Error creating notification:', error);
    throw error;
  }
};

export const sendEmailAlert = async (flagKey: string, oldState: boolean, newState: boolean, reason: string, user: string) => {
  const statusColor = newState ? '#22c55e' : '#ef4444';
  const htmlTemplate = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background-color: ${statusColor}; color: white; padding: 16px;">
        <h2 style="margin: 0;">Lancar Feature Flag Update</h2>
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

  // Mock email sending
  console.log('----------------------------------------------------');
  console.log(`[EMAIL ALERT] To be sent as HTML:`);
  console.log(htmlTemplate);
  console.log('----------------------------------------------------');
  return true;
};

export const sendSlackAlert = async (flagKey: string, oldState: boolean, newState: boolean, reason: string, user: string) => {
  // Mock Slack sending
  console.log('----------------------------------------------------');
  console.log(`[SLACK ALERT] 🚀 Feature Flag ${flagKey} toggled to ${newState ? 'ON' : 'OFF'} by ${user}`);
  console.log(`Reason: ${reason}`);
  console.log('----------------------------------------------------');
  return true;
};
