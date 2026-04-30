import { Router } from 'express';
import { 
  getAllFlags, 
  getFlagByKey, 
  toggleFlag, 
  updateFlagConfig, 
  getFlagLogs, 
  getAllLogs,
  getThreeLegsReadiness,
  createFlag
} from './controllers';
import { requireAuth, requireRole, requireTotp } from './middlewares';
import { toggleRateLimiter } from './rateLimit';

export const routes = Router();

// Apply auth and role middleware to all admin routes
routes.use('/admin', requireAuth, requireRole(['super_admin']));

routes.get('/admin/feature-flags', getAllFlags);
routes.post('/admin/feature-flags', createFlag);
routes.get('/admin/feature-flags/readiness/three-legs', getThreeLegsReadiness);
routes.get('/admin/feature-flags/:key', getFlagByKey);
// Apply TOTP and Rate Limit for toggle
routes.patch('/admin/feature-flags/:key/toggle', requireTotp, toggleRateLimiter, toggleFlag);
// Apply TOTP for config updates
routes.patch('/admin/feature-flags/:key/config', requireTotp, updateFlagConfig);
routes.get('/admin/feature-flags/:key/logs', getFlagLogs);
routes.get('/admin/audit-logs', getAllLogs);
