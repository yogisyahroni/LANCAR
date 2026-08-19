import { test, expect } from '@playwright/test';

// Use env vars injected by CI, with fallback for local dev
const LEGACY_TEST_EMAILS = new Set([
  'customer_test@tembus.id',
]);

const getConfiguredValue = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const configuredEmail = getConfiguredValue(process.env.TEST_USER_EMAIL);
const configuredPassword = getConfiguredValue(process.env.TEST_USER_PASSWORD);
const TEST_EMAIL =
  configuredEmail && !LEGACY_TEST_EMAILS.has(configuredEmail.toLowerCase())
    ? configuredEmail
    : 'customer@tembus.id';
const TEST_PASSWORD =
  configuredPassword && configuredPassword !== '123456'
    ? configuredPassword
    : 'Customer123!';

test.use({
  geolocation: { latitude: -6.2, longitude: 106.816666 },
  permissions: ['geolocation'],
});

const loginCustomer = async (page: import('@playwright/test').Page) => {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');

  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  const loginError = page.getByTestId('customer-login-error');
  const result = await Promise.race([
    page.waitForURL('**/dashboard', { timeout: 20000 }).then(() => ({ ok: true as const })),
    loginError.waitFor({ state: 'visible', timeout: 20000 }).then(async () => ({
      ok: false as const,
      message: (await loginError.innerText()).trim(),
    })),
  ]);

  if (!result.ok) {
    throw new Error(`Customer login failed for ${TEST_EMAIL}: ${result.message}`);
  }

  await page.waitForLoadState('domcontentloaded');
};

const openOrderForm = async (page: import('@playwright/test').Page) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');

  const createOrderLink = page.getByRole('link', { name: /Kirim Paket/i }).first();
  await expect(createOrderLink).toBeVisible({ timeout: 15000 });
  await createOrderLink.click();

  await page.waitForURL('**/orders/new', { timeout: 20000 });
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('pickup-address-input')).toBeVisible({ timeout: 15000 });
};

const applyBrowserLocation = async (
  page: import('@playwright/test').Page,
  mode: 'pickup' | 'dropoff',
  address: string,
  geolocation: { latitude: number; longitude: number },
) => {
  await page.context().grantPermissions(['geolocation']);
  await page.getByTestId(`${mode}-address-input`).fill(address);
  await page.context().setGeolocation(geolocation);
  await page.getByTestId(`${mode}-current-location-button`).click();
  await expect(page.getByTestId(`${mode}-coordinate-label`)).not.toContainText('Titik belum dipilih', { timeout: 10000 });
};

test.describe('Customer Portal E2E Flow', () => {

  test('Complete Flow: Login -> Create Order -> Dashboard', async ({ page }) => {
    // 1. Login with the rebranded staging customer seed account.
    await loginCustomer(page);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // 2. Navigate to "Kirim Paket" page
    await openOrderForm(page);

    // 3. Fill order form with browser geolocation so staging can price the route.
    await applyBrowserLocation(page, 'pickup', 'Monumen Nasional, Gambir, Jakarta Pusat', {
      latitude: -6.175392,
      longitude: 106.827153,
    });
    await applyBrowserLocation(page, 'dropoff', 'Jalan Merdeka No. 1, Gambir, Jakarta Pusat', {
      latitude: -6.21462,
      longitude: 106.84513,
    });

    await page.getByTestId('recipient-name-input').fill('Budi Santoso');
    await page.getByTestId('recipient-phone-input').fill('081234567890');
    await page.getByTestId('package-category-input').fill('electronics');
    await page.getByTestId('package-weight-input').fill('2.5');

    // 4. Wait for pricing calculation debounce
    await page.waitForTimeout(1500);

    // 5. Submit order
    const submitBtn = page.getByTestId('order-submit-button');
    await expect(submitBtn).toBeEnabled({ timeout: 15000 });
    await submitBtn.click();

    // 6. Verify Payment Modal appears
    await expect(page.locator('h2, h3').filter({ hasText: /Selesaikan Pembayaran|Pembayaran/ }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Validation: Check required fields and Zod errors', async ({ page }) => {
    // 1. Login first.
    await loginCustomer(page);

    // 2. Navigate to the order form
    await openOrderForm(page);

    // 3. Trigger validation by typing and clearing required fields
    await page.getByTestId('pickup-address-input').fill('a');
    await page.getByTestId('pickup-address-input').fill('');

    await page.getByTestId('dropoff-address-input').fill('a');
    await page.getByTestId('dropoff-address-input').fill('');

    await page.getByTestId('recipient-name-input').fill('a');
    await page.getByTestId('recipient-name-input').fill('');

    await page.getByTestId('recipient-phone-input').fill('1');
    await page.getByTestId('recipient-phone-input').fill('');

    await page.getByTestId('package-category-input').fill('electronics');
    await page.getByTestId('package-category-input').fill('');

    // 4. Click somewhere else to trigger blur validation
    await page.click('body');
    await page.waitForTimeout(300);

    // 5. Check for validation messages
    await expect(page.locator('text=Alamat pickup minimal 5 karakter')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Alamat tujuan minimal 5 karakter')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Nama penerima wajib diisi')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Nomor HP tidak valid')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Pilih kategori paket')).toBeVisible({ timeout: 5000 });
  });
});