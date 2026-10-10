import { test, expect } from '@playwright/test';
import jsQR from 'jsqr';
import AxeBuilder from '@axe-core/playwright';

const networks = ['Bitcoin', 'Ethereum Mainnet', 'Solana', 'Base', 'Arbitrum One', 'Optimism', 'Polygon PoS', 'BNB Smart Chain'];
const addresses = ['bc1qesd92qv7h3mlh4qqs4grz3e32phvxj6spwkcyz', '0x0D4aAc6d3C5DF6D162F121992eBD441728B143a2', '7oLWWpSrEG6aDKVZDAyuAjF3kDKEgAmnG3Q7JAb9uUXy'];
const addressFor = (index) => addresses[index === 0 ? 0 : index === 2 ? 2 : 1];
async function openCrypto(page) {
  await page.route('https://ko-fi.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Payment fixture</p>' }));
  await page.goto('/');
  await page.locator('.support-trigger').filter({ visible: true }).first().click();
  const dialog = page.locator('.support-dialog');
  await dialog.getByRole('tab').nth(1).click();
  return dialog;
}
async function selectNetwork(dialog, name) {
  await dialog.getByRole('combobox').click();
  await dialog.getByRole('option', { name, exact: true }).click();
  await expect(dialog.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
}
async function decodeQR(qr) {
  const screenshot = await qr.screenshot();
  const { pixels, size } = await qr.evaluate(async (_svg, png) => {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    image.src = `data:image/png;base64,${png}`;
    await loaded;
    const size = image.width;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, size, size);
    return { pixels: Array.from(context.getImageData(0, 0, size, size).data), size };
  }, screenshot.toString('base64'));
  return jsQR(new Uint8ClampedArray(pixels), size, size)?.data;
}


test('ordered network icons and locally decoded QR destinations preserve Ko-fi state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const dialog = await openCrypto(page);
  const frame = await dialog.locator('iframe').elementHandle();
  const baseline = await dialog.boundingBox();
  await dialog.getByRole('combobox').click();
  await expect(dialog.getByRole('option')).toHaveText(networks);
  expect(await dialog.getByRole('option').evaluateAll((rows) => rows.every((row) => row.querySelector('svg') && getComputedStyle(row).borderTopWidth === '0px'))).toBe(true);
  await dialog.getByRole('heading').click();
  await expect(dialog.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  for (const [index, name] of networks.entries()) {
    await selectNetwork(dialog, name);
    await expect(dialog.locator('.donation-address')).toHaveText(addressFor(index));
    await expect(dialog.locator('.donation-network-icon svg')).toHaveCount(1);
    expect(await decodeQR(dialog.locator('.donation-qr'))).toBe(addressFor(index));
    expect(await dialog.boundingBox()).toEqual(baseline);
    const native = index === 0 ? 'BTC' : index === 2 ? 'SOL' : index === 6 ? 'POL' : index === 7 ? 'BNB' : 'ETH';
    await expect(dialog.locator('.donation-assets')).toHaveText(index === 0 ? native : `${native}, USDC, USDT and other tokens`);
  }
  await expect(dialog.locator('.donation-instruction')).toHaveCount(0);
  await dialog.getByRole('tab').nth(0).click();
  await expect(dialog.locator('iframe')).toBeVisible();
  expect(await frame.evaluate((node) => node.isConnected)).toBe(true);
  await dialog.getByRole('tab').nth(1).click();
  await expect(dialog.getByRole('combobox')).toContainText('BNB Smart Chain');
  await dialog.locator('.support-close, .dialog-close').click();
  await page.locator('.support-trigger').filter({ visible: true }).first().click();
  await expect(dialog.getByRole('tab').nth(0)).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('tab').nth(1).click();
  await expect(dialog.getByRole('combobox')).toContainText('Bitcoin');
  expect(errors).toEqual([]);
});

test('clipboard confirmation resets without resizing and denied copy offers manual selection', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const dialog = await openCrypto(page);
  await page.clock.install();
  const baseline = await dialog.boundingBox();
  await dialog.getByRole('button', { name: 'Copy address', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(addresses[0]);
  expect(await dialog.boundingBox()).toEqual(baseline);
  await page.clock.fastForward(2100);
  await expect(dialog.getByRole('button', { name: 'Copy address', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Copy address', exact: true }).click();
  await page.clock.fastForward(1000);
  await selectNetwork(dialog, 'Base');
  await dialog.getByRole('button', { name: 'Copy address', exact: true }).click();
  await page.clock.fastForward(1100);
  await expect(dialog.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  await page.clock.fastForward(1100);
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new DOMException('Clipboard denied', 'NotAllowedError'); } }));
  await dialog.getByRole('button', { name: 'Copy address', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Copy manually', exact: true })).toBeEnabled();
  await expect(dialog.locator('.donation-address')).toBeFocused();
  expect(await page.evaluate(() => getSelection().toString())).toBe(addresses[1]);
  expect(await dialog.boundingBox()).toEqual(baseline);
});

test('keyboard choices, cancellation and stale clipboard completion preserve destination', async ({ page }) => {
  const dialog = await openCrypto(page);
  const network = dialog.getByRole('combobox');
  await network.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(network).toContainText('Ethereum Mainnet');
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(network).toContainText('Ethereum Mainnet');
  await page.keyboard.type('sol');
  await page.keyboard.press('Enter');
  await expect(network).toContainText('Solana');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(network).toContainText('Bitcoin');
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => new Promise((resolve) => { window.finishCopy = resolve; }) }));
  await dialog.getByRole('button', { name: 'Copy address', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Copy address', exact: true })).toBeDisabled();
  await selectNetwork(dialog, 'Solana');
  await page.evaluate(() => window.finishCopy());
  await expect(dialog.getByRole('button', { name: 'Copy address', exact: true })).toBeEnabled();
  await expect(dialog.locator('.donation-status')).toBeEmpty();
});

for (const width of [320, 390, 768, 1440]) {
  for (const locale of ['en']) {
    test(`crypto layout and menu fit ${width}px in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 900 });

      const dialog = await openCrypto(page);
      const compact = width <= 420;
      const toggle = dialog.locator('.donation-qr-toggle');
      if (compact) { await expect(toggle).toBeVisible(); await expect(dialog.locator('.donation-qr')).toBeHidden(); }
      else await expect(dialog.locator('.donation-qr')).toBeVisible();
      const baseline = await dialog.boundingBox();
      for (const name of ['Bitcoin', 'Solana', 'BNB Smart Chain', 'Ethereum Mainnet']) {
        await selectNetwork(dialog, name);
        expect(await dialog.boundingBox()).toEqual(baseline);
      }
      await dialog.getByRole('combobox').click();
      const bounds = await dialog.getByRole('listbox').boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(width === 320 ? 640 : 900);
      await page.keyboard.press('Escape');
      const overflow = await dialog.evaluate((node) => node.scrollWidth > node.clientWidth || document.documentElement.scrollWidth > innerWidth);
      expect(overflow).toBe(false);
      await dialog.screenshot({ path: `/tmp/vxPods-crypto-${width}-${locale}.png` });
      if (compact) { await toggle.click(); await expect(dialog.locator('.donation-qr')).toBeVisible(); }
      expect(await decodeQR(dialog.locator('.donation-qr'))).toBe(addresses[1]);
      if (compact) {
        const copy = dialog.locator('.donation-copy');
        await copy.scrollIntoViewIfNeeded();
        await expect(copy).toBeInViewport();
      }
      if (locale === 'th') {
        await expect(dialog.getByRole('tab').nth(1)).toHaveText('คริปโต');
        await expect(dialog.getByRole('button', { name: 'คัดลอกที่อยู่', exact: true })).toBeVisible();
        await expect(dialog.locator('.donation-assets')).toContainText('โทเคนอื่น');
      }
    });
  }
}

test('crypto controls and selected options meet accessibility contrast requirements', async ({ page }) => {
  const dialog = await openCrypto(page);
  for (const expanded of [false, true]) {
    if (expanded) await dialog.getByRole('combobox').click();
    const results = await new AxeBuilder({ page }).include('.support-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
  }
});
