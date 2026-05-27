import { test, expect } from '@playwright/test';

// Use env vars injected by CI, with fallback for local dev
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'customer_test@tembus.id';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '123456';

test.describe('Customer Portal E2E Flow', () => {

  test('Complete Flow: Login -> Create Order -> Dashboard', async ({ page }) => {
    // 1. Navigate to login page and wait for it to be ready
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // 2. Fill login form using name attributes (more stable than type selectors)
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // 3. Wait for redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // 4. Navigate to "Kirim Paket" page
    await page.click('text=Kirim Paket');
    await page.waitForURL('**/orders/new', { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // 5. Wait for the order form fields to appear
    await expect(page.locator('input[name="pickup_address"]')).toBeVisible({ timeout: 10000 });

    // 6. Fill Order Form via "Gunakan Lokasi Saya"
    await page.locator('text=Gunakan Lokasi Saya').first().click();
    await page.waitForTimeout(500);

    await page.locator('text=Gunakan Lokasi Saya').last().click();
    await page.waitForTimeout(500);

    // 7. Fill dropoff details
    await page.fill('input[name="dropoff_address"]', 'Jalan Merdeka No. 1, Gambir, Jakarta Pusat');
    await page.fill('input[name="recipient_name"]', 'Budi Santoso');
    await page.fill('input[name="recipient_phone"]', '081234567890');

    // 8. Select category
    await page.selectOption('select[name="package_details.category"]', 'electronics');

    // 9. Fill weight
    await page.fill('input[name="package_details.weight_kg"]', '2.5');

    // 10. Wait for pricing calculation debounce
    await page.waitForTimeout(1500);

    // 11. Submit order (button text may vary)
    const submitBtn = page.locator('button:has-text("Bayar Sekarang"), button:has-text("Pesan Sekarang")').first();
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    // 12. Verify Payment Modal appears
    await expect(page.locator('h2, h3').filter({ hasText: /Selesaikan Pembayaran|Pembayaran/ }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Validation: Check required fields and Zod errors', async ({ page }) => {
    // 1. Login first
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // 2. Navigate directly to the order form
    await page.goto('/orders/new');
    await page.waitForLoadState('networkidle');

    // 3. Wait for the form to be ready
    await expect(page.locator('input[name="pickup_address"]')).toBeVisible({ timeout: 10000 });

    // 4. Trigger validation by typing and clearing required fields
    await page.fill('input[name="pickup_address"]', 'a');
    await page.press('input[name="pickup_address"]', 'Backspace');

    await page.fill('input[name="dropoff_address"]', 'a');
    await page.press('input[name="dropoff_address"]', 'Backspace');

    await page.fill('input[name="recipient_name"]', 'a');
    await page.press('input[name="recipient_name"]', 'Backspace');

    await page.fill('input[name="recipient_phone"]', '1');
    await page.press('input[name="recipient_phone"]', 'Backspace');

    // 5. Trigger category validation
    await page.selectOption('select[name="package_details.category"]', 'electronics');
    await page.selectOption('select[name="package_details.category"]', '');

    // 6. Click somewhere else to trigger blur validation
    await page.click('body');
    await page.waitForTimeout(300);

    // 7. Check for validation messages
    await expect(page.locator('text=Alamat pickup minimal 5 karakter')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Alamat tujuan minimal 5 karakter')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Nama penerima wajib diisi')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Nomor HP tidak valid')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Pilih kategori paket')).toBeVisible({ timeout: 5000 });
  });
});
