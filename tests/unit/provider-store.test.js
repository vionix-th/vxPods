import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeBaseUrl,
  validateProviderInput,
  addProvider,
  updateProvider,
  deleteProvider,
  selectProvider,
  getSelectedProviderId,
  exportSettingsBackup,
  listProviders,
  restoreSettingsBackup,
} from '../../src/features/providers/provider-store.js';
import { providerSuggestionsForPreset } from '../../src/domain/provider-config.js';

beforeEach(() => {
  localStorage.clear();
});

describe('normalizeBaseUrl', () => {
  it('accepts an https URL ending in /v1', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1');
  });

  it('strips trailing slashes', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1');
  });

  it('rejects non-https URLs for remote hosts', () => {
    expect(() => normalizeBaseUrl('http://api.example.com/v1')).toThrowError(/HTTPS/);
  });

  it('allows http for localhost', () => {
    expect(normalizeBaseUrl('http://localhost:1234/v1')).toBe('http://localhost:1234/v1');
  });

  it('rejects URLs not ending in /v1', () => {
    expect(() => normalizeBaseUrl('https://api.openai.com/v2')).toThrowError(/\/v1/);
  });

  it('rejects malformed URLs', () => {
    expect(() => normalizeBaseUrl('not a url')).toThrowError();
  });

  it('rejects empty input', () => {
    expect(() => normalizeBaseUrl('   ')).toThrowError(/required/);
  });

  it('drops query and hash', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1?x=1#frag')).toBe(
      'https://api.openai.com/v1',
    );
  });
});

describe('validateProviderInput', () => {
  it('returns normalized record', () => {
    const out = validateProviderInput({
      name: ' My key ',
      baseUrl: 'https://api.openai.com/v1/',
      apiKey: 'sk-test',
    });
    expect(out).toMatchObject({
      name: 'My key',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
    });
    expect(out.textGeneration).toMatchObject({ api: 'chat-completions' });
    expect(out.textGeneration.models).toContain('gpt-4o-mini');
    expect(out.ttsModels).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: 'gpt-4o-mini-tts', voices: expect.arrayContaining(['alloy']), responseFormat: 'mp3' }),
    ]));
  });

  it('rejects empty key', () => {
    expect(() =>
      validateProviderInput({ name: 'x', baseUrl: 'https://api.openai.com/v1', apiKey: ' ' }),
    ).toThrowError(/API key/);
  });

  it('rejects empty name', () => {
    expect(() =>
      validateProviderInput({ name: '', baseUrl: 'https://api.openai.com/v1', apiKey: 'k' }),
    ).toThrowError(/Name/);
  });

  it('preserves empty model lists', () => {
    const out = validateProviderInput({
      name: 'x', baseUrl: 'https://manual.example/v1', apiKey: 'k',
      textGeneration: { api: 'responses', models: [] },
      ttsModels: [],
    });
    expect(out).toMatchObject({
      textGeneration: { api: 'responses', models: [] },
      ttsModels: [],
    });
  });

  it('leaves an unknown TTS model without voices', () => {
    const out = validateProviderInput({
      name: 'x', baseUrl: 'https://api.openai.com/v1', apiKey: 'k',
      ttsModels: [{ model: 'unknown-tts', voices: [], responseFormat: 'mp3' }],
    });
    expect(out.ttsModels).toEqual([{ model: 'unknown-tts', voices: [], responseFormat: 'mp3' }]);
  });

  it('accepts an explicit empty voice list for a TTS model', () => {
    const out = validateProviderInput({
      name: 'x', baseUrl: 'https://api.openai.com/v1', apiKey: 'k',
      ttsModels: [{ model: 'tts-1', voices: [], responseFormat: 'mp3' }],
    });
    expect(out.ttsModels[0].voices).toEqual([]);
  });

  it('rejects invalid raw PCM metadata', () => {
    expect(() => validateProviderInput({
      name: 'x', baseUrl: 'https://api.openai.com/v1', apiKey: 'k',
      ttsModels: [{ model: 'pcm-model', voices: ['voice'], responseFormat: 'pcm', pcm: { sampleRate: 0, channels: 1, encoding: 's16le' } }],
    })).toThrow(/valid PCM metadata/);
  });

  it('accepts Responses models and rejects unknown text-generation APIs', () => {
    expect(validateProviderInput({
      name: 'x', baseUrl: 'https://api.openai.com/v1', apiKey: 'k',
      textGeneration: { api: 'responses', models: [' gpt-5.6-luna ', 'gpt-5.6-luna'] },
    }).textGeneration).toEqual({ api: 'responses', models: ['gpt-5.6-luna'] });
    expect(() => validateProviderInput({
      name: 'x', baseUrl: 'https://api.openai.com/v1', apiKey: 'k',
      textGeneration: { api: 'legacy', models: ['m'] },
    })).toThrowError(/supported text generation API/);
  });
});

describe('provider preset suggestions', () => {
  it('starts OpenRouter and Manual without model or voice suggestions', () => {
    for (const preset of ['openrouter', 'manual']) {
      expect(providerSuggestionsForPreset(preset)).toEqual({
        textGeneration: { api: 'chat-completions', models: [] },
        ttsModels: [],
      });
    }
  });
});

describe('provider CRUD', () => {
  const input = {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-1',
  };

  it('adds and lists providers', () => {
    const record = addProvider(input);
    expect(listProviders()).toHaveLength(1);
    expect(listProviders()[0].id).toBe(record.id);
  });

  it('persists across loads (reload behavior)', () => {
    addProvider(input);
    expect(listProviders()).toHaveLength(1);
  });

  it('exports every local setting and restores as a full replacement', () => {
    const original = addProvider({
      ...input,
      textGeneration: { api: 'responses', models: ['custom-response'] },
      ttsModels: [{ model: 'custom-tts', voices: ['custom-voice'], responseFormat: 'pcm', pcm: { sampleRate: 24000, channels: 1, encoding: 's16le' } }],
    });
    selectProvider('text', original.id);
    const backup = exportSettingsBackup();
    backup.promptTemplates = {
      scriptUser:
        'Write {{formatDescription}} for {{audience}} in a {{tone}} tone. {{speakers}} {{speakerIds}} {{voices}} {{source}}',
    };
    addProvider({ ...input, name: 'Temporary' });

    restoreSettingsBackup(JSON.stringify(backup));

    expect(listProviders()).toHaveLength(1);
    expect(listProviders()[0].apiKey).toBe('sk-1');
    expect(listProviders()[0]).toMatchObject({
      textGeneration: { api: 'responses', models: ['custom-response'] },
      ttsModels: [{ model: 'custom-tts', voices: ['custom-voice'], responseFormat: 'pcm', pcm: { sampleRate: 24000, channels: 1, encoding: 's16le' } }],
    });
    expect(getSelectedProviderId('text')).toBe(original.id);
    expect(exportSettingsBackup().promptTemplates.scriptUser).toBe(
      'Write {{formatDescription}} for {{audience}} in a {{tone}} tone. {{speakers}} {{speakerIds}} {{voices}} {{source}}',
    );
  });

  it('rejects invalid backups without replacing current settings', () => {
    addProvider(input);
    expect(() => restoreSettingsBackup('{not json')).toThrowError(/valid JSON/);
    const invalidApi = exportSettingsBackup();
    invalidApi.providers[0].textGeneration.api = 'legacy';
    expect(() => restoreSettingsBackup(invalidApi)).toThrowError(/invalid provider configuration/);
    expect(listProviders()).toHaveLength(1);
  });

  it('update keeps saved key when new key is empty', () => {
    const record = addProvider(input);
    const updated = updateProvider(record.id, { name: 'Renamed', baseUrl: input.baseUrl, apiKey: '' });
    expect(updated.apiKey).toBe('sk-1');
    expect(updated.name).toBe('Renamed');
  });

  it('stores normalized, provider-specific model and voice suggestions', () => {
    const record = addProvider({
      ...input,
      textGeneration: { api: 'responses', models: [' custom-response ', 'custom-response', ''] },
      ttsModels: [{ model: 'custom-tts', voices: [' voice-a ', 'voice-a'], responseFormat: 'mp3' }],
    });
    expect(record).toMatchObject({
      textGeneration: { api: 'responses', models: ['custom-response'] },
      ttsModels: [{ model: 'custom-tts', voices: ['voice-a'], responseFormat: 'mp3' }],
    });
  });

  it('delete clears selections referencing it', () => {
    const record = addProvider(input);
    selectProvider('text', record.id);
    selectProvider('tts', record.id);
    deleteProvider(record.id);
    expect(listProviders()).toHaveLength(0);
    expect(getSelectedProviderId('text')).toBeNull();
    expect(getSelectedProviderId('tts')).toBeNull();
  });

  it('selections persist', () => {
    const record = addProvider(input);
    selectProvider('tts', record.id);
    expect(getSelectedProviderId('tts')).toBe(record.id);
    expect(getSelectedProviderId('text')).toBeNull();
  });

  it('rejects selection of unknown provider', () => {
    expect(() => selectProvider('text', 'nope')).toThrowError(/not found/);
  });
});
