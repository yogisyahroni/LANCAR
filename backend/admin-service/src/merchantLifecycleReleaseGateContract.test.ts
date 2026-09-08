import fs from 'fs';
import path from 'path';

describe('MERCH-2026-010 merchant lifecycle release gate contract', () => {
  const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

  const onboardingMigration = read('../../../database/migrations/20260908000011_merchant_onboarding_lifecycle.sql');
  const branchMigration = read('../../../database/migrations/20260908000012_merchant_branch_staff_rbac.sql');
  const catalogMigration = read('../../../database/migrations/20260908000013_merchant_catalog_governance.sql');
  const operatingMigration = read('../../../database/migrations/20260908000014_merchant_operating_state.sql');
  const financeMigration = read('../../../database/migrations/20260908000015_merchant_finance_statement.sql');
  const qualityMigration = read('../../../database/migrations/20260908000016_merchant_quality_scorecard.sql');
  const adsMigration = read('../../../database/migrations/20260908000017_merchant_promo_ads_boundary.sql');
  const enforcementMigration = read('../../../database/migrations/20260908000018_merchant_enforcement_actions.sql');

  const merchantService = read('../../merchant-service/internal/service/merchant_service.go');
  const merchantHandler = read('../../merchant-service/internal/handler/merchant_handler.go');
  const reportService = read('../../merchant-service/internal/service/report_service.go');
  const merchantOrders = read('../../merchant-service/internal/repository/postgres_merchant_order_repository.go');
  const menuRepository = read('../../merchant-service/internal/repository/postgres_menu_item_repository.go');
  const foodRepository = read('../../order-service/internal/repository/food_repository.go');
  const merchantEnforcementController = read('./controllers/merchantEnforcement.controller.ts');
  const routes = read('./routes/admin.routes.ts');

  it('keeps onboarding, branch access and catalog ownership in durable server-side boundaries', () => {
    expect(onboardingMigration).toContain('transition_merchant_onboarding');
    expect(branchMigration).toContain('merchant_staff_branch_access');
    expect(branchMigration).toContain('merchant_device_sessions');
    expect(catalogMigration).toContain('merchant_catalog_events');
    expect(catalogMigration).toContain("'merchant.catalog.changed'");
    expect(catalogMigration).toContain("'source_of_truth', 'merchant-service'");
    expect(branchMigration).toContain('branch_id');
    expect(menuRepository).toContain('merchant_menu_items');
  });

  it('makes Busy/Pause/Search/Ads eligibility consume the canonical operating and policy gates', () => {
    expect(operatingMigration).toContain('merchant.operating_state.changed');
    expect(operatingMigration).toContain("'search-index', 'ads-eligibility'");
    expect(foodRepository).toContain("operating_state IN ('open', 'busy')");
    expect(foodRepository).toContain('paused_until');
    expect(foodRepository).toContain("merchant_quality_is_eligible(m.id, 'search')");
    expect(foodRepository).toContain("merchant_quality_is_eligible(m.id, 'ads')");
    expect(foodRepository).toContain('merchant_enforcement_is_active');
    expect(qualityMigration).toContain('merchant_quality_is_eligible');
  });

  it('keeps the merchant order lifecycle and checkout catalog server-authoritative', () => {
    expect(merchantService).toContain('func (s *merchantServiceImpl) AcceptOrder');
    expect(merchantService).toContain('func (s *merchantServiceImpl) MarkReady');
    expect(merchantOrders).toContain("status = 'pending_merchant'");
    expect(merchantOrders).toContain("status = 'preparing'");
    expect(merchantOrders).toContain("status = 'searching'");
    expect(foodRepository).toContain('GetFoodMenuItems');
    expect(foodRepository).toContain('harga');
  });

  it('rejects staff withdrawal while allowing scoped finance reads', () => {
    expect(reportService).toContain('GetFinanceStatement');
    expect(reportService).toContain('RequestWithdrawal');
    expect(reportService).toContain('requireOwnerMerchant');
    expect(merchantHandler).toContain('PermViewReports');
    expect(routes).toContain("'/admin/finance/merchant-settlements'");
  });

  it('keeps settlement, refund and Ads charges in separate auditable accounting boundaries', () => {
    expect(financeMigration).toContain('merchant_statement_entries');
    expect(financeMigration).toContain('append_merchant_statement_entry');
    expect(adsMigration).toContain('merchant_ad_purchases');
    expect(adsMigration).toContain('uq_merchant_ad_purchase_idempotency');
    expect(adsMigration).toContain("product_type = 'ads'");
    expect(adsMigration).toContain('discount_value_idr = 0');
  });

  it('keeps suspension safe for active orders and makes appeal/reinstatement auditable', () => {
    expect(enforcementMigration).toContain('merchant_enforcement_appeals');
    expect(enforcementMigration).toContain('pending_safe_completion');
    expect(enforcementMigration).toContain('merchant_enforcement_order_matches');
    expect(merchantEnforcementController).toContain('merchant_enforcement_appeals');
    expect(merchantEnforcementController).toContain("status === 'approved'");
    expect(merchantEnforcementController).toContain("status = 'revoked'");
    expect(routes).toContain("'/admin/merchants/:id/enforcement-actions'");
    expect(routes).toContain("requireTotp, requireIdempotencyKey('admin.merchant_enforcement.create')");
    expect(routes).toContain("requireTotp, requireIdempotencyKey('admin.merchant_enforcement.review')");
  });
});
