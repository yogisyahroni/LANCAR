import { expect, test, type Page, type Route } from '@playwright/test'

const manifestId = '11111111-1111-4111-8111-111111111111'

const manifest = {
  id: '33333333-3333-4333-8333-333333333333',
  manifest_id: manifestId,
  revision: 3,
  schema_version: 1,
  market_code: 'id-jk',
  locale: 'id-ID',
  surface: 'customer_android' as const,
  min_app_version: '1.0.0',
  max_app_version: null,
  starts_at: '2026-09-01T00:00:00.000Z',
  ends_at: null,
  schedule_timezone: 'Asia/Jakarta',
  rollout_stage: 'public' as const,
  canary_cohort: null,
  rollout_percentage: 100,
  ttl_seconds: 300,
  cache_policy: 'private' as const,
  targeting: {
    cohorts: [],
    market_codes: [],
    city_codes: [],
    zone_codes: [],
    locales: [],
    service_usage_cohorts: [],
    user_status: null,
    roles: [],
    experiment_ref: null,
    experiment_assignments: [],
  },
  sections: [{
    id: 'hero',
    component: 'hero_banner',
    enabled: true,
    properties: { title: 'Accessibility-safe campaign', body: 'Server-gated content.' },
  }],
  asset_references: [],
  checksum: 'a'.repeat(64),
  signature: null,
  state: 'draft' as const,
  created_by: 'maker',
  updated_by: 'maker',
  published_by: null,
  published_at: null,
  rolled_back_by: null,
  rolled_back_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  requires_approval: false,
  approval_status: 'not_required' as const,
  approval_requested_by: null,
  approval_requested_at: null,
  approved_by: null,
  approved_at: null,
  kill_switch_active: false,
  kill_switched_by: null,
  kill_switched_at: null,
  kill_switch_reason: null,
}

const previewResult = (valid: boolean) => ({
  impression_recorded: false,
  simulation: { matched: true, reason: 'matched' },
  context: {},
  validation: {
    valid,
    issues: valid ? [] : [{
      path: 'sections[0].properties.alt_label',
      code: 'image_alt_required',
      message: 'Images need alt text or an explicit decorative decision.',
      blocking: true,
    }],
  },
  candidate: { manifest: { revision: manifest.revision, sections: manifest.sections }, section_outcomes: [] },
  fallback: null,
  current_live: null,
  diff: { changed_fields: [], added_sections: [], removed_sections: [], changed_sections: [], field_changes: [] },
})

const installExperienceFixture = async (page: Page, validPreview: boolean, calls: string[], rejectPublish = false) => {
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    const method = request.method()
    calls.push(`${method} ${path}`)

    if (path === '/auth/web/me') {
      await route.fulfill({ json: { user: {
        id: 'experience-a11y-fixture',
        name: 'Experience A11y Fixture',
        email: 'experience-a11y@example.test',
        role: 'super_admin',
        permissions: ['experience.read', 'experience.draft.write', 'experience.publish', 'experience.kill_switch.execute'],
      } } })
      return
    }
    if (path === '/admin/experience/manifests' && method === 'GET') {
      await route.fulfill({ json: { success: true, data: [manifest] } })
      return
    }
    if (path === `/admin/experience/manifests/${manifestId}` && method === 'GET') {
      await route.fulfill({ json: { success: true, data: { revisions: [manifest], audit: [] } } })
      return
    }
    if (path === '/admin/experience/service-controls' && method === 'GET') {
      await route.fulfill({ json: { success: true, data: [] } })
      return
    }
    if (path === `/admin/experience/manifests/${manifestId}/preview` && method === 'POST') {
      await route.fulfill({ json: { success: true, simulation: { matched: true, reason: 'matched' }, preview_result: previewResult(validPreview) } })
      return
    }
    if (path === `/admin/experience/manifests/${manifestId}/publish` && method === 'POST') {
      if (rejectPublish) {
        await route.fulfill({ status: 409, json: { success: false, message: 'Design token presets must preserve WCAG AA contrast of at least 4.5:1' } })
        return
      }
      await route.fulfill({ json: { success: true, data: { ...manifest, state: 'published' } } })
      return
    }
    await route.fulfill({ json: { success: true, data: {} } })
  })
}

test('authenticated invalid App Experience preview blocks publish in the GUI', async ({ page }) => {
  const calls: string[] = []
  await installExperienceFixture(page, false, calls)
  await page.goto(`/app-experience/campaigns?manifest_id=${manifestId}`, { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: /Banners & Promo Content · App Experience/ })).toBeVisible()
  await page.getByRole('button', { name: 'Preview resolver' }).click()
  await expect(page.getByRole('alert')).toContainText('Blocking validation')
  await expect(page.getByRole('alert')).toContainText('alt text')

  const publishButton = page.getByRole('button', { name: 'Preview before publish' })
  await expect(publishButton).toBeDisabled()
  expect(calls).not.toContain(`POST /admin/experience/manifests/${manifestId}/publish`)
})

test('authenticated valid App Experience preview publishes through the GUI', async ({ page }) => {
  const calls: string[] = []
  await installExperienceFixture(page, true, calls)
  await page.goto(`/app-experience/campaigns?manifest_id=${manifestId}`, { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: /Banners & Promo Content · App Experience/ })).toBeVisible()
  await page.getByRole('button', { name: 'Preview resolver' }).click()
  await expect(page.getByText('Schema, asset/deep-link integrity, schedule and targeting gates are clear for this saved candidate.')).toBeVisible()

  const publishButton = page.getByRole('button', { name: 'Publish' })
  await expect(publishButton).toBeEnabled()
  await publishButton.click()
  await expect.poll(() => calls.includes(`POST /admin/experience/manifests/${manifestId}/publish`)).toBe(true)
})

test('authenticated server contrast rejection remains visible and blocks false publish success', async ({ page }) => {
  const calls: string[] = []
  await installExperienceFixture(page, true, calls, true)
  await page.goto(`/app-experience/design-tokens?manifest_id=${manifestId}`, { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: /Design Tokens · App Experience/ })).toBeVisible()
  const publishButton = page.getByRole('button', { name: 'Publish' })
  await expect(publishButton).toBeEnabled()
  await publishButton.click()
  await expect(page.getByText(/Design token presets must preserve WCAG AA contrast/i)).toBeVisible()
  expect(calls).toContain(`POST /admin/experience/manifests/${manifestId}/publish`)
})

test('service-control types remain distinct and destructive confirmation includes impact', async ({ page }) => {
  const calls: string[] = []
  await installExperienceFixture(page, true, calls)
  await page.goto('/app-experience/kill-switches', { waitUntil: 'domcontentloaded' })

  const controlType = page.getByLabel('Control type')
  const impact = page.getByText('Blast radius sebelum eksekusi').locator('..')
  const expectedImpacts = {
    marketing_hide: 'Entry/promo disembunyikan saja; transaksi tidak diubah.',
    new_order_gate: 'Order baru ditolak; active order dan support tetap reachable.',
    provider_gate: 'Capability provider tertentu dihentikan tanpa menghapus service.',
    checkout_gate: 'Checkout/payment initiation baru dihentikan.',
  }

  for (const [type, description] of Object.entries(expectedImpacts)) {
    await controlType.selectOption(type)
    await expect(impact).toContainText(description)
  }

  await controlType.selectOption('new_order_gate')
  await page.getByLabel('Reason (wajib)').fill('Provider degradation requires a controlled admission pause')
  await page.getByRole('button', { name: 'Review & save control' }).click()
  const dialog = page.getByRole('dialog', { name: 'Konfirmasi service control' })
  await expect(dialog).toContainText('Nonaktifkan')
  await expect(dialog).toContainText('new_order_gate')
  await expect(dialog).toContainText('food_delivery')
  await expect(dialog).toContainText('Mencegah order baru')
  const cancelButton = dialog.getByRole('button', { name: 'Batal' })
  const confirmButton = dialog.getByRole('button', { name: 'Nonaktifkan control' })
  await expect(cancelButton).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(confirmButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancelButton).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Review & save control' })).toBeFocused()
})
