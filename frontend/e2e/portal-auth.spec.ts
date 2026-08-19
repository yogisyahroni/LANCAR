import { test, expect } from '@playwright/test';

test.describe('Portal Auth and Protected routes redirection tests', () => {
  test('redirects unauthorized users from /profil to /login', async ({ page }) => {
    // Navigate to protected page — middleware redirects client-side (307 + next query)
    await page.goto('/profil');

    // Wait for the redirect response, then assert final URL (with or without ?next=)
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });

    // Validate we're on login page (form visible = page rendered, not stuck loading)
    await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 15000 });
  });
});