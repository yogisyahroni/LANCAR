import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

describe('courier support integration contract', () => {
  it('wires mobile context, structured safety reporting, and admin queue surfaces', () => {
    const courierRoutes = read('routes/courier.routes.ts');
    const adminRoutes = read('routes/admin.routes.ts');
    const controller = read('controllers/courier/courierSafety.controller.ts');

    expect(courierRoutes).toContain("get('/api/v1/courier/orders/:orderId/support'");
    expect(courierRoutes).toContain("post('/api/v1/courier/safety-events'");
    expect(courierRoutes).toContain("post('/api/v1/courier/safety-events/photo'");
    expect(adminRoutes).toContain("get('/admin/courier-support/queue'");
    expect(adminRoutes).toContain("patch('/admin/courier-safety-events/:id'");
    expect(controller).toContain('normalizeCourierSupportIssue');
    expect(controller).toContain('supportReferencesForRole');
    expect(controller).toContain('recordExactLocationAccess');
  });

  it('keeps support actions pointed at existing canonical domain APIs', () => {
    const policy = read('services/courierSupportPolicy.ts');
    const orderRoutes = read('routes/order.routes.ts');
    const adminOrderActions = read('controllers/adminOrderActions.controller.ts');

    expect(policy).toContain("domain_api: 'orders.reassign'");
    expect(policy).toContain("domain_api: 'orders.force_cancel'");
    expect(policy).toContain("domain_api: 'disputes.resolve_refund'");
    expect(orderRoutes).toContain("post('/admin/orders/:id/reassign'");
    expect(orderRoutes).toContain("post('/admin/orders/:id/force-cancel'");
    expect(adminOrderActions).toContain('export const resolveAdminDispute');
  });
});
