import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

async function openProviderEditor(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('button', { name: 'Add provider' }).click();
  return settings;
}

for (const width of [910, 560, 320]) {
  test(`TTS model actions have visible labels and reflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 954 });
    const settings = await openProviderEditor(page);
    const detail = settings.locator('.tts-model-detail');
    const add = detail.getByRole('button', { name: 'Add voice', exact: true });
    const restore = detail.getByRole('button', { name: 'Restore known voices', exact: true });
    const remove = detail.getByRole('button', { name: 'Remove TTS model', exact: true });

    for (const [button, label] of [[add, 'Add voice'], [restore, 'Restore known voices'], [remove, 'Remove TTS model']]) {
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      await expect(button.locator('span')).toHaveText(label);
      await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true');
      await expect(button.locator('svg')).toHaveAttribute('focusable', 'false');
      const bounds = await button.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }

    const restoreBounds = await restore.boundingBox();
    const removeBounds = await remove.boundingBox();
    if (width === 910) {
      expect(removeBounds.y).toBe(restoreBounds.y);
      expect(removeBounds.x).toBeGreaterThan(restoreBounds.x + restoreBounds.width);
      const accessibility = await new AxeBuilder({ page })
        .include('.tts-model-actions')
        .include('.add-voice-row')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(accessibility.violations).toEqual([]);
    } else if (width === 320) {
      expect(removeBounds.y).toBeGreaterThanOrEqual(restoreBounds.y + restoreBounds.height);
      expect(removeBounds.x).toBe(restoreBounds.x);
    }
    expect(await detail.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
      await detail.evaluate((element) => element.clientWidth),
    );
  });
}

test('TTS actions support keyboard input and preserve confirmation behavior', async ({ page }) => {
  const settings = await openProviderEditor(page);
  const detail = settings.locator('.tts-model-detail');
  const addVoice = detail.getByLabel('Add voice');
  const restore = detail.getByRole('button', { name: 'Restore known voices' });
  const remove = detail.getByRole('button', { name: 'Remove TTS model' });
  const customVoice = detail.getByRole('button', { name: 'Remove voice custom-voice', exact: true });
  await addVoice.fill('custom-voice');
  await addVoice.press('Enter');
  await expect(customVoice).toBeVisible();
  await expect(addVoice).toHaveValue('');
  await addVoice.press('Tab');
  await expect(detail.getByRole('button', { name: 'Add voice', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(restore).toBeFocused();
  await page.keyboard.press('Enter');

  const restoreDialog = page.getByRole('dialog', { name: 'Restore known model voices', exact: true });
  await expect(restoreDialog).toContainText('gpt-4o-mini-tts');
  await restoreDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(customVoice).toBeVisible();
  await expect(restore).toBeFocused();
  await page.keyboard.press('Enter');
  await restoreDialog.getByRole('button', { name: 'Restore voices', exact: true }).click();
  await expect(customVoice).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Remove voice alloy', exact: true })).toBeVisible();
  await expect(restore).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Enter');

  const removeDialog = page.getByRole('dialog', { name: 'Remove TTS model', exact: true });
  await expect(removeDialog).toContainText('gpt-4o-mini-tts');
  await removeDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(settings.locator('.tts-model-editor .model-chip')).toHaveCount(3);
  await expect(remove).toBeFocused();
  await page.keyboard.press('Enter');
  await removeDialog.getByRole('button', { name: 'Remove model', exact: true }).click();
  await expect(settings.locator('.tts-model-editor .model-chip')).toHaveCount(2);
  await expect(detail.getByLabel('TTS model identifier')).toHaveValue('tts-1');
});
