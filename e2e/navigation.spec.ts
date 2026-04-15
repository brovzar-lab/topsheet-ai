import { test, expect } from '@playwright/test';

// These tests document the expected authenticated navigation flows.
// Run with a valid session cookie or mock auth for full coverage.

test.describe('Unauthenticated redirects', () => {
  test('redirects /project/* to auth gate', async ({ page }) => {
    await page.goto('/project/fake-id/breakdown');
    // Should show sign-in, not a broken page
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  });

  test('redirects /series/* to auth gate', async ({ page }) => {
    await page.goto('/series/fake-id');
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  });

  test('redirects /settings to auth gate', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  });
});
