/**
 * Direct text-to-speech workflow controller. Coordinates chunking, ordered
 * requests, cancellation, per-chunk retry, decode/assembly, and export.
 * Dependencies are injectable for tests.
 */

import { createStore, assertTransition } from '../../app/state.js';
import { AppError, toAppError } from '../../services/errors.js';
import { withRetry, throwIfAborted } from '../../services/retry.js';
import { createSpeech } from '../../services/speech-client.js';
import { splitIntoChunks, DEFAULT_MAX_CHUNK_CHARS } from '../../audio/segmenter.js';
import { assembleSegments, decodeToPcm } from '../../audio/audio-assembler.js';
import { wavBlob } from '../../audio/wav-writer.js';
import { encodeMp3 } from '../../audio/mp3-encoder.js';
import { sanitizeFilename } from '../../utils/download.js';

const SAMPLE_RATE = 44100;

/**
 * @typedef {Object} TtsSettings
 * @property {{ id: string, name: string, baseUrl: string, apiKey: string }} provider
 * @property {string} model
 * @property {string} voice
 * @property {number | undefined} speed
 * @property {'wav'|'mp3'} format
 */

/**
 * @typedef {Object} TtsState
 * @property {import('../../app/state.js').FeatureStatus} status
 * @property {{ index: number, status: 'pending'|'active'|'completed'|'failed', error?: string }[]} chunks
 * @property {{ wav: Blob | null, settingsLabel: string } | null} output
 * @property {import('../../services/errors.js').AppError | null} error
 * @property {boolean} exporting
 */

/**
 * @param {Object} [deps]
 * @param {typeof createSpeech} [deps.speech]
 * @param {typeof decodeToPcm} [deps.decode]
 * @param {(bytes: ArrayBuffer) => Promise<Blob>} [deps.encodeMp3Fn]
 * @param {number} [deps.maxChunkChars]
 */
export function createTtsController(deps = {}) {
  const speech = deps.speech || createSpeech;
  const decode = deps.decode || decodeToPcm;
  const maxChunkChars = deps.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS;

  /** @type {ReturnType<typeof createStore>} */
  const store = createStore(/** @type {TtsState} */ ({
    status: 'idle',
    chunks: [],
    output: null,
    error: null,
    exporting: false,
  }));

  /** @type {AbortController | null} */
  let activeController = null;
  /** @type {Float32Array[][] | null} decoded PCM per chunk */
  let decodedChunks = null;
  /** @type {TtsSettings | null} */
  let lastSettings = null;
  /** @type {string} */
  let lastSource = '';

  const transition = (from, to) => assertTransition(from, to);

  /**
   * Validate and start generation.
   * @param {string} source
   * @param {TtsSettings} settings
   */
  async function generate(source, settings) {
    const trimmed = String(source ?? '').trim();
    if (!trimmed) {
      throw new AppError({
        kind: 'validation',
        message: 'Enter text to speak first.',
        retryable: false,
        status: undefined,
      });
    }
    transition(store.get().status, 'validating');
    store.set({ status: 'validating', error: null, output: null });

    const chunks = splitIntoChunks(trimmed, maxChunkChars);
    decodedChunks = new Array(chunks.length).fill(null);
    lastSettings = settings;
    lastSource = trimmed;
    store.set({
      status: 'generating',
      chunks: chunks.map((_, index) => ({ index, status: 'pending' })),
    });

    activeController = new AbortController();
    const signal = activeController.signal;
    try {
      for (let i = 0; i < chunks.length; i += 1) {
        throwIfAborted(signal);
        await renderChunk(i, chunks[i], settings, signal);
      }
      transition(store.get().status, 'ready');
      const pcm = assembleSegments(
        decodedChunks.map((channels) => ({ channels })),
        SAMPLE_RATE,
      );
      const wav = wavBlob({ channels: pcm.channels, sampleRate: SAMPLE_RATE });
      store.set({
        status: 'ready',
        output: {
          wav,
          settingsLabel: `${settings.provider.name} · ${settings.model} · ${settings.voice}`,
        },
      });
    } catch (err) {
      const normalized = toAppError(err);
      if (normalized.kind === 'cancelled') {
        transition(store.get().status, 'cancelled');
        store.set({ status: 'cancelled', error: null });
      } else {
        transition(store.get().status, 'failed');
        store.set({ status: 'failed', error: normalized });
      }
    } finally {
      activeController = null;
    }
  }

  /**
   * Render one chunk with bounded retry; record per-chunk state.
   */
  async function renderChunk(index, text, settings, signal) {
    setChunk(index, { status: 'active', error: undefined });
    try {
      const result = await withRetry(
        () =>
          speech({
            provider: settings.provider,
            model: settings.model,
            voice: settings.voice,
            input: text,
            speed: settings.speed,
            signal,
          }),
        { signal },
      );
      decodedChunks[index] = (await decode(result.audio, SAMPLE_RATE)).channels;
      setChunk(index, { status: 'completed' });
    } catch (err) {
      const normalized = toAppError(err);
      setChunk(index, { status: 'failed', error: normalized.message });
      throw normalized;
    }
  }

  /**
   * Retry failed chunks and continue pending ones, preserving completed work.
   */
  async function retryFailed() {
    if (!lastSettings || !decodedChunks) return;
    const chunks = splitIntoChunks(lastSource, maxChunkChars);
    const remainingIndexes = store
      .get()
      .chunks.filter((c) => c.status !== 'completed')
      .map((c) => c.index);
    if (remainingIndexes.length === 0) return;
    transition(store.get().status, 'generating');
    store.set({ status: 'generating', error: null });
    activeController = new AbortController();
    const signal = activeController.signal;
    try {
      for (const index of remainingIndexes) {
        throwIfAborted(signal);
        await renderChunk(index, chunks[index], lastSettings, signal);
      }
      const pcm = assembleSegments(
        decodedChunks.map((channels) => ({ channels })),
        SAMPLE_RATE,
      );
      const wav = wavBlob({ channels: pcm.channels, sampleRate: SAMPLE_RATE });
      store.set({
        status: 'ready',
        output: {
          wav,
          settingsLabel: `${lastSettings.provider.name} · ${lastSettings.model} · ${lastSettings.voice}`,
        },
      });
    } catch (err) {
      const normalized = toAppError(err);
      if (normalized.kind === 'cancelled') {
        store.set({ status: 'cancelled' });
      } else {
        store.set({ status: 'failed', error: normalized });
      }
    } finally {
      activeController = null;
    }
  }

  /**
   * Cancel the active run. Completed chunks remain available for retry.
   */
  function cancel() {
    if (!activeController) return;
    const status = store.get().status;
    if (status === 'generating') {
      transition(status, 'cancelling');
      store.set({ status: 'cancelling' });
    }
    activeController.abort();
  }

  /**
   * Produce a downloadable Blob in the requested format.
   * @param {'wav'|'mp3'} format
   * @param {(encoded: number, total: number) => void} [onProgress]
   * @returns {Promise<{ blob: Blob, filename: string }>}
   */
  async function exportAudio(format, onProgress) {
    const output = store.get().output;
    if (!output?.wav) {
      throw new AppError({
        kind: 'validation',
        message: 'No generated audio to download yet.',
        retryable: false,
        status: undefined,
      });
    }
    store.set({ exporting: true });
    try {
      let blob;
      if (format === 'wav') {
        blob = output.wav;
      } else {
        const pcm = assembleSegments(
          (decodedChunks || []).map((channels) => ({ channels })),
          SAMPLE_RATE,
        );
        blob = await encodeMp3({
          channels: pcm.channels,
          sampleRate: SAMPLE_RATE,
          onProgress,
        });
      }
      const base = `vxpods-speech-${lastSource.slice(0, 40)}`;
      return { blob, filename: sanitizeFilename(base, format) };
    } catch (err) {
      throw toAppError(err, { kind: 'encoding', message: 'Audio encoding failed.' });
    } finally {
      store.set({ exporting: false });
    }
  }

  /**
   * Reset to idle, dropping output.
   */
  function reset() {
    activeController?.abort();
    decodedChunks = null;
    store.set({ status: 'idle', chunks: [], output: null, error: null, exporting: false });
  }

  /**
   * @param {number} index
   * @param {Partial<TtsState['chunks'][number]>} patch
   */
  function setChunk(index, patch) {
    const chunks = store.get().chunks.map((c) => (c.index === index ? { ...c, ...patch } : c));
    store.set({ chunks });
  }

  return {
    store,
    generate,
    retryFailed,
    cancel,
    exportAudio,
    reset,
  };
}
