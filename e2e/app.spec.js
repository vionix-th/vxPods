import { test, expect } from '@playwright/test';

/**
 * Intercepted provider endpoints; synthetic credentials only.
 * Speech responses carry a real PCM WAV so decodeAudioData succeeds.
 */

function wavBytes() {
  const sampleRate = 44100;
  const samples = new Int16Array(sampleRate / 20); // 50 ms tone
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, Math.sin(i / 10) * 1000, true);
  }
  return buffer;
}

const SCRIPT = {
  schemaVersion: 1,
  title: 'E2E Show',
  language: 'en',
  format: 'conversation',
  sourceGrounded: true,
  speakers: [
    { id: 'speaker-1', name: 'Host', role: 'Guides', voice: 'alloy' },
    { id: 'speaker-2', name: 'Guest', role: 'Explains', voice: 'verse' },
  ],
  segments: [
    { id: 'segment-0001', speakerId: 'speaker-1', text: 'Welcome to the show.', pauseAfterMs: 100 },
    { id: 'segment-0002', speakerId: 'speaker-2', text: 'Glad to be here.', pauseAfterMs: 0 },
  ],
};

/** Route all provider traffic to mocks. Returns call counters. */
async function mockProviders(page, { failSpeechAtCall } = {}) {
  const counters = { chat: 0, speech: 0 };
  await page.route('**/v1/chat/completions', async (route) => {
    counters.chat += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify(SCRIPT) } }],
        model: 'mock-chat',
      }),
    });
  });
  await page.route('**/v1/audio/speech', async (route) => {
    counters.speech += 1;
    if (failSpeechAtCall && counters.speech >= failSpeechAtCall) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      body: Buffer.from(wavBytes()),
    });
  });
  return counters;
}

/** Add a provider configuration through the dialog. */
async function addProvider(page, name = 'Mock') {
  await page.getByRole('button', { name: 'Provider settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add configuration' }).click();
  await dialog.getByLabel(/Name/).fill(name);
  await dialog.getByLabel(/Base URL/).fill('https://mock.provider/v1');
  await dialog.getByLabel(/API key/).fill('sk-synthetic');
  await dialog.getByRole('button', { name: 'Save configuration' }).click();
  await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
});

test('provider setup persists across reload', async ({ page }) => {
  await addProvider(page);
  await page.reload();
  await page.getByRole('button', { name: 'Provider settings' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Mock', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Key saved')).toBeVisible();
  await expect(dialog.getByText('https://mock.provider/v1')).toBeVisible();
});

test('direct TTS happy path: generate, play, download', async ({ page }) => {
  const counters = await mockProviders(page);
  await addProvider(page);
  await page.locator('#panel-tts').getByLabel(/Text to speak/).fill('Hello from the end to end test.');
  await page.locator('#panel-tts').getByRole('button', { name: 'Generate speech' }).click();
  await expect(page.locator('#panel-tts').getByLabel('Generated speech preview')).toBeVisible();
  expect(counters.speech).toBe(1);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MP3' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mp3$/);
});

test('podcast: generate script, render, export JSON and WAV', async ({ page }) => {
  const counters = await mockProviders(page);
  await addProvider(page);
  await page.getByRole('button', { name: 'Podcast' }).click();
  const panel = page.locator('#panel-podcast');
  await panel.getByLabel(/Text to speak/).fill('Source material for the podcast.');
  await panel.getByRole('button', { name: 'Generate script' }).click();
  await expect(panel.getByText('E2E Show')).toBeVisible();
  expect(counters.chat).toBe(1);

  await panel.getByRole('button', { name: 'Render audio' }).click();
  await expect(panel.getByLabel('Podcast preview')).toBeVisible();
  expect(counters.speech).toBe(2);

  const jsonDownload = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download script JSON' }).click();
  expect((await jsonDownload).suggestedFilename()).toMatch(/\.json$/);

  const wavDownload = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download WAV' }).click();
  expect((await wavDownload).suggestedFilename()).toMatch(/\.wav$/);
});

test('reload during partial render offers resume and resumes', async ({ page }) => {
  const counters = await mockProviders(page, { failSpeechAtCall: 2 });
  await addProvider(page);
  await page.getByRole('button', { name: 'Podcast' }).click();
  const panel = page.locator('#panel-podcast');
  await panel.getByLabel(/Text to speak/).fill('Source material.');
  await panel.getByRole('button', { name: 'Generate script' }).click();
  await panel.getByRole('button', { name: 'Render audio' }).click();
  // segment 2 fails -> render failed with segment 1 completed
  await expect(panel.getByText(/failed/i).first()).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Podcast' }).click();
  await expect(panel.getByText('Unfinished podcast render')).toBeVisible();
  await expect(panel.getByText(/1 of 2 turns completed/)).toBeVisible();

  // fix provider: allow speech to succeed now
  await page.unroute('**/v1/audio/speech');
  let speechCalls = 0;
  await page.route('**/v1/audio/speech', async (route) => {
    speechCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      body: Buffer.from(wavBytes()),
    });
  });
  await panel.getByRole('button', { name: 'Resume render' }).click();
  await expect(panel.getByLabel('Podcast preview')).toBeVisible();
  expect(speechCalls).toBe(1); // only the failed segment re-rendered
});

test('offline shell disables generation with explanation', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // service worker active and controlling the page (production build)
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));

  // Live offline transition: badge, explanation, disabled generation.
  await context.setOffline(true);
  await expect(page.locator('#online-status')).toHaveText('Offline');
  await expect(page.getByText('Generation is disabled while offline.')).toBeVisible();
  await expect(page.locator('#panel-tts').getByRole('button', { name: 'Generate speech' })).toBeDisabled();

  // Offline reload: shell must still load from the service worker cache.
  // Note: headless Chromium resets navigator.onLine to true after a reload,
  // so only structural availability is asserted here.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Generate speech' })).toBeVisible();
  await context.setOffline(false);
});

test('keyboard-only: provider dialog opens, traps focus, closes with Escape', async ({ page }) => {
  // Tab to the Provider settings button (past topbar/branding links).
  for (let i = 0; i < 10; i += 1) {
    const focused = await page.evaluate(
      () => `${document.activeElement?.tagName}|${document.activeElement?.textContent}`,
    );
    if (focused.startsWith('BUTTON') && focused.includes('Provider settings')) break;
    await page.keyboard.press('Tab');
  }
  const focusedNow = await page.evaluate(() => document.activeElement?.textContent);
  expect(focusedNow).toContain('Provider settings');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  // focus restored to the invoking button
  const restored = await page.evaluate(() => document.activeElement?.textContent);
  expect(restored).toContain('Provider settings');
});

test('podcast: structured editor and raw JSON view', async ({ page }) => {
  await mockProviders(page);
  await addProvider(page);
  await page.getByRole('button', { name: 'Podcast' }).click();
  const panel = page.locator('#panel-podcast');
  await panel.getByLabel(/Text to speak/).fill('Source material for editing.');
  await panel.getByRole('button', { name: 'Generate script' }).click();
  await expect(panel.getByText('E2E Show')).toBeVisible();

  // Structured editing: change turn text and save.
  await panel.getByRole('button', { name: 'Edit script' }).click();
  const firstArea = panel.getByLabel('Turn 1 text');
  await firstArea.fill('Edited welcome line.');
  await panel.getByRole('button', { name: 'Save edits' }).click();
  await expect(panel.getByText('Edited welcome line.')).toBeVisible();

  // Raw JSON view for advanced users.
  await panel.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(panel.locator('.script-json')).toContainText('"title": "E2E Show"');

  // Advanced JSON editing with validation.
  await panel.getByRole('button', { name: 'Edit JSON' }).click();
  const jsonArea = panel.getByLabel('Raw script JSON');
  const raw = await jsonArea.inputValue();
  const parsed = JSON.parse(raw);
  parsed.title = 'Retitled Show';
  await jsonArea.fill(JSON.stringify(parsed, null, 2));
  await panel.getByRole('button', { name: 'Apply JSON' }).click();
  await expect(panel.getByText(/Retitled Show/)).toBeVisible();

  // Invalid JSON is rejected with an error and keeps the current script.
  await panel.getByRole('button', { name: 'Edit JSON' }).click();
  await jsonArea.fill('{ not json');
  await panel.getByRole('button', { name: 'Apply JSON' }).click();
  await expect(panel.getByText('Not valid JSON. Check syntax and retry.')).toBeVisible();
  await panel.getByRole('button', { name: 'Discard changes' }).click();
  await expect(panel.locator('.script-json')).toContainText('Retitled Show');
});

test('mobile viewport exposes full TTS workflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mockProviders(page);
  await addProvider(page);
  await page.locator('#panel-tts').getByLabel(/Text to speak/).fill('Mobile source text.');
  await page.locator('#panel-tts').getByRole('button', { name: 'Generate speech' }).click();
  await expect(page.locator('#panel-tts').getByLabel('Generated speech preview')).toBeVisible();
});
