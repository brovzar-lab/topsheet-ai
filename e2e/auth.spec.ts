import { test, expect } from '@playwright/test';

test.describe('Auth gate', () => {
  test('shows sign-in screen when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /topsheet/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  });

  test('sign-in button is accessible by keyboard', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    // Skip link should be focusable first
    await page.keyboard.press('Tab');
    const btn = page.getByRole('button', { name: /continue with google/i });
    await expect(btn).toBeFocused();
  });

  test('login page has correct page title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/topsheet ai/i);
  });

  test('login page has main landmark', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible();
  });
});
