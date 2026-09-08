import { test, expect, type Page } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL?.trim() || 'customer@tembus.id';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD?.trim() || 'Customer123!';
const TEST_DEVICE_ID = 'qa-package-web-flow-20260908';

test.use({
  geolocation: { latitude: -6.2, longitude: 106.816666 },
  permissions: ['geolocation'],
});

async function loginCustomer(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.evaluate((deviceId) => {
    window.localStorage.setItem('tembus_customer_web_device_id', deviceId);
  }, TEST_DEVICE_ID);
  const loginResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && url.pathname.endsWith('/auth/customer/login/start');
  }, { timeout: 45_000 });
  await page.click('button[type="submit"]');
  await expect((await loginResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });
}

async function setBrowserLocation(page: Page, latitude: number, longitude: number) {
  await page.evaluate(([lat, lng]) => {
    (window as Window & { __qaGeo?: { lat: number; lng: number } }).__qaGeo = { lat, lng };
    navigator.geolocation.getCurrentPosition = (success) => {
      const geo = (window as Window & { __qaGeo?: { lat: number; lng: number } }).__qaGeo;
      if (!geo) throw new Error('QA geolocation was not initialized');
      success({
        coords: {
          latitude: geo.lat,
          longitude: geo.lng,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    };
  }, [latitude, longitude]);
}

async function fillPackageOrder(page: Page) {
  await page.goto('/orders/new/ondemand', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await expect(page.getByTestId('pickup-address-input')).toBeVisible({ timeout: 15_000 });

  await setBrowserLocation(page, -6.175392, 106.827153);
  await page.getByTestId('pickup-address-input').fill('Monumen Nasional, Gambir, Jakarta Pusat');
  await page.getByTestId('pickup-current-location-button').click();
  await expect(page.getByTestId('pickup-coordinate-label')).not.toContainText('Titik belum dipilih');

  await setBrowserLocation(page, -6.21462, 106.84513);
  await page.getByTestId('dropoff-address-input').fill('Istana Merdeka, Gambir, Jakarta Pusat');
  await page.getByTestId('dropoff-current-location-button').click();
  await expect(page.getByTestId('dropoff-coordinate-label')).not.toContainText('Titik belum dipilih');

  await page.getByTestId('recipient-name-input').fill('QA Package Recipient');
  await page.getByTestId('recipient-phone-input').fill('081234567890');
  await page.getByTestId('package-category-input').fill('electronics');
  await page.getByTestId('package-item-description-input').fill('QA package flow test item');
  await page.getByTestId('package-weight-input').fill('2.5');
  await expect(page.getByTestId('order-submit-button')).toBeEnabled({ timeout: 25_000 });
  await expect(page.getByText('Total Tagihan')).toBeVisible();
}

test.describe('QA-2026-006 Paket Web E2E', () => {
  test('creates a server-owned quote and loads the persisted order in history', async ({ page }) => {
    await loginCustomer(page);
    const quoteResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' && url.pathname.endsWith('/auth/web/orders/calculate');
    }, { timeout: 45_000 });
    await fillPackageOrder(page);

    const createResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' && url.pathname.endsWith('/auth/web/orders');
    }, { timeout: 45_000 });
    await page.getByTestId('order-submit-button').click();

    expect((await quoteResponse).status()).toBe(200);
    const create = await createResponse;
    expect(create.status()).toBe(201);
    const body = await create.json() as {
      success?: boolean;
      order?: { id?: string; order_number?: string; status?: string };
    };
    expect(body.success).toBe(true);
    const order = body.order;
    expect(order).toBeDefined();
    if (!order) throw new Error('Create order response did not include order');
    expect(order.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(order.order_number).toMatch(/^TMB-/);
    expect(order.status).toBeTruthy();

    await page.goto('/orders', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByRole('heading', { name: 'Riwayat Order Anda' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(order.order_number!, { exact: false })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('link', { name: `Lihat detail order ${order.order_number}` }).click();
    await expect(page.getByRole('heading', { name: `Detail Order ${order.order_number}` })).toBeVisible({ timeout: 20_000 });
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Riwayat Order Anda' })).toBeVisible({ timeout: 20_000 });
  });
});
