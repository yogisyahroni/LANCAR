import { expect, test, type Page } from '@playwright/test';

async function installCustomerFormFixture(page: Page, options: { disputes?: Array<Record<string, unknown>> } = {}) {
  await page.context().addCookies([
    { name: 'tembus_web_session', value: 'keyboard-customer-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'keyboard-customer-fixture', full_name: 'Keyboard Fixture', email: 'keyboard@example.test' } }),
      });
      return;
    }
    if (url.pathname.endsWith('/auth/web/notifications')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
      return;
    }
    if (url.pathname.endsWith('/auth/web/disputes')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: options.disputes ?? [] }) });
      return;
    }
    if (url.pathname.endsWith('/logistics/providers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ providers: [{ code: 'jne', name: 'JNE', capabilities: ['shipment', 'cod'], tracking_mode: 'api', available: true }] }),
      });
      return;
    }
    if (url.pathname.endsWith('/auth/web/delivery-services')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ services: [{
          code: 'tembus_instant',
          name: 'Paket Instan',
          description: 'Pengiriman cepat',
          service_category: 'package_on_demand',
          uses_size_tier: true,
          size_tiers: [{ code: 'regular', name: 'Regular', description: 'Maksimal 5 kg', max_weight_kg: 5 }],
          max_eta_minutes: 120,
          max_distance_km: 30,
          requires_dimension_scan: false,
          vehicle_types: ['motorcycle'],
        }] }),
      });
      return;
    }
    if (url.pathname.endsWith('/logistics/locations')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ code: 'JKT', name: 'Jakarta', type: 'both' }, { code: 'BKS', name: 'Bekasi', type: 'both' }] }),
      });
      return;
    }
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      return;
    }
    await route.continue();
  });
}

test('Customer login exposes a keyboard-reachable primary path @keyboard', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });

  const email = page.getByLabel(/email/i).first();
  const password = page.getByLabel(/password/i).first();
  await email.focus();
  await expect(email).toBeFocused();
  await expect.poll(() => email.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px');
  await page.keyboard.press('Tab');
  await expect(page.locator('a[href="/forgot-pin"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#customer-login-remember')).toBeFocused();
});

test('Customer login associates server errors with the affected fields @a11y', async ({ page }) => {
  await page.route('**/auth/customer/login/start', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
  });
  await page.goto('/login', { waitUntil: 'networkidle' });

  const email = page.getByLabel(/email/i).first();
  const password = page.getByLabel(/password/i).first();
  await email.fill('customer@example.test');
  await password.fill('incorrect-password');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();

  await expect(page.locator('#customer-login-error')).toContainText('Invalid credentials');
  await expect(email).toHaveAttribute('aria-describedby', 'customer-login-error');
  await expect(password).toHaveAttribute('aria-describedby', 'customer-login-error');
});

test('Customer navigation exposes the current location on desktop and mobile @keyboard @a11y', async ({ page }) => {
  await installCustomerFormFixture(page);

  for (const viewport of [
    { width: 1280, height: 900, navigation: 'Navigasi utama' },
    { width: 390, height: 844, navigation: 'Navigasi bawah mobile' },
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const navigation = page.getByRole('navigation', { name: viewport.navigation });
    const currentLink = navigation.locator('a[aria-current="page"]');
    await expect(currentLink).toHaveCount(1);
    await expect(currentLink).toHaveAttribute('href', '/dashboard');
    await currentLink.focus();
    await expect(currentLink).toBeFocused();
  }
});

test('Customer aggregator form keeps provider and city controls keyboard reachable @keyboard', async ({ page }) => {
  await installCustomerFormFixture(page);
  await page.goto('/orders/new/aggregator', { waitUntil: 'domcontentloaded' });

  const provider = page.getByRole('button', { name: /JNE/ });
  await expect(provider).toBeVisible();
  await provider.focus();
  await page.keyboard.press('Enter');

  const origin = page.getByLabel('Kota area pickup provider');
  await expect(origin).toBeEnabled();
  await expect(origin).toHaveAccessibleName('Kota area pickup provider');

  await origin.focus();
  await expect(origin).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(origin).toHaveValue('JKT');
});

test('Customer On-Demand service cards expose canonical icon and pressed state @keyboard @a11y @iconography', async ({ page }) => {
  await installCustomerFormFixture(page);
  await page.goto('/orders/new/ondemand', { waitUntil: 'domcontentloaded' });

  const serviceCard = page.getByRole('button', { name: /Paket Instan Pengiriman cepat/ });
  await expect(serviceCard).toBeVisible();
  await expect(serviceCard).toHaveAttribute('aria-pressed', 'true');
  await expect(serviceCard.locator('svg')).toHaveCount(2);
  await expect.poll(() => serviceCard.locator('svg').evaluateAll((icons) => icons.every((icon) => icon.getAttribute('aria-hidden') === 'true'))).toBe(true);

  const sizeTier = page.getByRole('button', { name: /Regular Maksimal 5 kg/ });
  await expect(sizeTier).toHaveAttribute('aria-pressed', 'true');
  await sizeTier.focus();
  await expect(sizeTier).toBeFocused();
});

test('Customer Food reorder quantity controls expose item-specific icon-only names @keyboard @a11y @iconography', async ({ page }) => {
  await page.context().addCookies([
    { name: 'tembus_web_session', value: 'food-reorder-keyboard-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'food-reorder-keyboard-fixture', full_name: 'Food Fixture', email: 'food@example.test' } }) });
      return;
    }
    if (url.pathname.endsWith('/auth/web/notifications')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
      return;
    }
    if (url.pathname.endsWith('/orders/reorder-info')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { order_id: 'ORDER-FOOD-REORDER', merchant_id: 'merchant-food-1', merchant_name: 'Food Fixture Merchant', merchant_open: true, items: [{ menu_item_id: 'menu-nasi-goreng', item_name: 'Nasi Goreng', quantity: 2, old_price: 18000, new_price: 20000, available: true, price_changed: true, variants: [] }], total_old: 36000, total_new: 40000, has_changes: true } }),
      });
      return;
    }
    if (url.pathname.endsWith('/customer/addresses')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'address-food-1', label: 'Rumah', address: 'Jl. Food Fixture 1', lat: -6.2, lng: 106.8, contact_name: 'Food Fixture', is_favorite: true }] }) });
      return;
    }
    if (url.pathname.endsWith('/food/merchants/merchant-food-1')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { merchant: { id: 'merchant-food-1', name: 'Food Fixture Merchant', is_open: true } } }) });
      return;
    }
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/orders/new/food?orderId=ORDER-FOOD-REORDER', { waitUntil: 'domcontentloaded' });
  const decrease = page.getByRole('button', { name: 'Kurangi Nasi Goreng' });
  const increase = page.getByRole('button', { name: 'Tambah Nasi Goreng' });
  await expect(decrease).toBeVisible();
  await expect(increase).toBeVisible();
  await expect(decrease).toHaveAttribute('title', 'Kurangi Nasi Goreng');
  await expect(increase).toHaveAttribute('title', 'Tambah Nasi Goreng');
  await increase.focus();
  await expect(increase).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Jumlah Nasi Goreng')).toContainText('3');
});

test('Customer scheduled pickup controls are keyboard reachable and Escape-dismissible @keyboard', async ({ page }) => {
  await installCustomerFormFixture(page);
  await page.goto('/orders/new/ondemand', { waitUntil: 'domcontentloaded' });

  const schedule = page.getByLabel('Jadwal');
  await expect(schedule).toBeVisible();
  await schedule.selectOption('scheduled');

  const dateButton = page.getByRole('button', { name: 'Pilih tanggal pickup' });
  await dateButton.focus();
  await expect(dateButton).toBeFocused();
  await page.keyboard.press('Enter');
  const dateDialog = page.getByRole('dialog', { name: 'Pilih tanggal pickup' });
  await expect(dateDialog).toBeVisible();
  await expect.poll(() => dateDialog.locator('button:not([disabled])').count()).toBeGreaterThan(0);
  await expect.poll(() => dateDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => dateDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => dateDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dateDialog).not.toBeVisible();
  await expect(dateButton).toBeFocused();

  const timeButton = page.getByRole('button', { name: 'Pilih jam pickup' });
  await timeButton.focus();
  await page.keyboard.press('Enter');
  const timePicker = page.getByRole('listbox', { name: 'Pilih jam pickup' });
  await expect(timePicker).toBeVisible();
  await expect.poll(() => timePicker.evaluate((picker) => picker.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => timePicker.evaluate((picker) => picker.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => timePicker.evaluate((picker) => picker.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(timePicker).not.toBeVisible();
  await expect(timeButton).toBeFocused();
});

test('Customer On-Demand validation connects visible errors to invalid fields @a11y', async ({ page }) => {
  await installCustomerFormFixture(page);
  await page.goto('/orders/new/ondemand', { waitUntil: 'domcontentloaded' });

  const invalidFields = [
    { testId: 'pickup-address-input', error: 'Alamat pickup minimal 5 karakter' },
    { testId: 'dropoff-address-input', error: 'Alamat tujuan minimal 5 karakter' },
    { testId: 'recipient-name-input', error: 'Nama penerima wajib diisi' },
    { testId: 'recipient-phone-input', error: 'Nomor HP tidak valid' },
    { testId: 'package-category-input', error: 'Pilih kategori paket' },
  ] as const;

  for (const field of invalidFields) {
    const control = page.getByTestId(field.testId);
    await control.fill('a');
    await control.fill('');
    await page.locator('body').click({ position: { x: 2, y: 2 } });

    await expect(page.getByText(field.error, { exact: true })).toBeVisible();
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await control.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    for (const id of describedBy?.split(/\s+/).filter(Boolean) ?? []) {
      await expect(page.locator(`#${id}`)).toContainText(field.error);
    }
  }
});

test('Customer address dialog traps focus and restores the add trigger @keyboard @a11y', async ({ page }) => {
  await installCustomerFormFixture(page);
  await page.goto('/alamat', { waitUntil: 'domcontentloaded' });

  const trigger = page.getByRole('button', { name: 'Tambah Alamat' });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Tambah Alamat Baru' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('Customer product dialogs expose names, focus containment and Escape dismissal @keyboard @a11y', async ({ page }) => {
  await installCustomerFormFixture(page);
  await page.goto('/products', { waitUntil: 'domcontentloaded' });

  const trigger = page.getByRole('button', { name: 'Tambah Produk', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Tambah Produk' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('Customer dispute cards and detail dialog are keyboard reachable @keyboard @a11y', async ({ page }) => {
  await installCustomerFormFixture(page, {
    disputes: [{
      id: 'keyboard-dispute-1',
      order_number: 'ORD-KEYBOARD-1',
      category: 'Paket belum diterima',
      description: 'Customer membutuhkan bantuan.',
      status: 'investigating',
      created_at: '2026-09-10T00:00:00.000Z',
      updated_at: '2026-09-10T00:00:00.000Z',
    }],
  });
  await page.goto('/disputes', { waitUntil: 'domcontentloaded' });

  const card = page.getByRole('button', { name: 'Buka detail dispute ORD-KEYBOARD-1' });
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Paket belum diterima' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();
});
