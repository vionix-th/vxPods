import { appError } from './errors.js';
import { sendProviderRequest } from './provider-http.js';

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
  // OpenAI defaults to MP3 while some compatible endpoints default to raw PCM.
  // Request MP3 explicitly so every caller receives a consistently decodable format.
  const body = { model, voice, input, response_format: 'mp3' };
  if (typeof args.speed === 'number' && Number.isFinite(args.speed)) {
    body.speed = args.speed;
  }
  const response = await sendProviderRequest({
    url: `${provider.baseUrl}/audio/speech`,
    provider,
    body,
    signal: args.signal,
    timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    timeoutMessage: 'Speech request timed out.',
  });
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
