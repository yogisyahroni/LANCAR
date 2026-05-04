# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer-flow.spec.ts >> Customer Portal E2E Flow >> Complete Flow: Login -> Create Order -> Dashboard
- Location: e2e\customer-flow.spec.ts:5:7

# Error details

```
Error: expect(locator).not.toHaveText(expected) failed

Locator: locator('text=Total Tagihan').locator('..').locator('.text-emerald-500')
Expected: not "Rp 0"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "not toHaveText" with timeout 5000ms
  - waiting for locator('text=Total Tagihan').locator('..').locator('.text-emerald-500')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [active]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - navigation [ref=e7]:
            - button "previous" [disabled] [ref=e8]:
              - img "previous" [ref=e9]
            - generic [ref=e11]:
              - generic [ref=e12]: 1/
              - text: "10"
            - button "next" [ref=e13] [cursor=pointer]:
              - img "next" [ref=e14]
          - img
        - generic [ref=e16]:
          - generic [ref=e17]:
            - img [ref=e18]
            - generic "Latest available version is detected (16.2.4)." [ref=e20]: Next.js 16.2.4
            - generic [ref=e21]: Turbopack
          - img
      - dialog "Console AxiosError" [ref=e23]:
        - generic [ref=e26]:
          - generic [ref=e27]:
            - generic [ref=e28]:
              - generic [ref=e30]: Console AxiosError
              - generic [ref=e31]:
                - button "Copy Error Info" [ref=e32] [cursor=pointer]:
                  - img [ref=e33]
                - button "No related documentation found" [disabled] [ref=e35]:
                  - img [ref=e36]
                - button "Attach Node.js inspector" [ref=e38] [cursor=pointer]:
                  - img [ref=e39]
            - generic [ref=e48]: Request failed with status code 404
          - generic [ref=e50]:
            - paragraph [ref=e52]:
              - text: Call Stack
              - generic [ref=e53]: "5"
            - generic [ref=e54]:
              - generic [ref=e55]:
                - text: settle
                - button "Sourcemapping failed. Click to log cause of error." [ref=e56] [cursor=pointer]:
                  - img [ref=e57]
              - text: file:///E:/antigraviti%20google/SUDAH%20DEPLOY/LANCAR/frontend/.next/dev/static/chunks/node_modules_axios_lib_0oh1xx3._.js (2147:16)
            - generic [ref=e59]:
              - generic [ref=e60]:
                - text: XMLHttpRequest.onloadend
                - button "Sourcemapping failed. Click to log cause of error." [ref=e61] [cursor=pointer]:
                  - img [ref=e62]
              - text: file:///E:/antigraviti%20google/SUDAH%20DEPLOY/LANCAR/frontend/.next/dev/static/chunks/node_modules_axios_lib_0oh1xx3._.js (2717:174)
            - generic [ref=e64]:
              - generic [ref=e65]:
                - text: Axios.request
                - button "Sourcemapping failed. Click to log cause of error." [ref=e66] [cursor=pointer]:
                  - img [ref=e67]
              - text: file:///E:/antigraviti%20google/SUDAH%20DEPLOY/LANCAR/frontend/.next/dev/static/chunks/node_modules_axios_lib_0oh1xx3._.js (3722:49)
            - generic [ref=e69]:
              - generic [ref=e70]:
                - text: async onSubmit
                - button "Sourcemapping failed. Click to log cause of error." [ref=e71] [cursor=pointer]:
                  - img [ref=e72]
              - text: file:///E:/antigraviti%20google/SUDAH%20DEPLOY/LANCAR/frontend/.next/dev/static/chunks/src_00dspy-._.js (214:34)
            - generic [ref=e74]:
              - generic [ref=e75]:
                - text: async
                - button "Sourcemapping failed. Click to log cause of error." [ref=e76] [cursor=pointer]:
                  - img [ref=e77]
              - text: file:///E:/antigraviti%20google/SUDAH%20DEPLOY/LANCAR/frontend/.next/dev/static/chunks/node_modules_react-hook-form_dist_index_esm_mjs_06an-fx._.js (2285:21)
        - generic [ref=e79]: "1"
        - generic [ref=e80]: "2"
    - generic [ref=e85] [cursor=pointer]:
      - button "Open Next.js Dev Tools" [ref=e86]:
        - img [ref=e87]
      - generic [ref=e90]:
        - button "Open issues overlay" [ref=e91]:
          - generic [ref=e92]:
            - generic [ref=e93]: "9"
            - generic [ref=e94]: "10"
          - generic [ref=e95]:
            - text: Issue
            - generic [ref=e96]: s
        - button "Collapse issues badge" [ref=e97]:
          - img [ref=e98]
  - generic [ref=e101]:
    - img [ref=e102]
    - heading "This page couldn’t load" [level=1] [ref=e104]
    - paragraph [ref=e105]: Reload to try again, or go back.
    - generic [ref=e106]:
      - button "Reload" [ref=e108] [cursor=pointer]
      - button "Back" [ref=e109] [cursor=pointer]
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
> 46 |     await expect(totalPrice).not.toHaveText('Rp 0');
     |                                  ^ Error: expect(locator).not.toHaveText(expected) failed
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
  74 |     await page.fill('input[name="pickup_address"]', 'a');
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