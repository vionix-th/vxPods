import { describe, expect, it } from 'vitest';
import { validateLiveProviderDocument } from '../live/provider-targets.js';

describe('live provider target validation', () => {
  it('normalizes independent text and speech cases', () => {
    const [target] = validateLiveProviderDocument({
      targets: [{
        name: 'Provider',
        baseUrl: 'https://api.test/v1/',
        apiKey: 'test-secret',
        textGeneration: [
          { api: 'chat-completions', model: 'chat-a', input: 'hello' },
          { api: 'responses', model: 'response-a' },
        ],
        speech: [
          { model: 'speech-a', voices: ['voice-a', ' voice-b '], responseFormat: 'pcm', pcm: { sampleRate: 24000, channels: 1, encoding: 's16le' } },
        ],
      }],
    });

    expect(target).toEqual({
      name: 'Provider',
      baseUrl: 'https://api.test/v1',
      apiKey: 'test-secret',
      textGeneration: [
        { api: 'chat-completions', model: 'chat-a', input: 'hello' },
        { api: 'responses', model: 'response-a', input: 'Reply with the word ok.' },
      ],
      speech: [{
        model: 'speech-a',
        voices: ['voice-a', 'voice-b'],
        responseFormat: 'pcm',
        pcm: { sampleRate: 24000, channels: 1, encoding: 's16le' },
        input: 'Live text to speech connectivity test.',
      }],
    });
  });

  it('rejects the previous TTS-only target shape', () => {
    expect(() => validateLiveProviderDocument({
      targets: [{
        name: 'Legacy TTS',
        baseUrl: 'https://api.test/v1',
        apiKey: 'test-secret',
        model: 'speech-a',
        voices: ['voice-a'],
      }],
    })).toThrow(/requires textGeneration or speech/);
  });

  it('rejects targets without a test case', () => {
    expect(() => validateLiveProviderDocument({
      targets: [{ name: 'Empty', baseUrl: 'https://api.test/v1', apiKey: 'test-secret' }],
    })).toThrow(/requires textGeneration or speech/);
  });

  it('rejects an unsupported text API', () => {
    expect(() => validateLiveProviderDocument({
      targets: [{
        name: 'Invalid',
        baseUrl: 'https://api.test/v1',
        apiKey: 'test-secret',
        textGeneration: [{ api: 'completions', model: 'model-a' }],
      }],
    })).toThrow(/chat-completions or responses/);
  });
});
