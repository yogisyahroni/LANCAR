import { expect, test, type Page } from '@playwright/test';

const AUTHENTICATED_ROUTES = [
  '/dashboard',
  '/orders',
  '/risk-reviews',
  '/finance',
  '/payment-links',
  '/app-experience/approval',
  '/app-experience/kill-switches',
] as const;

const FULL_ADMIN_ROUTE_INVENTORY = [
  '/dashboard',
  '/orders',
  '/orders/exceptions',
  '/business-api-requests',
  '/couriers',
  '/courier-performance',
  '/merchant-performance',
  '/driver-wallet-holds',
  '/courier-applications',
  '/merchants',
  '/merchant-staff',
  '/courier-face-verifications',
  '/courier-safety-events',
  '/courier-growth',
  '/courier-market-config',
  '/courier-retention',
  '/risk-reviews',
  '/pricing',
  '/economics',
  '/disputes',
  '/cases',
  '/customers',
  '/hr/jobs',
  '/hr/applications',
  '/news',
  '/analytics',
  '/custom-reports',
  '/campaign-calendar',
  '/finance',
  '/tax-center',
  '/chart-of-accounts',
  '/tariff-engine',
  '/merchant-settlements',
  '/cost-intelligence',
  '/payment-links',
  '/zones',
  '/meeting-points',
  '/warehouse-operations',
  '/vouchers',
  '/promos',
  '/notifications',
  '/broadcasts',
  '/feature-flags',
  '/experiments',
  '/app-experience/overview',
  '/app-experience/home-layout',
  '/app-experience/campaigns',
  '/app-experience/campaign-intro',
  '/app-experience/service-visibility',
  '/app-experience/kill-switches',
  '/app-experience/targeting',
  '/app-experience/assets',
  '/app-experience/deep-links',
  '/app-experience/design-tokens',
  '/app-experience/preview',
  '/app-experience/approval',
  '/app-experience/revisions',
  '/app-experience/feature-flags',
  '/app-experience/scheduling',
  '/app-experience/version-policy',
  '/app-experience/analytics',
  '/localized-content',
  '/mobile-release-policies',
  '/audit-logs',
  '/agreements',
  '/settings',
  '/resi-templates',
  '/logistics-discount',
  '/maps-runtime',
  '/market-configuration',
] as const;

async function mockAdminSessionAndApi(page: Page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const requestUrl = new URL(url);

    // Several Admin pages consume collection endpoints directly. Keep the
    // fixture shape faithful so reflow exercises the real empty-state render,
    // rather than hiding a runtime exception behind the shell.
    if ([
      '/admin/hr/jobs',
      '/admin/hr/applications',
      '/admin/feature-flags',
      '/admin/pricing',
      '/admin/analytics/reports',
      '/admin/audit-logs',
      '/admin/logistics-providers',
      '/admin/resi-templates',
      '/admin/vouchers',
      '/admin/zones',
      '/admin/warehouse/bags',
      '/admin/notifications/templates',
      '/admin/settings',
      '/admin/admins',
    ].some((endpoint) => requestUrl.pathname.endsWith(endpoint))) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/admin/health')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ components: [] }),
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/admin/maps-provider-config')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/admin/merchants/performance')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ merchants: [] }),
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/admin/driver-wallet-holds')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ drivers: [] }),
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/admin/delivery-services')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ services: [] }),
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/admin/experience/observability')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            breakdown: [],
            reliability_total: 0,
            reliability_failures: 0,
            reliability_failure_rate_pct: 0,
            guardrail_policy: { min_events: 20, max_failure_rate_pct: 10 },
          },
        }),
      });
      return;
    }

    if (url.includes('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'reflow-fixture',
            name: 'Reflow Fixture',
            email: 'reflow@example.test',
            role: 'super_admin',
            permissions: ['experience.read', 'experience.draft.write', 'experience.approve'],
          },
        }),
      });
      return;
    }

    if (url.includes('/admin/dashboard/events')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
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

test('Admin login keeps the form and primary action usable at 320px @reflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/login', { waitUntil: 'networkidle' });

  await expect(page.locator('input[name="email"]')).toBeVisible();
  const submit = page.getByRole('button', { name: /sign in to console/i });
  await expect(submit).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content, `Unexpected horizontal overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);

  const submitBox = await submit.boundingBox();
  expect(submitBox).not.toBeNull();
  if (!submitBox) throw new Error('Admin submit button has no layout box');
  expect(submitBox.x).toBeGreaterThanOrEqual(0);
  expect(submitBox.x + submitBox.width).toBeLessThanOrEqual(320);
});

test('Admin login keeps the form usable at a 200% zoom-equivalent 640px CSS viewport @zoom', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/login', { waitUntil: 'networkidle' });
  await expect(page.locator('input[name="email"]')).toBeVisible();
  const submit = page.getByRole('button', { name: /sign in to console/i });
  await expect(submit).toBeVisible();
  await assertNoUnexpectedHorizontalOverflow(page);
  const submitBox = await submit.boundingBox();
  expect(submitBox).not.toBeNull();
  if (!submitBox) throw new Error('Admin submit button has no layout box at 200% zoom equivalent');
  expect(submitBox.x + submitBox.width).toBeLessThanOrEqual(640);
});

test.describe('Admin authenticated reflow', () => {
  for (const route of AUTHENTICATED_ROUTES) {
    test(`${route} keeps the main surface usable at 320px @reflow`, async ({ page }) => {
      await mockAdminSessionAndApi(page);
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(route, { waitUntil: 'networkidle' });

      await expect(page.locator('#main-content')).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `Unexpected horizontal overflow on ${route}: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
    });
  }
});

test.describe('Admin full registered route inventory reflow', () => {
  for (const viewport of [{ width: 320, label: '320px' }, { width: 640, label: '200%-equivalent 640px' }] as const) {
    for (const route of FULL_ADMIN_ROUTE_INVENTORY) {
      test(`${route} keeps the registered surface inside ${viewport.label} @reflow @inventory`, async ({ page }) => {
        const pageErrors: string[] = [];
        const unexpectedConsoleErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error' && !/WebSocket connection error|Authentication error: Token missing/.test(message.text())) {
            unexpectedConsoleErrors.push(message.text());
          }
        });
        await mockAdminSessionAndApi(page);
        await page.setViewportSize({ width: viewport.width, height: 800 });
        await page.goto(route, { waitUntil: 'networkidle' });

        await expect(page.locator('#main-content')).toBeVisible();
        expect(pageErrors, `Runtime errors on ${route} at ${viewport.label}: ${pageErrors.join('; ')}`).toEqual([]);
        expect(unexpectedConsoleErrors, `Unexpected console errors on ${route} at ${viewport.label}: ${unexpectedConsoleErrors.join('; ')}`).toEqual([]);
        await assertNoUnexpectedHorizontalOverflow(page);
      });
    }
  }
});

test.describe('WCAG 1.4.12 full Admin route inventory', () => {
  for (const route of FULL_ADMIN_ROUTE_INVENTORY) {
    test(`${route} survives text-spacing overrides @text-spacing @inventory`, async ({ page }) => {
      const pageErrors: string[] = [];
      const unexpectedConsoleErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && !/WebSocket connection error|Authentication error: Token missing/.test(message.text())) {
          unexpectedConsoleErrors.push(message.text());
        }
      });
      await mockAdminSessionAndApi(page);
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(route, { waitUntil: 'networkidle' });
      await applyTextSpacingOverride(page);

      await expect(page.locator('#main-content')).toBeVisible();
      expect(pageErrors, `Runtime errors on ${route} after text-spacing override: ${pageErrors.join('; ')}`).toEqual([]);
      expect(unexpectedConsoleErrors, `Unexpected console errors on ${route} after text-spacing override: ${unexpectedConsoleErrors.join('; ')}`).toEqual([]);
      await assertNoUnexpectedHorizontalOverflow(page);
    });
  }
});

test('Admin dashboard survives WCAG 1.4.12 text-spacing override @text-spacing', async ({ page }) => {
  await mockAdminSessionAndApi(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  await applyTextSpacingOverride(page);
  await expect(page.locator('#main-content')).toBeVisible();
  await assertNoUnexpectedHorizontalOverflow(page);
});

test('Admin approval surface survives a 200% zoom-equivalent 640px CSS viewport @zoom', async ({ page }) => {
  await mockAdminSessionAndApi(page);
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/app-experience/approval', { waitUntil: 'networkidle' });
  await expect(page.locator('#main-content')).toBeVisible();
  await assertNoUnexpectedHorizontalOverflow(page);
});
