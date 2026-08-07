import { describe, expect, it } from 'vitest';
import { createSpeech } from '../../src/services/speech-client.js';
import { generateText } from '../../src/services/text-generation-client.js';
import { loadLiveProviderTargets } from './provider-targets.js';

const enabled = process.env.VXPODS_LIVE_PROVIDER === '1';
const targets = enabled ? loadLiveProviderTargets({ required: true }) : [];
const textCases = targets.flatMap((target) => target.textGeneration.map((testCase) => ({ target, testCase })));
const speechCases = targets.flatMap((target) => target.speech.flatMap((testCase) =>
  testCase.voices.map((voice) => ({ target, testCase, voice }))));

describe('live provider client', () => {
  if (!enabled) {
    it.skip('requires npm run test:live', () => {});
    return;
  }

  it.each(textCases)('$target.name · $testCase.api · $testCase.model returns text', async ({ target, testCase }) => {
    const result = await generateText({
      provider: {
        baseUrl: target.baseUrl,
        apiKey: target.apiKey,
        textGeneration: { api: testCase.api, models: [testCase.model] },
      },
      model: testCase.model,
      messages: [{ role: 'user', content: testCase.input }],
      temperature: 0,
      timeoutMs: 60_000,
    });

    expect(result.content.trim().length).toBeGreaterThan(0);
  }, 70_000);

  it.each(speechCases)('$target.name · $testCase.model · $voice returns configured audio bytes', async ({ target, testCase, voice }) => {
    const result = await createSpeech({
      provider: { baseUrl: target.baseUrl, apiKey: target.apiKey },
      ttsModel: testCase,
      voice,
      input: testCase.input,
      timeoutMs: 60_000,
    });

    expect(result.audio.byteLength).toBeGreaterThan(32);
    if (testCase.responseFormat === 'mp3') {
      expect(result.contentType.toLowerCase()).toMatch(/^audio\/(mpeg|mp3)(?:;|$)/);
      expect(hasMp3Header(new Uint8Array(result.audio))).toBe(true);
    } else {
      expect(result.contentType.toLowerCase()).toMatch(/^audio\/pcm(?:;|$)/);
      expect(result.audio.byteLength % (testCase.pcm.channels * 2)).toBe(0);
    }
  }, 70_000);
});

function hasMp3Header(bytes) {
  const hasId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const hasFrameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return hasId3 || hasFrameSync;
}
