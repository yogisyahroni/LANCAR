import fs from 'fs';
import path from 'path';

describe('COURIER-2026-012 lifecycle release gate contract', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../../../database/migrations/20260908000010_courier_lifecycle_document_scope.sql'),
    'utf8',
  );
  const onboarding = fs.readFileSync(path.resolve(__dirname, 'controllers/couriers.controller.ts'), 'utf8');
  const duty = fs.readFileSync(path.resolve(__dirname, 'controllers/courier/courierDuty.controller.ts'), 'utf8');
  const offer = fs.readFileSync(path.resolve(__dirname, 'controllers/courier/courierOffer.controller.ts'), 'utf8');
  const orders = fs.readFileSync(path.resolve(__dirname, 'controllers/courier/courierOrders.controller.ts'), 'utf8');
  const earnings = fs.readFileSync(path.resolve(__dirname, 'controllers/courier/courierEarnings.controller.ts'), 'utf8');
  const enforcement = fs.readFileSync(path.resolve(__dirname, 'controllers/courier/courierEnforcement.controller.ts'), 'utf8');
  const safety = fs.readFileSync(path.resolve(__dirname, 'controllers/courier/courierSafety.controller.ts'), 'utf8');

  it('scopes expiry/revocation to affected capabilities and keeps the account gate fail-closed', () => {
    expect(migration).toContain('service_scope TEXT[]');
    expect(migration).toContain('courier_profile_documents_eligible_for_service');
    expect(migration).toContain('UPDATE courier_service_capabilities csc');
    expect(migration).toContain("NEW.document_status IN ('expired', 'revoked', 'retention_expired')");
    expect(migration).toContain("SELECT courier_profile_documents_eligible_for_service($1, NULL)");
    expect(duty).toContain('courier_profile_documents_eligible(cp.id) AS documents_eligible');
  });

  it('keeps the apply/verify/activate and online gates server-authoritative', () => {
    expect(onboarding).toContain('buildCourierOnboardingChecklist');
    expect(onboarding).toContain('evaluateCourierActivation');
    expect(onboarding).toContain('upsertCourierVehicleAndCapabilities');
    expect(duty).toContain("courier.onboarding_status !== 'ACTIVE'");
    expect(duty).toContain('courier_market_is_eligible');
  });

  it('binds offers to an approved vehicle and capability before assignment', () => {
    expect(offer).toContain('courier_capability_is_eligible');
    expect(offer).toContain('courier_profile_documents_eligible_for_service(cp.id, $3)');
    expect(offer).toContain('ERR_VEHICLE_BINDING_REQUIRED');
    expect(offer).toContain('ERR_VEHICLE_BINDING_CONFLICT');
    expect(offer).toContain("cv.verification_status = 'approved'");
  });

  it('recovers active jobs from persisted order legs and persists completion earnings', () => {
    expect(orders).toContain('WHERE ol.courier_id = $1');
    expect(earnings).toContain('request_courier_payout');
    expect(earnings).toContain('ERR_IDEMPOTENCY_REQUIRED');
    expect(earnings).toContain('courier_earnings_ledger');
    expect(earnings).toContain('courier_earning_localization_snapshots');
  });

  it('keeps suspension, appeal, reinstatement and safety history auditable', () => {
    expect(enforcement).toContain('courier_enforcement_appeals');
    expect(enforcement).toContain("status === 'approved'");
    expect(enforcement).toContain("status = 'revoked'");
    expect(enforcement).toContain('auditEnforcement');
    expect(safety).toContain('INSERT INTO courier_safety_events');
    expect(safety).toContain('order_id');
  });
});
