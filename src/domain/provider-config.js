/** Canonical provider configuration contract and normalization. */

import { AppError } from '../services/errors.js';

/**
 * @typedef {Object} PcmFormat
 * @property {number} sampleRate
 * @property {number} channels
 * @property {'s16le'} encoding
 */

/**
 * @typedef {Object} TtsModelConfig
 * @property {string} model
 * @property {string[]} voices
 * @property {'mp3'|'pcm'} responseFormat
 * @property {PcmFormat | undefined} [pcm]
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} id
 * @property {string} name
 * @property {string} baseUrl
 * @property {'none'|'bearer'} auth
 * @property {string} apiKey
 * @property {{ api: 'chat-completions'|'responses', models: string[] }} textGeneration
 * @property {TtsModelConfig[]} ttsModels
 */

export const TEXT_GENERATION_APIS = {
  chatCompletions: 'chat-completions',
  responses: 'responses',
};

export const TEXT_GENERATION_API_LABELS = {
  [TEXT_GENERATION_APIS.chatCompletions]: 'Chat Completions',
  [TEXT_GENERATION_APIS.responses]: 'Responses',
};

export const DEFAULT_TEXT_MODELS_BY_API = {
  [TEXT_GENERATION_APIS.chatCompletions]: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  [TEXT_GENERATION_APIS.responses]: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6'],
};

export const DEFAULT_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
];

/** @type {TtsModelConfig[]} */
export const DEFAULT_TTS_MODELS = [
  mp3Model('gpt-4o-mini-tts', DEFAULT_VOICES),
  mp3Model('tts-1', DEFAULT_VOICES),
  mp3Model('tts-1-hd', DEFAULT_VOICES),
];

export function defaultProviderSuggestions() {
  return {
    textGeneration: {
      api: TEXT_GENERATION_APIS.chatCompletions,
      models: defaultTextModels(TEXT_GENERATION_APIS.chatCompletions),
    },
    ttsModels: cloneTtsModels(DEFAULT_TTS_MODELS),
  };
}

/** Presets seed local hints only; OpenRouter and Manual start empty. */
export function providerSuggestionsForPreset(preset) {
  if (preset === 'openai') return defaultProviderSuggestions();
  return {
    textGeneration: { api: TEXT_GENERATION_APIS.chatCompletions, models: [] },
    ttsModels: [],
  };
}

export function isTextGenerationApi(api) {
  return api === TEXT_GENERATION_APIS.chatCompletions || api === TEXT_GENERATION_APIS.responses;
}

export function defaultTextModels(api) {
  const validApi = isTextGenerationApi(api) ? api : TEXT_GENERATION_APIS.chatCompletions;
  return [...DEFAULT_TEXT_MODELS_BY_API[validApi]];
}

/** Normalize editable string suggestions with stable de-duplication. */
export function normalizeSuggestions(values, fallback = []) {
  if (!Array.isArray(values)) return [...fallback];
  const seen = new Set();
  const normalized = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const identifier = value.trim();
    if (!identifier || seen.has(identifier)) continue;
    seen.add(identifier);
    normalized.push(identifier);
    if (normalized.length === 100) break;
  }
  return normalized;
}

/** @param {unknown} values @param {TtsModelConfig[]} [fallback] */
export function normalizeTtsModels(values, fallback = []) {
  if (!Array.isArray(values)) return cloneTtsModels(fallback);
  const seen = new Set();
  const normalized = [];
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const model = typeof value.model === 'string' ? value.model.trim() : '';
    if (!model || seen.has(model)) continue;
    const responseFormat = value.responseFormat === 'pcm' ? 'pcm' : value.responseFormat === 'mp3' ? 'mp3' : null;
    if (!responseFormat) continue;
    const entry = {
      model,
      voices: normalizeSuggestions(value.voices),
      responseFormat,
    };
    if (responseFormat === 'pcm') {
      const sampleRate = Number(value.pcm?.sampleRate);
      const channels = Number(value.pcm?.channels);
      if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) continue;
      if (!Number.isInteger(channels) || channels < 1 || channels > 8) continue;
      if (value.pcm?.encoding !== 's16le') continue;
      entry.pcm = { sampleRate, channels, encoding: 's16le' };
    }
    seen.add(model);
    normalized.push(entry);
    if (normalized.length === 100) break;
  }
  return normalized;
}

/** @param {TtsModelConfig[]} models */
export function cloneTtsModels(models) {
  return models.map((entry) => ({
    model: entry.model,
    voices: [...entry.voices],
    responseFormat: entry.responseFormat,
    ...(entry.pcm ? { pcm: { ...entry.pcm } } : {}),
  }));
}

export function defaultTtsModel(model = '') {
  const known = DEFAULT_TTS_MODELS.find((entry) => entry.model === model);
  return known ? cloneTtsModels([known])[0] : mp3Model(model, []);
}

/** Normalize a user-entered OpenAI-compatible API root. */
export function normalizeBaseUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw validationError('Base URL is required.');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw validationError('Base URL is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw validationError('Base URL must use HTTP or HTTPS.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/v1')) {
    throw validationError('Base URL must end with /v1 (OpenAI-compatible API root).');
  }
  url.pathname = path;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

/** Validate and normalize editable provider fields. */
export function validateProviderInput(input) {
  const name = String(input.name ?? '').trim();
  if (!name) throw validationError('Name is required.');
  const auth = input.auth === undefined
    ? (String(input.apiKey ?? '').trim() ? 'bearer' : 'none')
    : input.auth;
  if (auth !== 'none' && auth !== 'bearer') throw validationError('Select a supported authentication mode.');
  const apiKey = String(input.apiKey ?? '').trim();
  if (auth === 'bearer' && !apiKey) throw validationError('API key is required for bearer authentication.');
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const api = input.textGeneration?.api ?? TEXT_GENERATION_APIS.chatCompletions;
  if (!isTextGenerationApi(api)) throw validationError('Select a supported text generation API.');
  const textModels = normalizeSuggestions(input.textGeneration?.models, defaultTextModels(api));
  const ttsModels = normalizeTtsModels(input.ttsModels, DEFAULT_TTS_MODELS);
  if (Array.isArray(input.ttsModels) && ttsModels.length !== input.ttsModels.length) {
    throw validationError('Each TTS model needs a unique identifier, a response format, and valid PCM metadata when PCM is selected.');
  }
  return { name, baseUrl, auth, apiKey: auth === 'bearer' ? apiKey : '', textGeneration: { api, models: textModels }, ttsModels };
}

/** @param {unknown} value @returns {value is ProviderConfig} */
export function isValidProviderRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (!Array.isArray(value.textGeneration?.models) || !Array.isArray(value.ttsModels)) return false;
  try {
    validateProviderInput(value);
    return true;
  } catch {
    return false;
  }
}

/** @param {ProviderConfig} provider @returns {ProviderConfig} */
export function normalizeProviderRecord(provider) {
  return { id: provider.id, ...validateProviderInput(provider) };
}

function mp3Model(model, voices) {
  return { model, voices: [...voices], responseFormat: 'mp3' };
}

function validationError(message) {
  return new AppError({ kind: 'validation', message, retryable: false, status: undefined });
}
