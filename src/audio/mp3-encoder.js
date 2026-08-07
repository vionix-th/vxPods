/**
 * MP3 encoding, isolated behind one module. Runs in a Web Worker when
 * available; falls back to main-thread encoding when a worker cannot be
 * constructed.
 */

import { AppError } from '../services/errors.js';
import { encodeMp3Bytes, floatToInt16 } from './mp3-core.js';

export { MP3_TARGET_KBPS } from './mp3-core.js';

class WorkerUnavailableError extends AppError {}

/**
 * Encode PCM into an MP3 Blob on the main thread.
 * @param {Object} args
 * @param {Float32Array[]} args.channels
 * @param {number} args.sampleRate
 * @param {(encodedSamples: number, totalSamples: number) => void} [args.onProgress]
 * @returns {Promise<Blob>}
 */
export async function encodeMp3MainThread({ channels, sampleRate, onProgress }) {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const pcm = channels.slice(0, 2).map(floatToInt16);
  const output = encodeMp3Bytes({ Encoder: Mp3Encoder, channels: pcm, sampleRate, onProgress });
  return new Blob([output], { type: 'audio/mpeg' });
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
        new WorkerUnavailableError({
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
    const int16Channels = channels.slice(0, 2).map(floatToInt16);
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
 * worker construction is unsupported. Runtime worker failures are surfaced;
 * silently repeating a failed encode on the main thread can freeze the UI.
 * @param {Parameters<typeof encodeMp3InWorker>[0]} args
 * @returns {Promise<Blob>}
 */
export async function encodeMp3(args) {
  try {
    return await encodeMp3InWorker(args);
  } catch (err) {
    if (err instanceof WorkerUnavailableError) return encodeMp3MainThread(args);
    throw err;
  }
}
