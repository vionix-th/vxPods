import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

for (const width of [390, 768, 1440]) {
  test(`publisher links and About work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.brand .product-name')).toHaveText('vxPods');
    expect(await page.locator('.brand').evaluate((node) => node.closest('a'))).toBeNull();
    const publisher = page.locator('.app-header').getByRole('link', { name: /By Vionix Consulting/ });
    await expect(publisher).toHaveAttribute('href', 'https://vionix.cloud');
    await expect(publisher).toHaveAttribute('rel', 'noopener noreferrer');
    const trigger = page.locator('.app-header').getByRole('button', { name: 'About', exact: true });
    await page.screenshot({ path: `/tmp/vionix-attribution-pods-shell-${width}.png` });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'About vxPods' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Source code', exact: true })).toHaveAttribute('href', 'https://github.com/vionix-th/vxPods');
    await expect(dialog.getByRole('link', { name: 'Report an issue' })).toHaveAttribute('href', 'https://github.com/vionix-th/vxPods/issues');
    await expect(dialog.getByRole('link', { name: 'MIT license' })).toHaveAttribute('href', 'https://github.com/vionix-th/vxPods/blob/main/LICENSE');
    await expect(dialog).toContainText('App v0.0.0');
    await expect(dialog).toContainText('provider charges may apply');
    const results = await new AxeBuilder({ page }).include('.dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/vionix-attribution-pods-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
