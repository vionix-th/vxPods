import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTtsController } from '../../src/features/tts/tts-controller.js';
import { AppError } from '../../src/services/errors.js';

const provider = { id: 'p', name: 'Test', baseUrl: 'https://api.test/v1', apiKey: 'sk' };
const settings = { provider, model: 'tts-1', voice: 'alloy', speed: undefined, format: 'wav' };

/** Minimal PCM decode stub: one Float32 sample per call. */
function fakeDecode() {
  return Promise.resolve({ channels: [new Float32Array([0.1, 0.2])], sampleRate: 44100 });
}

/** Encoded-bytes stub. */
function speechOk() {
  return vi.fn().mockResolvedValue({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav' });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('tts controller', () => {
  it('rejects empty source with validation error', async () => {
    const controller = createTtsController({ speech: speechOk(), decode: fakeDecode });
    await expect(controller.generate('   ', settings)).rejects.toMatchObject({
      kind: 'validation',
    });
  });

  it('renders chunks in order and reaches ready', async () => {
    const speech = speechOk();
    const controller = createTtsController({
      speech,
      decode: fakeDecode,
      maxChunkChars: 10,
    });
    await controller.generate('one two three four five six seven', settings);
    const state = controller.store.get();
    expect(state.status).toBe('ready');
    expect(state.output.wav).toBeInstanceOf(Blob);
    // order preserved: inputs passed sequentially
    const inputs = speech.mock.calls.map((c) => c[0].input);
    expect(inputs.join(' ')).toContain('one');
    expect(inputs.length).toBeGreaterThan(1);
  });

  it('keeps completed chunks and retries only failed ones', async () => {
    let call = 0;
    const speech = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 2) {
        return Promise.reject(
          new AppError({
            kind: 'provider',
            message: 'boom',
            retryable: false,
            status: 500,
          }),
        );
      }
      return Promise.resolve({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav' });
    });
    const controller = createTtsController({ speech, decode: fakeDecode, maxChunkChars: 5 });
    await controller.generate('aaaa bbbb cccc', settings);
    let state = controller.store.get();
    expect(state.status).toBe('failed');
    expect(state.chunks[0].status).toBe('completed');
    expect(state.chunks[1].status).toBe('failed');

    // fix provider, retry
    speech.mockResolvedValue({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav' });
    const callsBefore = speech.mock.calls.length;
    await controller.retryFailed();
    state = controller.store.get();
    expect(state.status).toBe('ready');
    // only failed chunks re-requested (2 remaining of 3)
    expect(speech.mock.calls.length - callsBefore).toBe(2);
  });

  it('cancel stops further requests', async () => {
    let resolveFirst;
    const speech = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = () =>
            resolve({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav' });
        }),
    );
    const controller = createTtsController({ speech, decode: fakeDecode, maxChunkChars: 5 });
    const run = controller.generate('aaaa bbbb cccc dddd', settings);
    await Promise.resolve();
    controller.cancel();
    resolveFirst();
    await run;
    const state = controller.store.get();
    expect(['cancelled', 'cancelling']).toContain(state.status);
    expect(speech.mock.calls.length).toBe(1);
  });

  it('marks output with the settings used', async () => {
    const controller = createTtsController({ speech: speechOk(), decode: fakeDecode });
    await controller.generate('short text', settings);
    expect(controller.store.get().output.settingsLabel).toContain('tts-1');
  });
});
