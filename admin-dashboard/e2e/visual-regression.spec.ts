import { expect, test, type Page } from '@playwright/test'

const THEME_CASES = [
  { mode: 'light', colorScheme: 'light' },
  { mode: 'dark', colorScheme: 'dark' },
] as const

async function installVisualFixture(page: Page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'visual-fixture',
            name: 'Visual Fixture',
            role: 'super_admin',
            permissions: ['experience.read'],
          },
        }),
      })
      return
    }
    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      const path = new URL(url).pathname
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

test.describe('Admin visual theme regression @visual', () => {
  for (const themeCase of THEME_CASES) {
    test(`login remains readable in ${themeCase.mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: themeCase.colorScheme })
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem('lancar-admin-theme', selectedTheme)
      }, themeCase.mode)
      await page.goto('/login', { waitUntil: 'networkidle' })
      await page.waitForTimeout(750)
      await expect(page).toHaveScreenshot(`admin-login-${themeCase.mode}.png`, {
        fullPage: true,
        animations: 'disabled',
      })
    })
  }

  test('empty operational dashboard remains readable in light and dark themes', async ({ page }) => {
    await installVisualFixture(page)
    for (const theme of ['light', 'dark'] as const) {
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem('lancar-admin-theme', selectedTheme)
      }, theme)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await expect(page.getByRole('heading', { name: 'System Overview' })).toBeVisible()
      await expect(page).toHaveScreenshot(`admin-dashboard-empty-${theme}.png`, {
        fullPage: true,
        animations: 'disabled',
        mask: [page.locator('.leaflet-container')],
      })
    }
  })
})
