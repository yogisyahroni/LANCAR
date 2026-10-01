import { test, expect } from '@playwright/test';

test.describe('Public visual smoke @visual', () => {
  test('landing page remains visually stable', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('login page remains visually stable', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
