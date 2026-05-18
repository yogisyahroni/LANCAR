import { Router } from 'express';
import * as controllers from './controllers/index';
import { requireAuth, requireRole, requireTotp, verifyWebSession, verifySession, requireMobileOrWebAuth } from './middlewares';
import { toggleRateLimiter } from './rateLimit';
import multer from 'multer';

// Multer setup for memory storage (max 10MB)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

export const routes = Router();


// Web Portal Auth Routes
routes.post('/auth/web/login', (req, res) => controllers.loginWeb(req, res));
routes.post('/auth/web/logout', (req, res) => controllers.logoutWeb(req, res));
routes.post('/auth/web/refresh-token', (req, res) => controllers.refreshToken(req, res));

// Courier Mobile Auth Routes
routes.post('/api/v1/auth/courier/login', (req, res) => controllers.loginCourier(req, res));
routes.post('/api/v1/auth/courier/documents/upload', upload.single('file'), (req, res) => controllers.uploadCourierOnDemandDocument(req, res));
routes.post('/api/v1/auth/courier/register', (req, res) => controllers.submitOnDemandCourierApplication(req, res));
routes.get('/api/v1/auth/courier/registration-links/:token', (req, res) => controllers.getPublicCourierRegistrationLink(req, res));
routes.post('/api/v1/auth/courier/register/:token', (req, res) => controllers.submitCourierApplicationByRegistrationLink(req, res));
routes.get('/api/v1/courier/profile', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierProfile(req, res));
routes.get('/api/v1/courier/on-demand/services', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierOnDemandServices(req, res));
routes.get('/api/v1/courier/on-demand/hotspots', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierHotspots(req, res));
routes.get('/api/v1/courier/performance', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPerformance(req, res));
routes.get('/api/v1/courier/earnings-ledger', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierEarningsLedger(req, res));
routes.get('/api/v1/courier/payout/summary', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPayoutSummary(req, res));
routes.get('/api/v1/courier/payout/requests', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPayoutRequests(req, res));
routes.post('/api/v1/courier/payout/requests', requireMobileOrWebAuth, (req, res) => controllers.createMobileCourierPayoutRequest(req, res));
routes.get('/api/v1/courier/capabilities', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierCapabilities(req, res));
routes.post('/api/v1/courier/training/complete', requireMobileOrWebAuth, (req, res) => controllers.completeMobileCourierTraining(req, res));
routes.get('/api/v1/courier/orders', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierOrders(req, res));
routes.get('/api/v1/courier/offers', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierOffers(req, res));
routes.post('/api/v1/courier/offers/:id/accept', requireMobileOrWebAuth, (req, res) => controllers.acceptMobileCourierOffer(req, res));
routes.post('/api/v1/courier/offers/:id/reject', requireMobileOrWebAuth, (req, res) => controllers.rejectMobileCourierOffer(req, res));
routes.patch('/api/v1/courier/duty', requireMobileOrWebAuth, (req, res) => controllers.updateMobileCourierDuty(req, res));
routes.post('/api/v1/courier/safety-events', requireMobileOrWebAuth, (req, res) => controllers.createMobileCourierSafetyEvent(req, res));
routes.post('/api/v1/courier/trip-share', requireMobileOrWebAuth, (req, res) => controllers.createMobileCourierTripShare(req, res));
routes.get('/api/v1/courier/orders/:orderId/route', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierRoutePreview(req, res));
routes.post('/api/v1/courier/orders/:orderId/cancel-pickup', requireMobileOrWebAuth, upload.single('photo'), (req, res) => controllers.cancelMobileCourierOnDemandPickup(req, res));
routes.post('/api/v1/tracking/sync', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.syncCourierTracking(req, res));
routes.get('/api/v1/tracking', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderTracking(req, res));
routes.post('/api/v1/orders/scan', requireMobileOrWebAuth, (req, res) => controllers.scanMobileCourierOrder(req, res));
routes.post('/api/v1/orders/pod/upload', requireMobileOrWebAuth, upload.single('photo'), (req, res) => controllers.uploadMobileCourierPod(req, res));

routes.get('/auth/web/me', verifySession, (req, res) => controllers.me(req, res));
routes.get('/auth/web/notifications', verifySession, (req, res) => controllers.getUserNotifications(req, res));
routes.patch('/auth/web/notifications/:id/read', verifyWebSession, (req, res) => controllers.markNotificationRead(req, res));
routes.delete('/auth/web/notifications', verifyWebSession, (req, res) => controllers.clearNotifications(req, res));
routes.post('/auth/web/notifications/subscribe', verifyWebSession, (req, res) => controllers.subscribePush(req, res));
routes.delete('/auth/web/notifications/subscribe', verifyWebSession, (req, res) => controllers.unsubscribePush(req, res));

// Mobile App Notification Routes
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

// Web Portal Order Routes
routes.post('/auth/web/orders/calculate', verifyWebSession, (req, res) => controllers.customerOrder.calculatePrice(req, res));
routes.post('/auth/web/orders', verifyWebSession, (req, res) => controllers.customerOrder.createCustomerOrder(req, res));
routes.get('/auth/web/orders', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerOrders(req, res));
routes.get('/auth/web/orders/:id/payment/status', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerOrderPaymentStatus(req, res));
routes.post('/auth/web/orders/:id/payment/check', verifyWebSession, (req, res) => controllers.customerOrder.confirmCustomerOrderPayment(req, res));
routes.get('/auth/web/orders/:id', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerOrderById(req, res));
routes.post('/auth/web/orders/:id/public-tracking-link', verifyWebSession, (req, res) => controllers.customerOrder.createCustomerPublicTrackingLink(req, res));
routes.get('/auth/web/orders/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderChats(req, res));
routes.post('/auth/web/orders/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.sendOrderChat(req, res));
routes.get('/api/v1/mobile/chats/orders/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderChats(req, res));
routes.post('/api/v1/mobile/chats/orders/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.sendOrderChat(req, res));
routes.post('/auth/web/orders/:id/upload', verifyWebSession, upload.single('file'), (req, res) => controllers.customerOrder.uploadOrderFile(req, res));
routes.get('/auth/web/disputes', verifyWebSession, (req, res) => controllers.getCustomerDisputes(req, res));
routes.post('/auth/web/disputes', verifyWebSession, (req, res) => controllers.createDispute(req, res));
routes.get('/auth/web/disputes/:id/chats', verifyWebSession, (req, res) => controllers.getDisputeChats(req, res));
routes.post('/auth/web/disputes/:id/chats', verifyWebSession, (req, res) => controllers.sendDisputeChat(req, res));
routes.post('/auth/web/disputes/:id/upload', verifyWebSession, upload.single('file'), (req, res) => controllers.uploadDisputeFile(req, res));

// Customer Mobile Portal Routes
routes.get('/api/v1/customer/dashboard/stats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getCustomerDashboardStats(req, res));
routes.get('/api/v1/customer/orders/:id/tracking-detail', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerOrderTrackingDetail(req, res));
routes.post('/api/v1/customer/notifications/register-token', requireMobileOrWebAuth, (req, res) => controllers.registerDeviceToken(req, res));

// Bulk Order Routes
routes.post('/auth/web/orders/bulk/upload', verifyWebSession, upload.single('file'), (req, res) => controllers.bulkOrder.uploadBulkExcel(req, res));
routes.get('/auth/web/orders/bulk/status/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.getBulkJobStatus(req, res));
routes.post('/auth/web/orders/bulk/validate/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.validateBulkRow(req, res));
routes.put('/auth/web/orders/bulk/row/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.validateBulkRow(req, res));
routes.delete('/auth/web/orders/bulk/rows/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.deleteBulkRows(req, res));
routes.post('/auth/web/orders/bulk/process', verifyWebSession, (req, res) => controllers.bulkOrder.processBulkPayment(req, res));
routes.post('/auth/web/orders/bulk/pay', verifyWebSession, (req, res) => controllers.bulkOrder.processBulkPayment(req, res));


// Public routes (no auth required)
routes.get('/health', (req, res) => controllers.getSystemHealth(req, res));
routes.get('/admin/health', (req, res) => controllers.getSystemHealth(req, res));
routes.get('/api/v1/system/latest-version', (req, res) => controllers.getLatestVersion(req, res));
routes.get('/api/v1/system/on-demand-readiness', (req, res) => controllers.getOnDemandReadiness(req, res));
routes.get('/track/:token', (req, res) => controllers.getPublicTripShare(req, res));
routes.post('/payments/midtrans/notification', (req, res) => controllers.customerOrder.handleMidtransNotification(req, res));
routes.post('/webhooks/courier-payout-provider', (req, res) => controllers.handleCourierPayoutProviderWebhook(req, res));

// Admin routes - Protected by Admin Auth and Role requirement
routes.use('/admin', requireAuth, requireRole(['admin', 'super_admin']));
routes.get('/admin/courier-safety-events', (req, res) => controllers.listAdminCourierSafetyEvents(req, res));
routes.get('/admin/courier-growth-configs', (req, res) => controllers.listAdminCourierGrowthConfigs(req, res));
routes.patch('/admin/courier-tier-configs/:id', (req, res) => controllers.updateAdminCourierTierConfig(req, res));
routes.patch('/admin/courier-incentive-campaigns/:id', (req, res) => controllers.updateAdminCourierIncentive(req, res));

// Admin Dashboard & Stats

routes.get('/admin/dashboard/stats', (req, res) => controllers.getDashboardStats(req, res));
routes.get('/admin/dashboard/events', (req, res) => controllers.getDashboardEvents(req, res));

routes.get('/admin/feature-flags', (req, res) => controllers.getAllFlags(req, res));
routes.post('/admin/feature-flags', (req, res) => controllers.createFlag(req, res));
routes.get('/admin/feature-flags/readiness/three-legs', (req, res) => controllers.getThreeLegsReadiness(req, res));
routes.get('/admin/readiness/three-legs', (req, res) => controllers.getThreeLegsReadiness(req, res));
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
routes.get('/admin/admins', (req, res) => controllers.getAllAdmins(req, res));
routes.post('/admin/admins', (req, res) => controllers.inviteAdmin(req, res));
routes.delete('/admin/admins/:id', (req, res) => controllers.deleteAdmin(req, res));

// Delivery Services Catalog
routes.get('/admin/delivery-services', (req, res) => controllers.deliveryServices.listAdminDeliveryServices(req, res));
routes.post('/admin/delivery-services', (req, res) => controllers.deliveryServices.createAdminDeliveryService(req, res));
routes.put('/admin/delivery-services/:code', (req, res) => controllers.deliveryServices.updateAdminDeliveryService(req, res));


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
routes.get('/admin/couriers/stats', (req, res) => controllers.getCourierStats(req, res));
routes.get('/admin/couriers/:id', (req, res) => controllers.getCourierById(req, res));
routes.patch('/admin/couriers/:id/status', (req, res) => controllers.updateCourierStatus(req, res));
routes.patch('/admin/couriers/:id/service-capabilities', (req, res) => controllers.updateCourierServiceCapabilities(req, res));
routes.get('/admin/couriers/:id/history', (req, res) => controllers.getCourierHistory(req, res));
routes.get('/admin/couriers/export', (req, res) => controllers.exportCouriers(req, res));


// Disputes Management
routes.get('/admin/disputes', (req, res) => controllers.getDisputes(req, res));
routes.get('/admin/disputes/stats', (req, res) => controllers.getDisputeStats(req, res));
routes.patch('/admin/disputes/:id/status', (req, res) => controllers.updateDisputeStatus(req, res));
routes.post('/admin/disputes/:id/assign', (req, res) => controllers.assignDispute(req, res));
routes.get('/admin/disputes/:id/chats', (req, res) => controllers.getDisputeChats(req, res));
routes.post('/admin/disputes/:id/chats', (req, res) => controllers.sendDisputeChat(req, res));
routes.post('/admin/disputes/:id/upload', upload.single('file'), (req, res) => controllers.uploadDisputeFile(req, res));


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
