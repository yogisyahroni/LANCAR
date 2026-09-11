import { expect, test, type Page } from '@playwright/test'

async function installCustomerSessionFixture(page: Page, options: { orders?: Array<Record<string, unknown>>, detailOrder?: Record<string, unknown>, carrierEvents?: Array<Record<string, unknown>>, disputes?: Array<Record<string, unknown>> } = {}) {
  await page.context().addCookies([
    { name: 'tembus_web_session', value: 'theme-customer-fixture', domain: 'localhost', path: '/' },
  ])
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = request.url()
    if (url.includes('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'theme-customer-fixture', name: 'Theme Customer', email: 'theme@example.test' } }),
      })
      return
    }
    if (url.includes('/auth/web/notifications')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) })
      return
    }
    if (/\/auth\/web\/orders\/[^/]+$/.test(new URL(url).pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, order: options.detailOrder, carrier_events: options.carrierEvents ?? [] }) })
      return
    }
    if (url.includes('/auth/web/disputes')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: options.disputes ?? [] }) })
      return
    }
    if (url.includes('/auth/web/orders')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orders: options.orders ?? [] }) })
      return
    }
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
      return
    }
    await route.continue()
  })
}

test('Customer theme bootstrap avoids hydration warnings and persists the selected mode @theme', async ({ page }) => {
  const hydrationMessages: string[] = []
  page.on('console', (message) => {
    if (/hydration|did not match|server HTML/i.test(message.text())) hydrationMessages.push(message.text())
  })
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('tembus-theme')) window.localStorage.setItem('tembus-theme', 'light')
  })
  await page.goto('/login', { waitUntil: 'networkidle' })
  await expect(page.locator('body')).toBeVisible()
  await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('light')

  await page.evaluate(() => window.localStorage.setItem('tembus-theme', 'dark'))
  await page.reload({ waitUntil: 'networkidle' })
  await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark')
  expect(hydrationMessages).toEqual([])
})

test('authenticated Customer theme switch preserves portal route and reload persistence @theme', async ({ page }) => {
  const hydrationMessages: string[] = []
  page.on('console', (message) => {
    if (/hydration|did not match|server HTML/i.test(message.text())) hydrationMessages.push(message.text())
  })
  await installCustomerSessionFixture(page)
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('tembus-theme')) window.localStorage.setItem('tembus-theme', 'light')
  })
  await page.goto('/dashboard', { waitUntil: 'networkidle' })
  await expect(page.locator('#main-content')).toBeVisible()
  await expect(page.getByRole('button', { name: /Ganti tema|Toggle theme/i })).toBeVisible()

  await page.getByRole('button', { name: /Ganti tema|Toggle theme/i }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(hydrationMessages).toEqual([])
})

test('Customer order status exposes readable label and supplemental icon semantics @a11y', async ({ page }) => {
  await installCustomerSessionFixture(page, {
    orders: [{
      id: 'ORDER-STATUS-1',
      order_number: 'ORD-STATUS-1',
      pickup_address: 'Jakarta',
      dropoff_address: 'Bekasi',
      recipient_name: 'Status Customer',
      model: 'p2p',
      service_category: 'package_on_demand',
      status: 'in_transit',
      payment_status: 'paid',
      distance_km: 12,
      total_price_idr: 12500,
      created_at: '2026-09-10T00:00:00.000Z',
    }],
  })
  await page.goto('/orders', { waitUntil: 'domcontentloaded' })

  const status = page.getByLabel('Status order: Dalam perjalanan')
  await expect(status).toBeVisible()
  await expect(status).toContainText('Dalam perjalanan')
  await expect(status.locator('svg')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByText('Lunas')).toBeVisible()
})

test('Customer dashboard uses the canonical service icon and visible label @a11y @iconography', async ({ page }) => {
  await installCustomerSessionFixture(page, {
    orders: [{
      id: 'ORDER-FOOD-1',
      order_number: 'ORD-FOOD-1',
      pickup_address: 'Merchant Fixture',
      dropoff_address: 'Customer Fixture',
      recipient_name: 'Food Customer',
      model: 'food',
      service_category: 'food',
      status: 'in_transit',
      payment_status: 'paid',
      distance_km: 3,
      total_price_idr: 22000,
      created_at: '2026-09-10T00:00:00.000Z',
    }],
  })
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  const service = page.getByLabel('Layanan Food delivery')
  await expect(service).toBeVisible()
  await expect(service).toContainText('Food delivery')
  await expect(service.locator('svg').first()).toHaveAttribute('aria-hidden', 'true')
})

test('Customer service badges keep canonical mappings across dashboard, history and detail @a11y @iconography', async ({ page }) => {
  const orders = [
    {
      id: 'ORDER-SERVICE-INSTANT', order_number: 'ORD-SERVICE-INSTANT', pickup_address: 'Jakarta', dropoff_address: 'Bekasi',
      recipient_name: 'Instant Customer', model: 'p2p', service_category: 'package_on_demand', status: 'in_transit', payment_status: 'paid',
      distance_km: 12, total_price_idr: 12500, created_at: '2026-09-10T00:00:00.000Z',
    },
    {
      id: 'ORDER-SERVICE-FOOD', order_number: 'ORD-SERVICE-FOOD', pickup_address: 'Merchant', dropoff_address: 'Jakarta',
      recipient_name: 'Food Customer', model: 'food', service_category: 'food', status: 'in_transit', payment_status: 'paid',
      distance_km: 3, total_price_idr: 22000, created_at: '2026-09-10T00:01:00.000Z',
    },
    {
      id: 'ORDER-SERVICE-AGGREGATOR', order_number: 'ORD-SERVICE-AGGREGATOR', pickup_address: 'Jakarta', dropoff_address: 'Bandung',
      recipient_name: 'Aggregator Customer', model: 'hub_and_spoke', service_category: 'aggregator', logistics_provider: 'JNE',
      logistics_service_type: 'REG', status: 'in_transit', payment_status: 'paid', distance_km: 150, total_price_idr: 85000,
      created_at: '2026-09-10T00:02:00.000Z', awb_number: 'JNE-A11Y-1',
    },
    {
      id: 'ORDER-SERVICE-TOWING', order_number: 'ORD-SERVICE-TOWING', pickup_address: 'Jakarta', dropoff_address: 'Depok',
      recipient_name: 'Towing Customer', model: 'towing', service_category: 'towing', status: 'in_transit', payment_status: 'paid',
      distance_km: 18, total_price_idr: 120000, created_at: '2026-09-10T00:03:00.000Z',
    },
  ]
  const expected = [
    ['Layanan Paket Instan', 'instant', 'ORD-SERVICE-INSTANT'],
    ['Layanan Food delivery', 'food', 'ORD-SERVICE-FOOD'],
    ['Layanan Ekspedisi Antar-Kota', 'aggregator', 'ORD-SERVICE-AGGREGATOR'],
    ['Layanan Towing', 'service', 'ORD-SERVICE-TOWING'],
  ] as const

  await installCustomerSessionFixture(page, { orders })
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  for (const [label, kind] of expected) {
    const badge = page.getByLabel(label)
    await expect(badge).toHaveAttribute('data-service-kind', kind)
    await expect(badge.locator('svg').first()).toHaveAttribute('aria-hidden', 'true')
  }

  await page.goto('/orders', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-service-badge="true"]')).toHaveCount(4)
  for (const [label, kind] of expected) {
    const badge = page.getByLabel(label)
    await expect(badge).toHaveAttribute('data-service-kind', kind)
  }

  await installCustomerSessionFixture(page, { detailOrder: orders[2], carrierEvents: [] })
  await page.goto('/orders/ORDER-SERVICE-AGGREGATOR', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Layanan Ekspedisi Antar-Kota')).toHaveAttribute('data-service-kind', 'aggregator')
})

test('Customer orders table exposes selected-row semantics and deliberate overflow in both themes @a11y', async ({ page }) => {
  await installCustomerSessionFixture(page, {
    orders: [{
      id: 'ORDER-SELECT-1',
      order_number: 'ORD-SELECT-1',
      pickup_address: 'Jakarta',
      dropoff_address: 'Bekasi',
      recipient_name: 'Selected Customer',
      model: 'p2p',
      service_category: 'package_on_demand',
      status: 'in_transit',
      payment_status: 'paid',
      distance_km: 12,
      total_price_idr: 12500,
      created_at: '2026-09-10T00:00:00.000Z',
    }],
  })

  await page.goto('/orders', { waitUntil: 'domcontentloaded' })
  const table = page.getByRole('table', { name: 'Daftar order' })
  const tableWrapper = table.locator('..')
  const row = table.locator('tbody tr').first()
  const checkbox = page.getByLabel('Pilih order ORD-SELECT-1')

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((selectedTheme) => window.localStorage.setItem('tembus-theme', selectedTheme), theme)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(tableWrapper).toHaveCSS('overflow-x', 'auto')
    await expect(page.getByRole('link', { name: 'Lihat detail order ORD-SELECT-1' })).toBeVisible()

    await page.mouse.move(0, 0)
    const restingBorder = await row.evaluate((element) => getComputedStyle(element).borderLeftColor)
    await row.hover()
    await expect.poll(() => row.evaluate((element) => getComputedStyle(element).borderLeftColor)).not.toBe(restingBorder)

    await checkbox.focus()
    await expect.poll(() => row.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none')
    await checkbox.check()
    await expect(checkbox).toBeChecked()
    await expect(row).toHaveAttribute('aria-selected', 'true')
    await expect(row).toHaveCSS('border-left-width', '2px')
    await expect(page.getByText('1 order dipilih')).toBeVisible()
  }
})

test('Customer receipt status keeps the same readable status contract @a11y', async ({ page }) => {
  await installCustomerSessionFixture(page, {
    detailOrder: {
      id: 'ORDER-RECEIPT-1',
      order_number: 'ORD-RECEIPT-1',
      pickup_address: 'Jakarta',
      dropoff_address: 'Depok',
      recipient_name: 'Receipt Customer',
      model: 'p2p',
      status: 'completed',
      payment_status: 'paid',
      distance_km: 18,
      total_price_idr: 18000,
      created_at: '2026-09-10T00:00:00.000Z',
      carrier_events: [{
        id: 'CARRIER-RECEIPT-1',
        provider: 'Fixture Carrier',
        canonical_status: 'in_transit',
        provider_status: 'in_transit',
        received_at: '2026-09-10T01:00:00.000Z',
      }],
    },
  })
  await page.goto('/resi/ORDER-RECEIPT-1', { waitUntil: 'domcontentloaded' })

  const statuses = page.getByLabel('Status order: Selesai')
  await expect(statuses).toHaveCount(2)
  for (const status of await statuses.all()) {
    await expect(status).toBeVisible()
    await expect(status.locator('svg')).toHaveAttribute('aria-hidden', 'true')
  }
  const carrierStatus = page.getByLabel('Status carrier: IN TRANSIT')
  await expect(carrierStatus).toBeVisible()
  await expect(carrierStatus.locator('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('Customer order detail carrier status exposes label and icon semantics @a11y', async ({ page }) => {
  await installCustomerSessionFixture(page, {
    detailOrder: {
      id: 'ORDER-CARRIER-1',
      order_number: 'ORD-CARRIER-1',
      pickup_address: 'Jakarta',
      dropoff_address: 'Bandung',
      recipient_name: 'Carrier Customer',
      model: 'aggregator',
      service_category: 'aggregator',
      status: 'in_transit',
      payment_status: 'paid',
      distance_km: 150,
      total_price_idr: 85000,
      created_at: '2026-09-10T00:00:00.000Z',
    },
    carrierEvents: [{
      id: 'CARRIER-ORDER-1',
      provider: 'Fixture Carrier',
      canonical_status: 'in_transit',
      provider_status: 'in_transit',
      received_at: '2026-09-10T01:00:00.000Z',
    }],
  })
  await page.goto('/orders/ORDER-CARRIER-1', { waitUntil: 'domcontentloaded' })

  const carrierStatus = page.getByLabel('Status carrier: IN TRANSIT')
  await expect(carrierStatus).toBeVisible()
  await expect(carrierStatus).toContainText('IN TRANSIT')
  await expect(carrierStatus.locator('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('Customer dispute status exposes text and supplemental icon semantics @a11y', async ({ page }) => {
  await installCustomerSessionFixture(page, {
    disputes: [{
      id: 'DISPUTE-1',
      order_number: 'ORD-DISPUTE-1',
      category: 'Paket belum diterima',
      description: 'Customer membutuhkan bantuan.',
      status: 'investigating',
      created_at: '2026-09-10T00:00:00.000Z',
      updated_at: '2026-09-10T00:00:00.000Z',
    }],
  })
  await page.goto('/disputes', { waitUntil: 'domcontentloaded' })

  const status = page.getByLabel('Status dispute: Sedang ditinjau')
  await expect(status).toBeVisible()
  await expect(status.locator('svg')).toHaveAttribute('aria-hidden', 'true')
})
