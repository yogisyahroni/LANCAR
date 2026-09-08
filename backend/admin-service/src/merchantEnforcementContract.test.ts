import fs from 'fs';
import path from 'path';

describe('MERCH-2026-008 merchant enforcement contract', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../../../database/migrations/20260908000018_merchant_enforcement_actions.sql'),
    'utf8',
  );
  const controller = fs.readFileSync(path.resolve(__dirname, 'controllers/merchantEnforcement.controller.ts'), 'utf8');
  const routes = fs.readFileSync(path.resolve(__dirname, 'routes/admin.routes.ts'), 'utf8');

  it('keeps scope, safe-order, audit, and appeal invariants in the database contract', () => {
    expect(migration).toContain("CHECK (scope IN ('merchant', 'branch', 'item', 'ads'))");
    expect(migration).toContain('evidence            JSONB NOT NULL');
    expect(migration).toContain("'pending_safe_completion'");
    expect(migration).toContain('merchant_enforcement_order_matches');
    expect(migration).toContain('refresh_merchant_enforcement_actions');
    expect(migration).toContain('uq_merchant_enforcement_appeals_open');
  });

  it('validates ownership and records actor/effective-period evidence through admin APIs', () => {
    expect(controller).toContain('branch bukan milik merchant ini');
    expect(controller).toContain('menu item bukan milik merchant ini');
    expect(controller).toContain('activeOrderCount');
    expect(controller).toContain('audit_logs');
    expect(controller).toContain('effective_from');
    expect(controller).toContain('effective_until');
    expect(controller).toContain('merchant_enforcement_action_events');
    expect(controller).toContain('status === \'approved\'');
  });

  it('protects admin mutations with role, TOTP, and idempotency middleware', () => {
    expect(routes).toContain("'/admin/merchants/:id/enforcement-actions'");
    expect(routes).toContain("'/admin/merchant-enforcement/appeals/:appealId'");
    expect(routes).toContain("requireIdempotencyKey('admin.merchant_enforcement.create')");
    expect(routes).toContain("requireIdempotencyKey('admin.merchant_enforcement.review')");
    expect(routes).toContain('requireRole([\'super_admin\', \'ops_admin\', \'ops_security\'])');
    expect(routes).toContain('requireTotp');
  });
});
