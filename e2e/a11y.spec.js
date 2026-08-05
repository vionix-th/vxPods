import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test('app shell passes automated WCAG 2.2 AA checks', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('provider dialog passes automated accessibility checks', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Provider settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('.dialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
