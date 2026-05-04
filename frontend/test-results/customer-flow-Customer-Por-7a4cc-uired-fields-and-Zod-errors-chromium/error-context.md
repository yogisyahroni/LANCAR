# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer-flow.spec.ts >> Customer Portal E2E Flow >> Validation: Check required fields and Zod errors
- Location: e2e\customer-flow.spec.ts:63:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('input[name="pickup_address"]')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e6] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e7]:
      - img [ref=e8]
    - generic [ref=e11]:
      - button "Open issues overlay" [ref=e12]:
        - generic [ref=e13]:
          - generic [ref=e14]: "0"
          - generic [ref=e15]: "1"
        - generic [ref=e16]: Issue
      - button "Collapse issues badge" [ref=e17]:
        - img [ref=e18]
  - alert [ref=e20]
  - generic [ref=e23]:
    - generic [ref=e24]:
      - img [ref=e26]
      - heading "Welcome to Lancar" [level=1] [ref=e30]
      - paragraph [ref=e31]: Sign in to manage your logistics and deliveries
    - generic [ref=e32]:
      - button "Password" [ref=e33]:
        - img [ref=e34]
        - text: Password
      - button "OTP Login" [ref=e37]:
        - img [ref=e38]
        - text: OTP Login
    - generic [ref=e41]:
      - generic [ref=e42]:
        - generic [ref=e43]:
          - generic [ref=e44]:
            - img [ref=e45]
            - text: Email
          - textbox "name@company.com" [ref=e48]
        - generic [ref=e49]:
          - generic [ref=e50]:
            - generic [ref=e51]:
              - img [ref=e52]
              - text: Password
            - link "Forgot password?" [ref=e55] [cursor=pointer]:
              - /url: /forgot-pin
          - textbox "••••••••" [ref=e56]
      - generic [ref=e58] [cursor=pointer]:
        - checkbox "Remember me (30 days)" [ref=e59]
        - generic [ref=e60]: Remember me (30 days)
      - button "Sign In" [ref=e61]
    - generic [ref=e66]: Or continue with
    - button "Sign in with Google" [ref=e67]:
      - img [ref=e68]
      - text: Sign in with Google
    - generic [ref=e73]:
      - text: Don't have an account?
      - link "Sign up here" [ref=e74] [cursor=pointer]:
        - /url: /daftar
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Customer Portal E2E Flow', () => {
  4  |   
  5  |   test('Complete Flow: Login -> Create Order -> Dashboard', async ({ page }) => {
  6  |     // 1. Login
  7  |     await page.goto('/login');
  8  |     await page.fill('input[type="email"]', 'customer_test@lancar.id');
  9  |     await page.fill('input[type="password"]', '123456');
  10 |     await page.click('button[type="submit"]');
  11 | 
  12 |     // Wait for redirect to dashboard
  13 |     await page.waitForURL('**/dashboard');
  14 |     await expect(page.locator('h1')).toContainText('Welcome back');
  15 | 
  16 |     // 2. Navigate to "Kirim Paket"
  17 |     await page.click('text=Kirim Paket');
  18 |     await page.waitForURL('**/orders/new');
  19 |     await expect(page.locator('h1')).toContainText('Kirim Paket Baru');
  20 | 
  21 |     // 3. Fill Order Form
  22 |     // Using "Gunakan Lokasi Saya" to fill pickup
  23 |     await page.locator('text=Gunakan Lokasi Saya').first().click();
  24 |     await page.waitForTimeout(500); 
  25 | 
  26 |     // Using "Gunakan Lokasi Saya" to fill dropoff location
  27 |     await page.locator('text=Gunakan Lokasi Saya').last().click();
  28 |     await page.waitForTimeout(500);
  29 | 
  30 |     // Fill Dropoff
  31 |     await page.fill('input[name="dropoff_address"]', 'Jalan Merdeka No. 1, Gambir, Jakarta Pusat');
  32 |     await page.fill('input[name="recipient_name"]', 'Budi Santoso');
  33 |     await page.fill('input[name="recipient_phone"]', '081234567890');
  34 | 
  35 |     // Select Category
  36 |     await page.selectOption('select[name="package_details.category"]', 'electronics');
  37 | 
  38 |     // Weight and Dimensions (defaults are fine, but let's change one)
  39 |     await page.fill('input[name="package_details.weight_kg"]', '2.5');
  40 | 
  41 |     // 4. Verify Pricing Calculation
  42 |     // Wait for calculation debounce
  43 |     await page.waitForTimeout(1000);
  44 |     const totalPrice = page.locator('text=Total Tagihan').locator('..').locator('.text-emerald-500');
  45 |     // Ensure price is calculated (not 0)
  46 |     await expect(totalPrice).not.toHaveText('Rp 0');
  47 | 
  48 |     // 5. Submit Order
  49 |     await page.click('button:has-text("Bayar Sekarang")');
  50 | 
  51 |     // 6. Verify Payment Modal
  52 |     await expect(page.locator('h2')).toContainText('Selesaikan Pembayaran');
  53 |     await expect(page.locator('text=Scan QRIS')).toBeVisible();
  54 | 
  55 |     // 7. Mock Payment Success
  56 |     await page.click('button:has-text("Simulasikan Pembayaran Sukses")');
  57 | 
  58 |     // 8. Back to Dashboard
  59 |     await page.waitForURL('**/dashboard');
  60 |     await expect(page.locator('text=Pembayaran Berhasil')).toBeVisible();
  61 |   });
  62 | 
  63 |   test('Validation: Check required fields and Zod errors', async ({ page }) => {
  64 |     await page.goto('/login');
  65 |     await page.fill('input[type="email"]', 'customer_test@lancar.id');
  66 |     await page.fill('input[type="password"]', '123456');
  67 |     await page.click('button[type="submit"]');
  68 |     await page.waitForURL('**/dashboard');
  69 | 
  70 |     await page.goto('/orders/new');
  71 |     
  72 |     // Trigger validation by typing and clearing required fields
  73 |     // since the "Bayar Sekarang" button is disabled when the form is invalid.
> 74 |     await page.fill('input[name="pickup_address"]', 'a');
     |                ^ Error: page.fill: Test timeout of 30000ms exceeded.
  75 |     await page.press('input[name="pickup_address"]', 'Backspace');
  76 |     
  77 |     await page.fill('input[name="dropoff_address"]', 'a');
  78 |     await page.press('input[name="dropoff_address"]', 'Backspace');
  79 | 
  80 |     await page.fill('input[name="recipient_name"]', 'a');
  81 |     await page.press('input[name="recipient_name"]', 'Backspace');
  82 | 
  83 |     await page.fill('input[name="recipient_phone"]', '1');
  84 |     await page.press('input[name="recipient_phone"]', 'Backspace');
  85 | 
  86 |     // For the category, we select then select back to empty
  87 |     await page.selectOption('select[name="package_details.category"]', 'electronics');
  88 |     await page.selectOption('select[name="package_details.category"]', '');
  89 | 
  90 |     // Check for validation messages
  91 |     await expect(page.locator('text=Alamat pickup minimal 5 karakter')).toBeVisible();
  92 |     await expect(page.locator('text=Alamat tujuan minimal 5 karakter')).toBeVisible();
  93 |     await expect(page.locator('text=Nama penerima wajib diisi')).toBeVisible();
  94 |     await expect(page.locator('text=Nomor HP tidak valid')).toBeVisible();
  95 |     await expect(page.locator('text=Pilih kategori paket')).toBeVisible();
  96 |   });
  97 | });
  98 | 
```