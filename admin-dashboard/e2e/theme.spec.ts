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
  await firstRow.focus()
  await expect(firstRow).toBeFocused()
  await expect.poll(() => firstRow.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px')
  await page.keyboard.press('Enter')
  const orderDialog = page.getByRole('dialog', { name: /order/i })
  const orderFocusTrap = orderDialog.locator('..')
  await expect(orderDialog).toBeVisible()
  await expect.poll(() => orderFocusTrap.evaluate((trap) => trap.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => orderFocusTrap.evaluate((trap) => trap.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Tab')
  await expect.poll(() => orderFocusTrap.evaluate((trap) => trap.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(orderDialog).not.toBeVisible()
  await expect(firstRow).toBeFocused()
})
