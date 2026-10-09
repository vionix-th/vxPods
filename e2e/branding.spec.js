import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

for (const width of [320, 390, 768, 1440]) {
  test(`publisher links and About work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.app-header .brand .product-name')).toHaveText('vxPods');
    await expect(page.locator('.app-header a.brand')).toHaveAttribute('href', 'https://vionix.cloud');
    await expect.poll(() => page.locator('.app-header .brand-logo').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.app-header .header-actions button svg')).toHaveCount(2);
    const publisher = page.locator('.app-header').getByRole('link', { name: /by Vionix Consulting/i });
    await expect(publisher).toHaveAttribute('href', 'https://vionix.cloud');
    await expect(publisher).toHaveAttribute('rel', 'noopener noreferrer');
    const trigger = page.locator('.app-header').getByRole('button', { name: 'About', exact: true });
    await page.screenshot({ path: `/tmp/vionix-attribution-pods-shell-${width}.png` });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'About vxPods' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.project-resource')).toHaveCount(3);
    await expect(dialog.locator('.about-footer')).toContainText('App v0.0.0');
    await expect.poll(() => dialog.locator('.brand-logo').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
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

for (const width of [320, 390, 720, 768, 910, 1440]) {
  test(`footer layout and keyboard actions work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://ko-fi.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Support fixture</p>' }));
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    await footer.scrollIntoViewIfNeeded();
    const identity = footer.getByRole('link', { name: /by Vionix Consulting/i });
    const about = footer.getByRole('button', { name: 'About', exact: true });
    const support = footer.getByRole('button', { name: 'Support this project', exact: true });
    const resources = footer.getByRole('navigation', { name: 'Project links' });
    await expect(resources.getByRole('link')).toHaveCount(3);
    await expect(resources.getByRole('link', { name: 'Source code', exact: true })).toHaveAttribute('href', 'https://github.com/vionix-th/vxPods');
    await expect(resources.getByRole('link', { name: 'Report an issue' })).toHaveAttribute('href', 'https://github.com/vionix-th/vxPods/issues');
    await expect(resources.getByRole('link', { name: 'MIT license' })).toHaveAttribute('href', 'https://github.com/vionix-th/vxPods/blob/main/LICENSE');
    const brandBounds = await identity.boundingBox();
    const actionBounds = await about.boundingBox();
    const copyrightBounds = await footer.locator('.footer-copyright p').boundingBox();
    const resourceBounds = await resources.boundingBox();
    expect(copyrightBounds.y).toBeGreaterThan(brandBounds.y + brandBounds.height);
    if (width >= 768) {
      expect(actionBounds.x).toBeGreaterThan(brandBounds.x + brandBounds.width);
      expect(Math.abs(actionBounds.y + actionBounds.height / 2 - brandBounds.y - brandBounds.height / 2)).toBeLessThanOrEqual(1);
      expect(resourceBounds.x).toBeGreaterThan(copyrightBounds.x + copyrightBounds.width);
      expect(Math.abs(resourceBounds.y + resourceBounds.height / 2 - copyrightBounds.y - copyrightBounds.height / 2)).toBeLessThanOrEqual(1);
    } else {
      expect(actionBounds.y).toBeGreaterThanOrEqual(brandBounds.y + brandBounds.height);
      expect(resourceBounds.y).toBeGreaterThanOrEqual(copyrightBounds.y + copyrightBounds.height);
    }
    for (const control of await footer.locator('a, button').all()) {
      const bounds = await control.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).include('.app-footer').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: `/tmp/vxpods-footer-${width}.png` });
    await identity.focus();
    for (const control of [about, support, ...await resources.getByRole('link').all()]) {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      expect(await control.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid');
    }
    for (const link of await resources.getByRole('link').all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    for (const [trigger, title] of [[about, 'About vxPods'], [support, 'Support vxPods']]) {
      await trigger.press('Enter');
      const dialog = page.getByRole('dialog', { name: title });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Close dialog' }).press('Enter');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  });
}
