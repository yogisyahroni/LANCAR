import { Router } from 'express';
import { 
  getAllFlags, 
  getFlagByKey, 
  toggleFlag, 
  updateFlagConfig, 
  getFlagLogs, 
  getThreeLegsReadiness 
} from './controllers';

export const routes = Router();

routes.get('/admin/feature-flags', getAllFlags);
routes.get('/admin/feature-flags/readiness/three-legs', getThreeLegsReadiness);
routes.get('/admin/feature-flags/:key', getFlagByKey);
routes.patch('/admin/feature-flags/:key/toggle', toggleFlag);
routes.patch('/admin/feature-flags/:key/config', updateFlagConfig);
routes.get('/admin/feature-flags/:key/logs', getFlagLogs);
