import { test, expect } from '@playwright/test';

test.describe('Customer Portal E2E Flow', () => {
  
  test('Complete Flow: Login -> Create Order -> Dashboard', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'customer_test@lancar.id');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard');
    await expect(page.locator('h1')).toContainText('Welcome back');

    // 2. Navigate to "Kirim Paket"
    await page.click('text=Kirim Paket');
    await page.waitForURL('**/orders/new');
    await expect(page.locator('h1')).toContainText('Kirim Paket Baru');

    // 3. Fill Order Form
    // Using "Gunakan Lokasi Saya" to fill pickup
    await page.locator('text=Gunakan Lokasi Saya').first().click();
    await page.waitForTimeout(500); 

    // Using "Gunakan Lokasi Saya" to fill dropoff location
    await page.locator('text=Gunakan Lokasi Saya').last().click();
    await page.waitForTimeout(500);

    // Fill Dropoff
    await page.fill('input[name="dropoff_address"]', 'Jalan Merdeka No. 1, Gambir, Jakarta Pusat');
    await page.fill('input[name="recipient_name"]', 'Budi Santoso');
    await page.fill('input[name="recipient_phone"]', '081234567890');

    // Select Category
    await page.selectOption('select[name="package_details.category"]', 'electronics');

    // Weight and Dimensions (defaults are fine, but let's change one)
    await page.fill('input[name="package_details.weight_kg"]', '2.5');

    // 4. Verify Pricing Calculation
    // Wait for calculation debounce
    await page.waitForTimeout(1000);
    const totalPrice = page.locator('text=Total Tagihan').locator('..').locator('.text-emerald-500');
    // Ensure price is calculated (not 0)
    await expect(totalPrice).not.toHaveText('Rp 0');

    // 5. Submit Order
    await page.click('button:has-text("Bayar Sekarang")');

    // 6. Verify Payment Modal
    await expect(page.locator('h2')).toContainText('Selesaikan Pembayaran');
    await expect(page.locator('text=Scan QRIS')).toBeVisible();

    // 7. Mock Payment Success
    await page.click('button:has-text("Simulasikan Pembayaran Sukses")');

    // 8. Back to Dashboard
    await page.waitForURL('**/dashboard');
    await expect(page.locator('text=Pembayaran Berhasil')).toBeVisible();
  });

  test('Validation: Check required fields and Zod errors', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'customer_test@lancar.id');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    await page.goto('/orders/new');
    
    // Trigger validation by typing and clearing required fields
    // since the "Bayar Sekarang" button is disabled when the form is invalid.
    await page.fill('input[name="pickup_address"]', 'a');
    await page.press('input[name="pickup_address"]', 'Backspace');
    
    await page.fill('input[name="dropoff_address"]', 'a');
    await page.press('input[name="dropoff_address"]', 'Backspace');

    await page.fill('input[name="recipient_name"]', 'a');
    await page.press('input[name="recipient_name"]', 'Backspace');

    await page.fill('input[name="recipient_phone"]', '1');
    await page.press('input[name="recipient_phone"]', 'Backspace');

    // For the category, we select then select back to empty
    await page.selectOption('select[name="package_details.category"]', 'electronics');
    await page.selectOption('select[name="package_details.category"]', '');

    // Check for validation messages
    await expect(page.locator('text=Alamat pickup minimal 5 karakter')).toBeVisible();
    await expect(page.locator('text=Alamat tujuan minimal 5 karakter')).toBeVisible();
    await expect(page.locator('text=Nama penerima wajib diisi')).toBeVisible();
    await expect(page.locator('text=Nomor HP tidak valid')).toBeVisible();
    await expect(page.locator('text=Pilih kategori paket')).toBeVisible();
  });
});
