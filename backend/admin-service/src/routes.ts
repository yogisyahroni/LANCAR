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
} from './rateLimit';
import { requireIdempotencyKey } from './middleware/idempotencyRequirement';
import { requireCookieCsrfProtection } from './middleware/csrfProtection';
import { secureUploadSingle } from './security/uploadSecurity';

export const routes = Router();

routes.use(requireCookieCsrfProtection);

// Web Portal Auth Routes
routes.post('/auth/web/login', (req, res) => controllers.loginWeb(req, res));
routes.post('/auth/web/session/exchange', (req, res) => controllers.exchangeCustomerJwtForWebSession(req, res));
routes.post('/auth/web/logout', (req, res) => controllers.logoutWeb(req, res));
routes.post('/auth/web/refresh-token', (req, res) => controllers.refreshToken(req, res));

// Courier Mobile Auth Routes
routes.post('/api/v1/auth/courier/login', (req, res) => controllers.loginCourier(req, res));
routes.post('/api/v1/auth/courier/otp/verify', (req, res) => controllers.verifyCourierLoginOtp(req, res));
routes.post('/api/v1/auth/courier/documents/upload', ...secureUploadSingle('file', 'courierDocument'), (req, res) => controllers.uploadCourierOnDemandDocument(req, res));
routes.post('/api/v1/auth/courier/register', (req, res) => controllers.submitOnDemandCourierApplication(req, res));
routes.get('/api/v1/auth/courier/registration-links/:token', (req, res) => controllers.getPublicCourierRegistrationLink(req, res));
routes.post('/api/v1/auth/courier/register/:token', (req, res) => controllers.submitCourierApplicationByRegistrationLink(req, res));
routes.get('/api/v1/courier/profile', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierProfile(req, res));
routes.put('/api/v1/courier/profile/capacity', requireMobileOrWebAuth, (req, res) => controllers.updateMobileCourierCapacity(req, res));
routes.get('/api/v1/courier/on-demand/services', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierOnDemandServices(req, res));
routes.get('/api/v1/courier/on-demand/hotspots', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierHotspots(req, res));
routes.get('/api/v1/courier/on-demand/pickup-cancellation-reasons', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPickupCancellationReasons(req, res));
routes.get('/api/v1/courier/order-status-transitions', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierStatusTransitions(req, res));
routes.get('/api/v1/courier/performance', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPerformance(req, res));
routes.get('/api/v1/courier/earnings-ledger', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierEarningsLedger(req, res));
routes.get('/api/v1/courier/payout/summary', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPayoutSummary(req, res));
routes.get('/api/v1/courier/payout/requests', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPayoutRequests(req, res));
routes.post('/api/v1/courier/payout/requests', requireMobileOrWebAuth, (req, res) => controllers.createMobileCourierPayoutRequest(req, res));
routes.get('/api/v1/courier/capabilities', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierCapabilities(req, res));
routes.post('/api/v1/courier/training/complete', requireMobileOrWebAuth, (req, res) => controllers.completeMobileCourierTraining(req, res));
routes.get('/api/v1/courier/orders', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierOrders(req, res));
routes.get('/api/v1/courier/offers', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierOffers(req, res));
routes.post('/api/v1/courier/offers/:id/accept', requireMobileOrWebAuth, courierOfferRateLimiter, requireIdempotencyKey('courier.offer.accept'), (req, res) => controllers.acceptMobileCourierOffer(req, res));
routes.post('/api/v1/courier/offers/:id/reject', requireMobileOrWebAuth, courierOfferRateLimiter, requireIdempotencyKey('courier.offer.reject'), (req, res) => controllers.rejectMobileCourierOffer(req, res));
routes.patch('/api/v1/courier/duty', requireMobileOrWebAuth, (req, res) => controllers.updateMobileCourierDuty(req, res));
routes.post('/api/v1/courier/face/verify', requireMobileOrWebAuth, courierFaceRateLimiter, requireIdempotencyKey('courier.face.verify'), ...secureUploadSingle('photo', 'evidenceImage'), (req, res) => controllers.verifyMobileCourierFace(req, res));
routes.post('/api/v1/courier/safety-events', requireMobileOrWebAuth, (req, res) => controllers.createMobileCourierSafetyEvent(req, res));
routes.post('/api/v1/courier/safety-events/photo', requireMobileOrWebAuth, ...secureUploadSingle('photo', 'evidenceImage'), (req, res) => controllers.createMobileCourierSafetyEvent(req, res));
routes.post('/api/v1/courier/trip-share', requireMobileOrWebAuth, (req, res) => controllers.createMobileCourierTripShare(req, res));
routes.get('/api/v1/courier/routes/active-plan', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierActiveRoutePlan(req, res));
routes.get('/api/v1/courier/orders/:orderId/route', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierRoutePreview(req, res));
routes.post('/api/v1/courier/orders/:orderId/cancel-pickup', requireMobileOrWebAuth, ...secureUploadSingle('photo', 'evidenceImage'), (req, res) => controllers.cancelMobileCourierOnDemandPickup(req, res));
routes.post('/api/v1/tracking/sync', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.syncCourierTracking(req, res));
routes.get('/api/v1/tracking', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderTracking(req, res));
routes.post('/api/v1/orders/status', requireMobileOrWebAuth, (req, res) => controllers.updateMobileCourierOrderStatus(req, res));
routes.post('/api/v1/orders/scan', requireMobileOrWebAuth, courierProofRateLimiter, requireIdempotencyKey('courier.proof.scan'), (req, res) => controllers.scanMobileCourierOrder(req, res));
routes.post('/api/v1/orders/pod/upload', requireMobileOrWebAuth, courierProofRateLimiter, requireIdempotencyKey('courier.pod.upload'), ...secureUploadSingle('photo', 'evidenceImage'), (req, res) => controllers.uploadMobileCourierPod(req, res));

routes.get('/auth/web/me', verifySession, (req, res) => controllers.me(req, res));
routes.get('/auth/web/notifications', verifySession, (req, res) => controllers.getUserNotifications(req, res));
routes.get('/auth/web/notifications/unread-count', verifyWebSession, (req, res) => controllers.getNotificationUnreadCount(req, res));
routes.patch('/auth/web/notifications/:id/read', verifyWebSession, (req, res) => controllers.markNotificationRead(req, res));
routes.patch('/auth/web/notifications/read-all', verifyWebSession, communicationReadRateLimiter, (req, res) => controllers.markAllNotificationsRead(req, res));
routes.patch('/auth/web/notifications/:id/archive', verifyWebSession, communicationReadRateLimiter, (req, res) => controllers.archiveNotification(req, res));
routes.delete('/auth/web/notifications', verifyWebSession, (req, res) => controllers.clearNotifications(req, res));
routes.get('/auth/web/notifications/preferences', verifyWebSession, (req, res) => controllers.getNotificationPreferences(req, res));
routes.patch('/auth/web/notifications/preferences', verifyWebSession, communicationReadRateLimiter, (req, res) => controllers.updateNotificationPreferences(req, res));
routes.post('/auth/web/notifications/subscribe', verifyWebSession, (req, res) => controllers.subscribePush(req, res));
routes.delete('/auth/web/notifications/subscribe', verifyWebSession, (req, res) => controllers.unsubscribePush(req, res));

// Mobile App Notification Routes
routes.get('/api/v1/mobile/notifications', requireMobileOrWebAuth, (req, res) => controllers.getUserNotifications(req, res));
routes.get('/api/v1/mobile/notifications/unread-count', requireMobileOrWebAuth, (req, res) => controllers.getNotificationUnreadCount(req, res));
routes.patch('/api/v1/mobile/notifications/read-all', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.markAllNotificationsRead(req, res));
routes.patch('/api/v1/mobile/notifications/:id/read', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.markNotificationRead(req, res));
routes.patch('/api/v1/mobile/notifications/:id/archive', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.archiveNotification(req, res));
routes.get('/api/v1/mobile/notifications/preferences', requireMobileOrWebAuth, (req, res) => controllers.getNotificationPreferences(req, res));
routes.patch('/api/v1/mobile/notifications/preferences', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.updateNotificationPreferences(req, res));
routes.post('/api/v1/mobile/notifications/register-token', requireMobileOrWebAuth, (req, res) => controllers.registerDeviceToken(req, res));
routes.post('/api/v1/mobile/notifications/unregister-token', requireMobileOrWebAuth, (req, res) => controllers.unregisterDeviceToken(req, res));

// Courier Specific FCM Aliases (for compatibility with existing Courier App)
routes.post('/api/v1/courier/fcm/register', requireMobileOrWebAuth, (req, res) => controllers.registerDeviceToken(req, res));
routes.post('/api/v1/courier/fcm/unregister', requireMobileOrWebAuth, (req, res) => controllers.unregisterDeviceToken(req, res));

routes.get('/auth/web/wallet/balance', verifyWebSession, (req, res) => controllers.getWalletBalance(req, res));
routes.post('/auth/web/wallet/topup', verifyWebSession, (req, res) => controllers.createTopUp(req, res));
routes.post('/auth/web/wallet/withdraw', verifyWebSession, (req, res) => controllers.requestWithdrawal(req, res));
routes.get('/auth/web/delivery-services', (req, res) => controllers.deliveryServices.listCustomerDeliveryServices(req, res));
routes.get('/auth/web/dashboard/stats', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerDashboardStats(req, res));
routes.get('/auth/web/reports/umkm', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerUmkmReport(req, res));
routes.post('/auth/web/promos/validate', verifyWebSession, promoReadRateLimiter, (req, res) => controllers.validateCustomerPromo(req, res));

// Web Portal Order Routes
routes.post('/auth/web/orders/calculate', verifyWebSession, (req, res) => controllers.customerOrder.calculatePrice(req, res));
routes.post('/auth/web/orders', verifyWebSession, requireIdempotencyKey('web.order.create'), (req, res) => controllers.customerOrder.createCustomerOrder(req, res));
routes.get('/auth/web/orders', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerOrders(req, res));
routes.post('/auth/web/orders/:id/payment/session', verifyWebSession, requireIdempotencyKey('web.payment.init'), (req, res) => controllers.customerOrder.createCustomerOrderPaymentSession(req, res));
routes.get('/auth/web/orders/:id/payment/status', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerOrderPaymentStatus(req, res));
routes.post('/auth/web/orders/:id/payment/check', verifyWebSession, requireIdempotencyKey('web.payment.confirm'), (req, res) => controllers.customerOrder.confirmCustomerOrderPayment(req, res));
routes.get('/auth/web/orders/:id', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerOrderById(req, res));
routes.post('/auth/web/orders/:id/public-tracking-link', verifyWebSession, (req, res) => controllers.customerOrder.createCustomerPublicTrackingLink(req, res));
routes.post('/auth/web/orders/:id/cancel', verifyWebSession, (req, res) => controllers.customerOrder.cancelCustomerOrder(req, res));
routes.post('/auth/web/orders/:id/retry-matching', verifyWebSession, (req, res) => controllers.customerOrder.retryCustomerOrderMatching(req, res));
routes.get('/auth/web/orders/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderChats(req, res));
routes.post('/auth/web/orders/:id/chats', requireMobileOrWebAuth, communicationMessageRateLimiter, (req, res) => controllers.customerOrder.sendOrderChat(req, res));
routes.get('/api/v1/mobile/chats/orders/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderChats(req, res));
routes.post('/api/v1/mobile/chats/orders/:id/chats', requireMobileOrWebAuth, communicationMessageRateLimiter, (req, res) => controllers.customerOrder.sendOrderChat(req, res));
routes.get('/api/v1/mobile/orders/:id/conversation', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderChats(req, res));
routes.patch('/api/v1/mobile/orders/:id/conversation/read', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.customerOrder.markOrderChatRead(req, res));
routes.post('/api/v1/mobile/orders/:id/calls', requireMobileOrWebAuth, communicationCallRateLimiter, (req, res) => controllers.customerOrder.createOrderCall(req, res));
routes.post('/api/v1/mobile/orders/:id/calls/:callId/join', requireMobileOrWebAuth, communicationCallRateLimiter, (req, res) => controllers.customerOrder.joinOrderCall(req, res));
routes.post('/api/v1/mobile/orders/:id/calls/:callId/end', requireMobileOrWebAuth, communicationCallRateLimiter, (req, res) => controllers.customerOrder.endOrderCall(req, res));
routes.post('/auth/web/orders/:id/upload', verifyWebSession, ...secureUploadSingle('file', 'customerAttachment'), (req, res) => controllers.customerOrder.uploadOrderFile(req, res));
routes.get('/auth/web/disputes', verifyWebSession, (req, res) => controllers.getCustomerDisputes(req, res));
routes.post('/auth/web/disputes', verifyWebSession, (req, res) => controllers.createDispute(req, res));
routes.get('/auth/web/disputes/:id/chats', verifyWebSession, (req, res) => controllers.getDisputeChats(req, res));
routes.post('/auth/web/disputes/:id/chats', verifyWebSession, (req, res) => controllers.sendDisputeChat(req, res));
routes.post('/auth/web/disputes/:id/upload', verifyWebSession, ...secureUploadSingle('file', 'customerAttachment'), (req, res) => controllers.uploadDisputeFile(req, res));

// Customer Mobile Portal Routes
routes.get('/api/v1/customer/profile', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerProfile(req, res));
routes.put('/api/v1/customer/profile', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.updateMobileCustomerProfile(req, res));
routes.post('/api/v1/customer/profile/photo', requireMobileOrWebAuth, ...secureUploadSingle('photo', 'profileImage'), (req, res) => controllers.customerOrder.uploadMobileCustomerProfilePhoto(req, res));
routes.get('/api/v1/customer/dashboard/stats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getCustomerDashboardStats(req, res));
routes.get('/api/v1/customer/orders', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerOrders(req, res));
routes.get('/api/v1/customer/incoming-packages', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerIncomingPackages(req, res));
routes.get('/api/v1/customer/orders/:id/tracking-detail', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerOrderTrackingDetail(req, res));
routes.get('/api/v1/customer/delivery-services', requireMobileOrWebAuth, (req, res) => controllers.deliveryServices.listCustomerDeliveryServices(req, res));
routes.post('/api/v1/customer/orders/calculate', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.calculatePrice(req, res));
routes.post('/api/v1/customer/orders/calculate-all', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.calculatePrices(req, res));
routes.post('/api/v1/customer/orders', requireMobileOrWebAuth, requireIdempotencyKey('customer.order.create'), (req, res) => controllers.customerOrder.createCustomerOrder(req, res));
routes.post('/api/v1/customer/orders/:id/payment', requireMobileOrWebAuth, requireIdempotencyKey('customer.payment.init'), (req, res) => controllers.customerOrder.createCustomerOrderPaymentSession(req, res));
routes.get('/api/v1/customer/orders/:id/payment/status', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getCustomerOrderPaymentStatus(req, res));
routes.post('/api/v1/customer/orders/:id/payment/check', requireMobileOrWebAuth, requireIdempotencyKey('customer.payment.confirm'), (req, res) => controllers.customerOrder.confirmCustomerOrderPayment(req, res));
routes.get('/api/v1/customer/orders/:id', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerOrder(req, res));
routes.post('/api/v1/customer/orders/:id/upload', requireMobileOrWebAuth, ...secureUploadSingle('file', 'customerAttachment'), (req, res) => controllers.customerOrder.uploadOrderFile(req, res));
routes.post('/api/v1/customer/orders/:id/cancel', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.cancelCustomerOrder(req, res));
routes.post('/api/v1/customer/orders/:id/retry-matching', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.retryCustomerOrderMatching(req, res));
routes.get('/api/v1/customer/disputes', requireMobileOrWebAuth, (req, res) => controllers.getCustomerDisputes(req, res));
routes.post('/api/v1/customer/disputes', requireMobileOrWebAuth, (req, res) => controllers.createDispute(req, res));
routes.get('/api/v1/customer/disputes/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.getDisputeChats(req, res));
routes.post('/api/v1/customer/disputes/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.sendDisputeChat(req, res));
routes.post('/api/v1/customer/disputes/:id/upload', requireMobileOrWebAuth, ...secureUploadSingle('file', 'customerAttachment'), (req, res) => controllers.uploadDisputeFile(req, res));
routes.get('/api/v1/customer/addresses', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.listCustomerAddresses(req, res));
routes.post('/api/v1/customer/addresses', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.createCustomerAddress(req, res));
routes.patch('/api/v1/customer/addresses/:id', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.updateCustomerAddress(req, res));
routes.delete('/api/v1/customer/addresses/:id', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.deleteCustomerAddress(req, res));
routes.post('/api/v1/customer/location-requests', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.createReceiverLocationRequest(req, res));
routes.get('/api/v1/customer/location-requests/:id', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getReceiverLocationRequestForCustomer(req, res));
routes.delete('/api/v1/customer/location-requests/:id', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.revokeReceiverLocationRequest(req, res));
routes.post('/api/v1/customer/notifications/register-token', requireMobileOrWebAuth, (req, res) => controllers.registerDeviceToken(req, res));
routes.get('/api/v1/customer/promos/eligible', requireMobileOrWebAuth, promoReadRateLimiter, (req, res) => controllers.listCustomerEligiblePromos(req, res));
routes.post('/api/v1/customer/promos/validate', requireMobileOrWebAuth, promoReadRateLimiter, (req, res) => controllers.validateCustomerPromo(req, res));
routes.post('/api/v1/customer/promos/reserve', requireMobileOrWebAuth, promoMutationRateLimiter, requireIdempotencyKey('customer.promo.reserve'), (req, res) => controllers.reserveCustomerPromo(req, res));
routes.post('/api/v1/customer/promos/redeem', requireMobileOrWebAuth, promoMutationRateLimiter, requireIdempotencyKey('customer.promo.redeem'), (req, res) => controllers.redeemCustomerPromo(req, res));
routes.post('/api/v1/customer/promos/release', requireMobileOrWebAuth, promoMutationRateLimiter, (req, res) => controllers.releaseCustomerPromoReservation(req, res));

// Payment Links Proxy
routes.get('/api/v1/payment-links', requireMobileOrWebAuth, (req, res) => controllers.paymentLink.listLinks(req, res));
routes.post('/api/v1/payment-links', requireMobileOrWebAuth, (req, res) => controllers.paymentLink.createLink(req, res));
routes.get('/api/v1/payment-links/:id', requireMobileOrWebAuth, (req, res) => controllers.paymentLink.getLink(req, res));
routes.post('/api/v1/payment-links/:id/checkout', requireMobileOrWebAuth, (req, res) => controllers.paymentLink.checkoutLink(req, res));

// Bulk Order Routes
routes.post('/auth/web/orders/bulk/upload', verifyWebSession, ...secureUploadSingle('file', 'bulkCsv'), (req, res) => controllers.bulkOrder.uploadBulkExcel(req, res));
routes.use('/uploads', requireMobileOrWebAuth, (req, res) => controllers.servePrivateUpload(req, res));
routes.get('/auth/web/orders/bulk/status/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.getBulkJobStatus(req, res));
routes.post('/auth/web/orders/bulk/validate/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.validateBulkRow(req, res));
routes.put('/auth/web/orders/bulk/row/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.validateBulkRow(req, res));
routes.delete('/auth/web/orders/bulk/rows/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.deleteBulkRows(req, res));
routes.post('/auth/web/orders/bulk/process', verifyWebSession, (req, res) => controllers.bulkOrder.processBulkPayment(req, res));
routes.post('/auth/web/orders/bulk/pay', verifyWebSession, (req, res) => controllers.bulkOrder.processBulkPayment(req, res));


// Public HR Careers routes
routes.get('/api/v1/public/jobs', (req, res) => controllers.hr.getPublicJobs(req, res));
routes.post('/api/v1/public/jobs/:id/apply', (req, res) => controllers.hr.applyForJob(req, res));

// Public News routes
routes.get('/api/v1/public/news', (req, res) => controllers.news.getPublicNews(req, res));
routes.get('/api/v1/public/news/:slug', (req, res) => controllers.news.getPublicNewsBySlug(req, res));

// Public routes (no auth required)
routes.get('/health', (req, res) => controllers.getSystemHealth(req, res));
routes.get('/admin/health', (req, res) => controllers.getSystemHealth(req, res));
routes.get('/api/v1/system/latest-version', (req, res) => controllers.getLatestVersion(req, res));
routes.get('/api/v1/system/on-demand-readiness', (req, res) => controllers.getOnDemandReadiness(req, res));
routes.get('/api/v1/config/runtime', (req, res) => controllers.getPublicRuntimeConfigs(req, res));
routes.get('/api/v1/maps/config', (req, res) => controllers.getPublicMapsProviderRuntimeConfig(req, res));
routes.get('/api/v1/maps/tiles/:z/:x/:y.png', (req, res) => controllers.getPublicOpenStreetMapTile(req, res));
routes.get('/api/v1/maps/route', (req, res) => controllers.getPublicMapsRoutePreview(req, res));
routes.get('/api/v1/maps/geocode', (req, res) => controllers.getPublicMapsGeocode(req, res));
routes.get('/api/v1/maps/reverse-geocode', (req, res) => controllers.getPublicMapsReverseGeocode(req, res));
routes.get('/track/:token', (req, res) => controllers.getPublicTripShare(req, res));
routes.get('/api/v1/public/location-requests/:token', (req, res) => controllers.customerOrder.getReceiverLocationRequestPublic(req, res));

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

// Admin routes - Protected by Admin Auth and Role requirement
routes.use('/admin', requireAuth, requireRole(['super_admin', 'ops_security', 'ops_admin', 'finance_admin', 'finance', 'cs_agent', 'zone_manager']));
routes.get('/admin/courier-safety-events', (req, res) => controllers.listAdminCourierSafetyEvents(req, res));
routes.get('/admin/courier-growth-configs', (req, res) => controllers.listAdminCourierGrowthConfigs(req, res));
routes.patch('/admin/courier-tier-configs/:id', (req, res) => controllers.updateAdminCourierTierConfig(req, res));
routes.patch('/admin/courier-incentive-campaigns/:id', (req, res) => controllers.updateAdminCourierIncentive(req, res));

// HR Careers Management
routes.get('/admin/hr/jobs', (req, res) => controllers.hr.getAdminJobs(req, res));
routes.post('/admin/hr/jobs', (req, res) => controllers.hr.createAdminJob(req, res));
routes.get('/admin/hr/jobs/:id', (req, res) => controllers.hr.getAdminJobById(req, res));
routes.put('/admin/hr/jobs/:id', (req, res) => controllers.hr.updateAdminJob(req, res));
routes.delete('/admin/hr/jobs/:id', (req, res) => controllers.hr.deleteAdminJob(req, res));
routes.get('/admin/hr/applications', (req, res) => controllers.hr.getAdminApplications(req, res));
routes.put('/admin/hr/applications/:id/status', (req, res) => controllers.hr.updateAdminApplicationStatus(req, res));

// News Management
routes.get('/admin/news', (req, res) => controllers.news.getAdminNews(req, res));
routes.post('/admin/news', ...secureUploadSingle('photo', 'newsImage'), (req, res) => controllers.news.createAdminNews(req, res));
routes.get('/admin/news/:id', (req, res) => controllers.news.getAdminNewsById(req, res));
routes.put('/admin/news/:id', ...secureUploadSingle('photo', 'newsImage'), (req, res) => controllers.news.updateAdminNews(req, res));
routes.delete('/admin/news/:id', (req, res) => controllers.news.deleteAdminNews(req, res));

// Business API Requests
routes.get('/admin/business-api-requests', (req, res) => controllers.businessApiRequest.getBusinessApiRequests(req, res));
routes.get('/admin/business-api-requests/:id', (req, res) => controllers.businessApiRequest.getBusinessApiRequestById(req, res));
routes.post('/admin/business-api-requests/:id/:action', (req, res) => controllers.businessApiRequest.reviewBusinessApiRequest(req, res));

// Admin Dashboard & Stats

routes.get('/admin/dashboard/stats', (req, res) => controllers.getDashboardStats(req, res));
routes.get('/admin/dashboard/events', (req, res) => controllers.getDashboardEvents(req, res));

routes.get('/admin/feature-flags', (req, res) => controllers.getAllFlags(req, res));
routes.post('/admin/feature-flags', (req, res) => controllers.createFlag(req, res));
routes.get('/admin/feature-flags/:key', (req, res) => controllers.getFlagByKey(req, res));
// Apply TOTP and Rate Limit for toggle
routes.patch('/admin/feature-flags/:key/toggle', requireTotp, toggleRateLimiter, (req, res) => controllers.toggleFlag(req, res));
// Apply TOTP for config updates
routes.patch('/admin/feature-flags/:key/config', requireTotp, (req, res) => controllers.updateFlagConfig(req, res));
routes.get('/admin/feature-flags/:key/logs', (req, res) => controllers.getFlagLogs(req, res));
routes.get('/admin/audit-logs', (req, res) => controllers.getAllLogs(req, res));
routes.get('/admin/audit-logs/export', (req, res) => controllers.exportAuditLogs(req, res));
routes.get('/admin/settings', (req, res) => controllers.getSystemConfigs(req, res));
routes.patch('/admin/settings/:key', requireTotp, (req, res) => controllers.updateSystemConfig(req, res));
routes.get('/admin/maps-provider-config', (req, res) => controllers.getAdminMapsProviderRuntimeConfig(req, res));
routes.patch('/admin/maps-provider-config', requireTotp, (req, res) => controllers.updateAdminMapsProviderRuntimeConfig(req, res));
routes.get('/admin/maps-production-readiness', (req, res) => controllers.getAdminMapsProductionReadiness(req, res));
routes.get('/admin/maps-provider-credentials', requireRole(['super_admin', 'ops_security']), (req, res) => controllers.listAdminMapsProviderCredentials(req, res));
routes.post('/admin/maps-provider-credentials/test', requireRole(['super_admin', 'ops_security']), requireTotp, (req, res) => controllers.testAdminMapsProviderCredential(req, res));
routes.post('/admin/maps-provider-credentials', requireRole(['super_admin', 'ops_security']), requireTotp, (req, res) => controllers.createAdminMapsProviderCredential(req, res));
routes.post('/admin/maps-provider-credentials/:id/validate', requireRole(['super_admin', 'ops_security']), requireTotp, (req, res) => controllers.validateAdminMapsProviderCredential(req, res));
routes.post('/admin/maps-provider-credentials/:id/activate', requireRole(['super_admin', 'ops_security']), requireTotp, (req, res) => controllers.activateAdminMapsProviderCredential(req, res));
routes.post('/admin/maps-provider-credentials/:id/deactivate', requireRole(['super_admin', 'ops_security']), requireTotp, (req, res) => controllers.deactivateAdminMapsProviderCredential(req, res));
routes.get('/admin/admins', (req, res) => controllers.getAllAdmins(req, res));
routes.post('/admin/admins', (req, res) => controllers.inviteAdmin(req, res));
routes.delete('/admin/admins/:id', (req, res) => controllers.deleteAdmin(req, res));

// Delivery Services Catalog
routes.get('/admin/delivery-services', (req, res) => controllers.deliveryServices.listAdminDeliveryServices(req, res));
routes.post('/admin/delivery-services', (req, res) => controllers.deliveryServices.createAdminDeliveryService(req, res));
routes.put('/admin/delivery-services/:code', (req, res) => controllers.deliveryServices.updateAdminDeliveryService(req, res));
routes.patch('/admin/delivery-services/:code/toggle', (req, res) => controllers.deliveryServices.toggleAdminDeliveryService(req, res));
routes.delete('/admin/delivery-services/:code', (req, res) => controllers.deliveryServices.deleteAdminDeliveryService(req, res));

// Operational Lookup Configuration
routes.get('/admin/operational-lookups/pickup-cancellation-reasons', (req, res) => controllers.operationalLookups.listAdminPickupCancellationReasons(req, res));
routes.post('/admin/operational-lookups/pickup-cancellation-reasons', requireTotp, (req, res) => controllers.operationalLookups.createAdminPickupCancellationReason(req, res));
routes.put('/admin/operational-lookups/pickup-cancellation-reasons/:code', requireTotp, (req, res) => controllers.operationalLookups.updateAdminPickupCancellationReason(req, res));
routes.delete('/admin/operational-lookups/pickup-cancellation-reasons/:code', requireTotp, (req, res) => controllers.operationalLookups.deactivateAdminPickupCancellationReason(req, res));
routes.get('/admin/operational-lookups/status-transition-policies', (req, res) => controllers.operationalLookups.listAdminStatusTransitionPolicies(req, res));
routes.post('/admin/operational-lookups/status-transition-policies', requireTotp, (req, res) => controllers.operationalLookups.createAdminStatusTransitionPolicy(req, res));
routes.put('/admin/operational-lookups/status-transition-policies/:id', requireTotp, (req, res) => controllers.operationalLookups.updateAdminStatusTransitionPolicy(req, res));
routes.delete('/admin/operational-lookups/status-transition-policies/:id', requireTotp, (req, res) => controllers.operationalLookups.deactivateAdminStatusTransitionPolicy(req, res));


// Orders Management
routes.get('/admin/orders', (req, res) => controllers.getAllOrders(req, res));
routes.get('/admin/orders/stats', (req, res) => controllers.getOrderStats(req, res));
routes.get('/admin/orders/:id', (req, res) => controllers.getOrderById(req, res));
routes.post('/admin/orders/:id/reassign', (req, res) => controllers.reassignOrder(req, res));
routes.post('/admin/orders/:id/flag', (req, res) => controllers.flagOrderIssue(req, res));
routes.post('/admin/orders', (req, res) => controllers.createOrder(req, res));
routes.get('/admin/orders/export', (req, res) => controllers.exportOrders(req, res));


// Couriers Management
routes.get('/admin/courier-applications/on-demand', (req, res) => controllers.getOnDemandCourierApplications(req, res));
routes.get('/admin/courier-applications/:channel', (req, res) => controllers.getCourierApplicationsByChannel(req, res));
routes.get('/admin/courier-registration-links', (req, res) => controllers.getCourierRegistrationLinks(req, res));
routes.post('/admin/courier-registration-links', (req, res) => controllers.createCourierRegistrationLink(req, res));
routes.get('/admin/couriers', (req, res) => controllers.getAllCouriers(req, res));
routes.get('/admin/couriers/face-verifications', (req, res) => controllers.getPendingFaceVerifications(req, res));
routes.post('/admin/couriers/face-verifications/:id/review', (req, res) => controllers.reviewFaceVerification(req, res));
routes.post('/admin/couriers/broadcast-onboarding', (req, res) => controllers.broadcastOnboardingInvite(req, res));
routes.get('/admin/couriers/stats', (req, res) => controllers.getCourierStats(req, res));
routes.get('/admin/couriers/:id', (req, res) => controllers.getCourierById(req, res));
routes.patch('/admin/couriers/:id/status', (req, res) => controllers.updateCourierStatus(req, res));
routes.patch('/admin/couriers/:id/service-capabilities', (req, res) => controllers.updateCourierServiceCapabilities(req, res));
routes.patch('/admin/couriers/:id/profile-photo', ...secureUploadSingle('photo', 'profileImage'), (req, res) => controllers.updateCourierProfilePhoto(req, res));
routes.get('/admin/couriers/:id/history', (req, res) => controllers.getCourierHistory(req, res));
routes.get('/admin/couriers/export', (req, res) => controllers.exportCouriers(req, res));


// Disputes Management
routes.get('/admin/disputes', (req, res) => controllers.getDisputes(req, res));
routes.get('/admin/disputes/stats', (req, res) => controllers.getDisputeStats(req, res));
routes.patch('/admin/disputes/:id/status', (req, res) => controllers.updateDisputeStatus(req, res));
routes.post('/admin/disputes/:id/assign', (req, res) => controllers.assignDispute(req, res));
routes.get('/admin/disputes/:id/chats', (req, res) => controllers.getDisputeChats(req, res));
routes.post('/admin/disputes/:id/chats', (req, res) => controllers.sendDisputeChat(req, res));
routes.post('/admin/disputes/:id/upload', ...secureUploadSingle('file', 'customerAttachment'), (req, res) => controllers.uploadDisputeFile(req, res));


// Finance Management
routes.get('/admin/finance/stats', (req, res) => controllers.getFinancialStats(req, res));
routes.get('/admin/finance/payout-accounts', (req, res) => controllers.getCourierPayoutAccounts(req, res));
routes.patch('/admin/finance/payout-accounts/:id', requireTotp, (req, res) => controllers.updateCourierPayoutAccountStatus(req, res));
routes.get('/admin/finance/payout-requests', (req, res) => controllers.getCourierPayoutRequests(req, res));
routes.get('/admin/finance/payout-review-queue', (req, res) => controllers.getCourierPayoutReviewQueue(req, res));
routes.get('/admin/finance/payout-requests/:id/detail', (req, res) => controllers.getCourierPayoutRequestDetail(req, res));
routes.post('/admin/finance/payout-requests/:id/review-action', requireTotp, (req, res) => controllers.reviewCourierPayoutRequestAction(req, res));
routes.patch('/admin/finance/payout-requests/:id', requireTotp, (req, res) => controllers.updateCourierPayoutRequestStatus(req, res));
routes.get('/admin/finance/payouts', (req, res) => controllers.getPayouts(req, res));
routes.get('/admin/finance/payouts/export', (req, res) => controllers.exportPayouts(req, res));
routes.get('/admin/finance/payout-risk-audit/export', (req, res) => controllers.exportCourierPayoutRiskAudit(req, res));
routes.get('/admin/finance/payout-ops-dashboard', (req, res) => controllers.getCourierPayoutOpsDashboard(req, res));
routes.post('/admin/finance/payouts/batch-release', (req, res) => controllers.batchReleasePayouts(req, res));
routes.post('/admin/finance/payouts/dispatch-approved', requireTotp, (req, res) => controllers.runCourierPayoutDispatcher(req, res));
routes.post('/admin/finance/payouts/reconcile', requireTotp, (req, res) => controllers.runCourierPayoutReconciliation(req, res));
routes.patch('/admin/finance/payouts/:id', (req, res) => controllers.updatePayoutStatus(req, res));
routes.post('/admin/finance/emergency-fund/top-up', (req, res) => controllers.topUpEmergencyFund(req, res));
routes.get('/admin/finance/masa-report/export', (req, res) => controllers.exportMasaReport(req, res));


// Customer Management
routes.get('/admin/customers/export', (req, res) => controllers.exportCustomers(req, res));
routes.get('/admin/customers', (req, res) => controllers.getCustomers(req, res));
routes.get('/admin/customers/stats', (req, res) => controllers.getCustomerStats(req, res));
routes.patch('/admin/customers/:id/status', (req, res) => controllers.updateCustomerStatus(req, res));
routes.post('/admin/customers/bulk-email', (req, res) => controllers.bulkEmailCustomers(req, res));


// Zone Management
routes.get('/admin/zones', (req, res) => controllers.getZones(req, res));
routes.get('/admin/zones/:id', (req, res) => controllers.getZoneById(req, res));
routes.post('/admin/zones', (req, res) => controllers.createZone(req, res));
routes.patch('/admin/zones/:id', (req, res) => controllers.updateZone(req, res));
routes.delete('/admin/zones/:id', (req, res) => controllers.deleteZone(req, res));

// Warehouse Operations
routes.get('/admin/warehouse/bags', (req, res) => controllers.getConsolidationBags(req, res));
routes.get('/admin/warehouse/bags/:bag_number', (req, res) => controllers.getConsolidationBagDetail(req, res));
routes.post('/admin/warehouse/bags', (req, res) => controllers.createConsolidationBag(req, res));
routes.post('/admin/warehouse/bags/open', (req, res) => controllers.openConsolidationBag(req, res));
routes.post('/admin/warehouse/scan', (req, res) => controllers.scanPackageInboundOutbound(req, res));
routes.post('/admin/warehouse/scan/auto-detect', (req, res) => controllers.autoDetectScanType(req, res));



// Notification Templates
routes.get('/admin/notifications/templates', (req, res) => controllers.getNotificationTemplates(req, res));
routes.get('/admin/notifications/templates/:id', (req, res) => controllers.getNotificationTemplateById(req, res));
routes.post('/admin/notifications/templates', requireTotp, (req, res) => controllers.createNotificationTemplate(req, res));
routes.put('/admin/notifications/templates/:id', requireTotp, (req, res) => controllers.updateNotificationTemplate(req, res));
routes.delete('/admin/notifications/templates/:id', requireTotp, (req, res) => controllers.deleteNotificationTemplate(req, res));


// Voucher Engine
routes.get('/admin/vouchers', (req, res) => controllers.getVouchers(req, res));
routes.get('/admin/vouchers/stats', (req, res) => controllers.getVoucherStats(req, res));
routes.get('/admin/vouchers/:id', (req, res) => controllers.getVoucherById(req, res));
routes.post('/admin/vouchers', (req, res) => controllers.createVoucher(req, res));
routes.patch('/admin/vouchers/:id', (req, res) => controllers.updateVoucher(req, res));
routes.delete('/admin/vouchers/:id', (req, res) => controllers.deleteVoucher(req, res));

// Promo Engine
routes.get('/admin/promos', requireRole(['super_admin', 'ops_admin', 'finance_admin']), (req, res) => controllers.listAdminPromoCampaigns(req, res));
routes.get('/admin/promos/margin-policies', requireRole(['super_admin', 'ops_admin', 'finance_admin']), (req, res) => controllers.getAdminPromoMarginPolicies(req, res));
routes.get('/admin/promos/:id', requireRole(['super_admin', 'ops_admin', 'finance_admin']), (req, res) => controllers.getAdminPromoCampaign(req, res));
routes.get('/admin/promos/:id/analytics', requireRole(['super_admin', 'ops_admin', 'finance_admin']), promoReadRateLimiter, (req, res) => controllers.getAdminPromoCampaignAnalytics(req, res));
routes.post('/admin/promos', requireRole(['super_admin', 'finance_admin']), requireTotp, promoMutationRateLimiter, (req, res) => controllers.createAdminPromoCampaign(req, res));
routes.patch('/admin/promos/:id', requireRole(['super_admin', 'finance_admin']), requireTotp, promoMutationRateLimiter, (req, res) => controllers.updateAdminPromoCampaign(req, res));
routes.post('/admin/promos/:id/simulate', requireRole(['super_admin', 'ops_admin', 'finance_admin']), promoReadRateLimiter, (req, res) => controllers.simulateAdminPromoCampaign(req, res));
routes.post('/admin/promos/:id/audience-preview', requireRole(['super_admin', 'ops_admin', 'finance_admin']), promoReadRateLimiter, (req, res) => controllers.previewAdminPromoNotificationAudience(req, res));
routes.post('/admin/promos/:id/submit', requireRole(['super_admin', 'finance_admin']), requireTotp, promoMutationRateLimiter, (req, res) => controllers.submitAdminPromoCampaign(req, res));
routes.post('/admin/promos/:id/submit-approval', requireRole(['super_admin', 'finance_admin']), requireTotp, promoMutationRateLimiter, (req, res) => controllers.submitAdminPromoCampaign(req, res));
routes.post('/admin/promos/:id/approve', requireRole(['super_admin']), requireTotp, promoMutationRateLimiter, (req, res) => controllers.approveAdminPromoCampaign(req, res));
routes.post('/admin/promos/:id/publish', requireRole(['super_admin', 'finance_admin']), requireTotp, promoMutationRateLimiter, (req, res) => controllers.publishAdminPromoCampaign(req, res));
routes.post('/admin/promos/:id/pause', requireRole(['super_admin', 'finance_admin', 'ops_admin']), requireTotp, promoMutationRateLimiter, (req, res) => controllers.pauseAdminPromoCampaign(req, res));
routes.post('/admin/promos/:id/notify', requireRole(['super_admin', 'finance_admin']), requireTotp, promoMutationRateLimiter, (req, res) => controllers.notifyAdminPromoCampaign(req, res));

// Pricing Configuration
routes.get('/admin/pricing', (req, res) => controllers.getPricingConfig(req, res));
routes.put('/admin/pricing', (req, res) => controllers.updatePricingConfig(req, res));

// SLA Configuration
routes.get('/admin/sla-configs', (req, res) => controllers.getSLAConfigs(req, res));
routes.patch('/admin/sla-configs', (req, res) => controllers.updateSLAConfig(req, res));

// Analytics
routes.get('/admin/analytics/kpis', (req, res) => controllers.getAnalyticsKPIs(req, res));
routes.get('/admin/analytics/sla', (req, res) => controllers.getAnalyticsSLA(req, res));
routes.get('/admin/analytics/surge', (req, res) => controllers.getAnalyticsSurge(req, res));
routes.get('/admin/analytics/scan-accuracy', (req, res) => controllers.getAnalyticsScanAccuracy(req, res));
routes.get('/admin/analytics/retention', (req, res) => controllers.getAnalyticsRetention(req, res));
routes.get('/admin/analytics/heat-data', (req, res) => controllers.getHeatData(req, res));
routes.get('/admin/analytics/unit-economics', (req, res) => controllers.getUnitEconomics(req, res));
routes.get('/admin/analytics/export', (req, res) => controllers.exportAnalytics(req, res));

// Scheduled Reports — dua path alias agar compatible dengan frontend Analytics.tsx
// Path /admin/analytics/reports dipakai Analytics.tsx
// Path /admin/reports/scheduled dipakai PricingConfig & internal
routes.get('/admin/analytics/reports', (req, res) => controllers.getScheduledReports(req, res));
routes.post('/admin/analytics/reports', (req, res) => controllers.createScheduledReport(req, res));
routes.patch('/admin/analytics/reports/:id', (req, res) => controllers.updateScheduledReport(req, res));
routes.delete('/admin/analytics/reports/:id', (req, res) => controllers.deleteScheduledReport(req, res));

// Alias path lama tetap aktif
routes.get('/admin/reports/scheduled', (req, res) => controllers.getScheduledReports(req, res));
routes.post('/admin/reports/scheduled', (req, res) => controllers.createScheduledReport(req, res));
routes.patch('/admin/reports/scheduled/:id', (req, res) => controllers.updateScheduledReport(req, res));
routes.delete('/admin/reports/scheduled/:id', (req, res) => controllers.deleteScheduledReport(req, res));

// Finance extras
routes.get('/admin/finance/summary', (req, res) => controllers.getFinancialSummary(req, res));
routes.get('/admin/finance/revenue-breakdown', (req, res) => controllers.getRevenueBreakdown(req, res));
routes.get('/admin/finance/cost-breakdown', (req, res) => controllers.getCostBreakdown(req, res));
routes.get('/admin/finance/emergency-fund', (req, res) => controllers.getEmergencyFund(req, res));

// Finance P0 extensions: Cash Position, P&L Report, Tax Dashboard
routes.get('/admin/finance/cash-position', (req, res) => controllers.getCashPosition(req, res));
routes.get('/admin/finance/pnl-report', (req, res) => controllers.getPnlReport(req, res));
routes.get('/admin/finance/tax-dashboard', (req, res) => controllers.getTaxDashboard(req, res));
routes.get('/admin/finance/pph-report', (req, res) => controllers.getPphReport(req, res));
routes.get('/admin/finance/tax-efaktur/export', (req, res) => controllers.exportTaxEfakturCSV(req, res));
routes.get('/admin/finance/tax-pph23/export', (req, res) => controllers.exportTaxPPh23CSV(req, res));
routes.get('/admin/finance/ledger', (req, res) => controllers.getLedgerReport(req, res));

