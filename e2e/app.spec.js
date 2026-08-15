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
  speakers: [
    { id: 'speaker-1', name: 'Host', role: 'Guides', voice: 'alloy' },
    { id: 'speaker-2', name: 'Guest', role: 'Explains', voice: 'verse' },
  ],
  segments: [
    { id: 'segment-0001', speakerId: 'speaker-1', text: 'Welcome to the show.', pauseAfterMs: 100 },
    { id: 'segment-0002', speakerId: 'speaker-2', text: 'Glad to be here.', pauseAfterMs: 0 },
  ],
};

const PLAN = {
  schemaVersion: 1,
  workingTitle: 'E2E editorial plan',
  editorialGoal: 'Explain the source’s central idea.',
  listenerPromise: 'Understand the central idea and why it matters.',
  formatApproach: 'Develop the topic through the selected format.',
  priorities: ['Central idea'],
  exclusions: [],
  speakerContributions: [
    { speakerId: 'speaker-1', contribution: 'Orient the listener and connect the discussion.' },
    { speakerId: 'speaker-2', contribution: 'Explain the central idea and its implications.' },
  ],
  beats: [{ id: 'beat-1', title: 'Central idea', purpose: 'Establish and develop the main issue.' }],
  ending: 'Consolidate the listener takeaway.',
};

/** Route all provider traffic to mocks. Returns call counters. */
async function mockProviders(page, { failSpeechAtCall } = {}) {
  const counters = { chat: 0, responses: 0, speech: 0 };
  await page.route('**/v1/chat/completions', async (route) => {
    counters.chat += 1;
    const request = route.request().postDataJSON();
    const output = JSON.stringify(request).includes('You are the editorial planner') ? PLAN : SCRIPT;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify(output) } }],
        model: 'mock-chat',
      }),
    });
  });
  await page.route('**/v1/responses', async (route) => {
    counters.responses += 1;
    const request = route.request().postDataJSON();
    const output = JSON.stringify(request).includes('You are the editorial planner') ? PLAN : SCRIPT;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
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
  await dialog.getByRole('textbox', { name: 'API key' }).fill('sk-synthetic');
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

test('model and voice selectors stay unavailable without a provider configuration', async ({ page }) => {
  const ttsPanel = page.locator('#panel-tts');
  await expect(ttsPanel.getByLabel('Model')).toBeDisabled();
  await expect(ttsPanel.getByLabel('Model').locator('option')).toHaveCount(0);
  const ttsVoice = ttsPanel.getByRole('combobox', { name: 'Voice', exact: true });
  await expect(ttsVoice).toBeDisabled();
  await expect(ttsVoice.locator('option')).toHaveCount(0);

  await page.getByRole('button', { name: 'Podcast', exact: true }).click();
  const podcastPanel = page.locator('#panel-podcast');
  await expect(podcastPanel.getByLabel('Script model')).toBeDisabled();
  await expect(podcastPanel.getByLabel('Script model').locator('option')).toHaveCount(0);
  await expect(podcastPanel.getByLabel('TTS model')).toBeDisabled();
  await expect(podcastPanel.getByLabel('TTS model').locator('option')).toHaveCount(0);
  const podcastVoices = podcastPanel.getByRole('combobox', { name: 'Voice', exact: true });
  await expect(podcastVoices).toHaveCount(2);
  for (const voice of await podcastVoices.all()) {
    await expect(voice).toBeDisabled();
    await expect(voice.locator('option')).toHaveCount(0);
  }
});

test('podcast episode draft survives reload and New episode clears it', async ({ page }) => {
  await page.getByRole('button', { name: 'Podcast', exact: true }).click();
  const panel = page.locator('#panel-podcast');
  await panel.getByLabel(/Text to speak/).fill('Persist this source.');
  await panel.getByLabel('Audience').fill('Busy readers');
  await panel.getByLabel('Review plan before writing').check();
  await panel.getByRole('button', { name: 'Add speaker' }).click();
  await panel.locator('.speaker-card').nth(2).getByLabel('Name (required)').fill('Third speaker');
  await page.waitForTimeout(300);

  await page.reload();
  await page.getByRole('button', { name: 'Podcast', exact: true }).click();
  await expect(panel.getByLabel(/Text to speak/)).toHaveValue('Persist this source.');
  await expect(panel.getByLabel('Audience')).toHaveValue('Busy readers');
  await expect(panel.getByLabel('Review plan before writing')).toBeChecked();
  await expect(panel.locator('.speaker-card')).toHaveCount(3);
  await expect(panel.locator('.speaker-card').nth(2).getByLabel('Name (required)')).toHaveValue('Third speaker');

  await panel.getByRole('button', { name: 'New episode' }).click();
  const dialog = page.getByRole('dialog', { name: 'New episode' });
  await dialog.getByRole('button', { name: 'Discard and start new' }).click();
  await expect(panel.getByLabel(/Text to speak/)).toHaveValue('');
  await expect(panel.locator('.speaker-card')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vxpods.podcast-draft'))).toBeNull();
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

test('provider Temperature is blank for new configurations', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add provider' }).click();
  const temperature = dialog.getByLabel('Temperature', { exact: true });

  await expect(temperature).toBeEnabled();
  await expect(temperature).toHaveValue('');
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

test('provider-managed voices follow TTS provider and model changes', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add provider' }).click();
  await dialog.getByLabel('Manual URL').check();
  await page.getByRole('dialog', { name: 'Apply preset defaults' }).getByRole('button', { name: 'Apply defaults' }).click();
  await dialog.getByLabel(/Name/).fill('Custom provider');
  await dialog.getByLabel('Base URL').fill('https://api.openai.com/v1');
  await dialog.getByRole('textbox', { name: 'API key' }).fill('sk-synthetic');
  await dialog.getByRole('button', { name: 'Add text generation model' }).click();
  await dialog.getByLabel('Text generation model identifier').fill('custom-chat');
  await dialog.getByRole('button', { name: 'Add TTS model' }).click();
  await dialog.getByLabel('TTS model identifier').fill('custom-tts-a');
  await dialog.getByLabel('Add voice').fill('voice-a');
  await dialog.getByRole('button', { name: 'Add voice', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add TTS model' }).click();
  await dialog.getByLabel('TTS model identifier').fill('custom-tts-b');
  await dialog.getByLabel('Add voice').fill('voice-b');
  await dialog.getByRole('button', { name: 'Add voice', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save configuration' }).click();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  const panel = page.locator('#panel-tts');
  const model = panel.getByLabel('Model');
  const voice = panel.getByRole('combobox', { name: 'Voice', exact: true });
  await expect(model.locator('option')).toHaveText(['custom-tts-a', 'custom-tts-b']);
  await expect(voice.locator('option')).toContainText(['voice-a']);
  await model.selectOption('custom-tts-b');
  await expect(voice.locator('option')).toHaveText(['voice-b']);

  await page.getByRole('button', { name: 'Podcast', exact: true }).click();
  const podcastPanel = page.locator('#panel-podcast');
  const podcastModel = podcastPanel.getByLabel('TTS model');
  const podcastVoices = podcastPanel.getByRole('combobox', { name: 'Voice', exact: true });
  await expect(podcastVoices.first().locator('option')).toHaveText(['voice-a']);
  await podcastModel.selectOption('custom-tts-b');
  for (const speakerVoice of await podcastVoices.all()) {
    await expect(speakerVoice.locator('option')).toHaveText(['voice-b']);
  }

  await page.getByRole('button', { name: 'Settings' }).click();
  await dialog.getByRole('button', { name: 'Add provider' }).click();
  await dialog.getByLabel(/Name/).fill('Second provider');
  await dialog.getByRole('textbox', { name: 'API key' }).fill('sk-synthetic-2');
  await dialog.getByRole('button', { name: 'Save configuration' }).click();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await podcastPanel.getByLabel('TTS provider').selectOption({ label: 'Second provider (api.openai.com)' });
  for (const speakerVoice of await podcastVoices.all()) {
    await expect(speakerVoice.locator('option')).toContainText(['alloy']);
    await expect(speakerVoice.locator('option', { hasText: 'voice-b' })).toHaveCount(0);
  }
});

test('prompt templates use dedicated pages and validate edits', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Podcast', exact: true }).click();
  await dialog.getByRole('button', { name: 'Advanced prompts' }).click();
  await expect(dialog.getByRole('tab', { name: 'Script rules' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Repair brief', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Preview rendered prompt' }).click();
  await expect(dialog.getByRole('heading', { name: 'Rendered generation request' })).toBeVisible();
  const userMessage = dialog.locator('.prompt-preview-message').filter({ hasText: 'User message' }).locator('pre');
  await expect(userMessage).not.toContainText('Tone:');
  await expect(userMessage).toContainText('Audience: general');
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

test('podcast template CRUD persists while generation edits remain session-only', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Podcast', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Episode direction templates' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Add direction' }).click();
  await dialog.getByLabel('Episode direction name (required)').fill('Author focus');
  await dialog.getByLabel('Episode direction instructions (required)').fill('Focus on the author’s central interpretive question.');
  await dialog.getByRole('button', { name: 'Save direction' }).click();
  await expect(dialog.getByText('Author focus', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Formats' }).click();
  await expect(dialog.getByRole('heading', { name: 'Format templates' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Add format' }).click();
  await dialog.getByLabel('Format name (required)').fill('Briefing');
  await dialog.getByLabel('Format instructions (required)').fill('Use a concise briefing with three ordered sections.');
  await dialog.getByRole('button', { name: 'Save format' }).click();
  await expect(dialog.getByText('Briefing', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Speaker profiles' }).click();
  await dialog.getByRole('button', { name: 'Add profile' }).click();
  await dialog.getByLabel('Profile label (required)').fill('Coach');
  await dialog.getByLabel('Default speaker name').fill('Coach');
  await dialog.getByLabel('Role (required)').fill('Explains ideas through practical exercises.');
  await dialog.getByRole('button', { name: 'Save profile' }).click();
  await expect(dialog.getByText('Coach', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Podcast', exact: true }).click();
  const panel = page.locator('#panel-podcast');
  await expect(panel.getByLabel('Tone')).toHaveCount(0);
  await expect(panel.getByLabel('Format template').locator('option')).toHaveText([
    'Conversation — Exploratory',
    'Conversation — Critical',
    'Conversation — Reflective',
    'Interview — Explanatory',
    'Interview — Investigative',
    'Interview — Interpretive',
    'Narrative — Chronological',
    'Narrative — Causal',
    'Narrative — Thematic',
    'Lecture — Conceptual',
    'Lecture — Case-led',
    'Lecture — Argumentative',
    'Panel Discussion — Exploratory',
    'Panel Discussion — Critical',
    'Panel Discussion — Comparative',
    'Briefing',
  ]);
  await panel.getByLabel('Episode direction template').selectOption({ label: 'Author focus' });
  await expect(panel.getByLabel('Episode direction (required)')).toHaveValue('Focus on the author’s central interpretive question.');
  await panel.getByLabel('Episode direction (required)').fill('Temporary author focus.');
  await panel.getByLabel('Format template').selectOption({ label: 'Conversation — Critical' });
  await expect(panel.getByLabel('Format instructions (required)')).toHaveValue(/claim–challenge–response/);
  await panel.getByLabel('Format template').selectOption({ label: 'Briefing' });
  await expect(panel.getByLabel('Format instructions (required)')).toHaveValue(
    'Use a concise briefing with three ordered sections.',
  );
  await panel.getByLabel('Format instructions (required)').fill('Temporary briefing change.');
  await expect(panel.locator('.format-draft-editor').nth(1).locator(':scope > .help-text')).toHaveText('Temporary changes.');

  const firstSpeaker = panel.locator('.speaker-card').first();
  await expect(firstSpeaker.getByLabel('Speaker profile').locator('option')).toHaveText([
    'Choose profile…',
    'Host — Facilitator',
    'Host — Peer Co-host',
    'Host — Synthesizer',
    'Interviewer — Clarifier',
    'Interviewer — Investigator',
    'Interviewer — Interpretive',
    'Expert — Explainer',
    'Expert — Analyst',
    'Expert — Contextualizer',
    'Narrator — Chronological',
    'Narrator — Causal',
    'Narrator — Thematic',
    'Skeptic — Evidence Auditor',
    'Skeptic — Scope Critic',
    'Skeptic — Alternative-Hypothesis Tester',
    'Coach',
  ]);
  await firstSpeaker.getByLabel('Speaker profile').selectOption({ label: 'Expert — Analyst' });
  await firstSpeaker.getByRole('button', { name: /Apply profile to/ }).click();
  await expect(firstSpeaker.getByLabel('Name (required)')).toHaveValue('Leah');
  await expect(firstSpeaker.getByLabel('Role')).toHaveValue(/claims, evidence, inference/);
  await firstSpeaker.getByLabel('Speaker profile').selectOption({ label: 'Coach' });
  await firstSpeaker.getByRole('button', { name: /Apply profile to/ }).click();
  await expect(firstSpeaker.getByLabel('Name (required)')).toHaveValue('Coach');
  await expect(firstSpeaker.getByLabel('Role')).toHaveValue('Explains ideas through practical exercises.');

  await page.getByRole('button', { name: 'Settings' }).click();
  await dialog.getByRole('button', { name: 'Podcast', exact: true }).click();
  await dialog.getByRole('button', { name: 'Formats' }).click();
  await dialog.getByRole('button', { name: 'Delete Briefing' }).click();
  await page
    .getByRole('dialog', { name: 'Delete format template' })
    .getByRole('button', { name: 'Delete format' })
    .click();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(panel.getByLabel('Episode direction template').locator('option:checked')).toHaveText('Author focus');
  await expect(panel.getByLabel('Format template')).toHaveValue('__custom__');
  await expect(panel.getByLabel('Format instructions (required)')).toHaveValue('Temporary briefing change.');

  await page.reload();
  await expect(panel.getByLabel('Episode direction template')).toHaveValue('direction-essential-overview');
  await expect(panel.getByLabel('Format template')).toHaveValue('format-conversation');
  await expect(panel.getByLabel('Format instructions (required)')).toHaveValue(/turn contingency/);
  await expect(panel.locator('.speaker-card').first().getByLabel('Name (required)')).toHaveValue('Maya');
  await expect(panel.locator('.speaker-card').nth(1).getByLabel('Name (required)')).toHaveValue('Leah');
});

test('podcast cast supports stable add, remove, reorder, and stale-script state', async ({ page }) => {
  const counters = await mockProviders(page);
  await addProvider(page);
  await page.getByRole('button', { name: 'Podcast', exact: true }).click();
  const panel = page.locator('#panel-podcast');
  const cards = panel.locator('.speaker-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute('data-speaker-id', 'speaker-1');
  await expect(cards.nth(1)).toHaveAttribute('data-speaker-id', 'speaker-2');
  await expect(cards.nth(0).getByRole('combobox', { name: 'Voice', exact: true })).toHaveValue('alloy');
  await expect(cards.nth(1).getByRole('combobox', { name: 'Voice', exact: true })).toHaveValue('ash');

  await cards.nth(0).getByLabel('Speaker profile').selectOption({ label: 'Expert — Analyst' });
  await cards.nth(1).getByLabel('Speaker profile').selectOption({ label: 'Host — Synthesizer' });
  await panel.getByRole('button', { name: 'Add speaker' }).click();
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2)).toHaveAttribute('data-speaker-id', 'speaker-3');
  await expect(cards.nth(2).getByRole('combobox', { name: 'Voice', exact: true })).toHaveValue('ballad');
  await expect(cards.nth(0).getByLabel('Speaker profile')).toHaveValue('profile-expert-analyst');
  await expect(cards.nth(1).getByLabel('Speaker profile')).toHaveValue('profile-host-synthesizer');
  await cards.nth(2).getByRole('button', { name: 'Move Speaker 3 up' }).click();
  await expect(cards.nth(1)).toHaveAttribute('data-speaker-id', 'speaker-3');
  await cards.nth(1).getByRole('button', { name: 'Remove Speaker 3' }).click();
  const removeDialog = page.getByRole('dialog', { name: 'Remove speaker' });
  await expect(removeDialog).toContainText('Remove “Speaker 3” from the current cast?');
  await removeDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(cards).toHaveCount(3);
  await cards.nth(1).getByRole('button', { name: 'Remove Speaker 3' }).click();
  await removeDialog.getByRole('button', { name: 'Remove speaker', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByLabel('Speaker profile')).toHaveValue('profile-expert-analyst');
  await expect(cards.nth(1).getByLabel('Speaker profile')).toHaveValue('profile-host-synthesizer');

  for (let index = 0; index < 6; index += 1) {
    await panel.getByRole('button', { name: 'Add speaker' }).click();
  }
  await expect(cards).toHaveCount(8);
  await expect(panel.getByRole('button', { name: 'Add speaker' })).toBeDisabled();
  for (let index = 0; index < 6; index += 1) {
    await cards.last().getByRole('button', { name: /^Remove / }).click();
    await removeDialog.getByRole('button', { name: 'Remove speaker', exact: true }).click();
  }
  await expect(cards).toHaveCount(2);

  await panel.getByLabel(/Text to speak/).fill('Source material for cast behavior.');
  await panel.getByRole('button', { name: 'Generate script' }).click();
  await expect(panel.getByText('E2E Show')).toBeVisible();
  expect(counters.chat).toBe(2);
  await panel.getByRole('button', { name: 'Add speaker' }).click();
  await expect(panel.getByText(/current plan and script reflect earlier/i)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Apply speaker changes to script' })).toBeDisabled();
  await cards.nth(2).getByRole('button', { name: 'Remove Speaker 3' }).click();
  await removeDialog.getByRole('button', { name: 'Remove speaker', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Apply speaker changes to script' })).toBeEnabled();
  await cards.nth(1).getByRole('button', { name: 'Move Guest up' }).click();
  await cards.nth(0).getByLabel('Name (required)').fill('Reordered Guest');
  await panel.getByRole('button', { name: 'Apply speaker changes to script' }).click();
  await expect(panel.getByText('E2E Show — Host, Reordered Guest · 2 turns')).toBeVisible();
  await expect(cards.nth(0)).toHaveAttribute('data-speaker-id', 'speaker-2');
  await expect(cards.nth(1)).toHaveAttribute('data-speaker-id', 'speaker-1');
});

test('reviewed podcast planning supports approval, structured edits, revision, and stale warnings', async ({ page }) => {
  const counters = await mockProviders(page);
  await addProvider(page);
  await page.getByRole('button', { name: 'Podcast', exact: true }).click();
  const panel = page.locator('#panel-podcast');
  await panel.getByLabel(/Text to speak/).fill('Source material for editorial planning.');
  await panel.getByLabel('Review plan before writing').check();
  await panel.getByRole('button', { name: 'Create plan', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Editorial plan' })).toBeVisible();
  await expect(panel.getByText('E2E editorial plan', { exact: true })).toBeVisible();
  await expect(panel.getByText('E2E Show')).toHaveCount(0);
  expect(counters.chat).toBe(1);

  await panel.getByRole('button', { name: 'Edit plan' }).click();
  await panel.getByLabel('Working title (required)').fill('Edited editorial plan');
  await expect(panel.getByRole('button', { name: 'Save edits' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Cancel edits' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Generate script from plan' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Create new plan' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Create plan', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Import script JSON' })).toBeDisabled();
  await expect(panel.getByLabel('Review plan before writing')).toBeDisabled();
  await expect(panel.getByLabel('Ask for changes to this plan')).toBeHidden();
  await page.context().setOffline(true);
  await expect(panel.getByLabel('Working title (required)')).toHaveValue('Edited editorial plan');
  await page.context().setOffline(false);
  await panel.getByLabel('Working title (required)').fill('');
  await panel.getByRole('button', { name: 'Save edits' }).click();
  await expect(panel.getByRole('button', { name: 'Save edits' })).toBeVisible();
  await expect(panel.getByLabel('Working title (required)')).toHaveValue('');
  await panel.getByLabel('Working title (required)').fill('Edited editorial plan');
  await panel.getByRole('button', { name: 'Add beat' }).click();
  await panel.getByLabel('Beat title (required)').last().fill('Implications');
  await panel.getByLabel('Beat purpose (required)').last().fill('Develop the implications.');
  await panel.getByRole('button', { name: 'Move beat 2 up' }).click();
  await panel.getByRole('button', { name: 'Save edits' }).click();
  await expect(panel.getByRole('button', { name: 'Edit plan' })).toBeFocused();
  await expect(panel.getByText('Edited editorial plan', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Edit plan' }).click();
  await panel.getByLabel('Working title (required)').fill('Discard this title');
  await panel.getByRole('button', { name: 'Cancel edits' }).click();
  await expect(panel.getByRole('button', { name: 'Edit plan' })).toBeFocused();
  await expect(panel.getByText('Edited editorial plan', { exact: true })).toBeVisible();

  await panel.getByLabel('Ask for changes to this plan').fill('Return to the source’s central framing.');
  await panel.getByRole('button', { name: 'Revise plan' }).click();
  await expect(panel.getByText('E2E editorial plan', { exact: true })).toBeVisible();
  expect(counters.chat).toBe(2);

  await panel.getByRole('button', { name: 'Generate script from plan' }).click();
  await expect(panel.getByText('E2E Show')).toBeVisible();
  expect(counters.chat).toBe(3);
  await panel.locator('.speaker-card').first().getByRole('combobox', { name: 'Voice', exact: true }).selectOption('verse');
  await expect(panel.getByText(/current plan and script reflect earlier/i)).toBeHidden();
  await panel.getByLabel(/Text to speak/).fill('Changed source material.');
  await expect(panel.getByText(/current plan and script reflect earlier/i)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Render audio' })).toBeEnabled();
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
  expect(counters.chat).toBe(2);

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
  expect(counters.responses).toBe(2);
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
  const settingsButton = page.locator('#settings-button');
  const focusableCount = await page
    .locator('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    .count();
  // Reach Settings through keyboard navigation without assuming a fixed number
  // of controls before it.
  for (let i = 0; i <= focusableCount; i += 1) {
    if (await settingsButton.evaluate((button) => document.activeElement === button)) break;
    await page.keyboard.press('Tab');
  }
  await expect(settingsButton).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  // focus restored to the invoking button
  await expect(settingsButton).toBeFocused();
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
