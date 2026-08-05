import { appError, httpStatusToAppError, parseRetryAfter } from './errors.js';

const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * @typedef {Object} SpeechResult
 * @property {ArrayBuffer} audio encoded audio bytes as returned by provider
 * @property {string} contentType provider-reported content type
 */

/**
 * Call an OpenAI-compatible text-to-speech endpoint.
 *
 * @param {Object} args
 * @param {{ baseUrl: string, apiKey: string }} args.provider
 * @param {string} args.model
 * @param {string} args.voice
 * @param {string} args.input
 * @param {number} [args.speed]
 * @param {AbortSignal} [args.signal]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<SpeechResult>}
 */
export async function createSpeech(args) {
  const { provider, model, voice, input } = args;
  const body = { model, voice, input };
  if (typeof args.speed === 'number' && Number.isFinite(args.speed)) {
    body.speed = args.speed;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw appError({
      kind: 'offline',
      message: 'Browser is offline. Connect to the internet to generate.',
      retryable: false,
      status: undefined,
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = args.signal;
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw appError({
        kind: 'cancelled',
        message: 'Request cancelled.',
        retryable: false,
        status: undefined,
      });
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  let response;
  try {
    response = await fetch(`${provider.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted && controller.signal.reason === 'timeout') {
      throw appError({
        kind: 'network',
        message: 'Speech request timed out.',
        retryable: true,
        status: undefined,
        cause: err,
      });
    }
    if (signal?.aborted) {
      throw appError({
        kind: 'cancelled',
        message: 'Request cancelled.',
        retryable: false,
        status: undefined,
        cause: err,
      });
    }
    throw appError({
      kind: 'network',
      message:
        'Network or CORS failure. Check the provider URL, endpoint CORS support, and connection.',
      retryable: true,
      status: undefined,
      cause: err,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
  if (!response.ok) {
    const bodyText = await safeReadText(response);
    throw httpStatusToAppError(response.status, bodyText, {
      retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
    });
  }
  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  let audio;
  try {
    audio = await response.arrayBuffer();
  } catch (err) {
    throw appError({
      kind: 'network',
      message: 'Failed to read provider audio response.',
      retryable: true,
      status: undefined,
      cause: err,
    });
  }
  if (audio.byteLength === 0) {
    throw appError({
      kind: 'provider',
      message: 'Provider returned empty audio.',
      retryable: true,
      status: 200,
    });
  }
  return { audio, contentType };
}

/**
 * Minimal capability probe used by "Test Speech".
 * @param {{ baseUrl: string, apiKey: string }} provider
 * @param {string} model
 * @param {string} voice
 * @param {AbortSignal} [signal]
 */
export async function testSpeechConnection(provider, model, voice, signal) {
  return createSpeech({
    provider,
    model,
    voice,
    input: 'Connection test.',
    timeoutMs: 30_000,
    signal,
  });
}

/**
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
