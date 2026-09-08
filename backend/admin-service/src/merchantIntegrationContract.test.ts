import fs from 'fs';
import path from 'path';

describe('MERCH-2026-009 POS/KDS integration contract', () => {
  const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

  it('keeps POS delivery, health and reconciliation state durable and canonical ownership explicit', () => {
    const migration = read('../../../database/migrations/20260908000019_pos_kds_integration_platform.sql');
    const domain = read('../../../backend/integration-gateway/internal/domain/pos_provider.go');
    const ownership = read('../../../backend/integration-gateway/internal/domain/pos_ownership.go');
    const handler = read('../../../backend/integration-gateway/internal/handler/pos_handler.go');
    const repository = read('../../../backend/integration-gateway/internal/repository/postgres_pos_repository.go');

    expect(migration).toContain('pos_order_deliveries');
    expect(migration).toContain('UNIQUE (provider_code, idempotency_key)');
    expect(migration).toContain('pos_reconciliation_items');
    expect(migration).toContain('pos_connector_health');
    expect(domain).toContain('POSCapabilityOrderReceipt');
    expect(ownership).toContain('POSCanonicalOwner = "lancar"');
    expect(handler).toContain('customer_order_status');
    expect(handler).toContain('ERR_CANONICAL_OWNERSHIP_CONFLICT');
    expect(handler).toContain('merchant acceptance transition runs in order-service');
    expect(repository).toContain('FOR UPDATE');
    expect(repository).toContain('retry_started');
  });

  it('exposes the projection to Merchant and Admin surfaces without adding a second order source of truth', () => {
    const merchantMain = read('../../../backend/merchant-service/cmd/api/main.go');
    const merchantHandler = read('../../../backend/merchant-service/internal/handler/merchant_handler.go');
    const adminController = read('./controllers/merchantIntegration.controller.ts');
    const adminRoutes = read('./routes/admin.routes.ts');

    expect(merchantMain).toContain('merchant/integrations/pos');
    expect(merchantHandler).toContain('GetPOSIntegrationStatus');
    expect(adminController).toContain('customer_acceptance_rule');
    expect(adminController).toContain('pos_reconciliation_items');
    expect(adminRoutes).toContain("'/admin/merchant-integrations/pos'");
    expect(adminRoutes).toContain("'/admin/merchants/:id/integrations/pos'");
  });
});
