import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeBaseUrl,
  validateProviderInput,
  addProvider,
  updateProvider,
  deleteProvider,
  selectProvider,
  getSelectedProviderId,
  listProviders,
} from '../../src/features/providers/provider-store.js';

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
    expect(out.chatModels).toContain('gpt-4o-mini');
    expect(out.ttsModels).toContain('gpt-4o-mini-tts');
    expect(out.voicesByTtsModel['gpt-4o-mini-tts']).toContain('alloy');
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

  it('requires at least one entry for every select-backed option list', () => {
    expect(() =>
      validateProviderInput({
        name: 'x',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'k',
        chatModels: [],
        ttsModels: ['tts'],
        voicesByTtsModel: { tts: ['voice'] },
      }),
    ).toThrowError(/Chat model/);
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

  it('update keeps saved key when new key is empty', () => {
    const record = addProvider(input);
    const updated = updateProvider(record.id, { name: 'Renamed', baseUrl: input.baseUrl, apiKey: '' });
    expect(updated.apiKey).toBe('sk-1');
    expect(updated.name).toBe('Renamed');
  });

  it('stores normalized, provider-specific model and voice suggestions', () => {
    const record = addProvider({
      ...input,
      chatModels: [' custom-chat ', 'custom-chat', ''],
      ttsModels: ['custom-tts'],
      voicesByTtsModel: { 'custom-tts': [' voice-a ', 'voice-a'] },
    });
    expect(record).toMatchObject({
      chatModels: ['custom-chat'],
      ttsModels: ['custom-tts'],
      voicesByTtsModel: { 'custom-tts': ['voice-a'] },
    });
  });

  it('delete clears selections referencing it', () => {
    const record = addProvider(input);
    selectProvider('chat', record.id);
    selectProvider('tts', record.id);
    deleteProvider(record.id);
    expect(listProviders()).toHaveLength(0);
    expect(getSelectedProviderId('chat')).toBeNull();
    expect(getSelectedProviderId('tts')).toBeNull();
  });

  it('selections persist', () => {
    const record = addProvider(input);
    selectProvider('tts', record.id);
    expect(getSelectedProviderId('tts')).toBe(record.id);
    expect(getSelectedProviderId('chat')).toBeNull();
  });

  it('rejects selection of unknown provider', () => {
    expect(() => selectProvider('chat', 'nope')).toThrowError(/not found/);
  });
});
