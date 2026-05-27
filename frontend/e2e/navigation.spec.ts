import { test, expect } from '@playwright/test';

test.describe('Navigation and UI elements tests', () => {
  test('should load the login page and show correct elements', async ({ page }) => {
    // Navigate to local port
    await page.goto('/login');

    // Wait for the login button or title to be visible
    await expect(page.locator('h1')).toContainText('Welcome to TEMBUS');
    
    // Check form inputs are present
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });
});
