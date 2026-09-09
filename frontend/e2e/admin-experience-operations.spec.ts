import { expect, test, type Page, type Route } from '@playwright/test';

const enabled = process.env.ADMIN_E2E === 'true';
const manifestId = '11111111-1111-4111-8111-111111111111';

const manifest = (state: 'draft' | 'published' = 'draft') => ({
  id: '33333333-3333-4333-8333-333333333333',
  manifest_id: manifestId,
  revision: state === 'draft' ? 3 : 2,
  schema_version: 1,
  market_code: 'id-jk',
  locale: 'id-ID',
  surface: 'customer_android',
  min_app_version: '1.0.0',
  max_app_version: null,
  starts_at: '2026-09-01T00:00:00.000Z',
  ends_at: null,
  schedule_timezone: 'Asia/Jakarta',
  rollout_stage: 'public',
  canary_cohort: null,
  rollout_percentage: 100,
  ttl_seconds: 300,
  cache_policy: 'private',
  targeting: { cohorts: [], market_codes: [], city_codes: [], zone_codes: [], locales: [], service_usage_cohorts: [], roles: [], experiment_assignments: [] },
  sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'Operational banner', body: 'GUI smoke content', cta_label: 'Open', deep_link: '/food' } }],
  asset_references: [],
  checksum: 'a'.repeat(64),
  signature: null,
  state,
  created_by: 'maker',
  updated_by: 'publisher',
  published_by: state === 'published' ? 'publisher' : null,
  published_at: state === 'published' ? '2026-09-01T00:00:00.000Z' : null,
  rolled_back_by: null,
  rolled_back_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  requires_approval: state === 'draft',
  approval_status: state === 'draft' ? 'draft' : 'approved',
  approval_requested_by: null,
  approval_requested_at: null,
  approved_by: state === 'published' ? 'checker' : null,
  approved_at: state === 'published' ? '2026-09-01T00:00:00.000Z' : null,
  kill_switch_active: false,
  kill_switched_by: null,
  kill_switched_at: null,
  kill_switch_reason: null,
});

const observability = {
  summary: {
    reliability_total: 12, reliability_failures: 1, reliability_failure_rate_pct: 8.3,
    fetch_success: 11, fetch_failure: 1, cache_hit: 7, parse_failure: 0,
    schema_fallback: 0, section_render_failure: 0, broken_asset: 0,
    deeplink_failure: 0, startup_regression: 0, network_regression: 0,
    fetch_latency_avg_ms: 80, fetch_latency_p95_ms: 160, impressions: 10, clicks: 3, dismissals: 1,
  },
  breakdown: [{ manifest_id: manifestId, manifest_revision: 2, market_code: 'id-jk', app_version: '1.0.0', total_events: 12, reliability_total: 12, reliability_failures: 1, reliability_failure_rate_pct: 8.3, impressions: 10, clicks: 3, dismissals: 1, fetch_latency_avg_ms: 80, rollback_target_revision: 1 }],
  guardrail_policy: { version: 1, min_events: 20, max_failure_rate_pct: 10, window_hours: 1, marketing_metrics_excluded: true, updated_at: null, updated_by: null },
};

const deepLinkRoute = {
  route_id: 'food', label: 'Food home', template: '/food', description: 'Food marketplace home', status: 'active', min_app_version: '1.0.0', min_schema_version: 1,
  fallback_route_id: 'home', supported_surfaces: ['customer_android', 'customer_web'], parameters: [],
};

const serviceControl = {
  id: 'control-1', key: 'food-provider-gate', name: 'Food provider gate', description: 'Provider safety control', kill_switch_type: 'provider_gate', service_code: 'food_delivery', service_category: 'food', market_codes: ['id-jk'], city_codes: [], zone_codes: [], surface: null, fallback_behavior: 'preserve_active_orders', starts_at: null, expires_at: null, review_at: null, preserve_active_orders: true, active: false, is_enabled: false, last_reason: null,
};

const releasePolicy = {
  id: 'policy-1', market_code: 'id-jk', client_type: 'customer', platform: 'android', latest_version_code: 2, latest_version_name: '1.1.0', min_supported_version_code: 1, min_supported_version_name: '1.0.0', recommended_version_code: 2, recommended_version_name: '1.1.0', update_mode: 'soft', hard_block_reason: 'none', localized_messages: { 'id-ID': { title: 'Pembaruan aplikasi', body: 'Update tersedia' }, 'en-US': { title: 'Update available', body: 'Update now' } }, store_destinations: {}, allow_active_order_access: true, allow_support_access: true, allow_new_transactions: true, remote_config_scope: 'release_metadata', revision: 1, effective_from: '2026-09-01T00:00:00.000Z', effective_to: null, updated_at: '2026-09-01T00:00:00.000Z',
};

const installGuiContract = async (page: Page, calls: string[]) => {
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    calls.push(`${method} ${path}`);

    if (path === '/auth/web/me') {
      await route.fulfill({ json: { user: { id: 'ops-user', name: 'Ops User', email: 'ops@example.test', role: 'super_admin', permissions: [
        'experience.read', 'experience.draft.write', 'experience.asset.write', 'experience.targeting.write', 'experience.guardrail.write', 'experience.feature_flag.write', 'experience.kill_switch.execute', 'experience.submit_approval', 'experience.approve', 'experience.publish', 'experience.rollback', 'experience.version_policy.write',
      ] } } });
      return;
    }
    if (path === '/admin/experience/manifests' && method === 'GET') { await route.fulfill({ json: { success: true, data: [manifest('draft'), manifest('published')] } }); return; }
    if (path === `/admin/experience/manifests/${manifestId}` && method === 'GET') { await route.fulfill({ json: { success: true, data: { revisions: [manifest('draft'), manifest('published')], audit: [] } } }); return; }
    if (path === '/admin/experience/observability') { await route.fulfill({ json: { success: true, data: observability } }); return; }
    if (path === '/admin/experience/audit') { await route.fulfill({ json: { success: true, data: [] } }); return; }
    if (path === '/admin/experience/service-controls') { await route.fulfill({ json: { success: true, data: [serviceControl] } }); return; }
    if (path === '/admin/experience/deep-link-registry') { await route.fulfill({ json: { success: true, data: [deepLinkRoute] } }); return; }
    if (path === '/admin/experience/deep-links' && method === 'GET') { await route.fulfill({ json: { success: true, data: [] } }); return; }
    if (path === '/admin/experience/assets') { await route.fulfill({ json: { success: true, data: [] } }); return; }
    if (path === '/admin/experience/revisions') { await route.fulfill({ json: { success: true, data: [manifest('published')] } }); return; }
    if (path === '/admin/feature-flags') { await route.fulfill({ json: { success: true, data: [] } }); return; }
    if (path === '/admin/audit-logs') { await route.fulfill({ json: { success: true, data: [] } }); return; }
    if (path === '/admin/mobile-release-policies') { await route.fulfill({ json: { success: true, data: [releasePolicy] } }); return; }
    if (path === '/admin/promos' || path === '/admin/broadcasts') { await route.fulfill({ json: { success: true, data: [] } }); return; }
    if (path.includes('/admin/experience/deep-links') && method === 'POST') { await route.fulfill({ json: { success: true, data: { deep_link: '/food', route: deepLinkRoute } } }); return; }
    if (path.includes('/admin/experience/service-controls') && method === 'POST') { await route.fulfill({ json: { success: true, data: serviceControl } }); return; }
    if (path.includes('/admin/mobile-release-policies/') && method === 'PUT') { await route.fulfill({ json: { success: true, data: releasePolicy } }); return; }
    await route.fulfill({ json: { success: true, data: {} } });
  });
};

test.describe('Admin Experience GUI operations', () => {
  test.skip(!enabled, 'Run with ADMIN_E2E=true against the admin dashboard dev server');

  test('exposes every routine operation surface and labels binary-bound actions', async ({ page }) => {
    const calls: string[] = [];
    await installGuiContract(page, calls);
    const routes: Array<[string, RegExp]> = [
      ['/app-experience/overview', /App Experience Overview/],
      [`/app-experience/home-layout?manifest_id=${manifestId}`, /Home Layout · App Experience/],
      [`/app-experience/campaigns?manifest_id=${manifestId}`, /Banners & Promo Content · App Experience/],
      [`/app-experience/campaign-intro?manifest_id=${manifestId}`, /Campaign Intro · App Experience/],
      [`/app-experience/service-visibility?manifest_id=${manifestId}`, /Service Visibility · App Experience/],
      ['/app-experience/kill-switches', /Kill Switches/],
      [`/app-experience/targeting?manifest_id=${manifestId}`, /Audience & Targeting · App Experience/],
      ['/app-experience/scheduling', /Campaign Calendar/],
      ['/app-experience/assets', /Asset Library/],
      ['/app-experience/deep-links', /Typed Deep Links/],
      [`/app-experience/design-tokens?manifest_id=${manifestId}`, /Design Tokens · App Experience/],
      [`/app-experience/preview?manifest_id=${manifestId}`, /Preview · App Experience/],
      [`/app-experience/approval?manifest_id=${manifestId}`, /Approval Queue · App Experience/],
      [`/app-experience/revisions?manifest_id=${manifestId}`, /Revisions & Rollback · App Experience/],
      ['/app-experience/feature-flags', /Feature Flags/],
      ['/app-experience/version-policy', /Mobile Release Policies/],
    ];
    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      if (path.includes('/home-layout')) await expect(page.getByText('Home layout sections')).toBeVisible();
      if (path.includes('/campaigns') || path.includes('/campaign-intro') || path.includes('/service-visibility')) {
        await expect(page.getByRole('button', { name: 'Preview resolver' })).toBeVisible();
        await expect(page.getByRole('button', { name: /Save draft/ })).toBeVisible();
      }
      if (path.includes('/targeting')) {
        await expect(page.getByRole('button', { name: 'Simulate matching' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Simulate non-matching' })).toBeVisible();
      }
      if (path.includes('/approval')) await expect(page.getByRole('button', { name: 'Submit approval' })).toBeVisible();
      if (path.includes('/revisions')) await expect(page.getByText('Revision history')).toBeVisible();
      if (path.includes('/assets')) await expect(page.getByRole('heading', { name: 'Register approved asset' })).toBeVisible();
      if (path.includes('/deep-links')) await expect(page.getByRole('button', { name: 'Run typed destination test' })).toBeVisible();
      if (path.includes('/version-policy')) await expect(page.getByRole('button', { name: 'New policy' })).toBeVisible();
    }
    await expect(page.getByText('Requires App Release', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/remote policy/i)).toBeVisible();
    expect(calls).toEqual(expect.arrayContaining([
      'GET /admin/experience/service-controls',
      'GET /admin/experience/deep-link-registry',
      'GET /admin/mobile-release-policies',
    ]));
  });

  test('executes typed deep-link and operational gate actions through GUI controls', async ({ page }) => {
    const calls: string[] = [];
    await installGuiContract(page, calls);
    await page.goto('/app-experience/deep-links');
    await page.getByRole('region', { name: 'Registered destination' }).getByRole('combobox').selectOption('food');
    await page.getByRole('button', { name: 'Run typed destination test' }).click();
    await expect(page.getByText('Destination available')).toBeVisible();
    await page.getByPlaceholder('https://app.bawain.my.id/promo').fill('https://app.bawain.my.id/promo');
    await page.getByRole('button', { name: 'Validate URL' }).click();

    await page.goto('/app-experience/kill-switches');
    await page.getByLabel('Control type').selectOption('new_order_gate');
    await page.getByLabel('Reason (wajib)').fill('Provider degradation requires controlled admission pause');
    await page.getByRole('button', { name: 'Review & save control' }).click();
    await expect(page.getByRole('dialog', { name: 'Konfirmasi service control' })).toBeVisible();
    await page.getByRole('button', { name: 'Nonaktifkan control' }).click();

    expect(calls).toEqual(expect.arrayContaining([
      'POST /admin/experience/deep-links',
      'POST /admin/experience/service-controls',
    ]));
  });
});
