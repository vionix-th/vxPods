/**
 * MP3 encoding, isolated behind one module. Runs in a Web Worker when
 * available; falls back to main-thread encoding otherwise.
 */

import { AppError } from '../services/errors.js';

export const MP3_TARGET_KBPS = 128;
const PROGRESS_INTERVAL = 50_000;

/**
 * Encode PCM into an MP3 Blob on the main thread.
 * Also used inside the worker; keep free of DOM assumptions.
 *
 * @param {Object} args
 * @param {Float32Array[]} args.channels
 * @param {number} args.sampleRate
 * @param {(encodedSamples: number, totalSamples: number) => void} [args.onProgress]
 * @returns {Promise<Blob>}
 */
export async function encodeMp3MainThread({ channels, sampleRate, onProgress }) {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const numChannels = Math.min(2, channels.length);
  const encoder = new Mp3Encoder(numChannels, sampleRate, MP3_TARGET_KBPS);
  const left = floatToInt16(channels[0]);
  const right = numChannels === 2 ? floatToInt16(channels[1]) : left;
  const parts = [];
  const blockSize = 1152;
  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const r = numChannels === 2 ? right.subarray(i, i + blockSize) : undefined;
    const encoded = numChannels === 2 ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
    if (encoded.length > 0) parts.push(new Int8Array(encoded));
    if (onProgress && (i % (PROGRESS_INTERVAL * blockSize) === 0 || i + blockSize >= left.length)) {
      onProgress(Math.min(i + blockSize, left.length), left.length);
    }
  }
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(new Int8Array(tail));
  return new Blob(parts, { type: 'audio/mpeg' });
}

/**
 * Encode in a dedicated worker; cancel via AbortSignal.
 * @param {Object} args
 * @param {Float32Array[]} args.channels
 * @param {number} args.sampleRate
 * @param {AbortSignal} [args.signal]
 * @param {(encodedSamples: number, totalSamples: number) => void} [args.onProgress]
 * @returns {Promise<Blob>}
 */
export function encodeMp3InWorker({ channels, sampleRate, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('../workers/audio-worker.js', import.meta.url), {
        type: 'module',
      });
    } catch (err) {
      reject(
        new AppError({
          kind: 'encoding',
          message: 'Unable to start background encoder.',
          retryable: false,
          status: undefined,
          cause: err,
        }),
      );
      return;
    }
    const onAbort = () => {
      worker.terminate();
      reject(
        new AppError({
          kind: 'cancelled',
          message: 'Encoding cancelled.',
          retryable: false,
          status: undefined,
        }),
      );
    };
    if (signal) {
      if (signal.aborted) {
        worker.terminate();
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    worker.onmessage = (event) => {
      const data = event.data;
      if (data?.type === 'progress') {
        onProgress?.(data.encoded, data.total);
        return;
      }
      cleanup();
      if (data?.type === 'done') {
        resolve(new Blob([data.mp3], { type: 'audio/mpeg' }));
      } else {
        reject(
          new AppError({
            kind: 'encoding',
            message: data?.message || 'MP3 encoding failed.',
            retryable: false,
            status: undefined,
          }),
        );
      }
    };
    worker.onerror = (event) => {
      cleanup();
      reject(
        new AppError({
          kind: 'encoding',
          message: 'MP3 encoding failed.',
          retryable: false,
          status: undefined,
          cause: event,
        }),
      );
    };
    const int16Channels = channels.map((c) => floatToInt16(c));
    const transfers = int16Channels.map((c) => c.buffer);
    worker.postMessage(
      {
        channels: transfers,
        sampleRate,
        channelCount: int16Channels.length,
        length: int16Channels[0].length,
      },
      transfers,
    );
    function cleanup() {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    }
  });
}

/**
 * Encode MP3, preferring the worker and falling back to main thread when
 * worker construction or module workers are unsupported.
 * @param {Parameters<typeof encodeMp3InWorker>[0]} args
 * @returns {Promise<Blob>}
 */
export async function encodeMp3(args) {
  try {
    return await encodeMp3InWorker(args);
  } catch (err) {
    if (err instanceof AppError && err.kind === 'cancelled') throw err;
    return encodeMp3MainThread(args);
  }
}

/**
 * @param {Float32Array} input
 * @returns {Int16Array}
 */
function floatToInt16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
