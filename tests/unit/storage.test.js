import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSettings,
  inspectSettings,
  saveSettings,
  restoreSettingsBackup,
  clearSettings,
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
  RENDER_JOB_SCHEMA_VERSION,
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
      ttsModels: [{ model: 'tts-1', voices: ['alloy'], responseFormat: 'mp3' }],
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

  it('preserves superseded settings until explicit restore or clear', () => {
    const raw = JSON.stringify({
      schemaVersion: 8,
      providers: [{ id: 'p1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x' }],
      selectedChatProviderId: 'p1',
      selectedTtsProviderId: null,
      preferences: { mode: 'podcast' },
    });
    localStorage.setItem(STORAGE_KEY, raw);
    expect(inspectSettings()).toMatchObject({ status: 'unsupported', settings: defaultSettings() });
    expect(() => saveSettings(defaultSettings())).toThrowError(/unsupported version/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);

    restoreSettingsBackup(defaultSettings());
    expect(inspectSettings().status).toBe('valid');
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
    expect(() => saveSettings(defaultSettings())).toThrowError(/damaged/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not json');
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
          { id: 'ok', name: 'A', baseUrl: 'https://a.example/v1', apiKey: 'k', textGeneration: { api: 'chat-completions', models: ['m'] }, ttsModels: [] },
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

  it('drops a provider with an invalid text-generation API', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...defaultSettings(),
      providers: [{
        id: 'bad', name: 'Bad', baseUrl: 'https://api.example/v1', apiKey: 'key',
        textGeneration: { api: 'legacy', models: ['m'] },
        ttsModels: [],
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

  it('surfaces clear failures instead of reporting success', () => {
    const failing = {
      removeItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    expect(() => clearSettings(failing)).toThrowError(/remove saved browser settings/i);
  });
});

const validScript = {
  schemaVersion: 1,
  title: 'T',
  language: 'en',
  format: 'solo',
  sourceGrounded: true,
  speakers: [{ id: 'speaker-1', name: 'Host', role: 'Narrates', voice: 'alloy' }],
  segments: [
    { id: 'segment-0001', speakerId: 'speaker-1', text: 'Hello.', pauseAfterMs: 0 },
  ],
};

const baseJob = {
  schemaVersion: RENDER_JOB_SCHEMA_VERSION,
  id: 'job-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  script: validScript,
  settings: {
    ttsProviderId: 'p1',
    ttsProviderName: 'Provider',
    ttsModel: { model: 'tts-1', voices: ['alloy'], responseFormat: 'mp3' },
  },
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

  it('rejects wrong schema versions', async () => {
    await saveJob({ ...baseJob, schemaVersion: 42 });
    await expect(loadJob()).rejects.toMatchObject({ kind: 'storage' });
  });

  it('rejects malformed jobs with the current version', async () => {
    await saveJob({ ...baseJob, segmentStates: { unknown: 'completed' } });
    await expect(loadJob()).rejects.toMatchObject({ kind: 'storage' });
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
