import { test, expect } from '@playwright/test';

test.describe('Portal Auth and Protected routes redirection tests', () => {
  test('redirects unauthorized users from /profil to /login', async ({ page }) => {
    // Navigate to protected page
    await page.goto('/profil');

    // Wait for redirect to login
    await page.waitForURL('**/login');
    
    // Validate we're on login page
    await expect(page).toHaveURL(/login/);
  });
});
