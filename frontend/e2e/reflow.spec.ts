import { expect, test, type Page } from '@playwright/test';

const PUBLIC_ROUTES = [
  { route: '/', primary: 'h1' },
  { route: '/login', primary: 'input[name="email"]' },
  { route: '/daftar', primary: 'h1' },
  { route: '/cek-resi', primary: 'button[type="submit"]' },
] as const;

const AUTHENTICATED_ROUTES = [
  '/dashboard',
  '/orders',
  '/orders/new',
  '/orders/new/food',
  '/orders/new/ondemand',
  '/orders/new/aggregator',
  '/resi',
  '/payment-links',
  '/profil',
  '/alamat',
  '/disputes',
  '/notifikasi',
] as const;

const FULL_CUSTOMER_ROUTE_INVENTORY = [
  '/',
  '/login',
  '/daftar',
  '/cek-resi',
  '/track/invalid',
  '/pay/fixture-payment',
  '/location-requests/fixture-token',
  '/dashboard',
  '/orders',
  '/orders/new',
  '/orders/new/food',
  '/orders/new/ondemand',
  '/orders/new/aggregator',
  '/orders/bulk',
  '/orders/fixture-order',
  '/resi',
  '/resi/fixture-resi',
  '/payment-links',
  '/profil',
  '/alamat',
  '/disputes',
  '/notifikasi',
  '/voucher',
  '/products',
  '/laporan',
  '/analytics',
  '/feature-flags',
] as const;

function isPublicCustomerRoute(route: string) {
  return route === '/' || route === '/login' || route === '/daftar' || route === '/cek-resi'
    || route === '/track/invalid' || route.startsWith('/pay/') || route.startsWith('/location-requests/');
}

async function mockCustomerSessionAndApi(page: Page) {
  await page.context().addCookies([
    { name: 'tembus_web_session', value: 'reflow-customer-fixture', domain: 'localhost', path: '/' },
  ]);

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/auth/web/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'reflow-fixture', full_name: 'Reflow Fixture', email: 'reflow@example.test' } }) });
      return;
    }
    if (url.includes('/auth/web/notifications')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
      return;
    }
    if (url.includes('/auth/web/orders')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orders: [] }) });
      return;
    }
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      return;
    }
    await route.continue();
  });
}

async function assertNoUnexpectedHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));

  expect(dimensions.content, `Unexpected horizontal overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function applyTextSpacingOverride(page: Page) {
  await page.addStyleTag({
    content: `
      body * { letter-spacing: 0.12em !important; word-spacing: 0.16em !important; line-height: 1.5 !important; }
      p { margin-bottom: 2em !important; }
    `,
  });
}

test.describe('WCAG 1.4.10 narrow viewport reflow', () => {
  for (const { route, primary } of PUBLIC_ROUTES) {
    test(`${route} keeps content and primary control usable at 320px @reflow`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(route, { waitUntil: 'networkidle' });

      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator(primary).first()).toBeVisible();
      await assertNoUnexpectedHorizontalOverflow(page);

      const primaryBox = await page.locator(primary).first().boundingBox();
      expect(primaryBox).not.toBeNull();
      expect(primaryBox!.x).toBeGreaterThanOrEqual(0);
      expect(primaryBox!.x + primaryBox!.width).toBeLessThanOrEqual(320);
    });
  }
});

test.describe('WCAG 1.4.10 authenticated Customer reflow', () => {
  for (const route of AUTHENTICATED_ROUTES) {
    test(`${route} keeps the portal shell inside 320px @reflow`, async ({ page }) => {
      await mockCustomerSessionAndApi(page);
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(route, { waitUntil: 'networkidle' });

      await expect(page.locator('main')).toBeVisible();
      await assertNoUnexpectedHorizontalOverflow(page);
    });
  }
});

test.describe('WCAG 1.4.10 full Customer route inventory', () => {
  for (const viewport of [{ width: 320, label: '320px' }, { width: 640, label: '200%-equivalent 640px' }] as const) {
    for (const route of FULL_CUSTOMER_ROUTE_INVENTORY) {
      test(`${route} keeps the registered surface inside ${viewport.label} @reflow @inventory`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        if (!isPublicCustomerRoute(route)) await mockCustomerSessionAndApi(page);
        await page.setViewportSize({ width: viewport.width, height: 800 });
        await page.goto(route, { waitUntil: 'networkidle' });

        await expect(page.locator('body')).toBeVisible();
        expect(pageErrors, `Runtime errors on ${route} at ${viewport.label}: ${pageErrors.join('; ')}`).toEqual([]);
        await assertNoUnexpectedHorizontalOverflow(page);
      });
    }
  }
});

test.describe('WCAG 1.4.12 full Customer route inventory', () => {
  for (const route of FULL_CUSTOMER_ROUTE_INVENTORY) {
    test(`${route} survives text-spacing overrides @text-spacing @inventory`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      if (!isPublicCustomerRoute(route)) await mockCustomerSessionAndApi(page);
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(route, { waitUntil: 'networkidle' });
      await applyTextSpacingOverride(page);

      await expect(page.locator('body')).toBeVisible();
      expect(pageErrors, `Runtime errors on ${route} after text-spacing override: ${pageErrors.join('; ')}`).toEqual([]);
      await assertNoUnexpectedHorizontalOverflow(page);
    });
  }
});

test('Customer login survives WCAG 1.4.12 text-spacing override @text-spacing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/login', { waitUntil: 'networkidle' });
  await applyTextSpacingOverride(page);
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await assertNoUnexpectedHorizontalOverflow(page);
});

test('Customer login survives a 200% zoom-equivalent 640px CSS viewport @zoom', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/login', { waitUntil: 'networkidle' });
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await assertNoUnexpectedHorizontalOverflow(page);
});

test('Customer authenticated order surface survives WCAG 1.4.12 text-spacing override @text-spacing', async ({ page }) => {
  await mockCustomerSessionAndApi(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/orders', { waitUntil: 'networkidle' });
  await applyTextSpacingOverride(page);
  await expect(page.locator('main')).toBeVisible();
  await assertNoUnexpectedHorizontalOverflow(page);
});

test('Customer order surface survives a 200% zoom-equivalent 640px CSS viewport @zoom', async ({ page }) => {
  await mockCustomerSessionAndApi(page);
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/orders', { waitUntil: 'networkidle' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoUnexpectedHorizontalOverflow(page);
});
