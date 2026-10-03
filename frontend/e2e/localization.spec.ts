import { test, expect } from '@playwright/test';

test.describe('localization and direction contract', () => {
  test('customer root redirects to the localized login portal', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'id-ID');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('keeps the login portal direction-safe for an RTL market', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document.documentElement.lang = 'ar';
      document.documentElement.dir = 'rtl';
      document.documentElement.dataset.locale = 'ar';
    });

    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });

  test('keeps the login portal usable with long translated copy', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const heading = page.getByRole('heading', { level: 1 });
    await heading.evaluate((node) => {
      node.textContent = 'Every delivery deserves a clear, helpful and trustworthy experience across every market';
    });

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});
