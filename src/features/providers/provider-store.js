/**
 * Provider configuration records: validation, URL normalization, and CRUD
 * over the versioned localStorage settings document.
 */

import { AppError } from '../../services/errors.js';
import { loadSettings, saveSettings } from '../../storage/local-settings.js';
import {
  DEFAULT_CHAT_MODELS,
  DEFAULT_TTS_MODELS,
  DEFAULT_VOICES,
  normalizeSuggestions,
  normalizeVoicesByTtsModel,
} from './provider-suggestions.js';

export const PROVIDER_PRESETS = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  manual: { label: 'Manual URL', baseUrl: '' },
};

/**
 * Normalize a user-entered base URL.
 * - trims whitespace
 * - requires http(s); https required except localhost/127.0.0.1
 * - strips trailing slashes
 * - requires the path to end with /v1 (OpenAI-compatible API root)
 *
 * @param {string} input
 * @returns {string}
 * @throws {AppError} validation kind
 */
export function normalizeBaseUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) {
    throw validationError('Base URL is required.');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw validationError('Base URL is not a valid URL.');
  }
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw validationError('Base URL must use HTTPS.');
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

/**
 * Validate a candidate provider record. Returns normalized copy.
 * @param {{ name: string, baseUrl: string, apiKey: string, chatModels?: unknown, ttsModels?: unknown, voicesByTtsModel?: unknown }} input
 * @returns {{ name: string, baseUrl: string, apiKey: string, chatModels: string[], ttsModels: string[], voicesByTtsModel: Record<string, string[]> }}
 * @throws {AppError} validation kind
 */
export function validateProviderInput(input) {
  const name = String(input.name ?? '').trim();
  if (!name) throw validationError('Name is required.');
  const apiKey = String(input.apiKey ?? '').trim();
  if (!apiKey) throw validationError('API key is required.');
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const chatModels = requiredSuggestions(input.chatModels, DEFAULT_CHAT_MODELS, 'Chat model');
  const ttsModels = requiredSuggestions(input.ttsModels, DEFAULT_TTS_MODELS, 'TTS model');
  const voicesByTtsModel = requiredVoicesByTtsModel(input.voicesByTtsModel, ttsModels);
  return {
    name,
    baseUrl,
    apiKey,
    chatModels,
    ttsModels,
    voicesByTtsModel,
  };
}

/**
 * @param {unknown} values
 * @param {string[]} fallback
 * @param {string} label
 */
function requiredSuggestions(values, fallback, label) {
  const suggestions = normalizeSuggestions(values, fallback);
  if (suggestions.length === 0) throw validationError(`At least one ${label} is required.`);
  return suggestions;
}

/** @param {unknown} values @param {string[]} ttsModels */
function requiredVoicesByTtsModel(values, ttsModels) {
  const source = values && typeof values === 'object' && !Array.isArray(values) ? values : null;
  const normalized = normalizeVoicesByTtsModel(values, ttsModels);
  for (const model of ttsModels) {
    const supplied = source ? normalizeSuggestions(source[model], DEFAULT_VOICES) : DEFAULT_VOICES;
    if (supplied.length === 0) throw validationError(`At least one voice is required for ${model}.`);
  }
  return normalized;
}

/**
 * @param {string} message
 */
function validationError(message) {
  return new AppError({
    kind: 'validation',
    message,
    retryable: false,
    status: undefined,
  });
}

/**
 * @returns {import('../../storage/local-settings.js').ProviderConfig[]}
 */
export function listProviders() {
  return loadSettings().providers;
}

/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * Subscribe to provider/selection mutations.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeProviders(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyProviders() {
  for (const listener of listeners) listener();
}

/**
 * @param {string | null | undefined} id
 * @returns {import('../../storage/local-settings.js').ProviderConfig | null}
 */
export function getProvider(id) {
  if (!id) return null;
  return loadSettings().providers.find((p) => p.id === id) ?? null;
}

/**
 * Create a provider. Returns the stored record.
 * @param {{ name: string, baseUrl: string, apiKey: string, chatModels?: unknown, ttsModels?: unknown, voicesByTtsModel?: unknown }} input
 */
export function addProvider(input) {
  const valid = validateProviderInput(input);
  const settings = loadSettings();
  const record = { id: generateId(), ...valid };
  settings.providers.push(record);
  saveSettings(settings);
  notifyProviders();
  return record;
}

/**
 * Update an existing provider. API key is replaced only when a new
 * non-empty key is supplied (masked-field behavior).
 * @param {string} id
 * @param {{ name: string, baseUrl: string, apiKey?: string, chatModels?: unknown, ttsModels?: unknown, voicesByTtsModel?: unknown }} input
 */
export function updateProvider(id, input) {
  const settings = loadSettings();
  const index = settings.providers.findIndex((p) => p.id === id);
  if (index === -1) throw validationError('Configuration not found.');
  const existing = settings.providers[index];
  const valid = validateProviderInput({
    name: input.name,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey?.trim() ? input.apiKey : existing.apiKey,
    chatModels: input.chatModels ?? existing.chatModels,
    ttsModels: input.ttsModels ?? existing.ttsModels,
    voicesByTtsModel: input.voicesByTtsModel ?? existing.voicesByTtsModel,
  });
  settings.providers[index] = { ...existing, ...valid };
  saveSettings(settings);
  notifyProviders();
  return settings.providers[index];
}

/**
 * Delete a provider and clear any selection referencing it.
 * @param {string} id
 */
export function deleteProvider(id) {
  const settings = loadSettings();
  settings.providers = settings.providers.filter((p) => p.id !== id);
  if (settings.selectedChatProviderId === id) settings.selectedChatProviderId = null;
  if (settings.selectedTtsProviderId === id) settings.selectedTtsProviderId = null;
  saveSettings(settings);
  notifyProviders();
}

/**
 * @param {'chat'|'tts'} slot
 * @param {string | null} id
 */
export function selectProvider(slot, id) {
  const settings = loadSettings();
  if (id !== null && !settings.providers.some((p) => p.id === id)) {
    throw validationError('Configuration not found.');
  }
  if (slot === 'chat') settings.selectedChatProviderId = id;
  else settings.selectedTtsProviderId = id;
  saveSettings(settings);
  notifyProviders();
}

/**
 * @param {'chat'|'tts'} slot
 * @returns {string | null}
 */
export function getSelectedProviderId(slot) {
  const settings = loadSettings();
  return slot === 'chat' ? settings.selectedChatProviderId : settings.selectedTtsProviderId;
}

/**
 * @param {'tts'|'podcast'} mode
 */
export function saveMode(mode) {
  const settings = loadSettings();
  settings.preferences.mode = mode;
  saveSettings(settings);
}

/**
 * @returns {string}
 */
function generateId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `provider-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
