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
// Login flow baru (customer auth): BACKEND me-lookup user via phone_number OR email (GetByPhoneNumber).
// Frontend field email (type=email) hanya menerima format email → isi EMAIL (bukan phone).
// Akun demo staging: customer@tembus.id / Customer123! (phone 6281244445555).
const TEST_EMAIL =
  configuredEmail && !LEGACY_TEST_EMAILS.has(configuredEmail.toLowerCase())
    ? configuredEmail
    : 'customer@tembus.id';
const TEST_PASSWORD =
  configuredPassword && configuredPassword !== '123456'
    ? configuredPassword
    : 'Customer123!';
// device_id tetap (trusted device) — menghindari OTP tiap run CI
const TEST_DEVICE_ID = 'e2e-customer-flow-device-01';

test.use({
  geolocation: { latitude: -6.2, longitude: 106.816666 },
  permissions: ['geolocation'],
});

// Geolocation Playwright hanya mendukung 1 posisi per konteks (cache per-origin),
// dan setGeolocation kedua tidak selalu diterapkan (chromium quirk). Solusi: mock
// navigator.geolocation.getCurrentPosition di dalam helper (setelah halaman load,
// navigator.geolocation pasti tersedia) — lihat applyPickupLocation / applyDropoffByLocation.

const loginCustomer = async (page: import('@playwright/test').Page) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('domcontentloaded');

  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.evaluate((deviceId) => {
    window.localStorage.setItem('tembus_customer_web_device_id', deviceId);
  }, TEST_DEVICE_ID);
  await page.click('button[type="submit"]');

  const loginError = page.getByTestId('customer-login-error');
  const result = await Promise.race([
    page.waitForURL('**/dashboard', { timeout: 45000 }).then(() => ({ ok: true as const })),
    loginError.waitFor({ state: 'visible', timeout: 45000 }).then(async () => ({
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
  // Navigasi langsung ke form order (dashboard loading race-prone: skeleton + fetch async).
  // Dashboard sudah diverifikasi di langkah 1 (h1/h2/h3 visible setelah login).
  await page.goto('/orders/new/ondemand', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('pickup-address-input')).toBeVisible({ timeout: 15000 });
};

const mockGeolocation = async (
  page: import('@playwright/test').Page,
  lat: number,
  lng: number,
) => {
  // Mock getCurrentPosition dengan nilai mutable (amankan dari cache per-origin Chromium).
  await page.evaluate(([latV, lngV]) => {
    (window as any).__e2eGeo = { lat: latV, lng: lngV };
    navigator.geolocation.getCurrentPosition = (
      success: PositionCallback,
      _error?: PositionErrorCallback | null,
    ) => {
      const g = (window as any).__e2eGeo;
      success({
        coords: {
          latitude: g.lat,
          longitude: g.lng,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    };
  }, [lat, lng]);
};

const applyPickupLocation = async (
  page: import('@playwright/test').Page,
) => {
  // Pickup: mock geolocation → nilai mutable (set ulang aman tanpa cache per-origin)
  await mockGeolocation(page, -6.175392, 106.827153);
  await page.getByTestId('pickup-address-input').fill('Monumen Nasional, Gambir, Jakarta Pusat');
  await expect(page.getByTestId('pickup-current-location-button')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('pickup-current-location-button').click();
  await expect(page.getByTestId('pickup-coordinate-label')).not.toContainText('Titik belum dipilih', { timeout: 10000 });
};

const applyDropoffByLocation = async (
  page: import('@playwright/test').Page,
) => {
  // Dropoff: mock geolocation ke nilai dropoff SEBELUM klik — getCurrentPosition
  // mock membaca nilai mutable terkini. Pickup sudah tersimpan di form state.
  await mockGeolocation(page, -6.21462, 106.84513);
  await page.getByTestId('dropoff-address-input').fill('Istana Merdeka, Gambir, Jakarta Pusat');
  await expect(page.getByTestId('dropoff-current-location-button')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('dropoff-current-location-button').click();
  await expect(page.getByTestId('dropoff-coordinate-label')).not.toContainText('Titik belum dipilih', { timeout: 10000 });
};

test.describe('Customer Portal E2E Flow', () => {

  test('Complete Flow: Login -> Create Order -> Dashboard', async ({ page }) => {
    // 1. Login with the rebranded staging customer seed account.
    await loginCustomer(page);
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 });

    // 2. Navigate to "Kirim Paket" page
    await openOrderForm(page);

    // 3. Fill order form with browser geolocation so staging can price the route.
    await applyPickupLocation(page);
    await applyDropoffByLocation(page);

    await page.getByTestId('recipient-name-input').fill('Budi Santoso');
    await page.getByTestId('recipient-phone-input').fill('081234567890');
    await page.getByTestId('package-category-input').fill('electronics');
    await page.getByTestId('package-item-description-input').fill('Kamera DSLR hitam dalam tas');
    await page.getByTestId('package-weight-input').fill('2.5');

    // 4. Wait for pricing calculation debounce (service auto-select + default size tier)
    await expect(page.getByTestId('order-submit-button')).toBeEnabled({ timeout: 20000 });
    await page.waitForTimeout(1500);

    // 5. Submit order
    await page.getByTestId('order-submit-button').click();

    // 6. Verify order created -> redirected to Dashboard (no payment modal on success path)
    await expect(page.locator('h1').filter({ hasText: /Welcome back/ }).first()).toBeVisible({ timeout: 15000 });
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