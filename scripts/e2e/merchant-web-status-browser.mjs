import { chromium } from '../../frontend/node_modules/playwright/index.mjs'

const [baseUrl = 'http://localhost:3004', email, phone] = process.argv.slice(2)

if (!email || !phone) {
  throw new Error('Usage: node merchant-web-status-browser.mjs <baseUrl> <email> <phone>')
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const statusUrl = '**/auth/merchant/registration-status**'

try {
  await page.goto(`${baseUrl}/status`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="tel"]').fill(phone)

  await page.route(statusUrl, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'ERR_STATUS_LOOKUP_UNAVAILABLE' }),
    })
  })
  await page.getByRole('button', { name: 'Periksa Status' }).click()
  await page.getByText('Status sedang tidak dapat diperiksa. Coba lagi beberapa saat.').waitFor()
  await page.unroute(statusUrl)

  const statusResponse = page.waitForResponse((response) => response.url().includes('/auth/merchant/registration-status'))
  await page.getByRole('button', { name: 'Periksa Status' }).click()
  const response = await statusResponse
  if (!response.ok()) throw new Error(`Expected real status response, got ${response.status()}`)
  await page.getByText('Akses ditangguhkan').waitFor()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="tel"]').fill(phone)
  await page.getByRole('button', { name: 'Periksa Status' }).click()
  await page.getByText('Akses ditangguhkan').waitFor()

  console.log(JSON.stringify({ status: 'PASS', browser: 'chromium', checks: ['error_retry', 'status_read', 'refresh'] }))
} finally {
  await browser.close()
}
