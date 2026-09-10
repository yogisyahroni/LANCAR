import { expect, test, type Page, type Route } from '@playwright/test';

type RuntimeManifest = {
  manifest_id: string;
  revision: number;
  market_code: string;
  locale: string;
  surface: 'customer_web';
  sections: Array<{ id: string; component: string; properties: Record<string, unknown> }>;
  asset_references?: Array<{ asset_id: string; uri: string }>;
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
  asset_references: [],
  });

const installApiContract = async (
  page: Page,
  manifest: RuntimeManifest | null,
): Promise<void> => {
  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    const requestUrl = route.request().url();
    if (requestUrl.includes('/auth/web/me')) {
      await route.fulfill({ json: { success: true, user: { id: 'runtime-user', name: 'Runtime User' } } });
      return;
    }
    if (requestUrl.includes('/auth/web/notifications')) {
      await route.fulfill({ json: { success: true, notifications: [] } });
      return;
    }
    if (!/^\/(?:api\/v1\/)?(?:auth|experience)\//.test(url.pathname)) {
      await route.continue();
      return;
    }
    const path = url.pathname.replace(/^\/api\/v1/, '');
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
    await page.route('**/experience/manifest**', async (route) => {
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

  test('runtime campaign media keeps informative copy outside the image and preserves alt semantics', async ({ page }) => {
    const mediaManifest: RuntimeManifest = {
      ...manifestFor(1, 'Media campaign'),
      sections: [{
        id: 'media-hero',
        component: 'hero_banner',
        properties: {
          title: 'Informative campaign title',
          body: 'Copy remains readable outside arbitrary campaign art.',
          image_asset_id: 'hero-asset',
          alt_label: 'Illustrative food delivery banner',
        },
      }],
      asset_references: [{ asset_id: 'hero-asset', uri: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }],
    };
    await installApiContract(page, mediaManifest);
    await page.goto('/dashboard');

    const image = page.getByRole('img', { name: 'Illustrative food delivery banner' });
    const title = page.getByRole('heading', { name: 'Informative campaign title' });
    await expect(image).toBeVisible();
    await expect(title).toBeVisible();
    const [imageBox, titleBox] = await Promise.all([image.boundingBox(), title.boundingBox()]);
    expect(imageBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect((imageBox?.y ?? 0) + (imageBox?.height ?? 0)).toBeLessThanOrEqual(titleBox?.y ?? 0);
    await expect(image).not.toHaveAttribute('aria-hidden', 'true');
  });

  test('runtime decorative campaign media is hidden from assistive technology', async ({ page }) => {
    const decorativeManifest: RuntimeManifest = {
      ...manifestFor(1, 'Decorative campaign'),
      sections: [{
        id: 'decorative-hero',
        component: 'hero_banner',
        properties: {
          title: 'Decorative campaign title',
          image_asset_id: 'decorative-asset',
          image_decorative: true,
        },
      }],
      asset_references: [{ asset_id: 'decorative-asset', uri: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }],
    };
    await installApiContract(page, decorativeManifest);
    await page.goto('/dashboard');

    const image = page.locator('img[aria-hidden="true"]');
    await expect(image).toHaveCount(1);
    await expect(image).toHaveAttribute('alt', '');
  });
});
