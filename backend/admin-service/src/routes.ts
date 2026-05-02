import { Router } from 'express';
import * as controllers from './controllers';
import { requireAuth, requireRole, requireTotp } from './middlewares';
import { toggleRateLimiter } from './rateLimit';

export const routes = Router();

// Apply auth and role middleware to all admin routes
routes.use('/admin', requireAuth, requireRole(['super_admin']));

// Dashboard
routes.get('/admin/dashboard/stats', controllers.getDashboardStats);
routes.get('/admin/dashboard/events', controllers.getDashboardEvents);

routes.get('/admin/feature-flags', controllers.getAllFlags);
routes.post('/admin/feature-flags', controllers.createFlag);
routes.get('/admin/feature-flags/readiness/three-legs', controllers.getThreeLegsReadiness);
routes.get('/admin/readiness/three-legs', controllers.getThreeLegsReadiness);
routes.get('/admin/feature-flags/:key', controllers.getFlagByKey);
// Apply TOTP and Rate Limit for toggle
routes.patch('/admin/feature-flags/:key/toggle', requireTotp, toggleRateLimiter, controllers.toggleFlag);
// Apply TOTP for config updates
routes.patch('/admin/feature-flags/:key/config', requireTotp, controllers.updateFlagConfig);
routes.get('/admin/feature-flags/:key/logs', controllers.getFlagLogs);
routes.get('/admin/audit-logs', controllers.getAllLogs);
routes.get('/admin/audit-logs/export', controllers.exportAuditLogs);
routes.get('/admin/settings', controllers.getSystemConfigs);
routes.patch('/admin/settings/:key', requireTotp, controllers.updateSystemConfig);
routes.get('/admin/admins', controllers.getAllAdmins);
routes.post('/admin/admins', controllers.inviteAdmin);
routes.delete('/admin/admins/:id', controllers.deleteAdmin);
routes.get('/admin/health', controllers.getSystemHealth);

// Orders Management
routes.get('/admin/orders', controllers.getAllOrders);
routes.get('/admin/orders/stats', controllers.getOrderStats);
routes.get('/admin/orders/:id', controllers.getOrderById);
routes.post('/admin/orders/:id/reassign', controllers.reassignOrder);
routes.post('/admin/orders/:id/flag', controllers.flagOrderIssue);
routes.post('/admin/orders', controllers.createOrder);
routes.get('/admin/orders/export', controllers.exportOrders);

// Couriers Management
routes.get('/admin/couriers', controllers.getAllCouriers);
routes.get('/admin/couriers/stats', controllers.getCourierStats);
routes.get('/admin/couriers/:id', controllers.getCourierById);
routes.patch('/admin/couriers/:id/status', controllers.updateCourierStatus);
routes.get('/admin/couriers/:id/history', controllers.getCourierHistory);
routes.get('/admin/couriers/export', controllers.exportCouriers);


// Disputes Management
routes.get('/admin/disputes', controllers.getDisputes);
routes.get('/admin/disputes/stats', controllers.getDisputeStats);
routes.patch('/admin/disputes/:id/status', controllers.updateDisputeStatus);
routes.post('/admin/disputes/:id/assign', controllers.assignDispute);

// Finance Management
// NOTE: The 4 routes below are superseded by /finance/stats which returns all data in one response.
// Kept as dead code for reference. Frontend uses /finance/stats exclusively.
// routes.get('/admin/finance/summary', controllers.getFinancialSummary);
// routes.get('/admin/finance/revenue-breakdown', controllers.getRevenueBreakdown);
// routes.get('/admin/finance/cost-breakdown', controllers.getCostBreakdown);
// routes.get('/admin/finance/emergency-fund', controllers.getEmergencyFund);
routes.get('/admin/finance/stats', controllers.getFinancialStats);
routes.get('/admin/finance/payouts', controllers.getPayouts);
routes.get('/admin/finance/payouts/export', controllers.exportPayouts);
routes.post('/admin/finance/payouts/batch-release', controllers.batchReleasePayouts);
routes.patch('/admin/finance/payouts/:id', controllers.updatePayoutStatus);
routes.post('/admin/finance/emergency-fund/top-up', controllers.topUpEmergencyFund);
routes.get('/admin/finance/masa-report/export', controllers.exportMasaReport);

// Customer Management
routes.get('/admin/customers/export', controllers.exportCustomers);
routes.get('/admin/customers', controllers.getCustomers);
routes.get('/admin/customers/stats', controllers.getCustomerStats);
routes.patch('/admin/customers/:id/status', controllers.updateCustomerStatus);
routes.post('/admin/customers/bulk-email', controllers.bulkEmailCustomers);

// Notification Templates
routes.get('/admin/notifications/templates', controllers.getNotificationTemplates);
routes.get('/admin/notifications/templates/:id', controllers.getNotificationTemplateById);
routes.post('/admin/notifications/templates', requireTotp, controllers.createNotificationTemplate);
routes.put('/admin/notifications/templates/:id', requireTotp, controllers.updateNotificationTemplate);
routes.delete('/admin/notifications/templates/:id', requireTotp, controllers.deleteNotificationTemplate);

// Voucher Engine
routes.get('/admin/vouchers', controllers.getVouchers);
routes.post('/admin/vouchers', controllers.createVoucher);
routes.patch('/admin/vouchers/:id', controllers.updateVoucher);
routes.delete('/admin/vouchers/:id', controllers.deleteVoucher);
routes.get('/admin/vouchers/stats', controllers.getVoucherStats);

// Zone Management
routes.get('/admin/zones', controllers.getZones);
routes.post('/admin/zones', controllers.createZone);
routes.patch('/admin/zones/:id', controllers.updateZone);
routes.delete('/admin/zones/:id', controllers.deleteZone);

// Analytics
routes.get('/admin/analytics/kpis', controllers.getAnalyticsKPIs);
routes.get('/admin/analytics/sla', controllers.getAnalyticsSLA);
routes.get('/admin/analytics/surge', controllers.getAnalyticsSurge);
routes.get('/admin/analytics/scan-accuracy', controllers.getAnalyticsScanAccuracy);
routes.get('/admin/analytics/retention', controllers.getAnalyticsRetention);
routes.get('/admin/analytics/heat-data', controllers.getHeatData);
routes.get('/admin/analytics/export', controllers.exportAnalytics);
routes.get('/admin/analytics/reports', controllers.getScheduledReports);
routes.post('/admin/analytics/reports', controllers.createScheduledReport);
routes.patch('/admin/analytics/reports/:id', controllers.updateScheduledReport);
routes.delete('/admin/analytics/reports/:id', controllers.deleteScheduledReport);

// Pricing Configuration
routes.get('/admin/pricing', controllers.getPricingConfig);
routes.put('/admin/pricing', controllers.updatePricingConfig);

// SLA Thresholds
routes.get('/admin/sla', controllers.getSLAConfigs);
routes.put('/admin/sla', controllers.updateSLAConfig);

