import fs from 'fs';
import path from 'path';

describe('COURIER-2026-009 enforcement contract', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../../../database/migrations/20260908000008_courier_enforcement_actions.sql'),
    'utf8',
  );
  const controller = fs.readFileSync(path.resolve(__dirname, 'controllers/courier/courierEnforcement.controller.ts'), 'utf8');
  const profileController = fs.readFileSync(path.resolve(__dirname, 'controllers/courier/courierProfile.controller.ts'), 'utf8');
  const courierRoutes = fs.readFileSync(path.resolve(__dirname, 'routes/courier.routes.ts'), 'utf8');
  const adminRoutes = fs.readFileSync(path.resolve(__dirname, 'routes/admin.routes.ts'), 'utf8');
  const profileModel = fs.readFileSync(
    path.resolve(__dirname, '../../../android-app/app/src/main/java/com/tembus/courier/data/model/AuthModels.kt'),
    'utf8',
  );

  it('models scoped actions, effective windows, safe-job policy and immutable appeal timeline', () => {
    expect(migration).toContain('scope VARCHAR(20) NOT NULL');
    expect(migration).toContain("scope IN ('account', 'market', 'capability')");
    expect(migration).toContain('effective_from TIMESTAMPTZ');
    expect(migration).toContain('safe_job_policy VARCHAR(40)');
    expect(migration).toContain('courier_enforcement_action_events');
    expect(migration).toContain('courier_enforcement_appeals');
    expect(migration).toContain('uq_courier_enforcement_appeals_open');
    expect(migration).toContain('courier_enforcement_is_active');
  });

  it('protects matching and exposes courier-visible reasons/reinstatement policy', () => {
    expect(migration).toContain('NOT courier_enforcement_is_active(profile_id, resolved_market, service_code_value)');
    expect(migration).toContain('NOT courier_enforcement_is_active(profile_id, NULL, NULL)');
    expect(controller).toContain('reassign_unpicked_jobs');
    expect(controller).toContain('safe_completion_pending');
    expect(controller).toContain('restoration_snapshot');
    expect(controller).toContain("appeal.${status}");
    expect(controller).toContain("status = 'enabled'");
    expect(profileController).toContain('enforcement_actions');
    expect(profileModel).toContain('data class CourierEnforcementAction');
  });

  it('wires authenticated courier appeal and TOTP-protected admin review routes', () => {
    expect(courierRoutes).toContain("get('/api/v1/courier/enforcement'");
    expect(courierRoutes).toContain("post('/api/v1/courier/enforcement/appeals'");
    expect(courierRoutes).toContain("requireIdempotencyKey('courier.enforcement.appeal')");
    expect(adminRoutes).toContain("post('/admin/couriers/:id/enforcement-actions'");
    expect(adminRoutes).toContain("requireTotp");
    expect(adminRoutes).toContain("get('/admin/courier-enforcement/appeals'");
    expect(adminRoutes).toContain("patch('/admin/courier-enforcement/appeals/:appealId'");
    expect(adminRoutes).toContain("requireIdempotencyKey('admin.courier_enforcement.review')");
  });
});
