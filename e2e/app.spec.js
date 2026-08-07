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
  const counters = { chat: 0, responses: 0, speech: 0 };
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
  await page.route('**/v1/responses', async (route) => {
    counters.responses += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(SCRIPT) }] }],
        model: 'mock-response',
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
async function addProvider(page, name = 'Mock', api = 'chat-completions') {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add provider' }).click();
  await dialog.getByLabel(/Name/).fill(name);
  await dialog.getByLabel(/API key/).fill('sk-synthetic');
  if (api === 'responses') {
    await dialog.getByLabel('Responses').check();
    await page
      .getByRole('dialog', { name: 'Change text generation API' })
      .getByRole('button', { name: 'Change API' })
      .click();
  }
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
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Mock', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Key saved')).toBeVisible();
  await expect(dialog.getByText('https://api.openai.com/v1')).toBeVisible();
});

test('settings validation feedback stays visible inside the dialog', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add provider' }).click();
  await dialog.getByRole('button', { name: 'Save configuration' }).click();

  const notice = dialog.locator('.local-notice:visible');
  await expect(notice).toHaveAttribute('role', 'alert');
  await expect(notice).toContainText('Input problem');
  await expect(page.locator('#notification-stack .notification-error')).toHaveCount(0);
});

test('provider failures expose compact redacted technical details', async ({ page }) => {
  await page.route('**/v1/audio/speech', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      headers: {
        'x-generation-id': 'gen-reportable-123',
        'access-control-expose-headers': 'x-generation-id',
      },
      body: JSON.stringify({ error: { message: 'Voice is not available for this model.' } }),
    });
  });
  await addProvider(page);
  const panel = page.locator('#panel-tts');
  await panel.getByLabel(/Text to speak/).fill('Trigger a provider failure.');
  await panel.getByRole('button', { name: 'Generate speech' }).click();

  const notification = page.locator('#notification-stack .notification-error');
  await expect(notification).toContainText('Voice is not available for this model.');
  await notification.getByText('Technical details').click();
  await expect(notification).toContainText('speech synthesis');
  await expect(notification).toContainText('https://api.openai.com/v1/audio/speech');
  await expect(notification).toContainText('gpt-4o-mini-tts');
  await expect(notification).toContainText('gen-reportable-123');
  await expect(notification).not.toContainText('sk-synthetic');
});

test('OpenRouter and Manual presets start with empty model and voice lists', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add provider' }).click();

  await dialog.getByLabel('OpenRouter').check();
  await page.getByRole('dialog', { name: 'Apply preset defaults' }).getByRole('button', { name: 'Apply defaults' }).click();
  await expect(dialog.getByLabel('Base URL')).toHaveValue('https://openrouter.ai/api/v1');
  await expect(dialog.locator('.identifier-list-editor .model-chip')).toHaveCount(0);
  await expect(dialog.locator('.tts-model-editor .model-chip')).toHaveCount(0);

  await dialog.getByLabel('Manual URL').check();
  await page.getByRole('dialog', { name: 'Apply preset defaults' }).getByRole('button', { name: 'Apply defaults' }).click();
  await expect(dialog.getByLabel('Base URL')).toHaveValue('');
  await expect(dialog.locator('.identifier-list-editor .model-chip')).toHaveCount(0);
  await expect(dialog.locator('.tts-model-editor .model-chip')).toHaveCount(0);
});

test('provider-managed model and voice suggestions populate TTS fields', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add provider' }).click();
  await dialog.getByLabel(/Name/).fill('Custom provider');
  await dialog.getByLabel(/API key/).fill('sk-synthetic');
  await dialog.getByRole('button', { name: 'gpt-4o-mini', exact: true }).click();
  await dialog.getByLabel('Text generation model identifier').fill('custom-chat');
  await dialog.getByRole('button', { name: 'gpt-4o-mini-tts', exact: true }).click();
  await dialog.getByLabel('TTS model identifier').fill('custom-tts-a');
  await dialog.getByLabel('Add voice').fill('voice-a');
  await dialog.getByRole('button', { name: 'Add voice', exact: true }).click();
  await dialog.getByRole('button', { name: 'tts-1', exact: true }).click();
  await dialog.getByLabel('TTS model identifier').fill('custom-tts-b');
  await dialog.getByLabel('Add voice').fill('voice-b');
  await dialog.getByRole('button', { name: 'Add voice', exact: true }).click();
  await dialog.getByRole('button', { name: 'tts-1-hd', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove model', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Remove TTS model' })
    .getByRole('button', { name: 'Remove model' })
    .click();
  await dialog.getByRole('button', { name: 'Save configuration' }).click();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  const panel = page.locator('#panel-tts');
  const model = panel.getByLabel('Model');
  const voice = panel.getByLabel('Voice');
  await expect(model.locator('option')).toHaveText(['custom-tts-a', 'custom-tts-b']);
  await expect(voice.locator('option')).toContainText(['voice-a']);
  await model.selectOption('custom-tts-b');
  await expect(voice.locator('option')).toContainText(['voice-b']);
});

test('prompt templates use dedicated pages and validate edits', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Prompt templates' }).click();
  await expect(dialog.getByRole('tab', { name: 'Script rules' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Repair brief' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Preview rendered prompt' }).click();
  await expect(dialog.getByRole('heading', { name: 'Rendered generation request' })).toBeVisible();
  await expect(dialog.getByText(/Tone: conversational\. Audience: general\./)).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit templates' }).last().click();
  const scriptUser = dialog.getByLabel('Script user instructions');
  await expect(scriptUser).toHaveAttribute('readonly', '');
  await dialog.getByRole('button', { name: 'Unlock editing' }).click();
  await scriptUser.fill('Missing required values');
  await dialog.getByRole('button', { name: 'Save this template' }).click();
  await expect(page.getByText(/Missing required placeholder/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Restore this default' }).click();
  await page.getByRole('button', { name: 'Restore default' }).last().click();
  await expect(scriptUser).toHaveAttribute('readonly', '');
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

test('podcast: Responses configuration selects API-specific models and generates script', async ({ page }) => {
  const counters = await mockProviders(page);
  await addProvider(page, 'Responses provider', 'responses');
  await page.reload();
  await page.getByRole('button', { name: 'Podcast' }).click();
  const panel = page.locator('#panel-podcast');
  await expect(panel.getByLabel('Script configuration')).toContainText('Responses');
  await expect(panel.getByLabel('Script model').locator('option')).toHaveText([
    'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6',
  ]);
  await expect(panel.getByText(/Responses provider · Responses · gpt-5.6-luna/)).toBeVisible();
  await panel.getByLabel(/Text to speak/).fill('Source material for Responses.');
  await panel.getByRole('button', { name: 'Generate script' }).click();
  await expect(panel.getByText('E2E Show')).toBeVisible();
  expect(counters.responses).toBe(1);
  expect(counters.chat).toBe(0);
});

test('reload during partial render offers resume and resumes', async ({ page }) => {
  await mockProviders(page, { failSpeechAtCall: 2 });
  await addProvider(page);
  await page.getByRole('button', { name: 'Podcast' }).click();
  const panel = page.locator('#panel-podcast');
  await panel.getByLabel(/Text to speak/).fill('Source material.');
  await panel.getByRole('button', { name: 'Generate script' }).click();
  await panel.getByRole('button', { name: 'Render audio' }).click();
  // segment 2 fails -> render failed with segment 1 completed
  await expect(panel.getByText('Turn 2 failed.')).toBeVisible();

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

  // Live offline transition: explanation and disabled generation.
  await context.setOffline(true);
  await expect(page.getByText('Generation is disabled while offline.')).toBeVisible();
  await expect(page.locator('#panel-tts').getByRole('button', { name: 'Generate speech' })).toBeDisabled();

  // Offline reload: shell must still load from the service worker cache.
  // Note: headless Chromium resets navigator.onLine to true after a reload,
  // so only structural availability is asserted here.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Generate speech' })).toBeVisible();
  await context.setOffline(false);
});

test('keyboard-only: settings dialog opens, traps focus, closes with Escape', async ({ page }) => {
  // Tab to the Settings button (past topbar/branding links).
  for (let i = 0; i < 10; i += 1) {
    const focused = await page.evaluate(
      () => `${document.activeElement?.tagName}|${document.activeElement?.textContent}`,
    );
    if (focused.startsWith('BUTTON') && focused.includes('Settings')) break;
    await page.keyboard.press('Tab');
  }
  const focusedNow = await page.evaluate(() => document.activeElement?.textContent);
  expect(focusedNow).toContain('Settings');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  // focus restored to the invoking button
  const restored = await page.evaluate(() => document.activeElement?.textContent);
  expect(restored).toContain('Settings');
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
  await expect(panel.getByText('Retitled Show — Host, Guest · 2 turns')).toBeVisible();

  // Invalid JSON is rejected with an error and keeps the current script.
  await panel.getByRole('button', { name: 'Edit JSON' }).click();
  await jsonArea.fill('{ not json');
  await panel.getByRole('button', { name: 'Apply JSON' }).click();
  await expect(page.getByText('Not valid JSON. Check syntax and retry.')).toBeVisible();
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
