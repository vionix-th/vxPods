/**
 * Podcast workflow controller: script generation/validation/repair,
 * recoverable audio rendering, resume, retry, assembly, and export.
 * Dependencies injectable for tests.
 */

import { createStore, assertTransition } from '../../app/state.js';
import { AppError, toAppError } from '../../services/errors.js';
import { withRetry, throwIfAborted } from '../../services/retry.js';
import { createChatCompletion } from '../../services/chat-completions-client.js';
import { createSpeech } from '../../services/speech-client.js';
import { splitIntoChunks, DEFAULT_MAX_CHUNK_CHARS } from '../../audio/segmenter.js';
import { assembleSegments, decodeToPcm } from '../../audio/audio-assembler.js';
import { wavBlob, encodeWavPcm16 } from '../../audio/wav-writer.js';
import { encodeMp3 } from '../../audio/mp3-encoder.js';
import { sanitizeFilename } from '../../utils/download.js';
import {
  buildScriptPrompt,
  buildRepairMessages,
  extractJson,
  validateScript,
  exportableScript,
} from './podcast-script.js';
import * as jobStore from '../../storage/render-job-store.js';

const SAMPLE_RATE = 44100;

/**
 * @typedef {Object} PodcastState
 * @property {import('../../app/state.js').FeatureStatus} status script phase
 * @property {import('./podcast-script.js').PodcastScript | null} script
 * @property {import('../../services/errors.js').AppError | null} error
 * @property {string[]} validationErrors
 * @property {boolean} repairAvailable
 * @property {'idle'|'rendering'|'cancelled'|'failed'|'ready'} renderStatus
 * @property {Record<string, 'pending'|'active'|'completed'|'failed'>} segmentStates
 * @property {string | null} activeSegmentId
 * @property {import('../../services/errors.js').AppError | null} renderError
 * @property {{ wav: Blob } | null} output
 * @property {boolean} exporting
 */

/**
 * @param {Object} [deps]
 * @param {typeof createChatCompletion} [deps.chat]
 * @param {typeof createSpeech} [deps.speech]
 * @param {typeof decodeToPcm} [deps.decode]
 * @param {typeof jobStore} [deps.jobs]
 * @param {number} [deps.maxChunkChars]
 */
export function createPodcastController(deps = {}) {
  const chat = deps.chat || createChatCompletion;
  const speech = deps.speech || createSpeech;
  const decode = deps.decode || decodeToPcm;
  const jobs = deps.jobs || jobStore;
  const maxChunkChars = deps.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS;

  const store = createStore(/** @type {PodcastState} */ ({
    status: 'idle',
    script: null,
    error: null,
    validationErrors: [],
    repairAvailable: false,
    renderStatus: 'idle',
    segmentStates: {},
    activeSegmentId: null,
    renderError: null,
    output: null,
    exporting: false,
  }));

  /** @type {AbortController | null} */
  let renderController = null;
  /** @type {import('../../storage/render-job-store.js').RenderJob | null} */
  let activeJob = null;
  /** @type {import('./podcast-script.js').PodcastPreferences | null} */
  let lastPrefs = null;
  /** @type {string} */
  let lastSource = '';
  /** @type {{ baseUrl: string, apiKey: string } | null} */
  let lastChatProvider = null;
  /** @type {string} */
  let lastRawOutput = '';

  /**
   * Generate a script from source + preferences.
   * @param {string} source
   * @param {import('./podcast-script.js').PodcastPreferences} prefs
   * @param {{ baseUrl: string, apiKey: string }} chatProvider
   */
  async function generateScript(source, prefs, chatProvider) {
    const trimmed = String(source ?? '').trim();
    if (!trimmed) {
      throw new AppError({
        kind: 'validation',
        message: 'Add source text first.',
        retryable: false,
        status: undefined,
      });
    }
    assertTransition(store.get().status, 'generating');
    store.set({
      status: 'generating',
      error: null,
      validationErrors: [],
      repairAvailable: false,
      script: null,
    });
    lastPrefs = prefs;
    lastSource = trimmed;
    lastChatProvider = chatProvider;
    try {
      const { content } = await chat({
        provider: chatProvider,
        model: prefs.chatModel,
        messages: buildScriptPrompt(trimmed, prefs),
        jsonMode: true,
      });
      lastRawOutput = content;
      const script = parseAndValidate(content);
      store.set({ status: 'ready', script });
    } catch (err) {
      const normalized = toAppError(err);
      if (normalized.kind === 'schema') {
        store.set({
          status: 'failed',
          error: normalized,
          validationErrors: normalized.cause?.errors || [normalized.message],
          repairAvailable: true,
        });
      } else {
        store.set({ status: 'failed', error: normalized });
      }
    }
  }

  /**
   * The one allowed model repair attempt with validation errors + prior output.
   */
  async function repairScript() {
    if (!store.get().repairAvailable || !lastPrefs || !lastChatProvider) return;
    store.set({ status: 'generating', error: null, repairAvailable: false });
    try {
      const { content } = await chat({
        provider: lastChatProvider,
        model: lastPrefs.chatModel,
        messages: buildRepairMessages(lastRawOutput, store.get().validationErrors),
        jsonMode: true,
      });
      lastRawOutput = content;
      const script = parseAndValidate(content);
      store.set({ status: 'ready', script, validationErrors: [] });
    } catch (err) {
      const normalized = toAppError(err);
      store.set({
        status: 'failed',
        error: normalized,
        validationErrors: normalized.kind === 'schema' ? normalized.cause?.errors || [] : [],
        repairAvailable: false,
      });
    }
  }

  /**
   * @param {string} raw
   * @returns {import('./podcast-script.js').PodcastScript}
   */
  function parseAndValidate(raw) {
    let parsed;
    try {
      parsed = extractJson(raw);
    } catch (err) {
      throw new AppError({
        kind: 'schema',
        message: 'Model output was not valid JSON.',
        retryable: false,
        status: undefined,
        cause: { errors: [err instanceof Error ? err.message : 'Invalid JSON.'] },
      });
    }
    const result = validateScript(parsed);
    if (!result.valid) {
      throw new AppError({
        kind: 'schema',
        message: `Script failed validation: ${result.errors[0]}`,
        retryable: false,
        status: undefined,
        cause: { errors: result.errors },
      });
    }
    return result.script;
  }

  /**
   * Replace the script after user edits; revalidates before rendering.
   * @param {import('./podcast-script.js').PodcastScript} edited
   */
  function applyEditedScript(edited) {
    const result = validateScript(edited);
    if (!result.valid) {
      throw new AppError({
        kind: 'schema',
        message: `Edited script is invalid: ${result.errors[0]}`,
        retryable: false,
        status: undefined,
        cause: { errors: result.errors },
      });
    }
    store.set({ script: result.script });
    return result.script;
  }

  /**
   * Validate a canonical script exported by vxPods without changing state.
   * @param {string | object} raw
   * @returns {import('./podcast-script.js').PodcastScript}
   */
  function validateImportedScript(raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new AppError({
          kind: 'schema',
          message: 'Script file is not valid JSON.',
          retryable: false,
          status: undefined,
        });
      }
    }
    const result = validateScript(parsed);
    if (!result.valid) {
      throw new AppError({
        kind: 'schema',
        message: `Script file failed validation: ${result.errors[0]}`,
        retryable: false,
        status: undefined,
        cause: { errors: result.errors },
      });
    }
    return result.script;
  }

  /**
   * Replace the active script with a previously validated imported script.
   * @param {string | object} raw
   * @returns {import('./podcast-script.js').PodcastScript}
   */
  function importScript(raw) {
    const script = validateImportedScript(raw);
    store.set({
      status: 'ready',
      script,
      error: null,
      validationErrors: [],
      repairAvailable: false,
    });
    return script;
  }

  /**
   * Create a new recoverable render job and start rendering.
   * Caller confirms replacement of any existing recoverable job first.
   *
   * @param {{ baseUrl: string, apiKey: string, id?: string, name?: string }} ttsProvider
   * @param {string} ttsModel
   */
  async function startRender(ttsProvider, ttsModel) {
    const script = store.get().script;
    if (!script) {
      throw new AppError({
        kind: 'validation',
        message: 'Generate a valid script before rendering.',
        retryable: false,
        status: undefined,
      });
    }
    const now = new Date().toISOString();
    /** @type {import('../../storage/render-job-store.js').RenderJob} */
    const job = {
      schemaVersion: 1,
      id: `job-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      script,
      settings: {
        ttsProviderId: ttsProvider.id || null,
        ttsProviderName: ttsProvider.name || null,
        ttsModel,
      },
      segmentStates: Object.fromEntries(script.segments.map((s) => [s.id, 'pending'])),
      status: 'rendering',
    };
    await jobs.saveJob(job);
    activeJob = job;
    store.set({
      renderStatus: 'rendering',
      segmentStates: { ...job.segmentStates },
      renderError: null,
      output: null,
    });
    await renderPendingSegments(ttsProvider, ttsModel);
  }

  /**
   * Resume an unfinished job after reload.
   * @param {{ baseUrl: string, apiKey: string }} ttsProvider
   */
  async function resumeRender(ttsProvider) {
    const job = await jobs.loadJob();
    if (!job) {
      throw new AppError({
        kind: 'validation',
        message: 'No recoverable render found.',
        retryable: false,
        status: undefined,
      });
    }
    activeJob = job;
    store.set({
      script: job.script,
      status: 'ready',
      renderStatus: 'rendering',
      segmentStates: { ...job.segmentStates },
      renderError: null,
    });
    // Segments left 'active' by an interrupted run become pending again.
    for (const [id, state] of Object.entries(job.segmentStates)) {
      if (state === 'active') job.segmentStates[id] = 'pending';
    }
    await jobs.updateJob(job);
    await renderPendingSegments(ttsProvider, job.settings.ttsModel);
  }

  /**
   * Sequential renderer: one TTS request at a time (R1 default).
   */
  async function renderPendingSegments(ttsProvider, ttsModel) {
    renderController = new AbortController();
    const signal = renderController.signal;
    try {
      const script = activeJob.script;
      for (const segment of script.segments) {
        throwIfAborted(signal);
        if (activeJob.segmentStates[segment.id] === 'completed') continue;
        await renderSegment(segment, ttsProvider, ttsModel, signal);
      }
      activeJob = { ...activeJob, status: 'ready' };
      await jobs.updateJob(activeJob);
      store.set({ renderStatus: 'ready', activeSegmentId: null });
      await assembleOutput();
    } catch (err) {
      const normalized = toAppError(err);
      if (normalized.kind === 'cancelled') {
        activeJob = { ...activeJob, status: 'cancelled' };
        await jobs.updateJob(activeJob);
        store.set({ renderStatus: 'cancelled', activeSegmentId: null });
      } else {
        activeJob = { ...activeJob, status: 'failed' };
        await jobs.updateJob(activeJob);
        store.set({ renderStatus: 'failed', renderError: normalized, activeSegmentId: null });
      }
    } finally {
      renderController = null;
    }
  }

  /**
   * Synthesize one segment (chunked when needed) and persist its WAV Blob
   * transactionally with the job state.
   */
  async function renderSegment(segment, ttsProvider, ttsModel, signal) {
    const speaker = activeJob.script.speakers.find((s) => s.id === segment.speakerId);
    if (!speaker) {
      throw new AppError({
        kind: 'schema',
        message: `Segment ${segment.id} references an unknown speaker.`,
        retryable: false,
        status: undefined,
      });
    }
    setSegmentState(segment.id, 'active');
    store.set({ activeSegmentId: segment.id });
    try {
      const chunks = splitIntoChunks(segment.text, maxChunkChars);
      const pcmParts = [];
      for (const chunk of chunks) {
        throwIfAborted(signal);
        const result = await withRetry(
          () =>
            speech({
              provider: ttsProvider,
              model: ttsModel,
              voice: speaker.voice,
              input: chunk,
              signal,
            }),
          { signal },
        );
        pcmParts.push((await decode(result.audio, SAMPLE_RATE)).channels);
      }
      const merged = assembleSegments(
        pcmParts.map((channels) => ({ channels })),
        SAMPLE_RATE,
      );
      const wavBytes = encodeWavPcm16({ channels: merged.channels, sampleRate: SAMPLE_RATE });
      const blob = new Blob([wavBytes], { type: 'audio/wav' });
      activeJob = await jobs.saveSegment(activeJob.id, segment.id, blob, activeJob);
      setSegmentState(segment.id, 'completed');
    } catch (err) {
      const normalized = toAppError(err);
      if (normalized.kind !== 'cancelled') {
        activeJob = {
          ...activeJob,
          segmentStates: { ...activeJob.segmentStates, [segment.id]: 'failed' },
        };
        await jobs.updateJob(activeJob);
        setSegmentState(segment.id, 'failed');
      }
      throw normalized;
    }
  }

  /**
   * Retry one failed segment without disturbing completed work.
   * @param {string} segmentId
   * @param {{ baseUrl: string, apiKey: string }} ttsProvider
   * @param {string} ttsModel
   */
  async function retrySegment(segmentId, ttsProvider, ttsModel) {
    if (!activeJob) {
      const job = await jobs.loadJob();
      if (!job) return;
      activeJob = job;
    }
    const segment = activeJob.script.segments.find((s) => s.id === segmentId);
    if (!segment) return;
    store.set({ renderStatus: 'rendering', renderError: null });
    renderController = new AbortController();
    try {
      await renderSegment(segment, ttsProvider, ttsModel, renderController.signal);
      const allDone = activeJob.script.segments.every(
        (s) => activeJob.segmentStates[s.id] === 'completed',
      );
      if (allDone) {
        activeJob = { ...activeJob, status: 'ready' };
        await jobs.updateJob(activeJob);
        store.set({ renderStatus: 'ready', activeSegmentId: null });
        await assembleOutput();
      } else {
        store.set({ renderStatus: 'failed', activeSegmentId: null });
      }
    } catch (err) {
      const normalized = toAppError(err);
      store.set({
        renderStatus: normalized.kind === 'cancelled' ? 'cancelled' : 'failed',
        renderError: normalized.kind === 'cancelled' ? null : normalized,
        activeSegmentId: null,
      });
    } finally {
      renderController = null;
    }
  }

  /**
   * Stop after the in-flight request; completed segments stay persisted.
   */
  function cancelRender() {
    renderController?.abort();
  }

  /**
   * Decode persisted segments in script order and assemble preview WAV.
   */
  async function assembleOutput() {
    const job = activeJob;
    const records = await jobs.getAllSegments(job.id);
    const byId = new Map(records.map((r) => [r.segmentId, r.blob]));
    const pcmSegments = [];
    for (const segment of job.script.segments) {
      const blob = byId.get(segment.id);
      if (!blob) {
        throw new AppError({
          kind: 'encoding',
          message: `Audio for segment ${segment.id} is missing.`,
          retryable: true,
          status: undefined,
        });
      }
      const pcm = await decode(await blob.arrayBuffer(), SAMPLE_RATE);
      pcmSegments.push({ channels: pcm.channels, pauseAfterMs: segment.pauseAfterMs });
    }
    const assembled = assembleSegments(pcmSegments, SAMPLE_RATE);
    const wav = wavBlob({ channels: assembled.channels, sampleRate: SAMPLE_RATE });
    store.set({ output: { wav } });
  }

  /**
   * Export final audio. Recovery data is retained on export failure.
   * @param {'wav'|'mp3'} format
   * @param {(encoded: number, total: number) => void} [onProgress]
   * @returns {Promise<{ blob: Blob, filename: string }>}
   */
  async function exportAudio(format, onProgress) {
    const output = store.get().output;
    if (!output?.wav) {
      throw new AppError({
        kind: 'validation',
        message: 'No rendered audio to download yet.',
        retryable: false,
        status: undefined,
      });
    }
    store.set({ exporting: true });
    try {
      let blob = output.wav;
      if (format === 'mp3') {
        const pcm = await decode(await output.wav.arrayBuffer(), SAMPLE_RATE);
        blob = await encodeMp3({ channels: pcm.channels, sampleRate: SAMPLE_RATE, onProgress });
      }
      const title = activeJob?.script?.title || store.get().script?.title || 'podcast';
      const filename = sanitizeFilename(`vxpods-${title}`, format);
      // Successful export: recovery data no longer needed.
      await jobs.deleteJob();
      activeJob = null;
      return { blob, filename };
    } catch (err) {
      throw toAppError(err, { kind: 'encoding', message: 'Audio export failed.' });
    } finally {
      store.set({ exporting: false });
    }
  }

  /**
   * JSON export of the canonical script (no credentials/recovery metadata).
   * @returns {{ json: object, filename: string }}
   */
  function exportScriptJson() {
    const script = store.get().script;
    if (!script) {
      throw new AppError({
        kind: 'validation',
        message: 'No script to download yet.',
        retryable: false,
        status: undefined,
      });
    }
    return {
      json: exportableScript(script),
      filename: sanitizeFilename(`vxpods-script-${script.title}`, 'json'),
    };
  }

  /**
   * Explicitly discard recoverable render data.
   */
  async function discardRender() {
    renderController?.abort();
    await jobs.deleteJob();
    activeJob = null;
    store.set({
      renderStatus: 'idle',
      segmentStates: {},
      activeSegmentId: null,
      renderError: null,
      output: null,
    });
  }

  /**
   * Load recoverable job summary without starting anything.
   */
  async function getRecoverableJob() {
    return jobs.loadJob();
  }

  /**
   * @param {string} id
   * @param {'pending'|'active'|'completed'|'failed'} state
   */
  function setSegmentState(id, state) {
    store.set({ segmentStates: { ...store.get().segmentStates, [id]: state } });
  }

  return {
    store,
    generateScript,
    repairScript,
    applyEditedScript,
    validateImportedScript,
    importScript,
    startRender,
    resumeRender,
    retrySegment,
    cancelRender,
    exportAudio,
    exportScriptJson,
    discardRender,
    getRecoverableJob,
  };
}
