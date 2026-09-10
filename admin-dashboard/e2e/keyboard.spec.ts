import { expect, test } from '@playwright/test';

test('Admin login keeps the primary form keyboard reachable and announces auth errors @keyboard', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });
  const email = page.getByLabel('Email Address');
  const password = page.getByLabel('Password');
  await email.focus();
  await expect(email).toBeFocused();
  await expect.poll(() => email.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px');
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('checkbox', { name: /remember/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /forgot password/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /sign in to console/i })).toBeFocused();
});

test('Admin collapsed sidebar preserves names, current location and focus @keyboard', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'keyboard-fixture', name: 'Keyboard Fixture', role: 'super_admin', permissions: [] } }),
      });
      return;
    }
    if (url.includes('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#main-content')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();

  const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
  await expect(dashboardLink).toHaveAttribute('aria-label', 'Dashboard');
  await expect(dashboardLink).toHaveAttribute('title', 'Dashboard');
  await expect(dashboardLink).toHaveAttribute('aria-current', 'page');
  await dashboardLink.focus();
  await expect(dashboardLink).toBeFocused();
  await expect.poll(() => dashboardLink.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px');
});

test('Admin feature flag switch exposes state and Escape restores focus @keyboard @a11y', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'feature-flag-keyboard-fixture',
            name: 'Feature Flag Keyboard Fixture',
            role: 'super_admin',
            permissions: ['experience.read', 'experience.feature_flag.write'],
          },
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/feature-flags')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ key: 'semantic_state_fixture', name: 'Semantic state fixture', category: 'ui', is_enabled: false }]),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/audit-logs')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (url.pathname.endsWith('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/app-experience/feature-flags', { waitUntil: 'domcontentloaded' });

  const switchControl = page.getByRole('switch', { name: 'Aktifkan semantic_state_fixture' });
  await expect(switchControl).toBeVisible();
  await expect(switchControl).toHaveAttribute('aria-checked', 'false');
  await switchControl.focus();
  await expect(switchControl).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Aktifkan Feature?' });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Alasan Perubahan (wajib)')).toBeVisible();
  await expect(page.getByLabel('Rollback Plan (wajib untuk high-blast flag)')).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(switchControl).toBeFocused();
});

test('Admin login associates server errors with both credential fields @a11y', async ({ page }) => {
  await page.route('**/auth/web/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
  });
  await page.goto('/login', { waitUntil: 'networkidle' });

  const email = page.getByLabel('Email Address');
  const password = page.getByLabel('Password');
  await email.fill('admin@example.test');
  await password.fill('incorrect-password');
  await page.getByRole('button', { name: /sign in to console/i }).click();

  await expect(page.locator('#admin-login-error')).toContainText('Invalid credentials');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveAttribute('aria-describedby', 'admin-login-error');
  await expect(password).toHaveAttribute('aria-describedby', 'admin-login-error');
});
