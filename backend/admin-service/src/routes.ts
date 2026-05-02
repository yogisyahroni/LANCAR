import { Router } from 'express';
import * as controllers from './controllers';
import { requireAuth, requireRole, requireTotp } from './middlewares';
import { toggleRateLimiter } from './rateLimit';


export const routes = Router();


// Apply auth and role middleware to all admin routes
routes.use('/admin', requireAuth, requireRole(['super_admin']));


// Dashboard
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
routes.get('/admin/health', (req, res) => controllers.getSystemHealth(req, res));


// Orders Management
routes.get('/admin/orders', (req, res) => controllers.getAllOrders(req, res));
routes.get('/admin/orders/stats', (req, res) => controllers.getOrderStats(req, res));
routes.get('/admin/orders/:id', (req, res) => controllers.getOrderById(req, res));
routes.post('/admin/orders/:id/reassign', (req, res) => controllers.reassignOrder(req, res));
routes.post('/admin/orders/:id/flag', (req, res) => controllers.flagOrderIssue(req, res));
routes.post('/admin/orders', (req, res) => controllers.createOrder(req, res));
routes.get('/admin/orders/export', (req, res) => controllers.exportOrders(req, res));


// Couriers Management
routes.get('/admin/couriers', (req, res) => controllers.getAllCouriers(req, res));
routes.get('/admin/couriers/stats', (req, res) => controllers.getCourierStats(req, res));
routes.get('/admin/couriers/:id', (req, res) => controllers.getCourierById(req, res));
routes.patch('/admin/couriers/:id/status', (req, res) => controllers.updateCourierStatus(req, res));
routes.get('/admin/couriers/:id/history', (req, res) => controllers.getCourierHistory(req, res));
routes.get('/admin/couriers/export', (req, res) => controllers.exportCouriers(req, res));


// Disputes Management
routes.get('/admin/disputes', (req, res) => controllers.getDisputes(req, res));
routes.get('/admin/disputes/stats', (req, res) => controllers.getDisputeStats(req, res));
routes.patch('/admin/disputes/:id/status', (req, res) => controllers.updateDisputeStatus(req, res));
routes.post('/admin/disputes/:id/assign', (req, res) => controllers.assignDispute(req, res));
