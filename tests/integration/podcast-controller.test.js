import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPodcastController } from '../../src/features/podcast/podcast-controller.js';
import {
  loadJob,
  getAllSegments,
  resetDbConnectionForTests,
} from '../../src/storage/render-job-store.js';
import { AppError } from '../../src/services/errors.js';

const textProvider = { baseUrl: 'https://text.test/v1', apiKey: 'sk-text' };
const ttsProvider = {
  id: 'tts1',
  name: 'TTS',
  baseUrl: 'https://tts.test/v1',
  apiKey: 'sk-tts',
};
const ttsModel = { model: 'tts-1', voices: ['alloy', 'verse'], responseFormat: 'mp3' };

const prefs = {
  formatInstructions: 'Create a natural conversation.',
  audience: 'general',
  speakers: [
    { id: 'speaker-1', name: 'Host', role: 'Guides', voice: 'alloy' },
    { id: 'speaker-2', name: 'Guest', role: 'Explains', voice: 'verse' },
  ],
  textModel: 'gpt-4o-mini',
  ttsModel: 'tts-1',
};

const validScript = {
  schemaVersion: 2,
  title: 'Test Show',
  language: 'en',
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

function textReturning(script) {
  return vi.fn().mockResolvedValue({ content: JSON.stringify(script), model: 'm' });
}

function speechOk() {
  return vi.fn().mockResolvedValue({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav', ttsModel });
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
      textGeneration: textReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source text', prefs, textProvider);
    const state = controller.store.get();
    expect(state.status).toBe('ready');
    expect(state.script.title).toBe('Test Show');
  });

  it('generates and validates a three-speaker script', async () => {
    const third = { id: 'speaker-3', name: 'Skeptic', role: 'Challenges claims', voice: 'alloy' };
    const threePrefs = { ...prefs, speakers: [...prefs.speakers, third] };
    const threeScript = {
      ...structuredClone(validScript),
      speakers: [...validScript.speakers, third],
      segments: [...validScript.segments, {
        id: 'segment-0004', speakerId: 'speaker-3', text: 'What supports that?', pauseAfterMs: 0,
      }],
    };
    const textGeneration = textReturning(threeScript);
    const controller = createPodcastController({ textGeneration, speech: speechOk(), decode: fakeDecode });
    await controller.generateScript('source text', threePrefs, textProvider);
    expect(controller.store.get().script.speakers).toHaveLength(3);
    expect(textGeneration.mock.calls[0][0].messages[1].content).toContain('speaker-3');
  });

  it('invalid output fails with schema error and one repair option', async () => {
    const textGeneration = vi
      .fn()
      .mockResolvedValueOnce({ content: '{"schemaVersion":7}', model: 'm' })
      .mockResolvedValueOnce({ content: JSON.stringify(validScript), model: 'm' });
    const controller = createPodcastController({ textGeneration, speech: speechOk(), decode: fakeDecode });
    await controller.generateScript('source text', prefs, textProvider);
    let state = controller.store.get();
    expect(state.status).toBe('failed');
    expect(state.error.kind).toBe('schema');
    expect(state.repairAvailable).toBe(true);

    await controller.repairScript();
    state = controller.store.get();
    expect(state.status).toBe('ready');
    expect(state.script.title).toBe('Test Show');
    expect(textGeneration).toHaveBeenCalledTimes(2);
    // repair request included validation errors
    const repairCall = textGeneration.mock.calls[1][0];
    expect(JSON.stringify(repairCall.messages)).toContain('schemaVersion');
  });

  it('edited script is revalidated', async () => {
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source text', prefs, textProvider);
    const script = controller.store.get().script;
    expect(() =>
      controller.applyEditedScript({ ...script, segments: [] }),
    ).toThrowError(/invalid/i);
    const edited = {
      ...script,
      segments: script.segments.map((s, i) =>
        i === 0 ? { ...s, text: 'Edited text.', pauseAfterMs: 750 } : s,
      ),
    };
    controller.applyEditedScript(edited);
    expect(controller.store.get().script.segments[0].text).toBe('Edited text.');
    expect(controller.store.get().script.segments[0].pauseAfterMs).toBe(750);
  });

  it('script JSON export excludes internal metadata', async () => {
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source text', prefs, textProvider);
    const { json, filename } = controller.exportScriptJson();
    expect(filename.endsWith('.json')).toBe(true);
    expect(JSON.stringify(json)).not.toContain('apiKey');
    expect(Object.keys(json)).not.toContain('segmentStates');
  });

  it('imports a canonical script after schema validation', () => {
    const controller = createPodcastController();
    const imported = controller.importScript(JSON.stringify(validScript));
    expect(imported).toEqual(validScript);
    expect(controller.store.get()).toMatchObject({ status: 'ready', script: validScript });
  });

  it('imports version 1 scripts as canonical version 2 without format', () => {
    const legacy = { ...structuredClone(validScript), schemaVersion: 1, format: 'conversation' };
    const controller = createPodcastController();
    const imported = controller.importScript(legacy);
    expect(imported.schemaVersion).toBe(2);
    expect(imported).not.toHaveProperty('format');
  });

  it('applies speaker metadata changes without changing referenced turns', async () => {
    const controller = createPodcastController({ textGeneration: textReturning(validScript) });
    await controller.generateScript('source text', prefs, textProvider);
    const script = controller.store.get().script;
    const updated = controller.applyEditedScript({
      ...script,
      speakers: script.speakers.map((speaker, index) =>
        index === 0 ? { ...speaker, name: 'Narrator', role: 'Introduces the topic', voice: 'nova' } : speaker,
      ),
    });
    expect(updated.speakers[0]).toMatchObject({ name: 'Narrator', role: 'Introduces the topic', voice: 'nova' });
    expect(updated.segments.map((segment) => segment.speakerId)).toEqual(
      script.segments.map((segment) => segment.speakerId),
    );
  });

  it('rejects invalid script imports without changing the current script', async () => {
    const controller = createPodcastController({ textGeneration: textReturning(validScript) });
    await controller.generateScript('source text', prefs, textProvider);
    const original = controller.store.get().script;
    expect(() => controller.importScript('{not json')).toThrowError(/not valid JSON/);
    expect(controller.store.get().script).toEqual(original);
  });
});

describe('podcast rendering', () => {
  it('renders all segments, persists blobs, assembles output', async () => {
    const speech = speechOk();
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech,
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, textProvider);
    await controller.startRender(ttsProvider, ttsModel);
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
      return Promise.resolve({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav', ttsModel });
    });
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech,
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, textProvider);
    await controller.startRender(ttsProvider, ttsModel);
    expect(controller.store.get().renderStatus).toBe('failed');
    const job = await loadJob();
    expect(job.segmentStates['segment-0001']).toBe('completed');
    expect(job.segmentStates['segment-0003']).toBe('failed');

    // Simulate reload: brand-new controller resumes from IndexedDB.
    const speech2 = speechOk();
    const resumed = createPodcastController({
      textGeneration: textReturning(validScript),
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
        return Promise.resolve({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav', ttsModel });
      }
      return new Promise((resolve) => {
        resolvePending = () =>
          resolve({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav', ttsModel });
      });
    });
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech,
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, textProvider);
    const run = controller.startRender(ttsProvider, ttsModel);
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
      return Promise.resolve({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav', ttsModel });
    });
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech,
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, textProvider);
    await controller.startRender(ttsProvider, ttsModel);
    expect(controller.store.get().renderStatus).toBe('failed');

    speech.mockResolvedValue({ audio: new Uint8Array([1]).buffer, contentType: 'audio/wav', ttsModel });
    await controller.retrySegment('segment-0002', ttsProvider);
    let job = await loadJob();
    expect(job.segmentStates['segment-0002']).toBe('completed');

    await controller.retrySegment('segment-0003', ttsProvider);
    job = await loadJob();
    expect(job.segmentStates['segment-0003']).toBe('completed');
    expect(controller.store.get().renderStatus).toBe('ready');
  });

  it('clears recovery only after the download boundary confirms export', async () => {
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, textProvider);
    await controller.startRender(ttsProvider, ttsModel);
    expect(await loadJob()).toBeTruthy();

    const { blob, filename } = await controller.exportAudio('wav');
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toMatch(/^vxpods-test-show\.wav$/);
    expect(await loadJob()).toBeTruthy();
    await controller.completeExport();
    expect(await loadJob()).toBeNull();
  });

  it('restores a ready render locally without provider requests', async () => {
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, textProvider);
    await controller.startRender(ttsProvider, ttsModel);

    const speech = vi.fn();
    const restored = createPodcastController({ speech, decode: fakeDecode });
    await restored.restoreReadyRender();
    expect(restored.store.get()).toMatchObject({ renderStatus: 'ready', script: validScript });
    expect(restored.store.get().output.wav).toBeInstanceOf(Blob);
    expect(speech).not.toHaveBeenCalled();
  });

  it('rejects resume with a different provider ID', async () => {
    const failingSpeech = vi.fn().mockRejectedValue(
      new AppError({ kind: 'provider', message: 'boom', retryable: false, status: 500 }),
    );
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech: failingSpeech,
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, textProvider);
    await controller.startRender(ttsProvider, ttsModel);

    const resumed = createPodcastController({ speech: speechOk(), decode: fakeDecode });
    await expect(resumed.resumeRender({ ...ttsProvider, id: 'other' })).rejects.toMatchObject({
      kind: 'validation',
    });
    expect(resumed.store.get().renderStatus).toBe('idle');
  });

  it('failed export retains recovery data', async () => {
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
      encodeMp3Fn: vi.fn().mockRejectedValue(new Error('encoder failed')),
    });
    await controller.generateScript('source', prefs, textProvider);
    await controller.startRender(ttsProvider, ttsModel);

    await expect(controller.exportAudio('mp3')).rejects.toMatchObject({ kind: 'encoding' });
    expect(await loadJob()).toBeTruthy();
  });

  it('discard removes recoverable data', async () => {
    const controller = createPodcastController({
      textGeneration: textReturning(validScript),
      speech: speechOk(),
      decode: fakeDecode,
    });
    await controller.generateScript('source', prefs, textProvider);
    await controller.startRender(ttsProvider, ttsModel);
    await controller.discardRender();
    expect(await loadJob()).toBeNull();
    expect(controller.store.get().renderStatus).toBe('idle');
  });
});
