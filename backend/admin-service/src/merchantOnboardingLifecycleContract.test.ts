import fs from 'fs';
import path from 'path';

describe('MERCH-2026-001 onboarding lifecycle contract', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../../../database/migrations/20260908000011_merchant_onboarding_lifecycle.sql'),
    'utf8',
  );
  const controller = fs.readFileSync(path.resolve(__dirname, 'controllers/merchants.controller.ts'), 'utf8');
  const routes = fs.readFileSync(path.resolve(__dirname, 'routes/admin.routes.ts'), 'utf8');
  const merchantService = fs.readFileSync(
    path.resolve(__dirname, '../../merchant-service/internal/service/merchant_service.go'),
    'utf8',
  );
  const repository = fs.readFileSync(
    path.resolve(__dirname, '../../merchant-service/internal/repository/postgres_merchant_repository.go'),
    'utf8',
  );

  it('stores legal ownership, market requirements and commercial/bank references as structured data', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS merchant_legal_profiles');
    expect(migration).toContain('owner_user_id UUID NOT NULL REFERENCES users(id)');
    expect(migration).toContain('operator_user_id UUID NOT NULL REFERENCES users(id)');
    expect(migration).toContain('payout_account_reference VARCHAR(120) NOT NULL');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS merchant_market_verification_requirements');
    expect(migration).toContain('merchant_commission_contracts');
  });

  it('enforces the canonical lifecycle and market requirement gate in PostgreSQL', () => {
    expect(migration).toContain("'DRAFT', 'SUBMITTED', 'VERIFYING', 'ACTIVE', 'REJECTED', 'SUSPENDED'");
    expect(migration).toContain('transition_merchant_onboarding');
    expect(migration).toContain('merchant_onboarding_requirements_met');
    expect(migration).toContain('merchant onboarding_status must transition via transition_merchant_onboarding');
    expect(migration).toContain('merchant onboarding application must start in DRAFT or SUBMITTED');
    expect(migration).toContain("IF next_status = 'ACTIVE' AND NOT met THEN");
    expect(migration).toContain('merchant_onboarding_reviews');
  });

  it('keeps activation in the privileged admin flow and protects each mutation', () => {
    expect(controller).toContain("transitionAdminMerchant(req, res, 'VERIFYING'");
    expect(controller).toContain("transitionAdminMerchant(req, res, 'ACTIVE'");
    expect(controller).toContain("transitionAdminMerchant(req, res, 'SUSPENDED'");
    expect(controller).toContain('auditMerchantLifecycle');
    expect(routes).toContain("requireIdempotencyKey('admin.merchant_onboarding.start_verification')");
    expect(routes).toContain("requireIdempotencyKey('admin.merchant_onboarding.activate')");
    expect(routes).toContain("requireTotp, requireIdempotencyKey('admin.merchant_onboarding.suspend')");
  });

  it('allows a rejected application to resubmit but never self-activates merchant operations', () => {
    expect(merchantService).toContain('currentStatus != "DRAFT" && currentStatus != "REJECTED"');
    expect(merchantService).toContain('merchantOnboardingActive');
    expect(repository).toContain('func (r *postgresMerchantRepository) Resubmit');
    expect(repository).toContain("transition_merchant_onboarding($1::uuid, 'SUBMITTED'");
  });
});
