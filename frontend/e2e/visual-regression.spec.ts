import { test, expect } from '@playwright/test';
import percySnapshot from '@percy/playwright';

test.describe('Public visual regression @visual', () => {
  test('landing page remains visually stable', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    await percySnapshot(page, 'Customer landing page', {
      widths: [375, 1280],
    });
  });

  test('login page remains visually stable', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await percySnapshot(page, 'Customer login page', {
      widths: [375, 1280],
    });
  });
});
