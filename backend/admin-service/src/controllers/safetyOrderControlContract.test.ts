import fs from 'fs';
import path from 'path';

describe('SAFE-2026-003 safety order control contract', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, 'safety.controller.ts'), 'utf8');
  const routes = fs.readFileSync(path.resolve(__dirname, '../routes/admin.routes.ts'), 'utf8');
  const courierStatus = fs.readFileSync(path.resolve(__dirname, 'courier/courierAccount.controller.ts'), 'utf8');
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../../../../database/migrations/20260912000016_safety_order_controls.sql'),
    'utf8',
  );

  it('exposes an elevated, idempotent and TOTP-protected order action endpoint', () => {
    expect(routes).toContain("post('/admin/safety/incidents/:id/order-action'");
    expect(routes).toContain("requireTotp, requireIdempotencyKey('admin.safety.order_action')");
    expect(controller).toContain("const SAFETY_ORDER_ACTIONS = ['PAUSE', 'HOLD', 'REASSIGN', 'RELEASE']");
    expect(controller).toContain("ERR_REASSIGN_REQUIRES_SAFE_TRANSFER");
  });

  it('keeps delivery status authoritative and blocks courier progress while controlled', () => {
    expect(migration).toContain('safety_control_state');
    expect(migration).toContain("'REASSIGN_REQUESTED'");
    expect(courierStatus).toContain('ERR_SAFETY_ORDER_CONTROL_ACTIVE');
    expect(courierStatus).toContain('safety_control_state');
  });
});
