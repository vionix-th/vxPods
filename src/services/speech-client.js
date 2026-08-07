import { appError } from './errors.js';
import { providerRequestDiagnostics, sendProviderRequest } from './provider-http.js';

const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * @typedef {Object} SpeechResult
 * @property {ArrayBuffer} audio encoded audio bytes as returned by provider
 * @property {string} contentType provider-reported content type
 * @property {import('../storage/local-settings.js').TtsModelConfig} ttsModel requested audio contract
 * @property {import('./errors.js').ProviderDiagnostics} diagnostics redacted request context
 */

/**
 * Call an OpenAI-compatible text-to-speech endpoint.
 *
 * @param {Object} args
 * @param {{ baseUrl: string, apiKey: string }} args.provider
 * @param {import('../storage/local-settings.js').TtsModelConfig} args.ttsModel
 * @param {string} args.voice
 * @param {string} args.input
 * @param {number} [args.speed]
 * @param {AbortSignal} [args.signal]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<SpeechResult>}
 */
export async function createSpeech(args) {
  const { provider, ttsModel, voice, input } = args;
  const body = { model: ttsModel.model, voice, input, response_format: ttsModel.responseFormat };
  if (typeof args.speed === 'number' && Number.isFinite(args.speed)) {
    body.speed = args.speed;
  }
  const request = {
    url: `${provider.baseUrl}/audio/speech`,
    provider,
    body,
    signal: args.signal,
    timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    timeoutMessage: 'Speech request timed out.',
  };
  const response = await sendProviderRequest(request);
  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  const diagnostics = providerRequestDiagnostics(request, response);
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
      diagnostics,
    });
  }
  if (!contentType.toLowerCase().startsWith('audio/')) {
    throw appError({
      kind: 'provider',
      message: `Provider returned ${contentType} instead of audio.`,
      retryable: false,
      status: 200,
      diagnostics,
    });
  }
  return { audio, contentType, diagnostics, ttsModel };
}

/**
 * Decode a speech result while preserving safe provider context when the
 * browser rejects the returned bytes.
 * @param {SpeechResult} result
 * @param {(bytes: ArrayBuffer, sampleRate: number) => Promise<unknown>} decode
 * @param {number} sampleRate
 * @param {(bytes: ArrayBuffer, format: import('../storage/local-settings.js').PcmFormat, sampleRate: number) => unknown} [decodeRawPcm]
 */
export async function decodeSpeechAudio(result, decode, sampleRate, decodeRawPcm) {
  try {
    if (result.ttsModel.responseFormat === 'pcm') {
      if (!result.ttsModel.pcm || !decodeRawPcm) throw new Error('Raw PCM metadata or decoder is missing.');
      return await decodeRawPcm(result.audio, result.ttsModel.pcm, sampleRate);
    }
    return await decode(result.audio, sampleRate);
  } catch (cause) {
    throw appError({
      kind: 'encoding',
      message: 'The provider returned audio that this browser could not decode.',
      retryable: false,
      status: 200,
      cause,
      diagnostics: { ...result.diagnostics, contentType: result.contentType },
    });
  }
}

/**
 * Minimal capability probe used by "Test Speech".
 * @param {{ baseUrl: string, apiKey: string }} provider
 * @param {import('../storage/local-settings.js').TtsModelConfig} ttsModel
 * @param {string} voice
 * @param {AbortSignal} [signal]
 */
export async function testSpeechConnection(provider, ttsModel, voice, signal) {
  return createSpeech({
    provider,
    ttsModel,
    voice,
    input: 'Connection test.',
    timeoutMs: 30_000,
    signal,
  });
}
