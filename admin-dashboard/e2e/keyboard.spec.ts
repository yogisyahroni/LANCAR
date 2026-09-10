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
