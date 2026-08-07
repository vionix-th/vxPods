/**
 * Podcast workflow controller: script generation/validation/repair,
 * recoverable audio rendering, resume, retry, assembly, and export.
 * Dependencies injectable for tests.
 */

import { createStore, setFeatureStatus, setGuardedStatus } from '../../app/state.js';
import { AppError, toAppError } from '../../services/errors.js';
import { throwIfAborted } from '../../services/retry.js';
import { generateText } from '../../services/text-generation-client.js';
import { createSpeech } from '../../services/speech-client.js';
import { synthesizeSpeechText } from '../../services/speech-renderer.js';
import { DEFAULT_MAX_CHUNK_CHARS } from '../../audio/segmenter.js';
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
import { RENDER_JOB_SCHEMA_VERSION } from '../../storage/render-job-store.js';
import { loadSettings } from '../../storage/local-settings.js';

const SAMPLE_RATE = 44100;
const RENDER_TRANSITIONS = {
  idle: ['rendering', 'ready', 'failed'],
  rendering: ['ready', 'failed', 'cancelled', 'idle'],
  ready: ['rendering', 'exporting', 'failed', 'idle'],
  exporting: ['ready'],
  failed: ['rendering', 'idle'],
  cancelled: ['rendering', 'idle'],
};

/**
 * @typedef {Object} PodcastState
 * @property {import('../../app/state.js').FeatureStatus} status script phase
 * @property {import('./podcast-script.js').PodcastScript | null} script
 * @property {import('../../services/errors.js').AppError | null} error
 * @property {string[]} validationErrors
 * @property {boolean} repairAvailable
 * @property {'idle'|'rendering'|'cancelled'|'failed'|'ready'|'exporting'} renderStatus
 * @property {Record<string, 'pending'|'active'|'completed'|'failed'>} segmentStates
 * @property {string | null} activeSegmentId
 * @property {import('../../services/errors.js').AppError | null} renderError
 * @property {{ wav: Blob } | null} output
 */

/**
 * @param {Object} [deps]
 * @param {typeof generateText} [deps.textGeneration]
 * @param {typeof createSpeech} [deps.speech]
 * @param {typeof decodeToPcm} [deps.decode]
 * @param {typeof jobStore} [deps.jobs]
 * @param {number} [deps.maxChunkChars]
 * @param {() => object} [deps.getPromptTemplates]
 * @param {typeof encodeMp3} [deps.encodeMp3Fn]
 */
export function createPodcastController(deps = {}) {
  const textGeneration = deps.textGeneration || generateText;
  const speech = deps.speech || createSpeech;
  const decode = deps.decode || decodeToPcm;
  const jobs = deps.jobs || jobStore;
  const maxChunkChars = deps.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS;
  const getPromptTemplates = deps.getPromptTemplates || (() => loadSettings().promptTemplates);
  const encodeMp3Audio = deps.encodeMp3Fn || encodeMp3;

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
  }));

  /** @type {AbortController | null} */
  let renderController = null;
  /** @type {import('../../storage/render-job-store.js').RenderJob | null} */
  let activeJob = null;
  /** @type {import('./podcast-script.js').PodcastPreferences | null} */
  let lastPrefs = null;
  /** @type {{ baseUrl: string, apiKey: string } | null} */
  let lastTextProvider = null;
  /** @type {string} */
  let lastRawOutput = '';

  /**
   * Generate a script from source + preferences.
   * @param {string} source
   * @param {import('./podcast-script.js').PodcastPreferences} prefs
   * @param {{ baseUrl: string, apiKey: string, textGeneration: { api: 'chat-completions'|'responses', models: string[] } }} textProvider
   */
  async function generateScript(source, prefs, textProvider) {
    const trimmed = String(source ?? '').trim();
    if (!trimmed) {
      throw new AppError({
        kind: 'validation',
        message: 'Add source text first.',
        retryable: false,
        status: undefined,
      });
    }
    setFeatureStatus(store, 'generating', {
      error: null,
      validationErrors: [],
      repairAvailable: false,
      script: null,
    });
    lastPrefs = prefs;
    lastTextProvider = textProvider;
    try {
      const { content } = await textGeneration({
        provider: textProvider,
        model: prefs.textModel,
        messages: buildScriptPrompt(trimmed, prefs, getPromptTemplates()),
        jsonMode: true,
      });
      lastRawOutput = content;
      const script = parseAndValidate(content);
      setFeatureStatus(store, 'ready', { script });
    } catch (err) {
      const normalized = toAppError(err);
      if (normalized.kind === 'schema') {
        setFeatureStatus(store, 'failed', {
          error: normalized,
          validationErrors: normalized.cause?.errors || [normalized.message],
          repairAvailable: true,
        });
      } else {
        setFeatureStatus(store, 'failed', { error: normalized });
      }
    }
  }

  /**
   * The one allowed model repair attempt with validation errors + prior output.
   */
  async function repairScript() {
    if (!store.get().repairAvailable || !lastPrefs || !lastTextProvider) return;
    setFeatureStatus(store, 'generating', { error: null, repairAvailable: false });
    try {
      const { content } = await textGeneration({
        provider: lastTextProvider,
        model: lastPrefs.textModel,
        messages: buildRepairMessages(lastRawOutput, store.get().validationErrors, getPromptTemplates()),
        jsonMode: true,
      });
      lastRawOutput = content;
      const script = parseAndValidate(content);
      setFeatureStatus(store, 'ready', { script, validationErrors: [] });
    } catch (err) {
      const normalized = toAppError(err);
      setFeatureStatus(store, 'failed', {
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
    setFeatureStatus(store, 'ready', {
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
   * @param {import('../../domain/provider-config.js').TtsModelConfig} ttsModel
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
    if (!ttsProvider?.id) {
      throw new AppError({
        kind: 'validation',
        message: 'Select a saved TTS configuration before rendering.',
        retryable: false,
        status: undefined,
      });
    }
    const now = new Date().toISOString();
    /** @type {import('../../storage/render-job-store.js').RenderJob} */
    const job = {
      schemaVersion: RENDER_JOB_SCHEMA_VERSION,
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
    setRenderStatus('rendering', {
      segmentStates: { ...job.segmentStates },
      renderError: null,
      output: null,
    });
    await renderPendingSegments(ttsProvider, ttsModel);
  }

  /**
   * Resume an unfinished job after reload.
   * @param {{ id: string, baseUrl: string, apiKey: string }} ttsProvider
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
    assertJobProvider(job, ttsProvider);
    activeJob = job;
    setFeatureStatus(store, 'ready', { script: job.script });
    setRenderStatus('rendering', {
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
      await assembleOutput();
      activeJob = { ...activeJob, status: 'ready' };
      await jobs.updateJob(activeJob);
      setRenderStatus('ready', { activeSegmentId: null });
    } catch (err) {
      const normalized = toAppError(err);
      if (normalized.kind === 'cancelled') {
        activeJob = { ...activeJob, status: 'cancelled' };
        await jobs.updateJob(activeJob);
        setRenderStatus('cancelled', { activeSegmentId: null });
      } else {
        activeJob = { ...activeJob, status: 'failed' };
        await jobs.updateJob(activeJob);
        setRenderStatus('failed', { renderError: normalized, activeSegmentId: null });
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
      const merged = await synthesizeSpeechText({
        provider: ttsProvider,
        ttsModel,
        voice: speaker.voice,
        input: segment.text,
        signal,
        targetSampleRate: SAMPLE_RATE,
        maxChunkChars,
        speech,
        decode,
      });
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
   * @param {{ id: string, baseUrl: string, apiKey: string }} ttsProvider
   */
  async function retrySegment(segmentId, ttsProvider) {
    if (!activeJob) {
      const job = await jobs.loadJob();
      if (!job) return;
      activeJob = job;
    }
    assertJobProvider(activeJob, ttsProvider);
    const segment = activeJob.script.segments.find((s) => s.id === segmentId);
    if (!segment) return;
    setRenderStatus('rendering', { renderError: null });
    renderController = new AbortController();
    try {
      await renderSegment(
        segment,
        ttsProvider,
        activeJob.settings.ttsModel,
        renderController.signal,
      );
      const allDone = activeJob.script.segments.every(
        (s) => activeJob.segmentStates[s.id] === 'completed',
      );
      if (allDone) {
        await assembleOutput();
        activeJob = { ...activeJob, status: 'ready' };
        await jobs.updateJob(activeJob);
        setRenderStatus('ready', { activeSegmentId: null });
      } else {
        setRenderStatus('failed', { activeSegmentId: null });
      }
    } catch (err) {
      const normalized = toAppError(err);
      setRenderStatus(normalized.kind === 'cancelled' ? 'cancelled' : 'failed', {
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

  /** Restore a completed persisted render without making provider requests. */
  async function restoreReadyRender() {
    const job = await jobs.loadJob();
    if (!job || job.status !== 'ready') {
      throw new AppError({
        kind: 'validation',
        message: 'No completed render was found.',
        retryable: false,
        status: undefined,
      });
    }
    activeJob = job;
    setFeatureStatus(store, 'ready', { script: job.script });
    store.set({
      segmentStates: { ...job.segmentStates },
      renderError: null,
      output: null,
    });
    try {
      await assembleOutput();
      setRenderStatus('ready', { activeSegmentId: null });
    } catch (error) {
      const normalized = toAppError(error);
      setRenderStatus('failed', { renderError: normalized, activeSegmentId: null });
      throw normalized;
    }
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
    if (store.get().renderStatus !== 'ready') {
      throw new AppError({
        kind: 'validation',
        message: 'An export is already in progress.',
        retryable: false,
        status: undefined,
      });
    }
    setRenderStatus('exporting');
    try {
      let blob = output.wav;
      if (format === 'mp3') {
        const pcm = await decode(await output.wav.arrayBuffer(), SAMPLE_RATE);
        blob = await encodeMp3Audio({ channels: pcm.channels, sampleRate: SAMPLE_RATE, onProgress });
      }
      const title = activeJob?.script?.title || store.get().script?.title || 'podcast';
      const filename = sanitizeFilename(`vxpods-${title}`, format);
      return { blob, filename };
    } catch (err) {
      throw toAppError(err, { kind: 'encoding', message: 'Audio export failed.' });
    } finally {
      setRenderStatus('ready');
    }
  }

  /** Remove recovery only after the UI has triggered the browser download. */
  async function completeExport() {
    await jobs.deleteJob();
    activeJob = null;
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
    setRenderStatus('idle', {
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

  function assertJobProvider(job, provider) {
    if (!provider?.id || provider.id !== job.settings.ttsProviderId) {
      throw new AppError({
        kind: 'validation',
        message: `This render requires TTS configuration “${job.settings.ttsProviderName ?? job.settings.ttsProviderId}”. Restore that configuration or discard the render.`,
        retryable: false,
        status: undefined,
      });
    }
  }

  /**
   * @param {string} id
   * @param {'pending'|'active'|'completed'|'failed'} state
   */
  function setSegmentState(id, state) {
    store.set({ segmentStates: { ...store.get().segmentStates, [id]: state } });
  }

  function setRenderStatus(status, patch = {}) {
    return setGuardedStatus(store, 'renderStatus', status, RENDER_TRANSITIONS, patch);
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
    restoreReadyRender,
    retrySegment,
    cancelRender,
    exportAudio,
    completeExport,
    exportScriptJson,
    discardRender,
    getRecoverableJob,
  };
}
