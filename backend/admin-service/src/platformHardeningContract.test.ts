import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.resolve(ROOT, relativePath), 'utf8');

describe('PART W-X/AE-AF platform hardening contracts', () => {
  it('keeps payment chargeback/balance/reputation/CRM history append-only and versioned', () => {
    const migration = read('database/migrations/20260912000009_platform_hardening.sql');
    const reputationImmutabilityMigration = read('database/migrations/20260912000015_reputation_source_immutability.sql');
    const chargebackMigration = read('database/migrations/20260912000011_payment_chargeback_ledger.sql');
    const supportMigration = read('database/migrations/20260912000012_support_chargeback_links.sql');
    const safetySupportMigration = read('database/migrations/20260912000013_support_safety_links.sql');
    expect(migration).toContain('payment_chargeback_events');
    expect(chargebackMigration).toContain('payment_chargeback_ledger_entries');
    expect(chargebackMigration).toContain("entry_type IN ('LOSS','WIN')");
    expect(supportMigration).toContain("'chargeback'");
    expect(safetySupportMigration).toContain("'safety'");
    expect(migration).toContain('payment_balance_entries');
    expect(migration).toContain('reputation_signal_snapshots');
    expect(migration).toContain('crm_campaign_exposures');
    expect(migration).toContain('reject_platform_financial_history_update');
    expect(reputationImmutabilityMigration).toContain('raw reputation signal fields are immutable');
    expect(reputationImmutabilityMigration).toContain('trg_reputation_reviews_source_immutable');
  });

  it('keeps loyalty mutations on an internal authenticated, idempotent ledger boundary', () => {
    const controller = read('backend/admin-service/src/controllers/loyalty.controller.ts');
    const routes = read('backend/admin-service/src/routes.ts');
    expect(controller).toContain('timingSafeEqual');
    expect(controller).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
    expect(controller).toContain('loyalty_ledger_entries');
    expect(routes).toContain("/api/internal/loyalty/order-events");
  });

  it('keeps emergency contacts encrypted and user-scoped', () => {
    const controller = read('backend/admin-service/src/controllers/safety.controller.ts');
    const routes = read('backend/admin-service/src/routes/order.routes.ts');
    expect(controller).toContain('SAFETY_CONTACT_ENCRYPTION_KEY');
    expect(controller).toContain('aes-256-gcm');
    expect(controller).toContain('WHERE id = $1 AND user_id = $2');
    expect(routes).toContain('/api/v1/customer/safety/emergency-contacts');
  });

  it('keeps safety evidence private and auditable on download', () => {
    const controller = read('backend/admin-service/src/controllers/safety.controller.ts');
    const routes = read('backend/admin-service/src/routes/admin.routes.ts');
    expect(controller).toContain('resolvePrivateUploadPath');
    expect(controller).toContain("safety.evidence.downloaded");
    expect(controller).toContain('must fail closed');
    expect(routes).toContain('/admin/safety/incidents/:id/evidence/:evidenceId');
    expect(routes).toContain('/admin/safety/incidents/:id/reputation-signal');
    expect(routes).toContain("requireRole(['super_admin', 'ops_security'])");
    expect(routes).toContain('requireTotp, (req, res) => controllers.downloadAdminSafetyEvidence');
  });

  it('keeps the admin control plane on the correct host boundary', () => {
    const dashboard = read('admin-dashboard/src/pages/PlatformOperations.tsx');
    const compose = read('docker-compose.yml');
    expect(dashboard).toContain('/admin/payment/health');
    expect(compose).toContain('admin-dashboard');
  });

  it('wires reputation submission/reporting to completed-order and merchant ownership checks', () => {
    const controller = read('backend/admin-service/src/controllers/reputation.controller.ts');
    const routes = read('backend/admin-service/src/routes/public.routes.ts');
    expect(controller).toContain('ERR_REPUTATION_ORDER_NOT_ELIGIBLE');
    expect(controller).toContain('EXISTS (');
    expect(controller).toContain('reputation_review_responses');
    expect(controller).toContain("const nextState = review.state === 'HIDDEN' ? 'HIDDEN' : 'REPORTED'");
    expect(controller).toContain('REPUTATION_REPORT_CATEGORIES');
    expect(routes).toContain("post('/api/v1/reputation/reviews'");
    expect(routes).toContain("post('/api/v1/reputation/reviews/:id/report'");
    expect(routes).toContain("post('/api/v1/reputation/reviews/:id/appeals'");
    expect(routes).toContain("post('/api/v1/merchant/reputation/reviews/:id/response'");
    expect(controller).toContain('reputation_appeals');
    expect(controller).toContain('APPEAL_REVERSE');
    expect(read('backend/admin-service/src/services/supportCasePolicy.ts')).toContain("'safety'");
  });

  it('keeps referral and loyalty reads on canonical CRM tables', () => {
    const referral = read('backend/admin-service/src/controllers/referral.controller.ts');
    const loyalty = read('backend/admin-service/src/controllers/loyalty.controller.ts');
    const routes = read('backend/admin-service/src/routes/public.routes.ts');
    expect(referral).toContain('crm_referral_attributions');
    expect(referral).toContain('crm_referral_policies');
    expect(referral).not.toContain("reward_value)\n       VALUES");
    expect(loyalty).toContain('loyalty_ledger_entries');
    expect(loyalty).toContain('getMembershipEntitlements');
    expect(routes).toContain("get('/api/v1/customer/loyalty/ledger'");
    expect(routes).toContain("get('/api/v1/customer/memberships'");
  });

  it('routes high-impact payment config mutations through maker-checker approval', () => {
    const controller = read('backend/admin-service/src/controllers/paymentConfigApproval.controller.ts');
    const operations = read('backend/admin-service/src/controllers/platformOperations.controller.ts');
    const routes = read('backend/admin-service/src/routes/admin.routes.ts');
    const migration = read('database/migrations/20260912000010_payment_config_approvals.sql');
    expect(controller).toContain('MAKER_CHECKER_REQUIRED');
    expect(controller).toContain('payment_config_change_events');
    expect(controller).toContain("status = 'APPLIED'");
    expect(operations).toContain("requestPaymentConfigChange(req, res, 'METHOD_CATALOG')");
    expect(operations).toContain("requestPaymentConfigChange(req, res, 'PROVIDER_HEALTH')");
    expect(routes).toContain('/admin/payment/config-change-requests/:id/approve');
    expect(migration).toContain('payment_config_change_requests_distinct_approver_ck');
  });

  it('prevents direct CRM campaign publication without the approval state and role', () => {
    const source = read('backend/admin-service/src/controllers/platformOperations.controller.ts');
    expect(source).toContain('publicationAllowed');
    expect(source).toContain("currentState === 'PENDING_APPROVAL'");
    expect(source).toContain("actorRole !== 'super_admin'");
    expect(source).toContain('Campaign publication requires super_admin approval');
    expect(source).toContain("['PENDING_APPROVAL', 'SCHEDULED'].includes(currentState)");
  });

  it('guards public reputation aggregation against malformed legacy dimensions', () => {
    const source = read('backend/admin-service/src/controllers/reputation.controller.ts');
    expect(source).toContain("dimensions->>'service' ~ '^[1-5]$'");
    expect(source).toContain("dimensions->>'delivery' ~ '^[1-5]$'");
  });

  it('requires reviewed safety incidents before emitting one reputation signal', () => {
    const controller = read('backend/admin-service/src/controllers/safety.controller.ts');
    const migration = read('database/migrations/20260912000014_safety_reputation_signal_guard.sql');
    expect(controller).toContain("String(incident.state) !== 'RESOLVED'");
    expect(controller).toContain("safety.incident.resolved");
    expect(controller).toContain("automatic_enforcement: false");
    expect(controller).toContain("'QUALITY_RECALCULATE'");
    expect(controller).toContain('clients cannot choose a reputation target');
    expect(migration).toContain('uq_reputation_actions_safety_incident_signal');
  });

  it('keeps the public edge inventory explicit about host boundaries and recovery', () => {
    const inventory = read('docs/security/public-api-inventory.md');
    expect(inventory).toContain('https://admin.bawain.my.id');
    expect(inventory).toContain('https://api.bawain.my.id');
    expect(inventory).toContain('X-Idempotency-Key');
    expect(inventory).toContain('provider signature verification');
    expect(inventory).toContain('must not remove access to an active-order safety/support surface');
  });
});
