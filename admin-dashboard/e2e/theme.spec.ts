import { expect, test, type Page } from '@playwright/test'

async function installThemeFixture(page: Page, options: { notifications?: Array<Record<string, unknown>> } = {}) {
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'theme-fixture',
            name: 'Theme Fixture',
            role: 'super_admin',
            permissions: ['experience.read', 'experience.draft.write'],
          },
        }),
      })
      return
    }
    if (url.includes('/auth/web/notifications')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notifications: options.notifications ?? [] }),
      })
      return
    }
    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      const requestUrl = new URL(url)
      const path = requestUrl.pathname
      if (path.endsWith('/admin/orders')) {
        const requestedPage = Number(requestUrl.searchParams.get('page') ?? '1')
        const orderIds = requestedPage === 2 ? ['ORDER-11'] : Array.from({ length: 10 }, (_, index) => `ORDER-${index + 1}`)
        const data = orderIds.map((id) => ({
          id,
          model: 'instant',
          service_category: 'package_on_demand',
          status: 'in_transit',
          payment_status: 'paid',
          total_amount: '12500',
          customer_name: 'Theme Fixture Customer',
          courier_name: 'Courier Fixture',
        }))
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, total: 11 }) })
        return
      }
      if (/\/admin\/orders\/[^/]+$/.test(path)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          id: path.split('/').pop(),
          created_at: '2026-09-10T00:00:00.000Z',
          model: 'instant',
          service_category: 'package_on_demand',
          status: 'in_transit',
          customer_name: 'Theme Fixture Customer',
          courier_name: 'Courier Fixture',
          events: [],
          payments: [],
          refunds: [],
          dispatches: [],
          proof_attempts: [],
          carrier_events: [],
        }) })
        return
      }
      if (path.endsWith('/admin/analytics/reports')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
        return
      }
      const body = path.endsWith('/admin/dashboard/events')
        ? []
        : path.endsWith('/admin/health')
          ? { components: [] }
          : path.endsWith('/admin/dashboard/stats')
            ? {}
            : path.endsWith('/admin/finance/stats')
              ? { model_breakdown: [] }
              : { data: [] }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      return
    }
    await route.continue()
  })
}

test('theme cycle preserves the current route and updates the root mode @theme', async ({ page }) => {
  await installThemeFixture(page)
  await page.addInitScript(() => window.localStorage.setItem('lancar-admin-theme', 'light'))
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'System Overview' })).toBeVisible()

  const themeToggle = page.getByRole('button', { name: /Theme light/i })
  await themeToggle.click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark')
  await expect.poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark'))).toBe(true)

  await page.getByRole('button', { name: /Theme dark/i }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('system')
})

test('App Experience contrast preview exposes Light/Dark/System state @theme', async ({ page }) => {
  await installThemeFixture(page)
  await page.goto('/app-experience/design-tokens', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /Design Tokens · App Experience/ })).toBeVisible()

  const previewModes = page.getByRole('group', { name: 'Preview color mode' })
  await expect(previewModes.getByRole('button', { name: 'System', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await previewModes.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(previewModes.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(previewModes.getByRole('button', { name: 'System', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('sidebar active state keeps icon/text contrast and visible focus in both themes @theme', async ({ page }) => {
  await installThemeFixture(page)
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  const dashboardLink = page.getByRole('link', { name: 'Dashboard' })

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((selectedTheme) => window.localStorage.setItem('lancar-admin-theme', selectedTheme), theme)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(dashboardLink).toHaveAttribute('aria-current', 'page')

    const colors = await dashboardLink.evaluate((element) => {
      const surface = element.firstElementChild ?? element
      const style = getComputedStyle(surface)
      const icon = surface.querySelector('svg')
      return {
        background: style.backgroundColor,
        text: style.color,
        icon: icon ? getComputedStyle(icon).color : '',
      }
    })
    expect(colors.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(colors.icon).toBe(colors.text)

    await dashboardLink.focus()
    await expect.poll(() => dashboardLink.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px')
  }
})

test('sidebar keeps service and finance concepts on canonical contextual icons @a11y', async ({ page }) => {
  await installThemeFixture(page)
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  const iconMarkup = (label: string) => page.getByRole('link', { name: label, exact: true }).locator('svg').evaluate((icon) => icon.innerHTML)
  await expect(page.getByRole('link', { name: 'Disputes', exact: true }).locator('svg')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByRole('link', { name: 'Merchant Performance', exact: true }).locator('svg')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByRole('link', { name: 'Merchant Escrow', exact: true }).locator('svg')).toHaveAttribute('aria-hidden', 'true')

  expect(await iconMarkup('Disputes')).not.toBe(await iconMarkup('Exception Queue'))
  expect(await iconMarkup('Merchant Performance')).not.toBe(await iconMarkup('Merchants'))
  expect(await iconMarkup('Merchant Escrow')).not.toBe(await iconMarkup('Finance & Payouts'))
})

test('notification history is keyboard-operable and keeps its visible message name @a11y', async ({ page }) => {
  await installThemeFixture(page, {
    notifications: [{
      id: 'notification-1',
      title: 'Dispute membutuhkan review',
      body: 'Order ORDER-1 memiliki pesan baru.',
      type: 'dispute_chat',
      is_read: false,
      created_at: '2026-09-10T00:00:00.000Z',
    }],
  })
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: 'Notifications' }).click()
  const notification = page.getByRole('button', { name: /Dispute membutuhkan review.*Order ORDER-1/ })
  await expect(notification).toBeVisible()
  await notification.focus()
  await expect(notification).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(notification).toBeVisible()
})

test('theme switching preserves App Experience draft field and route @theme', async ({ page }) => {
  await installThemeFixture(page)
  await page.goto('/app-experience/design-tokens', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /Design Tokens · App Experience/ })).toBeVisible()

  const accent = page.getByLabel('Campaign accent')
  await expect(accent).toBeEnabled()
  await accent.selectOption('campaign_blue')
  await expect(accent).toHaveValue('campaign_blue')

  await page.getByRole('button', { name: /Theme system/i }).click()
  await expect(page).toHaveURL(/\/app-experience\/design-tokens$/)
  await expect(accent).toHaveValue('campaign_blue')
})

test('orders table keeps dense states readable across themes @theme', async ({ page }) => {
  await installThemeFixture(page)
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('lancar-admin-theme')) window.localStorage.setItem('lancar-admin-theme', 'light')
  })
  await page.goto('/orders', { waitUntil: 'domcontentloaded' })

  const table = page.getByRole('table', { name: 'Active orders' })
  const header = table.locator('thead tr')
  await expect(table).toBeVisible()
  await expect(page.getByRole('button', { name: 'Orders page 1' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Previous orders page' })).toBeDisabled()

  const headerBackground = () => header.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(await headerBackground()).not.toBe('rgba(0, 0, 0, 0)')

  const paymentFilter = page.getByLabel('Filter payment state')
  await paymentFilter.selectOption('paid')
  await expect(paymentFilter).toHaveValue('paid')

  await page.getByRole('button', { name: /Theme light/i }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(paymentFilter).toHaveValue('paid')
  expect(await headerBackground()).not.toBe('rgba(0, 0, 0, 0)')

  await page.getByRole('button', { name: 'Next orders page' }).click()
  await expect(page.getByText('ORDER-11')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Orders page 2' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Previous orders page' })).toBeEnabled()
  await expect(page.getByLabel('Order status: Dalam perjalanan')).toBeVisible()
})

test('orders table exposes header semantics, deliberate overflow and keyboard row activation @a11y', async ({ page }) => {
  await installThemeFixture(page)
  await page.goto('/orders', { waitUntil: 'domcontentloaded' })

  const table = page.getByRole('table', { name: 'Active orders' })
  const wrapper = table.locator('..')
  await expect(table.locator('thead th')).toHaveCount(5)
  await expect(table.locator('thead th').first()).toHaveAttribute('scope', 'col')
  await expect(wrapper).toHaveCSS('overflow-x', 'auto')

  const firstRow = table.locator('tbody tr').first()
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((selectedTheme) => window.localStorage.setItem('lancar-admin-theme', selectedTheme), theme)
    await page.reload({ waitUntil: 'domcontentloaded' })
    const themedTable = page.getByRole('table', { name: 'Active orders' })
    const themedWrapper = themedTable.locator('..')
    const themedRow = themedTable.locator('tbody tr').first()
    await expect(themedWrapper).toHaveCSS('overflow-x', 'auto')
    const restingBorder = await themedRow.evaluate((element) => getComputedStyle(element).borderLeftColor)
    await themedRow.hover()
    await expect.poll(() => themedRow.evaluate((element) => getComputedStyle(element).borderLeftColor)).not.toBe(restingBorder)
    await themedRow.focus()
    await expect.poll(() => themedRow.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px')
    await page.keyboard.press('Enter')
    await expect(themedRow).toHaveAttribute('aria-selected', 'true')
    await expect(themedRow).toHaveCSS('border-left-width', '2px')
    await page.keyboard.press('Escape')
    await expect(themedRow).toHaveAttribute('aria-selected', 'false')
  }

  await page.evaluate(() => window.localStorage.setItem('lancar-admin-theme', 'light'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  const refreshedTable = page.getByRole('table', { name: 'Active orders' })
  const refreshedRow = refreshedTable.locator('tbody tr').first()
  await refreshedRow.focus()
  await expect(refreshedRow).toBeFocused()
  await expect.poll(() => refreshedRow.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px')
  await page.keyboard.press('Enter')
  const orderDialog = page.getByRole('dialog', { name: /order/i })
  const orderFocusTrap = orderDialog.locator('..')
  await expect(orderDialog).toBeVisible()
  await expect.poll(() => orderFocusTrap.evaluate((trap) => trap.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => orderFocusTrap.evaluate((trap) => trap.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Tab')
  await expect.poll(() => orderFocusTrap.evaluate((trap) => trap.contains(document.activeElement))).toBe(true)
  await expect(refreshedRow).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(orderDialog).not.toBeVisible()
  await expect(refreshedRow).toHaveAttribute('aria-selected', 'false')
  await expect(refreshedRow).toBeFocused()
})

test('analytics map zoom controls are keyboard reachable and announce the updated level @a11y', async ({ page }) => {
  await installThemeFixture(page)
  await page.goto('/analytics', { waitUntil: 'domcontentloaded' })

  const controls = page.getByRole('group', { name: 'Kontrol zoom demand density' })
  const zoomIn = controls.getByRole('button', { name: 'Zoom in map' })
  const zoomStatus = controls.getByRole('status')
  await expect(zoomIn).toBeVisible()
  await expect(zoomIn).toBeEnabled()
  await expect(zoomStatus).toHaveText('Zoom peta: level 12')

  await zoomIn.focus()
  await expect(zoomIn).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(zoomStatus).toHaveText('Zoom peta: level 13')
})

test('operational status surfaces expose readable labels and supplemental icons @a11y', async ({ page }) => {
  await installThemeFixture(page)
  await page.route('**/*', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname.endsWith('/admin/market-configs') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            market_code: 'ID-JK', country_code: 'ID', region_code: 'ID-JK', currency_code: 'IDR',
            currency_minor_unit: 0, default_locale: 'id-ID', timezone: 'Asia/Jakarta',
            measurement_system: 'metric', launch_state: 'active', config_version: 3,
            effective_from: '2026-09-10T00:00:00.000Z', rollback_version: null,
            approval_status: 'approved', approval_reason: null, updated_at: '2026-09-10T00:00:00.000Z',
          }],
        }),
      })
      return
    }
    if (/\/admin\/market-configs\/[^/]+$/.test(pathname) && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            config: {
              market_code: 'ID-JK', country_code: 'ID', region_code: 'ID-JK', currency_code: 'IDR',
              currency_minor_unit: 0, default_locale: 'id-ID', timezone: 'Asia/Jakarta',
              measurement_system: 'metric', phone_rules: {}, address_rules: {}, payment_methods: [],
              logistics_providers: [], map_providers: [], tax_policy_refs: [], insurance_policy_refs: [],
              service_hours: {}, launch_state: 'active', config_version: 3,
              effective_from: '2026-09-10T00:00:00.000Z', rollback_version: null,
              approval_status: 'approved', approval_reason: null, updated_at: '2026-09-10T00:00:00.000Z',
            },
            service_availability: [
              { city_code: 'jakarta', service_code: 'tembus_instant', is_enabled: true, service_hours: {}, policy_refs: {} },
              { city_code: 'jakarta', service_code: 'food_delivery', is_enabled: false, service_hours: {}, policy_refs: {} },
            ],
            legal_documents: [{
              document_type: 'terms', locale: 'id-ID', version: '3.0', document_uri: '/terms',
              status: 'approved', effective_from: '2026-09-10T00:00:00.000Z',
            }],
            readiness: { is_ready: false, reason_codes: ['missing_provider'] },
          },
        }),
      })
      return
    }
    if (pathname.endsWith('/admin/courier-retention') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ couriers: [{
          courier_profile_id: 'retention-1', full_name: 'Retention Fixture Courier',
          email: 'retention@example.test', user_status: 'approved', completed_orders: 12,
          cancelled_orders: 1, training_count: 2, retraining_id: 'retraining-1', retraining_status: 'in_progress',
        }] }),
      })
      return
    }
    if (pathname.endsWith('/admin/driver-wallet-holds') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ drivers: [{
          wallet_id: 'wallet-1', courier_id: 'courier-1', balance: 100000, hold_balance: 20000,
          hold_minimum_required: 10000, wallet_status: 'active', driver_name: 'Wallet Fixture Driver',
          phone: '081234567890', email: 'wallet@example.test', vehicle_type: 'motor',
          penalties: [{ id: 'penalty-1', order_id: 'ORDER-PENALTY-1', violation_type: 'silent_cancel', amount_deducted: 15000, appeal_status: 'submitted', created_at: '2026-09-10T00:00:00.000Z' }],
        }] }),
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/market-configuration', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Market readiness status: Belum ready: missing_provider')).toBeVisible()
  await expect(page.getByLabel('Service availability status: Aktif')).toBeVisible()
  await expect(page.getByLabel('Service availability status: Dinonaktifkan')).toBeVisible()
  await expect(page.getByLabel('Legal document status: Disetujui')).toBeVisible()

  await page.goto('/courier-retention', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Retraining status: Berjalan')).toBeVisible()

  await page.goto('/driver-wallet-holds', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Wallet hold status: Hold aktif')).toBeVisible()
  await expect(page.getByLabel('Penalty appeal status: Diajukan')).toBeVisible()
})
