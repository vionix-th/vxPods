import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSettings,
  saveSettings,
  defaultSettings,
  SETTINGS_SCHEMA_VERSION,
  STORAGE_KEY,
} from '../../src/storage/local-settings.js';
import {
  saveJob,
  loadJob,
  updateJob,
  saveSegment,
  getAllSegments,
  deleteJob,
  pruneExpired,
  RECOVERY_TTL_MS,
  resetDbConnectionForTests,
} from '../../src/storage/render-job-store.js';

beforeEach(() => {
  localStorage.clear();
  resetDbConnectionForTests();
});

describe('local-settings', () => {
  it('returns defaults when empty', () => {
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it('round-trips a valid document', () => {
    const doc = defaultSettings();
    doc.providers.push({
      id: 'p1',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-x',
      textGeneration: { api: 'chat-completions', models: ['gpt-4o-mini'] },
    });
    doc.selectedTtsProviderId = 'p1';
    doc.preferences.mode = 'podcast';
    doc.promptTemplates.repairUser = 'Errors: {{validationErrors}}';
    saveSettings(doc);
    const loaded = loadSettings();
    expect(loaded.providers).toHaveLength(1);
    expect(loaded.selectedTtsProviderId).toBe('p1');
    expect(loaded.preferences.mode).toBe('podcast');
    expect(loaded.promptTemplates.repairUser).toBe('Errors: {{validationErrors}}');
    expect(loaded.providers[0].textGeneration.models).toContain('gpt-4o-mini');
  });

  it('migrates v1 settings and preserves provider configuration', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        providers: [{ id: 'p1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x' }],
        selectedChatProviderId: 'p1',
        selectedTtsProviderId: null,
        preferences: { mode: 'podcast' },
      }),
    );
    const loaded = loadSettings();
    expect(loaded.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(loaded.providers).toHaveLength(1);
    expect(loaded.promptTemplates).toEqual({});
  });

  it('removes deprecated duration instructions from v2 script templates', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultSettings(),
        schemaVersion: 2,
        promptTemplates: {
          scriptUser: 'Write {{formatDescription}}.\nApproximate duration: {{durationMinutes}} minutes.\nTone: {{tone}}. Audience: {{audience}}.\n{{speakers}} {{speakerIds}} {{voices}} {{source}}',
        },
      }),
    );
    const loaded = loadSettings();
    expect(loaded.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(loaded.promptTemplates.scriptUser).not.toContain('durationMinutes');
    expect(loaded.promptTemplates.scriptUser).toContain('{{source}}');
  });

  it('migrates v3 providers with editable model and voice suggestions', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultSettings(),
        schemaVersion: 3,
        providers: [{ id: 'p1', name: 'Provider', baseUrl: 'https://api.example/v1', apiKey: 'key' }],
      }),
    );
    const loaded = loadSettings();
    expect(loaded.providers[0]).toMatchObject({
      textGeneration: {
        api: 'chat-completions',
        models: expect.arrayContaining(['gpt-4o-mini']),
      },
      ttsModels: expect.arrayContaining(['gpt-4o-mini-tts']),
      voicesByTtsModel: expect.any(Object),
    });
  });

  it('restores defaults for empty option lists from v4 settings', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultSettings(),
        schemaVersion: 4,
        providers: [{
          id: 'p1', name: 'Provider', baseUrl: 'https://api.example/v1', apiKey: 'key',
          chatModels: [], ttsModels: [], voices: [],
        }],
      }),
    );
    const [provider] = loadSettings().providers;
    expect(provider.textGeneration.models).not.toHaveLength(0);
    expect(provider.ttsModels).not.toHaveLength(0);
    expect(provider.voicesByTtsModel[provider.ttsModels[0]]).not.toHaveLength(0);
  });

  it('migrates v6 chat configuration and selection to the neutral text contract', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 6,
        providers: [{
          id: 'p1', name: 'Provider', baseUrl: 'https://api.example/v1', apiKey: 'key',
          chatModels: ['custom-chat'], ttsModels: ['tts'], voicesByTtsModel: { tts: ['voice'] },
        }],
        selectedChatProviderId: 'p1',
        selectedTtsProviderId: null,
        preferences: { mode: 'podcast' },
        promptTemplates: {},
      }),
    );
    const loaded = loadSettings();
    expect(loaded.selectedTextProviderId).toBe('p1');
    expect(loaded.providers[0].textGeneration).toEqual({
      api: 'chat-completions',
      models: ['custom-chat'],
    });
    expect(loaded.providers[0]).not.toHaveProperty('chatModels');
  });

  it('migrates v7 voice mappings without overwriting explicit choices', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultSettings(),
      schemaVersion: 7,
      providers: [{
        id: 'p1', name: 'Provider', baseUrl: 'https://api.example/v1', apiKey: 'key',
        textGeneration: { api: 'chat-completions', models: ['m'] },
        ttsModels: ['tts-1', 'unknown-tts', 'custom-tts'],
        voicesByTtsModel: { 'tts-1': ['custom'], 'custom-tts': ['voice'] },
      }],
    }));
    const [provider] = loadSettings().providers;
    expect(provider.voicesByTtsModel).toEqual({
      'tts-1': ['custom'],
      'unknown-tts': [],
      'custom-tts': ['voice'],
    });
  });

  it('drops an invalid template override without discarding valid overrides', () => {
    const doc = defaultSettings();
    doc.promptTemplates = {
      scriptUser: 'invalid',
      repairUser: 'Errors: {{validationErrors}}',
    };
    saveSettings(doc);
    expect(loadSettings().promptTemplates).toEqual({ repairUser: 'Errors: {{validationErrors}}' });
  });

  it('falls back safely on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it('falls back on unknown future schema version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 999 }));
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it('drops invalid provider records but keeps valid ones', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        providers: [
          { id: 'ok', name: 'A', baseUrl: 'https://a.example/v1', apiKey: 'k', textGeneration: { api: 'chat-completions', models: ['m'] } },
          { id: 'bad', name: '', baseUrl: 'https://b.example/v1' }, // missing key, empty name
        ],
        selectedTextProviderId: 'bad',
        selectedTtsProviderId: 'ok',
        preferences: { mode: 'tts' },
      }),
    );
    const loaded = loadSettings();
    expect(loaded.providers.map((p) => p.id)).toEqual(['ok']);
    expect(loaded.selectedTextProviderId).toBeNull();
    expect(loaded.selectedTtsProviderId).toBe('ok');
  });

  it('drops a version 7 provider with an invalid text-generation API', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultSettings(),
      providers: [{
        id: 'bad', name: 'Bad', baseUrl: 'https://api.example/v1', apiKey: 'key',
        textGeneration: { api: 'legacy', models: ['m'] },
      }],
    }));
    expect(loadSettings().providers).toEqual([]);
  });

  it('surfaces quota errors as storage kind', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {},
    };
    let caught;
    try {
      saveSettings(defaultSettings(), failing);
    } catch (err) {
      caught = err;
    }
    expect(caught.kind).toBe('storage');
    expect(caught.message).toContain('storage is full');
  });
});

const baseJob = {
  schemaVersion: 1,
  id: 'job-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  script: { title: 'T', segments: [] },
  settings: { ttsModel: 'tts-1' },
  segmentStates: { 'segment-0001': 'pending' },
  status: 'rendering',
};

describe('render-job-store', () => {
  it('saves and loads the active job', async () => {
    await saveJob(baseJob);
    const loaded = await loadJob();
    expect(loaded.id).toBe('job-1');
    expect(loaded.status).toBe('rendering');
  });

  it('returns null for wrong schema version', async () => {
    await saveJob({ ...baseJob, schemaVersion: 42 });
    expect(await loadJob()).toBeNull();
  });

  it('persists segments transactionally with job state', async () => {
    await saveJob(baseJob);
    const blob = new Blob(['audio-bytes'], { type: 'audio/wav' });
    const next = await saveSegment('job-1', 'segment-0001', blob, baseJob);
    expect(next.segmentStates['segment-0001']).toBe('completed');
    const loaded = await loadJob();
    expect(loaded.segmentStates['segment-0001']).toBe('completed');
    const segments = await getAllSegments('job-1');
    expect(segments).toHaveLength(1);
    expect(segments[0].segmentId).toBe('segment-0001');
    expect(await segments[0].blob.text()).toBe('audio-bytes');
  });

  it('saveJob replaces existing job and clears old segments', async () => {
    await saveJob(baseJob);
    await saveSegment('job-1', 'segment-0001', new Blob(['a']), baseJob);
    await saveJob({ ...baseJob, id: 'job-2' });
    expect((await loadJob()).id).toBe('job-2');
    expect(await getAllSegments('job-1')).toHaveLength(0);
  });

  it('updateJob bumps updatedAt', async () => {
    await saveJob(baseJob);
    const before = (await loadJob()).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await updateJob({ ...baseJob, status: 'cancelled' });
    const after = await loadJob();
    expect(after.status).toBe('cancelled');
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before));
  });

  it('deleteJob removes job and segments', async () => {
    await saveJob(baseJob);
    await saveSegment('job-1', 'segment-0001', new Blob(['a']), baseJob);
    await deleteJob();
    expect(await loadJob()).toBeNull();
    expect(await getAllSegments('job-1')).toHaveLength(0);
  });

  it('prunes jobs older than seven days of inactivity', async () => {
    const stale = {
      ...baseJob,
      updatedAt: new Date(Date.now() - RECOVERY_TTL_MS - 1000).toISOString(),
    };
    await saveJob(stale);
    expect(await pruneExpired()).toBe(true);
    expect(await loadJob()).toBeNull();
  });

  it('keeps fresh jobs', async () => {
    await saveJob(baseJob);
    expect(await pruneExpired()).toBe(false);
    expect(await loadJob()).not.toBeNull();
  });
});
