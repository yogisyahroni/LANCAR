import { Router } from 'express';
import * as controllers from '../controllers';
import { requireAuth, requireRole, requireTotp, verifyWebSession, verifySession, requireMobileOrWebAuth } from '../middlewares';
import {
  communicationCallRateLimiter, communicationMessageRateLimiter, communicationReadRateLimiter,
  courierFaceRateLimiter, courierOfferRateLimiter, courierProofRateLimiter,
  promoMutationRateLimiter, promoReadRateLimiter, toggleRateLimiter, publicEndpointRateLimiter,
} from '../rateLimit';
import { requireIdempotencyKey } from '../middleware/idempotencyRequirement';
import { secureUploadSingle } from '../security/uploadSecurity';

// notification routes (extracted from routes.ts)
export const notificationRoutes = Router();

notificationRoutes.get('/auth/web/notifications', verifySession, (req, res) => controllers.getUserNotifications(req, res));
notificationRoutes.get('/auth/web/notifications/unread-count', verifyWebSession, (req, res) => controllers.getNotificationUnreadCount(req, res));
notificationRoutes.patch('/auth/web/notifications/:id/read', verifyWebSession, (req, res) => controllers.markNotificationRead(req, res));
notificationRoutes.patch('/auth/web/notifications/read-all', verifyWebSession, communicationReadRateLimiter, (req, res) => controllers.markAllNotificationsRead(req, res));
notificationRoutes.patch('/auth/web/notifications/:id/archive', verifyWebSession, communicationReadRateLimiter, (req, res) => controllers.archiveNotification(req, res));
notificationRoutes.delete('/auth/web/notifications', verifyWebSession, (req, res) => controllers.clearNotifications(req, res));
notificationRoutes.get('/auth/web/notifications/preferences', verifyWebSession, (req, res) => controllers.getNotificationPreferences(req, res));
notificationRoutes.patch('/auth/web/notifications/preferences', verifyWebSession, communicationReadRateLimiter, (req, res) => controllers.updateNotificationPreferences(req, res));
notificationRoutes.post('/auth/web/notifications/subscribe', verifyWebSession, (req, res) => controllers.subscribePush(req, res));
notificationRoutes.delete('/auth/web/notifications/subscribe', verifyWebSession, (req, res) => controllers.unsubscribePush(req, res));
notificationRoutes.get('/api/v1/mobile/notifications', requireMobileOrWebAuth, (req, res) => controllers.getUserNotifications(req, res));
notificationRoutes.get('/api/v1/mobile/notifications/unread-count', requireMobileOrWebAuth, (req, res) => controllers.getNotificationUnreadCount(req, res));
notificationRoutes.patch('/api/v1/mobile/notifications/read-all', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.markAllNotificationsRead(req, res));
notificationRoutes.patch('/api/v1/mobile/notifications/:id/read', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.markNotificationRead(req, res));
notificationRoutes.patch('/api/v1/mobile/notifications/:id/archive', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.archiveNotification(req, res));
notificationRoutes.patch('/api/v1/mobile/notifications/:id/opened', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.broadcast.markMobileNotificationOpened(req, res));
notificationRoutes.get('/api/v1/mobile/notifications/preferences', requireMobileOrWebAuth, (req, res) => controllers.getNotificationPreferences(req, res));
notificationRoutes.patch('/api/v1/mobile/notifications/preferences', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.updateNotificationPreferences(req, res));
notificationRoutes.post('/api/v1/mobile/notifications/register-token', requireMobileOrWebAuth, (req, res) => controllers.registerDeviceToken(req, res));
notificationRoutes.post('/api/v1/mobile/notifications/unregister-token', requireMobileOrWebAuth, (req, res) => controllers.registerDeviceToken(req, res));
notificationRoutes.get('/api/v1/customer/notifications/register-token', requireMobileOrWebAuth, (req, res) => controllers.registerDeviceToken(req, res));
