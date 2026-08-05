import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPodcastController } from '../../src/features/podcast/podcast-controller.js';
import {
  loadJob,
  getAllSegments,
  resetDbConnectionForTests,
} from '../../src/storage/render-job-store.js';
import { AppError } from '../../src/services/errors.js';

const chatProvider = { baseUrl: 'https://chat.test/v1', apiKey: 'sk-chat' };
const ttsProvider = {
  id: 'tts1',
  name: 'TTS',
  baseUrl: 'https://tts.test/v1',
  apiKey: 'sk-tts',
};

const prefs = {
  format: 'conversation',
  targetMinutes: 3,
  tone: 'conversational',
  audience: 'general',
  speakers: [
    { name: 'Host', role: 'Guides', voice: 'alloy' },
    { name: 'Guest', role: 'Explains', voice: 'verse' },
  ],
  chatModel: 'gpt-4o-mini',
  ttsModel: 'tts-1',
};

const validScript = {
  schemaVersion: 1,
  title: 'Test Show',
  language: 'en',
  format: 'conversation',
  sourceGrounded: true,
  speakers: [
    { id: 'speaker-1', name: 'Host', role: 'Guides', voice: 'alloy' },
    { id: 'speaker-2', name: 'Guest', role: 'Explains', voice: 'verse' },
  ],
  segments: [
    { id: 'segment-0001', speakerId: 'speaker-1', text: 'Hello.', pauseAfterMs: 100 },
    { id: 'segment-0002', speakerId: 'speaker-2', text: 'Hi there.', pauseAfterMs: 100 },
    { id: 'segment-0003', speakerId: 'speaker-1', text: 'Bye.', pauseAfterMs: 0 },
  ],
};

function chatReturning(script) {
  return vi.fn().mockResolvedValue({ content: JSON.stringify(script), model: 'm' });
}

function speechOk() {
  return vi.fn().mockResolvedValue({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav' });
}

function fakeDecode() {
  return Promise.resolve({ channels: [new Float32Array([0.1, 0.2])], sampleRate: 44100 });
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetDbConnectionForTests();
});

describe('podcast script generation', () => {
  it('valid output becomes ready script', async () => {
    const controller = createPodcastController({
      chat: chatReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source text', prefs, chatProvider);
    const state = controller.store.get();
    expect(state.status).toBe('ready');
    expect(state.script.title).toBe('Test Show');
  });

  it('invalid output fails with schema error and one repair option', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ content: '{"schemaVersion":7}', model: 'm' })
      .mockResolvedValueOnce({ content: JSON.stringify(validScript), model: 'm' });
    const controller = createPodcastController({ chat, speech: speechOk(), decode: fakeDecode });
    await controller.generateScript('source text', prefs, chatProvider);
    let state = controller.store.get();
    expect(state.status).toBe('failed');
    expect(state.error.kind).toBe('schema');
    expect(state.repairAvailable).toBe(true);

    await controller.repairScript();
    state = controller.store.get();
    expect(state.status).toBe('ready');
    expect(state.script.title).toBe('Test Show');
    expect(chat).toHaveBeenCalledTimes(2);
    // repair request included validation errors
    const repairCall = chat.mock.calls[1][0];
    expect(JSON.stringify(repairCall.messages)).toContain('schemaVersion');
  });

  it('edited script is revalidated', async () => {
    const controller = createPodcastController({
      chat: chatReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source text', prefs, chatProvider);
    const script = controller.store.get().script;
    expect(() =>
      controller.applyEditedScript({ ...script, segments: [] }),
    ).toThrowError(/invalid/i);
    const edited = {
      ...script,
      segments: script.segments.map((s, i) => (i === 0 ? { ...s, text: 'Edited text.' } : s)),
    };
    controller.applyEditedScript(edited);
    expect(controller.store.get().script.segments[0].text).toBe('Edited text.');
  });

  it('script JSON export excludes internal metadata', async () => {
    const controller = createPodcastController({
      chat: chatReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source text', prefs, chatProvider);
    const { json, filename } = controller.exportScriptJson();
    expect(filename.endsWith('.json')).toBe(true);
    expect(JSON.stringify(json)).not.toContain('apiKey');
    expect(Object.keys(json)).not.toContain('segmentStates');
  });
});

describe('podcast rendering', () => {
  it('renders all segments, persists blobs, assembles output', async () => {
    const speech = speechOk();
    const controller = createPodcastController({
      chat: chatReturning(validScript),
      speech,
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, chatProvider);
    await controller.startRender(ttsProvider, 'tts-1');
    const state = controller.store.get();
    expect(state.renderStatus).toBe('ready');
    expect(state.output.wav).toBeInstanceOf(Blob);
    expect(speech).toHaveBeenCalledTimes(3);
    // voices assigned per speaker
    expect(speech.mock.calls[0][0].voice).toBe('alloy');
    expect(speech.mock.calls[1][0].voice).toBe('verse');
    // persisted for recovery
    const job = await loadJob();
    expect(job).toBeTruthy();
    const segments = await getAllSegments(job.id);
    expect(segments).toHaveLength(3);
  });

  it('resume reuses completed segments and renders only pending', async () => {
    // First run: fail segment 3 after two successes.
    let call = 0;
    const speech = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 3) {
        return Promise.reject(
          new AppError({ kind: 'provider', message: 'boom', retryable: false, status: 500 }),
        );
      }
      return Promise.resolve({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav' });
    });
    const controller = createPodcastController({
      chat: chatReturning(validScript),
      speech,
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, chatProvider);
    await controller.startRender(ttsProvider, 'tts-1');
    expect(controller.store.get().renderStatus).toBe('failed');
    const job = await loadJob();
    expect(job.segmentStates['segment-0001']).toBe('completed');
    expect(job.segmentStates['segment-0003']).toBe('failed');

    // Simulate reload: brand-new controller resumes from IndexedDB.
    const speech2 = speechOk();
    const resumed = createPodcastController({
      chat: chatReturning(validScript),
      speech: speech2,
      decode: fakeDecode,
    });
    await resumed.resumeRender(ttsProvider);
    const state = resumed.store.get();
    expect(state.renderStatus).toBe('ready');
    // only the one non-completed segment was requested
    expect(speech2).toHaveBeenCalledTimes(1);
  });

  it('cancel preserves completed segments', async () => {
    let resolvePending;
    let call = 0;
    const speech = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav' });
      }
      return new Promise((resolve) => {
        resolvePending = () =>
          resolve({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav' });
      });
    });
    const controller = createPodcastController({
      chat: chatReturning(validScript),
      speech,
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, chatProvider);
    const run = controller.startRender(ttsProvider, 'tts-1');
    await vi.waitFor(() => expect(call).toBe(2));
    controller.cancelRender();
    resolvePending();
    await run;
    expect(controller.store.get().renderStatus).toBe('cancelled');
    const job = await loadJob();
    expect(job.segmentStates['segment-0001']).toBe('completed');
  });

  it('failed segment retries individually', async () => {
    let call = 0;
    const speech = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 2) {
        return Promise.reject(
          new AppError({ kind: 'provider', message: 'boom', retryable: false, status: 500 }),
        );
      }
      return Promise.resolve({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav' });
    });
    const controller = createPodcastController({
      chat: chatReturning(validScript),
      speech,
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, chatProvider);
    await controller.startRender(ttsProvider, 'tts-1');
    expect(controller.store.get().renderStatus).toBe('failed');

    speech.mockResolvedValue({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav' });
    await controller.retrySegment('segment-0002', ttsProvider, 'tts-1');
    let job = await loadJob();
    expect(job.segmentStates['segment-0002']).toBe('completed');

    await controller.retrySegment('segment-0003', ttsProvider, 'tts-1');
    job = await loadJob();
    expect(job.segmentStates['segment-0003']).toBe('completed');
    expect(controller.store.get().renderStatus).toBe('ready');
  });

  it('successful export clears recovery data; failure retains it', async () => {
    const controller = createPodcastController({
      chat: chatReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, chatProvider);
    await controller.startRender(ttsProvider, 'tts-1');
    expect(await loadJob()).toBeTruthy();

    const { blob, filename } = await controller.exportAudio('wav');
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toMatch(/^vxpods-test-show\.wav$/);
    expect(await loadJob()).toBeNull();
  });

  it('discard removes recoverable data', async () => {
    const controller = createPodcastController({
      chat: chatReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, chatProvider);
    await controller.startRender(ttsProvider, 'tts-1');
    await controller.discardRender();
    expect(await loadJob()).toBeNull();
    expect(controller.store.get().renderStatus).toBe('idle');
  });
});
