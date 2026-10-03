import { test, expect } from '@playwright/test';

test.describe('Public visual smoke @visual', () => {
  test('customer root enters the login portal', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test('login page remains visually stable', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
