import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('auth page has no critical axe violations', async ({ page }) => {
    await page.goto('/');
    // Inject axe-core and run audit
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js',
    });
    const violations = await page.evaluate(async () => {
      // @ts-expect-error — axe is injected at runtime via addScriptTag
      const results = await window.axe.run();
      return results.violations.filter((v: { impact: string }) =>
        v.impact === 'critical' || v.impact === 'serious'
      );
    });
    expect(violations, `axe violations: ${JSON.stringify(violations, null, 2)}`).toHaveLength(0);
  });

  test('skip-to-main link is present and focusable', async ({ page }) => {
    await page.goto('/');
    // Tab to skip link
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /skip to main/i });
    await expect(skipLink).toBeFocused();
  });
});
