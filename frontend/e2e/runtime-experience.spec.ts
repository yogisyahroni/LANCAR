import { expect, test, type Page, type Route } from '@playwright/test';

type RuntimeManifest = {
  manifest_id: string;
  revision: number;
  market_code: string;
  locale: string;
  surface: 'customer_web';
  sections: Array<{ id: string; component: string; properties: Record<string, unknown> }>;
  checksum: string;
};

const activeOrder = {
  id: 'order-runtime-1',
  order_number: 'LCR-RUNTIME-001',
  pickup_address: 'Monas',
  dropoff_address: 'Kuningan',
  recipient_name: 'Runtime Test',
  model: 'instan',
  status: 'delivering',
  distance_km: 4.2,
  total_price_idr: 18000,
  created_at: '2026-09-09T00:00:00.000Z',
};

const manifestFor = (revision: number, title: string): RuntimeManifest => ({
  manifest_id: 'runtime-manifest-1',
  revision,
  market_code: 'id-jk',
  locale: 'id-ID',
  surface: 'customer_web',
  checksum: revision.toString(16).padStart(64, '0'),
  sections: [{
    id: 'runtime-notice',
    component: 'notice',
    properties: { title, body: 'Presentation-only runtime content.' },
  }],
});

const installApiContract = async (
  page: Page,
  manifest: RuntimeManifest | null,
): Promise<void> => {
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/web/me') {
      await route.fulfill({ json: { success: true, user: { id: 'runtime-user', name: 'Runtime User' } } });
      return;
    }
    if (path === '/auth/web/orders') {
      await route.fulfill({ json: { success: true, orders: [activeOrder] } });
      return;
    }
    if (path === '/auth/web/dashboard/stats') {
      await route.fulfill({ json: { success: true, data: {
        active_orders: 1,
        completed_orders_month: 0,
        cancelled_orders_month: 0,
        total_spend_month: 0,
        previous_spend_month: 0,
        spend_growth_percent: 0,
        weekly_activity: [],
      } } });
      return;
    }
    if (path === '/auth/web/notifications') {
      await route.fulfill({ json: { success: true, notifications: [] } });
      return;
    }
    if (path === '/auth/web/feature-flags') {
      await route.fulfill({ json: { success: true, data: { flags: {} } } });
      return;
    }
    if (path === '/experience/manifest') {
      if (!manifest) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false }) });
      } else {
        await route.fulfill({ json: { success: true, data: manifest }, headers: { ETag: `"${manifest.checksum}"` } });
      }
      return;
    }
    await route.fulfill({ json: { success: true, data: {} } });
  });
  await page.context().addCookies([{ name: 'tembus_web_session', value: 'runtime-test-session', domain: 'localhost', path: '/' }]);
};

test.describe('Runtime experience contract', () => {
  test('updates a compatible revision without an app release and keeps the active order visible', async ({ page }) => {
    let revision = 1;
    await installApiContract(page, manifestFor(1, 'Revision satu'));
    await page.route('**/api/v1/experience/manifest**', async (route) => {
      const manifest = manifestFor(revision, revision === 1 ? 'Revision satu' : 'Revision dua');
      await route.fulfill({ json: { success: true, data: manifest }, headers: { ETag: `"${manifest.checksum}"` } });
    });

    await page.goto('/dashboard');
    await expect(page.getByText('Revision satu')).toBeVisible();
    await expect(page.getByText('LCR-RUNTIME-001')).toBeVisible();

    revision = 2;
    await page.reload();
    await expect(page.getByText('Revision dua')).toBeVisible();
    await expect(page.getByText('LCR-RUNTIME-001')).toBeVisible();
  });

  test('a killed/unavailable experience entry does not hide the active-order recovery path', async ({ page }) => {
    await installApiContract(page, null);

    await page.goto('/dashboard');

    await expect(page.getByText('LCR-RUNTIME-001')).toBeVisible();
    await expect(page.getByText('Order Aktif Terbaru')).toBeVisible();
    await expect(page.getByText('Tidak ada order aktif.')).not.toBeVisible();
  });
});
