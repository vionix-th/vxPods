/**
 * Local, provider-specific suggestions for editable model and voice fields.
 * They are deliberately not inferred from provider APIs: OpenAI-compatible
 * `/models` responses do not communicate TTS or voice capabilities.
 */

export const DEFAULT_CHAT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'];
export const DEFAULT_TTS_MODELS = ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'];
export const DEFAULT_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
];

/**
 * @returns {{ chatModels: string[], ttsModels: string[], voicesByTtsModel: Record<string, string[]> }}
 */
export function defaultProviderSuggestions() {
  return {
    chatModels: [...DEFAULT_CHAT_MODELS],
    ttsModels: [...DEFAULT_TTS_MODELS],
    voicesByTtsModel: voicesForTtsModels(DEFAULT_TTS_MODELS),
  };
}

/**
 * @param {string[]} ttsModels
 * @param {string[]} [fallbackVoices]
 * @returns {Record<string, string[]>}
 */
export function voicesForTtsModels(ttsModels, fallbackVoices = DEFAULT_VOICES) {
  return Object.fromEntries(ttsModels.map((model) => [model, [...fallbackVoices]]));
}

/**
 * Normalize editable provider suggestions without imposing provider-specific
 * capability rules. Empty lists are valid because all workflow fields permit
 * manual identifiers.
 * @param {unknown} values
 * @param {string[]} fallback
 * @returns {string[]}
 */
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
 * Normalize model-specific voice lists. Missing or malformed entries receive
 * defaults so loaded settings always produce valid native select controls.
 * @param {unknown} values
 * @param {string[]} ttsModels
 * @param {string[]} [fallbackVoices]
 * @returns {Record<string, string[]>}
 */
export function normalizeVoicesByTtsModel(values, ttsModels, fallbackVoices = DEFAULT_VOICES) {
  const input = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  return Object.fromEntries(
    ttsModels.map((model) => {
      const voices = normalizeSuggestions(input[model], fallbackVoices);
      return [model, voices.length ? voices : [...fallbackVoices]];
    }),
  );
}

/** @param {string} value */
export function suggestionsFromLines(value) {
  return value.split(/\r?\n/);
}
