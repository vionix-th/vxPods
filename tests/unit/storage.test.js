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
  PODCAST_DRAFT_STORAGE_KEY,
  PODCAST_DRAFT_SCHEMA_VERSION,
  inspectPodcastDraft,
  loadPodcastDraft,
  savePodcastDraft,
  clearPodcastDraft,
} from '../../src/storage/podcast-draft-store.js';
import { PODCAST_TEMPLATE_CATALOG_VERSION } from '../../src/domain/podcast-templates.js';
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
      textGeneration: { api: 'chat-completions', jsonResponseFormat: 'json_object', models: ['gpt-4o-mini'] },
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

  it('seeds Episode directions when an existing v1 document or backup omits the additive field', () => {
    const legacy = defaultSettings();
    delete legacy.episodeDirectionTemplates;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    expect(loadSettings().episodeDirectionTemplates.map((record) => record.name)).toContain('Essential Overview');

    const restored = restoreSettingsBackup(legacy);
    expect(restored.episodeDirectionTemplates.map((record) => record.name)).toContain('Essential Overview');
  });

  it('preserves an explicitly empty Episode direction collection', () => {
    const doc = defaultSettings();
    doc.episodeDirectionTemplates = [];
    saveSettings(doc);
    expect(loadSettings().episodeDirectionTemplates).toEqual([]);
    expect(restoreSettingsBackup(doc).episodeDirectionTemplates).toEqual([]);
  });

  it('replaces legacy bundled Podcast templates once while retaining custom records', () => {
    const legacy = defaultSettings();
    delete legacy.podcastTemplateCatalogVersion;
    legacy.formatTemplates = [
      { id: 'format-conversation', name: 'Conversation', instructions: 'Legacy conversation.' },
      { id: 'format-custom', name: 'Custom briefing', instructions: 'Custom format.' },
    ];
    legacy.speakerProfiles = [
      { id: 'profile-host', label: 'Host', defaultSpeakerName: 'Old name', role: 'Legacy host.' },
      { id: 'profile-custom', label: 'Custom guide', defaultSpeakerName: 'Kai', role: 'Custom role.' },
    ];
    const raw = JSON.stringify(legacy);
    localStorage.setItem(STORAGE_KEY, raw);

    const migrated = loadSettings();
    expect(migrated.podcastTemplateCatalogVersion).toBe(PODCAST_TEMPLATE_CATALOG_VERSION);
    expect(migrated.formatTemplates).toHaveLength(16);
    expect(migrated.formatTemplates[0]).toMatchObject({
      id: 'format-conversation', name: 'Conversation — Exploratory',
    });
    expect(migrated.formatTemplates.at(-1)).toMatchObject({ id: 'format-custom', name: 'Custom briefing' });
    expect(migrated.speakerProfiles).toHaveLength(16);
    expect(migrated.speakerProfiles[0]).toMatchObject({
      id: 'profile-host', label: 'Host — Facilitator', defaultSpeakerName: 'Maya',
    });
    expect(migrated.speakerProfiles.at(-1)).toMatchObject({ id: 'profile-custom', label: 'Custom guide' });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);

    saveSettings(migrated);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).podcastTemplateCatalogVersion)
      .toBe(PODCAST_TEMPLATE_CATALOG_VERSION);
  });

  it('replaces explicit empty legacy collections and respects custom ownership of starter names', () => {
    const emptyLegacy = defaultSettings();
    delete emptyLegacy.podcastTemplateCatalogVersion;
    emptyLegacy.formatTemplates = [];
    emptyLegacy.speakerProfiles = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyLegacy));
    expect(loadSettings().formatTemplates).toHaveLength(15);
    expect(loadSettings().speakerProfiles).toHaveLength(15);

    const collisionLegacy = defaultSettings();
    delete collisionLegacy.podcastTemplateCatalogVersion;
    collisionLegacy.formatTemplates = [{
      id: 'format-custom-critical',
      name: 'conversation — critical',
      instructions: 'Custom critical conversation.',
    }];
    collisionLegacy.speakerProfiles = [{
      id: 'profile-custom-analyst',
      label: 'expert — analyst',
      defaultSpeakerName: 'Ada',
      role: 'Custom analyst.',
    }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collisionLegacy));
    const migrated = loadSettings();
    expect(migrated.formatTemplates).toHaveLength(15);
    expect(migrated.formatTemplates.some((record) => record.id === 'format-conversation-critical')).toBe(false);
    expect(migrated.formatTemplates.at(-1)).toMatchObject({ id: 'format-custom-critical' });
    expect(migrated.speakerProfiles).toHaveLength(15);
    expect(migrated.speakerProfiles.some((record) => record.id === 'profile-expert-analyst')).toBe(false);
    expect(migrated.speakerProfiles.at(-1)).toMatchObject({ id: 'profile-custom-analyst' });
  });

  it('persists template deletions after catalog migration and migrates legacy backups', () => {
    const legacy = defaultSettings();
    delete legacy.podcastTemplateCatalogVersion;
    const restored = restoreSettingsBackup(legacy);
    expect(restored.podcastTemplateCatalogVersion).toBe(PODCAST_TEMPLATE_CATALOG_VERSION);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).podcastTemplateCatalogVersion)
      .toBe(PODCAST_TEMPLATE_CATALOG_VERSION);

    restored.formatTemplates = restored.formatTemplates
      .filter((record) => record.id !== 'format-conversation-critical');
    restored.speakerProfiles = restored.speakerProfiles
      .filter((record) => record.id !== 'profile-expert-analyst');
    saveSettings(restored);
    expect(loadSettings().formatTemplates.some((record) => record.id === 'format-conversation-critical')).toBe(false);
    expect(loadSettings().speakerProfiles.some((record) => record.id === 'profile-expert-analyst')).toBe(false);
  });

  it('preserves settings with an unsupported schema version until explicit restore or clear', () => {
    const raw = JSON.stringify({ ...defaultSettings(), schemaVersion: 'invalid' });
    localStorage.setItem(STORAGE_KEY, raw);
    expect(inspectSettings()).toMatchObject({ status: 'unsupported', settings: defaultSettings() });
    expect(() => saveSettings(defaultSettings())).toThrowError(/unsupported schema version/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('rejects invalid template collections during restore', () => {
    const backup = defaultSettings();
    backup.formatTemplates.push({
      id: 'duplicate-name',
      name: backup.formatTemplates[0].name.toLowerCase(),
      instructions: 'Duplicate name.',
    });
    expect(() => restoreSettingsBackup(backup)).toThrow(/invalid format templates/i);
  });

  it('preserves unsupported settings until explicit restore or clear', () => {
    const raw = JSON.stringify({
      schemaVersion: 'invalid',
      providers: [{ id: 'p1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x' }],
      selectedChatProviderId: 'p1',
      selectedTtsProviderId: null,
      preferences: { mode: 'podcast' },
    });
    localStorage.setItem(STORAGE_KEY, raw);
    expect(inspectSettings()).toMatchObject({ status: 'unsupported', settings: defaultSettings() });
    expect(() => saveSettings(defaultSettings())).toThrowError(/unsupported schema version/i);
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

  it('falls back when settings omit the current-format marker', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({}));
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it('drops invalid provider records but keeps valid ones', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        providers: [
          { id: 'ok', name: 'A', baseUrl: 'https://a.example/v1', apiKey: 'k', textGeneration: { api: 'chat-completions', jsonResponseFormat: 'json_object', models: ['m'] }, ttsModels: [] },
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
        textGeneration: { api: 'unsupported-api', jsonResponseFormat: 'json_object', models: ['m'] },
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

describe('podcast draft storage', () => {
  const draft = () => ({
    schemaVersion: PODCAST_DRAFT_SCHEMA_VERSION,
    source: 'Source text',
    directionTemplateId: 'direction-essential-overview',
    episodeDirection: 'Focus on key facts.',
    formatTemplateId: 'format-conversation',
    formatInstructions: 'Two speakers discuss.',
    audience: 'general',
    textModel: 'gpt-test',
    ttsModel: 'tts-test',
    speakers: [
      { id: 'speaker-1', name: 'Maya', role: 'Host', voice: 'alloy' },
      { id: 'speaker-2', name: 'Elias', role: 'Expert', voice: 'echo' },
    ],
    reviewPlan: true,
  });

  it('round-trips an episode draft separately from settings', () => {
    savePodcastDraft(draft());
    expect(loadPodcastDraft()).toEqual(draft());
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns null for missing, corrupt, and unsupported drafts without replacing raw data', () => {
    expect(loadPodcastDraft()).toBeNull();
    localStorage.setItem(PODCAST_DRAFT_STORAGE_KEY, '{bad');
    expect(inspectPodcastDraft()).toMatchObject({ status: 'corrupt', draft: null });
    expect(localStorage.getItem(PODCAST_DRAFT_STORAGE_KEY)).toBe('{bad');
    localStorage.setItem(PODCAST_DRAFT_STORAGE_KEY, JSON.stringify({ ...draft(), schemaVersion: 99 }));
    expect(inspectPodcastDraft()).toMatchObject({ status: 'unsupported', draft: null });
  });

  it('rejects invalid speaker records and clears only explicit draft data', () => {
    expect(() => savePodcastDraft({ ...draft(), speakers: [{ ...draft().speakers[0] }, { ...draft().speakers[0] }] }))
      .toThrow(/unique/i);
    savePodcastDraft(draft());
    clearPodcastDraft();
    expect(loadPodcastDraft()).toBeNull();
  });

  it('normalizes draft storage read and quota failures', () => {
    const unavailable = { getItem() { throw new Error('blocked'); } };
    expect(inspectPodcastDraft(unavailable)).toMatchObject({ status: 'unavailable', error: { kind: 'storage' } });
    const full = {
      setItem() { throw new DOMException('full', 'QuotaExceededError'); },
    };
    expect(() => savePodcastDraft(draft(), full)).toThrow(/storage is full/i);
  });
});

const validScript = {
  schemaVersion: 1,
  title: 'T',
  language: 'en',
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
    expect(loaded.script.schemaVersion).toBe(1);
    expect(loaded.script).not.toHaveProperty('format');
  });

  it('rejects jobs without the current-format marker', async () => {
    await saveJob({ ...baseJob, schemaVersion: undefined });
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
