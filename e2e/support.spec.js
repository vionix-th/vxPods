import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

for (const width of [320, 390, 768, 1440]) {
  test(`optional support preserves workspace at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = [];
    await page.route('https://ko-fi.com/**', async (route) => {
      calls.push(route.request().url());
      await route.fulfill({ contentType: 'text/html', body: '<button>One-time</button><button>Monthly</button>' });
    });
    await page.goto('/');
    expect(calls).toHaveLength(0);
    await expect(page.locator('iframe')).toHaveCount(0);
    const draft = page.locator('textarea').first();
    await draft.fill('Support must preserve this draft.');
    const url = page.url();
    const trigger = page.locator('.app-header').getByRole('button', { name: 'Support this project', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Support vxPods' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    await expect(dialog.locator('iframe')).toHaveAttribute('src', 'https://ko-fi.com/vionixconsulting/?hidefeed=true&widget=true&embed=true&preview=true');
    await expect(dialog.locator('iframe')).toHaveAttribute('referrerpolicy', 'no-referrer');
    await expect(dialog.getByRole('link', { name: 'Open Ko-fi in new tab' })).toBeHidden();
    await expect(dialog).not.toContainText('Optional one-time');
    const host = await dialog.locator('.support-panel').boundingBox();
    const panel = await dialog.locator('iframe').boundingBox();
    expect(panel.y - host.y).toBeGreaterThanOrEqual(16);
    expect(Math.abs(panel.x - host.x - (host.x + host.width - panel.x - panel.width))).toBeLessThanOrEqual(2);
    expect(Math.abs(panel.y - host.y - (host.y + host.height - panel.y - panel.height))).toBeLessThanOrEqual(2);
    expect(panel.height).toBeLessThanOrEqual(600);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).include('.support-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: `/tmp/vionix-ux-pods-${width}.png` });
    await page.mouse.click(1, 1);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(draft).toHaveValue('Support must preserve this draft.');
    expect(page.url()).toBe(url);
    await trigger.click();
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.locator('iframe')).toHaveCount(0);
  });
}

test('About transitions to Support without stacked dialogs', async ({ page }) => {
  await page.route('https://ko-fi.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Payment fixture</p>' }));
  await page.goto('/');
  const opener = page.locator('.app-header').getByRole('button', { name: 'About', exact: true });
  await opener.click();
  await page.getByRole('dialog', { name: 'About vxPods' }).getByRole('button', { name: 'Support this project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const support = page.getByRole('dialog', { name: 'Support vxPods' });
  await support.getByRole('button', { name: 'Close dialog' }).click();
  await expect(opener).toBeFocused();
});

test('pointer project actions restore focus to their shell buttons', async ({ page }) => {
  await page.route('https://ko-fi.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Payment fixture</p>' }));
  await page.goto('/');
  const header = page.locator('.app-header');
  const about = header.getByRole('button', { name: 'About', exact: true });
  const support = header.getByRole('button', { name: 'Support this project', exact: true });
  await about.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
  await expect(about).toBeFocused();
  await support.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
  await expect(support).toBeFocused();
});

test('slow panel retains external fallback and loading notice', async ({ page }) => {
  await page.clock.install();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('https://ko-fi.com/**', async (route) => {
    await held;
    await route.fulfill({ contentType: 'text/html', body: '<p>Payment fixture</p>' }).catch(() => {});
  });
  try {
    await page.goto('/');
    await page.locator('.app-header').getByRole('button', { name: 'Support this project', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Support vxPods' });
    await expect(dialog.getByRole('status')).toHaveText('Loading Ko-fi…');
    await page.clock.fastForward(10_000);
    await expect(dialog.getByRole('status')).toContainText('Taking longer than expected');
    await expect(dialog.getByRole('link', { name: 'Open Ko-fi in new tab' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.locator('iframe')).toHaveCount(0);
  } finally { release(); }
});

test('support reflows at a 200% desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await page.route('https://ko-fi.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Payment fixture</p>' }));
  await page.goto('/');
  await page.locator('.app-header').getByRole('button', { name: 'Support this project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Support vxPods' });
  const close = dialog.getByRole('button', { name: 'Close dialog' });
  const bounds = await close.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(450);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await dialog.locator('.dialog-body').evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await close.click();
});
