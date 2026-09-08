import fs from 'fs';
import path from 'path';

describe('GLOB-2026-010 support cases contract', () => {
  const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

  it('keeps references, append-only timeline and idempotent actions durable', () => {
    const migration = read('../../../database/migrations/20260909000004_support_cases.sql');
    const controller = read('./controllers/supportCases.controller.ts');
    const policy = read('./services/supportCasePolicy.ts');

    expect(migration).toContain('support_case_links');
    expect(migration).toContain('support_case_events');
    expect(migration).toContain('support_case_actions');
    expect(migration).toContain('UNIQUE (case_id, idempotency_key)');
    expect(migration).toContain("reference_type IN ('order', 'payment', 'refund', 'courier', 'merchant', 'carrier', 'proof', 'claim', 'reconciliation')");
    expect(controller).toContain('event_outbox');
    expect(controller).toContain('X-Internal-Api-Key');
    expect(controller).toContain('X-Idempotency-Key');
    expect(controller).toContain('support.case.financial_action');
    expect(policy).toContain('serviceCode');
    expect(policy).toContain('marketCode');
    expect(policy).toContain('paymentStatus');
  });

  it('exposes customer and admin routes without a second support service', () => {
    const routes = read('./routes/support.routes.ts');
    const gateway = read('../../../backend/api-gateway/src/index.ts');
    const matrix = read('../../../backend/api-gateway/src/routeAuthMatrix.ts');

    expect(routes).toContain("'/api/v1/support/cases'");
    expect(routes).toContain("'/admin/support/cases'");
    expect(gateway).toContain("pathFilter: '/api/v1/support'");
    expect(matrix).toContain("id: 'support-case-api'");
    expect(matrix).toContain("requirement: 'web-session-or-jwt'");
  });
});
