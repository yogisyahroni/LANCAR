import { Router } from 'express';
import * as controllers from './controllers';
import { requireAuth, requireRole, requireTotp } from './middlewares';
import { toggleRateLimiter } from './rateLimit';

export const routes = Router();

// Apply auth and role middleware to all admin routes
routes.use('/admin', requireAuth, requireRole(['super_admin']));

routes.get('/admin/feature-flags', controllers.getAllFlags);
routes.post('/admin/feature-flags', controllers.createFlag);
routes.get('/admin/feature-flags/readiness/three-legs', controllers.getThreeLegsReadiness);
routes.get('/admin/feature-flags/:key', controllers.getFlagByKey);
// Apply TOTP and Rate Limit for toggle
routes.patch('/admin/feature-flags/:key/toggle', requireTotp, toggleRateLimiter, controllers.toggleFlag);
// Apply TOTP for config updates
routes.patch('/admin/feature-flags/:key/config', requireTotp, controllers.updateFlagConfig);
routes.get('/admin/feature-flags/:key/logs', controllers.getFlagLogs);
routes.get('/admin/audit-logs', controllers.getAllLogs);
