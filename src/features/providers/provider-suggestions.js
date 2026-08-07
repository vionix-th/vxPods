/**
 * Local provider suggestions. Model capabilities are explicit user-managed
 * configuration and are never inferred from a provider's `/models` response.
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

/** @type {import('../../storage/local-settings.js').TtsModelConfig[]} */
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
export function normalizeSuggestions(values, fallback) {
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

/**
 * Normalize canonical TTS model objects. Legacy string/map shapes are
 * intentionally unsupported after the pre-release schema reset.
 * @param {unknown} values
 * @param {import('../../storage/local-settings.js').TtsModelConfig[]} [fallback]
 */
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
      voices: normalizeSuggestions(value.voices, []),
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
  return known
    ? cloneTtsModels([known])[0]
    : mp3Model(model, []);
}

function mp3Model(model, voices) {
  return { model, voices: [...voices], responseFormat: 'mp3' };
}

export function suggestionsFromLines(value) {
  return value.split(/\r?\n/);
}
