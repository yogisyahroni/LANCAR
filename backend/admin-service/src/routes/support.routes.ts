import { Router } from 'express';
import * as controllers from '../controllers';
import { requireIdempotencyKey } from '../middleware/idempotencyRequirement';
import { requireAuth, requireMobileOrWebAuth, requireRole } from '../middlewares';

export const supportRoutes = Router();

// Shared customer / merchant / courier case intake. The authenticated actor is
// taken from the session or gateway identity; requester_id is never client-set.
supportRoutes.post(
  '/api/v1/support/cases',
  requireMobileOrWebAuth,
  requireIdempotencyKey('support.case.create'),
  (req, res) => controllers.createSupportCase(req, res),
);
supportRoutes.get('/api/v1/support/cases', requireMobileOrWebAuth, (req, res) => controllers.listSupportCases(req, res));
supportRoutes.get('/api/v1/support/cases/:id', requireMobileOrWebAuth, (req, res) => controllers.getSupportCase(req, res));

// Admin console workflow. Financial actions perform their own finance-role +
// TOTP gate in the controller before calling the audited order-service API.
const SUPPORT_ADMIN_ROLES = ['super_admin', 'ops_security', 'ops_admin', 'finance_admin', 'finance', 'cs_agent', 'zone_manager'];
supportRoutes.use('/admin/support', requireAuth, requireRole(SUPPORT_ADMIN_ROLES));
supportRoutes.get(
  '/admin/support/cases',
  (req, res) => controllers.listSupportCases(req, res),
);
supportRoutes.get(
  '/admin/support/cases/:id',
  (req, res) => controllers.getSupportCase(req, res),
);
supportRoutes.patch(
  '/admin/support/cases/:id',
  requireIdempotencyKey('admin.support.case.update'),
  (req, res) => controllers.updateSupportCase(req, res),
);
supportRoutes.post(
  '/admin/support/cases/:id/actions',
  requireIdempotencyKey('admin.support.case.action'),
  (req, res) => controllers.executeSupportCaseAction(req, res),
);
