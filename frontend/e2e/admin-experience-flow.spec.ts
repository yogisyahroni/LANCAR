import { expect, test } from '@playwright/test';

const adminE2EEnabled = process.env.ADMIN_E2E === 'true';
const manifestId = '11111111-1111-4111-8111-111111111111';

const baseManifest = (overrides: Record<string, unknown> = {}) => ({
  id: '33333333-3333-4333-8333-333333333333',
  manifest_id: manifestId,
  revision: 2,
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
  targeting: {
    cohorts: [], market_codes: [], city_codes: [], zone_codes: [], locales: [],
    service_usage_cohorts: [], roles: [], experiment_assignments: [],
  },
  sections: [{ id: 'hero', component: 'hero_banner', properties: { title: 'Current banner', body: 'Published content' } }],
  asset_references: [],
  checksum: 'a'.repeat(64),
  signature: null,
  state: 'published',
  created_by: 'maker',
  updated_by: 'publisher',
  published_by: 'publisher',
  published_at: '2026-09-01T00:00:00.000Z',
  rolled_back_by: null,
  rolled_back_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  requires_approval: false,
  approval_status: 'not_required',
  approval_requested_by: null,
  approval_requested_at: null,
  approved_by: null,
  approved_at: null,
  kill_switch_active: false,
  kill_switched_by: null,
  kill_switched_at: null,
  kill_switch_reason: null,
  ...overrides,
});

test.describe('Admin-to-App Experience flow', () => {
  test.skip(!adminE2EEnabled, 'Run with ADMIN_E2E=true against the admin dashboard dev server');

  test('creates, previews, submits, approves and publishes a banner through the Admin UI', async ({ page }) => {
    let draft: ReturnType<typeof baseManifest> | null = null;
    let published: ReturnType<typeof baseManifest> = baseManifest();
    const calls: string[] = [];

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const apiPath = url.pathname.replace('/api/v1', '');
      const method = request.method();
      calls.push(`${method} ${apiPath}`);

      if (apiPath === '/auth/web/me') {
        await route.fulfill({ json: { user: {
          id: 'publisher', name: 'Publisher', email: 'publisher@example.test', role: 'super_admin',
          permissions: [
            'experience.read', 'experience.draft.write', 'experience.submit_approval',
            'experience.approve', 'experience.publish', 'experience.rollback', 'experience.kill_switch.execute',
          ],
        } } });
        return;
      }
      if (apiPath === '/admin/experience/manifests' && method === 'GET') {
        await route.fulfill({ json: { success: true, data: draft ? [draft] : [] } });
        return;
      }
      if (apiPath === `/admin/experience/manifests/${manifestId}` && method === 'GET') {
        await route.fulfill({ json: { success: true, data: {
          revisions: draft ? [draft, published] : [published],
          audit: [],
        } } });
        return;
      }
      if (apiPath === '/admin/experience/manifests' && method === 'POST') {
        const body = request.postDataJSON();
        draft = baseManifest({
          ...body,
          id: '44444444-4444-4444-8444-444444444444',
          revision: 3,
          state: 'draft',
          requires_approval: true,
          approval_status: 'draft',
          created_by: 'maker',
          updated_by: 'maker',
        });
        await route.fulfill({ json: { success: true, data: draft } });
        return;
      }
      if (apiPath.endsWith('/preview') && method === 'POST') {
        await route.fulfill({ json: {
          success: true,
          simulation: { matched: true, reason: 'matched' },
          preview_result: {
            validation: { valid: true, issues: [] },
            simulation: { matched: true, reason: 'matched' },
            candidate: { manifest: draft, section_outcomes: [] },
            fallback: null,
            current_live: published,
            diff: { changed_fields: [], added_sections: [], removed_sections: [], changed_sections: [], field_changes: [] },
            release_summary: { audience: { mode: 'broad', market_code: 'id-jk', locale: 'id-ID', dimensions: {} }, schedule: { starts_at: '2026-09-01T00:00:00.000Z', ends_at: null, timezone: 'Asia/Jakarta' }, rollout: { stage: 'public', canary_cohort: null, percentage: 100 }, affected_surfaces: ['customer_android'], blast_radius: { level: 'high', reasons: [] } },
          },
        } });
        return;
      }
      if (apiPath.endsWith('/submit-approval') && method === 'POST') {
        draft = { ...draft, approval_status: 'pending' };
        await route.fulfill({ json: { success: true, data: draft } });
        return;
      }
      if (apiPath.endsWith('/approve') && method === 'POST') {
        draft = { ...draft, approval_status: 'approved', approved_by: 'publisher' };
        await route.fulfill({ json: { success: true, data: draft } });
        return;
      }
      if (apiPath.endsWith('/publish') && method === 'POST') {
        published = { ...draft, state: 'published', published_by: 'publisher', approval_status: 'approved' };
        draft = null;
        await route.fulfill({ json: { success: true, data: published } });
        return;
      }
      await route.fulfill({ json: { success: true, data: {} } });
    });

    await page.goto('/app-experience/campaigns');
    await expect(page.getByRole('heading', { name: /Banners & Promo Content · App Experience/ })).toBeVisible();
    await page.getByRole('button', { name: /New campaign/ }).click();
    await page.getByLabel('title', { exact: false }).first().fill('Ramadan customer banner');
    const saveButton = page.getByRole('button', { name: 'Save draft' });
    await saveButton.click();
    await expect.poll(() => calls.join('\n')).toMatch(/POST .*experience\/manifests/);
    await expect(page.getByText('State:')).toBeVisible();
    await page.getByRole('button', { name: 'Preview resolver' }).click();
    await expect.poll(() => calls.join('\n')).toMatch(/POST .*\/preview/);
    await expect(page.getByRole('button', { name: 'Submit approval' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit approval' })).toBeEnabled();
    await page.getByRole('button', { name: 'Submit approval' }).click();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
    await page.getByRole('button', { name: 'Preview resolver' }).click();
    await expect.poll(() => calls.filter((call) => call.includes('/preview')).length).toBeGreaterThan(1);
    await expect(page.getByRole('button', { name: 'Publish' })).toBeEnabled();
    await page.getByRole('button', { name: 'Publish' }).click();

    expect(calls).toEqual(expect.arrayContaining([
      expect.stringMatching(/^POST \/admin\/experience\/manifests$/),
      expect.stringMatching(/\/preview$/),
      expect.stringMatching(/\/submit-approval$/),
      expect.stringMatching(/\/approve$/),
      expect.stringMatching(/\/publish$/),
    ]));
    await expect.poll(() => published.state).toBe('published');
  });

  test('does not expose publish/rollback controls to a read-only operator', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const apiPath = url.pathname.replace('/api/v1', '');
      if (apiPath === '/auth/web/me') {
        await route.fulfill({ json: { user: {
          id: 'viewer', name: 'Viewer', email: 'viewer@example.test', role: 'ops_admin', permissions: ['experience.read'],
        } } });
        return;
      }
      if (apiPath === '/admin/experience/manifests') {
        await route.fulfill({ json: { success: true, data: [baseManifest()] } });
        return;
      }
      if (apiPath === `/admin/experience/manifests/${manifestId}`) {
        await route.fulfill({ json: { success: true, data: { revisions: [baseManifest()], audit: [] } } });
        return;
      }
      await route.fulfill({ json: { success: true, data: {} } });
    });

    await page.goto(`/app-experience/campaigns?manifest_id=${manifestId}`);
    await expect(page.getByRole('heading', { name: /Banners & Promo Content · App Experience/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /New campaign/ })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Roll back/ })).not.toBeVisible();
  });
});
