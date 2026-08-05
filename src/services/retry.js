import { AppError, toAppError } from './errors.js';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 800;
const MAX_DELAY_MS = 8000;

/**
 * Retry an async operation with bounded exponential backoff.
 * Only errors marked retryable are retried. Rate-limit waits honor
 * the provider-supplied Retry-After hint when passed via onRateLimit.
 *
 * @template T
 * @param {(attempt: number) => Promise<T>} fn
 * @param {{ signal?: AbortSignal, sleep?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const sleep = options.sleep || defaultSleep;
  let attempt = 0;
  for (;;) {
    throwIfAborted(options.signal);
    try {
      return await fn(attempt);
    } catch (err) {
      const normalized = toAppError(err);
      attempt += 1;
      if (!normalized.retryable || attempt >= MAX_ATTEMPTS) {
        throw normalized;
      }
      let delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
      if (normalized.kind === 'rate-limit' && typeof normalized.retryAfterSeconds === 'number') {
        delay = Math.max(delay, normalized.retryAfterSeconds * 1000);
      }
      await cancellableSleep(delay, options.signal, sleep);
    }
  }
}

/**
 * @param {AbortSignal} [signal]
 */
export function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new AppError({
      kind: 'cancelled',
      message: 'Request cancelled.',
      retryable: false,
      status: undefined,
    });
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @param {(ms: number) => Promise<void>} sleep
 */
function cancellableSleep(ms, signal, sleep) {
  if (!signal) return sleep(ms);
  return Promise.race([
    sleep(ms),
    new Promise((_, reject) => {
      if (signal.aborted) {
        reject(
          new AppError({
            kind: 'cancelled',
            message: 'Request cancelled.',
            retryable: false,
            status: undefined,
          }),
        );
        return;
      }
      signal.addEventListener(
        'abort',
        () =>
          reject(
            new AppError({
              kind: 'cancelled',
              message: 'Request cancelled.',
              retryable: false,
              status: undefined,
            }),
          ),
        { once: true },
      );
    }),
  ]);
}
