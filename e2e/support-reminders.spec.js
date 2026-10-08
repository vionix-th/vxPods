import { test, expect } from '@playwright/test';
const now = new Date(2026, 0, 4, 12).getTime();
async function seed(page, count = 5) {
  await page.clock.setFixedTime(now);
  await page.addInitScript(({ first, count }) => {
    localStorage.setItem('vxPods.support-reminders', JSON.stringify({
      version: 1, firstUsedAt: first, activeDays: ['2026-01-01', '2026-01-02', '2026-01-03'],
      count, cooldownUntil: 0, disabled: false,
    }));
  }, { first: now - 72 * 3600000, count });
}
for (const width of [320, 390, 768, 1440]) {
  test(`persistent secondary reminder at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    let calls = 0;
    await page.route('https://ko-fi.com/**', (route) => { calls++; return route.fulfill({ body: '<button>Monthly</button>' }); });
    await page.goto('/');
    const card = page.locator('.support-reminder');
    await expect(page.getByRole('status', { name: 'Support reminder' })).toBeVisible();
    await page.waitForTimeout(6500);
    await expect(card).toBeVisible();
    expect(calls).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/pods-reminder-${width}.png` });
    const url = page.url();
    await card.getByRole('button', { name: 'Support', exact: true }).click();
    await expect(card).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.locator('.app-header .support-trigger')).toBeFocused();
    expect(page.url()).toBe(url);
    await expect(page.locator('iframe')).toHaveCount(0);
  });
}
test('editing and operational notifications suspend the same card', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const card = page.locator('.support-reminder');
  await expect(card).toBeVisible();
  const draft = page.locator('textarea').first();
  await draft.fill('Keep this draft');
  await expect(card).toBeHidden();
  await page.locator('h1').click();
  await expect(card).toBeVisible();
  await page.context().setOffline(true);
  const operation = page.locator('.notification:not(.support-reminder)');
  await expect(operation).toContainText('Offline');
  await expect(card).toBeHidden();
  await operation.getByRole('button', { name: 'Dismiss Offline' }).click();
  await page.context().setOffline(false);
  await expect(operation).toContainText('Back online');
  await operation.getByRole('button', { name: 'Dismiss Back online' }).click();
  await expect(card).toBeVisible();
  await page.evaluate(() => {
    const scope = document.createElement('dialog'); scope.id = 'busy-fixture';
    document.body.append(scope); scope.showModal();
  });
  await expect(card).toBeHidden();
  await page.evaluate(() => { document.getElementById('busy-fixture').close(); document.getElementById('busy-fixture').remove(); });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Not now' }).click();
  await expect(card).toHaveCount(0);
  await expect(draft).toHaveValue('Keep this draft');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vxPods.support-reminders')).count)).toBe(0);
});
test('opt-out survives reload and manual Support preserves it', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.locator('.support-reminder').getByRole('button', { name: 'Don’t remind me' }).click();
  const other = await page.context().newPage();
  await other.goto('/');
  await expect(other.locator('.support-reminder')).toHaveCount(0);
  await other.route('https://ko-fi.com/**', (route) => route.fulfill({ body: 'Fixture' }));
  await other.locator('.app-header .support-trigger').click();
  expect(await other.evaluate(() => JSON.parse(localStorage.getItem('vxPods.support-reminders')).disabled)).toBe(true);
  await other.close();
});
test('fresh startup has no reminder or Ko-fi request', async ({ page }) => {
  let calls = 0;
  page.on('request', (request) => { if (request.url().includes('ko-fi.com')) calls++; });
  await page.goto('/');
  await expect(page.locator('.support-reminder')).toHaveCount(0);
  expect(calls).toBe(0);
});
test('200% text scaling keeps all actions within viewport', async ({ page }) => {
  await seed(page); await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await page.locator('html').evaluate((node) => { node.style.fontSize = '200%'; });
  const card = page.locator('.support-reminder');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Don’t remind me' }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.getByRole('button', { name: 'Don’t remind me' }).click();
});

test('Clear local data explicitly removes reminder metadata', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('vxPods.support-reminders', JSON.stringify({ version: 1, firstUsedAt: null, activeDays: [], count: 0, cooldownUntil: 0, disabled: true })));
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByRole('button', { name: 'Data & privacy', exact: true }).click();
  await page.getByRole('button', { name: 'Clear local data', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Clear local data', exact: true });
  await expect(confirmation).toContainText('support reminder preferences');
  await confirmation.getByRole('button', { name: 'Clear local data', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('vxPods.support-reminders'))).toBeNull();
});
