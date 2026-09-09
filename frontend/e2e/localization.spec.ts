import { test, expect } from '@playwright/test';

test.describe('localization and direction contract', () => {
  test('switches the public landing page between Indonesian and English', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const localeSwitcher = page.getByLabel('Pilih bahasa');
    await expect(localeSwitcher).toHaveValue('id-ID');
    await expect(page.locator('html')).toHaveAttribute('lang', 'id-ID');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Semua kiriman');

    await localeSwitcher.selectOption('en-US');
    await expect(page.getByLabel('Choose language')).toHaveValue('en-US');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every delivery');
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  });

  test('keeps the public shell direction-safe for an RTL market', async ({ page }) => {
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

  test('keeps the public shell usable with long translated copy', async ({ page }) => {
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
