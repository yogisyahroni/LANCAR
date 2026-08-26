import { Router } from 'express';
import * as controllers from './controllers/index';
import { requireAuth, requireRole, requireTotp, verifyWebSession, verifySession, requireMobileOrWebAuth } from './middlewares';
import {
  communicationCallRateLimiter,
  communicationMessageRateLimiter,
  communicationReadRateLimiter,
  courierFaceRateLimiter,
  courierOfferRateLimiter,
  courierProofRateLimiter,
  promoMutationRateLimiter,
  promoReadRateLimiter,
  toggleRateLimiter,
  publicEndpointRateLimiter,
} from './rateLimit';
import { requireIdempotencyKey } from './middleware/idempotencyRequirement';
import { requireCookieCsrfProtection } from './middleware/csrfProtection';
import { secureUploadSingle } from './security/uploadSecurity';

export const routes = Router();

routes.use(requireCookieCsrfProtection);

// Domain route modules (extracted from monolithic routes.ts)
import { authRoutes } from './routes/auth.routes';
import { courierRoutes } from './routes/courier.routes';
import { notificationRoutes } from './routes/notification.routes';
import { orderRoutes } from './routes/order.routes';
import { adminRoutes } from './routes/admin.routes';
import { publicRoutes } from './routes/public.routes';

routes.use(authRoutes);
routes.use(courierRoutes);
routes.use(notificationRoutes);
routes.use(orderRoutes);
routes.use(adminRoutes);
routes.use(publicRoutes);

routes.get('/api/admin/courier/leaderboard', requireAuth, async (req, res) => {
    try {
        const db = require('./db').db;
        const result = await db.query(`SELECT is_enabled FROM feature_flags WHERE key = 'courier_leaderboard'`);
        if (result.rows.length === 0 || !result.rows[0].is_enabled) {
            return res.status(403).json({ error: 'Feature Courier Leaderboard is disabled' });
        }
        res.json({ status: 'success', data: [] });
    } catch(e) {
        res.status(500).json({error: 'Internal Server Error'});
    }
});

routes.get('/api/admin/chat/messages', requireAuth, async (req, res) => {
    try {
        const db = require('./db').db;
        const result = await db.query(`SELECT is_enabled FROM feature_flags WHERE key = 'in_app_chat'`);
        if (result.rows.length === 0 || !result.rows[0].is_enabled) {
            return res.status(403).json({ error: 'Feature In-App Chat is disabled' });
        }
        res.json({ status: 'success', data: [] });
    } catch(e) {
        res.status(500).json({error: 'Internal Server Error'});
    }
});
routes.post('/api/v1/public/location-requests/:token', (req, res) => controllers.customerOrder.submitReceiverLocationRequestPublic(req, res));
routes.post('/api/v1/public/business/api-requests', (req, res) => controllers.businessApiRequest.createBusinessApiRequest(req, res));
routes.post('/payments/midtrans/notification', (req, res) => controllers.customerOrder.handleMidtransNotification(req, res));
routes.post('/webhooks/courier-payout-provider', (req, res) => controllers.handleCourierPayoutProviderWebhook(req, res));
