import { spawnSync } from 'child_process';
import path from 'path';

import { db, readDb } from './db';

const requiredEnv = (name: string): string => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required for the local merchant lifecycle release gate`);
  return value;
};

const runGoGate = (label: string, cwd: string, testPattern: string, env: NodeJS.ProcessEnv) => {
  const result = spawnSync(
    'go',
    ['test', './internal/repository', '-run', testPattern, '-count=1', '-v'],
    { cwd, env, encoding: 'utf8', windowsHide: true },
  );
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    throw new Error(`${label} failed (exit ${result.status}):\n${output.slice(-6000)}`);
  }
};

const main = async () => {
  const databaseURL = requiredEnv('DATABASE_URL');
  const merchantID = requiredEnv('TEMBUS_MERCHANT_LIFECYCLE_TEST_MERCHANT_ID');
  const ownerID = requiredEnv('TEMBUS_MERCHANT_LIFECYCLE_TEST_OWNER_ID');
  const orderID = String(process.env.TEMBUS_MERCHANT_FINANCE_TEST_ORDER_ID || '8e7a2e6a-1e4a-4b31-8af7-202608080010').trim();
  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TEMBUS_MERCHANT_LIFECYCLE_TEST_DATABASE_URL: databaseURL,
    TEMBUS_MERCHANT_LIFECYCLE_TEST_MERCHANT_ID: merchantID,
    TEMBUS_MERCHANT_LIFECYCLE_TEST_OWNER_ID: ownerID,
    TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL: databaseURL,
    TEMBUS_MERCHANT_FINANCE_TEST_MERCHANT_ID: merchantID,
    TEMBUS_MERCHANT_FINANCE_TEST_ORDER_ID: orderID,
    TEMBUS_MERCHANT_FINANCE_TEST_USER_ID: ownerID,
    TEMBUS_MERCHANT_ADS_TEST_DATABASE_URL: databaseURL,
    TEMBUS_MERCHANT_ADS_TEST_MERCHANT_ID: merchantID,
    TEMBUS_MERCHANT_ADS_TEST_USER_ID: ownerID,
    TEMBUS_MERCHANT_ENFORCEMENT_TEST_DATABASE_URL: databaseURL,
    TEMBUS_MERCHANT_ENFORCEMENT_TEST_MERCHANT_ID: merchantID,
    TEMBUS_MERCHANT_ENFORCEMENT_TEST_USER_ID: ownerID,
    TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL: databaseURL,
    TEMBUS_OPERATING_STATE_TEST_MERCHANT_ID: merchantID,
  };

  const merchantServiceCwd = path.resolve(__dirname, '../../merchant-service');
  const orderServiceCwd = path.resolve(__dirname, '../../order-service');
  runGoGate(
    'merchant-service lifecycle/finance/enforcement gate',
    merchantServiceCwd,
    'TestMerchantLifecycleReleaseGateIntegration|TestMerchantFinanceStatementIntegration|TestMerchantBankAccountLifecycleIntegration|TestMerchantFinanceDiscrepancyQueueIntegration|TestMerchantFinanceStatementAppendOnlyIntegration|TestMerchantFinanceMarketCurrencyBoundaryIntegration|TestMerchantAdsIntegration|TestMerchantEnforcementIntegration|TestMerchantQualityScoreIntegration',
    baseEnv,
  );
  runGoGate(
    'order-service discovery/checkout eligibility gate',
    orderServiceCwd,
    'TestMerchantDiscoveryCheckoutReleaseGateIntegration|TestFoodRepositoryReadsCanonicalOperatingState|TestMerchantAdsBoundaryIntegration|TestMerchantBranchCheckoutBoundaryIntegration|TestMerchantQualityDiscoveryEligibilityIntegration',
    baseEnv,
  );

  const result = await readDb.query(
    `SELECT m.onboarding_status,
            m.verification_status,
            m.is_open,
            m.operating_state,
            ST_Y(m.lokasi::geometry) AS latitude,
            ST_X(m.lokasi::geometry) AS longitude,
            EXISTS (
              SELECT 1 FROM merchant_branches b
              WHERE b.merchant_id = m.id AND b.code = 'MAIN' AND b.is_active
            ) AS has_main_branch,
            EXISTS (
              SELECT 1 FROM merchant_menu_items item
              JOIN merchant_branches b ON b.id = item.branch_id
              WHERE item.merchant_id = m.id
                AND b.is_active
                AND item.status = 'active'
                AND item.moderation_status = 'approved'
            ) AS has_active_catalog,
            merchant_quality_is_eligible(m.id, 'search') AS search_eligible,
            merchant_quality_is_eligible(m.id, 'ads') AS ads_eligible,
            merchant_enforcement_is_active(m.id, NULL, NULL, NULL) AS enforcement_active
       FROM merchants m
      WHERE m.id = $1`,
    [merchantID],
  );
  const fixture = result.rows[0];
  if (!fixture) throw new Error('merchant lifecycle fixture was not found');
  if (fixture.onboarding_status !== 'ACTIVE' || fixture.verification_status !== 'approved') {
    throw new Error(`merchant lifecycle fixture is not active/verified: ${JSON.stringify(fixture)}`);
  }
  if (!fixture.is_open || !['open', 'busy'].includes(fixture.operating_state)) {
    throw new Error(`merchant operating state is not discovery eligible: ${JSON.stringify(fixture)}`);
  }
  if (Number(fixture.latitude) === 0 && Number(fixture.longitude) === 0) {
    throw new Error('merchant lifecycle fixture has no real pickup location');
  }
  if (!fixture.has_main_branch || !fixture.has_active_catalog) {
    throw new Error(`merchant branch/catalog prerequisites are incomplete: ${JSON.stringify(fixture)}`);
  }
  if (!fixture.search_eligible || !fixture.ads_eligible || fixture.enforcement_active) {
    throw new Error(`merchant Search/Ads eligibility is not consistent: ${JSON.stringify(fixture)}`);
  }

  console.log(JSON.stringify({
    task_id: 'MERCH-2026-010',
    status: 'PASS',
    scenarios: [
      'onboard_verify_branch_catalog_open_receive_prepare_settle',
      'busy_pause_search_ads_eligibility',
      'staff_finance_authorization',
      'catalog_search_checkout_authority',
      'settlement_refund_ads_reconciliation',
      'suspension_safe_completion_appeal',
    ],
    fixture: {
      onboarding_status: fixture.onboarding_status,
      verification_status: fixture.verification_status,
      operating_state: fixture.operating_state,
      has_main_branch: fixture.has_main_branch,
      has_active_catalog: fixture.has_active_catalog,
    },
  }));
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([db.end(), readDb.end()]);
  });
