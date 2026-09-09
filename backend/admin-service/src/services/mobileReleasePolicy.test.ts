import {
  decideMobileRelease,
  estimateMobileReleasePolicyImpact,
  parseMobileReleasePolicyInput,
  type MobileReleasePolicyRecord,
} from './mobileReleasePolicy';

const policy = (overrides: Partial<MobileReleasePolicyRecord> = {}): MobileReleasePolicyRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  market_code: 'id-jk',
  client_type: 'customer',
  platform: 'android',
  latest_version_code: 3,
  latest_version_name: '1.0.3',
  min_supported_version_code: 2,
  min_supported_version_name: '1.0.2',
  recommended_version_code: 3,
  recommended_version_name: '1.0.3',
  update_mode: 'soft',
  hard_block_reason: 'none',
  localized_messages: { 'id-ID': 'Versi baru tersedia', en: 'A new version is available' },
  store_destinations: { primary: 'https://play.google.com/store/apps/details?id=com.tembus.customer' },
  allow_active_order_access: true,
  allow_support_access: true,
  allow_new_transactions: true,
  remote_config_scope: 'release_metadata',
  revision: 1,
  effective_from: '2026-01-01T00:00:00.000Z',
  effective_to: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('mobile release policy contract', () => {
  it('validates market/platform-scoped policy and release metadata limits', () => {
    expect(parseMobileReleasePolicyInput({
      market_code: 'ID-JK',
      client_type: 'customer',
      platform: 'android',
      latest_version_code: 3,
      latest_version_name: '1.0.3',
      min_supported_version_code: 2,
      min_supported_version_name: '1.0.2',
      recommended_version_code: 3,
      recommended_version_name: '1.0.3',
      update_mode: 'soft',
      localized_messages: { 'id-ID': 'Perbarui aplikasi saat siap.' },
      store_destinations: { primary: 'https://play.google.com/store/apps/details?id=com.tembus.customer' },
      reason: 'Raise the recommended customer release',
    })).toMatchObject({ market_code: 'id-jk', platform: 'android', update_mode: 'soft' });

    expect(() => parseMobileReleasePolicyInput({
      market_code: 'id-jk', client_type: 'customer', platform: 'android',
      latest_version_code: 3, latest_version_name: '1.0.3',
      min_supported_version_code: 2, min_supported_version_name: '1.0.2',
      update_mode: 'hard', hard_block_reason: 'none', reason: 'Invalid hard gate',
    })).toThrow(/hard update requires/);

    expect(() => parseMobileReleasePolicyInput({
      market_code: 'id-jk', client_type: 'web', platform: 'android',
      latest_version_code: 1, latest_version_name: '1.0.0',
      min_supported_version_code: 1, min_supported_version_name: '1.0.0',
      update_mode: 'none', reason: 'Wrong client platform',
    })).toThrow(/web client must use the web platform/);

    expect(() => parseMobileReleasePolicyInput({
      market_code: 'id-jk', client_type: 'customer', platform: 'android',
      latest_version_code: 3, latest_version_name: '1.0.3',
      min_supported_version_code: 2, min_supported_version_name: '1.0.2',
      update_mode: 'hard', hard_block_reason: 'unsafe', reason: 'Missing explicit confirmation',
    })).toThrow(/explicit confirmation/);

    expect(parseMobileReleasePolicyInput({
      market_code: 'id-jk', client_type: 'customer', platform: 'android',
      latest_version_code: 3, latest_version_name: '1.0.3',
      min_supported_version_code: 2, min_supported_version_name: '1.0.2',
      update_mode: 'hard', hard_block_reason: 'unsafe', confirm_hard_update: true,
      effective_from: '2026-09-10T00:00:00.000Z', effective_to: '2026-09-11T00:00:00.000Z',
      reason: 'Confirmed unsafe binary release gate',
    })).toMatchObject({ confirm_hard_update: true, effective_to: expect.any(Date) });
  });

  it('keeps soft updates dismissible and separate from transaction failures', () => {
    const decision = decideMobileRelease(policy(), {
      clientType: 'customer', appVersion: '1.0.2', appVersionCode: 2, schemaVersion: 1,
      capabilities: [], status: 'compatible', upgradeRequired: false,
      dynamicFeaturesEnabled: true, reason: null,
    }, 'id-ID');

    expect(decision).toMatchObject({
      update_mode: 'soft', update_required: true, hard_block: false, force: false,
      recovery_access: { active_order: true, support: true, new_transactions: true },
      message: 'Versi baru tersedia',
    });
  });

  it('hard-blocks only an unsafe/incompatible old client while preserving recovery access', () => {
    const decision = decideMobileRelease(policy({
      update_mode: 'hard',
      hard_block_reason: 'incompatible',
      min_supported_version_code: 3,
      min_supported_version_name: '1.0.3',
      allow_new_transactions: false,
    }), {
      clientType: 'customer', appVersion: '1.0.2', appVersionCode: 2, schemaVersion: 1,
      capabilities: [], status: 'compatible', upgradeRequired: false,
      dynamicFeaturesEnabled: true, reason: null,
    }, 'en-US');

    expect(decision).toMatchObject({
      update_mode: 'hard', update_required: true, hard_block: true, force: true,
      hard_block_reason: 'incompatible',
      recovery_access: { active_order: true, support: true, new_transactions: false },
      message: 'A new version is available',
    });
  });

  it('turns schema incompatibility into a hard recovery gate even when version policy is soft', () => {
    const decision = decideMobileRelease(policy(), {
      clientType: 'customer', appVersion: '1.0.2', appVersionCode: 2, schemaVersion: 99,
      capabilities: [], status: 'upgrade_required', upgradeRequired: true,
      dynamicFeaturesEnabled: false, reason: 'unsupported_api_schema',
    }, 'id-ID');

    expect(decision).toMatchObject({ update_mode: 'hard', hard_block: true, hard_block_reason: 'incompatible' });
    expect(decision.recovery_access.new_transactions).toBe(false);
  });

  it('enforces the market minimum as an incompatible hard gate even for a soft policy', () => {
    const decision = decideMobileRelease(policy({
      update_mode: 'soft',
      min_supported_version_code: 3,
      min_supported_version_name: '1.0.3',
    }), {
      clientType: 'customer', appVersion: '1.0.1', appVersionCode: 1, schemaVersion: 1,
      capabilities: [], status: 'compatible', upgradeRequired: false,
      dynamicFeaturesEnabled: true, reason: null,
    }, 'id-ID');

    expect(decision).toMatchObject({
      update_mode: 'hard',
      update_required: true,
      hard_block: true,
      hard_block_reason: 'incompatible',
    });
    expect(decision.recovery_access).toEqual({ active_order: true, support: true, new_transactions: false });
  });

  it('estimates affected version distribution from observed scoped experience telemetry', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [
      { app_version: '1.0.1', observed_events: 25 },
      { app_version: '1.0.2', observed_events: 50 },
      { app_version: 'unknown', observed_events: 5 },
    ] }) };
    const impact = await estimateMobileReleasePolicyImpact({
      market_code: 'id-jk', client_type: 'customer', platform: 'android', min_supported_version_name: '1.0.2',
    }, queryable);

    expect(impact).toMatchObject({ coverage: 'observed', observed_events: 80, affected_events: 25, unknown_events: 5, affected_share_pct: 33.33 });
    expect(impact.versions).toEqual(expect.arrayContaining([
      expect.objectContaining({ app_version: '1.0.1', affected: true, share_pct: 31.25 }),
      expect.objectContaining({ app_version: 'unknown', affected: null, share_pct: 6.25 }),
    ]));
    expect(queryable.query).toHaveBeenCalledWith(expect.stringContaining("aggregate_type IN ('experience_banner', 'experience_runtime')"), ['id-jk', 30, ['customer_android']]);
  });
});
