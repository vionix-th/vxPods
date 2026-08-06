/**
 * Provider configuration records: validation, URL normalization, and CRUD
 * over the versioned localStorage settings document.
 */

import { AppError } from '../../services/errors.js';
import {
  loadSettings,
  restoreSettingsBackup as restoreSettingsBackupDocument,
  saveSettings,
  validateSettingsBackup as validateSettingsBackupDocument,
} from '../../storage/local-settings.js';
import {
  DEFAULT_TTS_MODELS,
  TEXT_GENERATION_APIS,
  defaultTextModels,
  isTextGenerationApi,
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
 * @param {{ name: string, baseUrl: string, apiKey: string, textGeneration?: { api?: unknown, models?: unknown }, ttsModels?: unknown, voicesByTtsModel?: unknown }} input
 * @throws {AppError} validation kind
 */
export function validateProviderInput(input) {
  const name = String(input.name ?? '').trim();
  if (!name) throw validationError('Name is required.');
  const apiKey = String(input.apiKey ?? '').trim();
  if (!apiKey) throw validationError('API key is required.');
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const api = input.textGeneration?.api ?? TEXT_GENERATION_APIS.chatCompletions;
  if (!isTextGenerationApi(api)) throw validationError('Select a supported text generation API.');
  const textModels = requiredSuggestions(input.textGeneration?.models, defaultTextModels(api), 'Text generation model');
  const ttsModels = requiredSuggestions(input.ttsModels, DEFAULT_TTS_MODELS, 'TTS model');
  const voicesByTtsModel = requiredVoicesByTtsModel(input.voicesByTtsModel, ttsModels);
  return {
    name,
    baseUrl,
    apiKey,
    textGeneration: { api, models: textModels },
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
  return normalizeVoicesByTtsModel(values, ttsModels);
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

/** @returns {import('../../storage/local-settings.js').SettingsDocument} */
export function exportSettingsBackup() {
  return loadSettings();
}

/** @param {unknown} backup */
export function validateSettingsBackup(backup) {
  return validateSettingsBackupDocument(backup);
}

/**
 * Fully replace settings from an exported backup. Existing settings are not
 * changed unless the complete input validates and persists successfully.
 * @param {unknown} backup
 */
export function restoreSettingsBackup(backup) {
  const restored = restoreSettingsBackupDocument(backup);
  notifyProviders();
  return restored;
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
 * @param {{ name: string, baseUrl: string, apiKey: string, textGeneration?: { api?: unknown, models?: unknown }, ttsModels?: unknown, voicesByTtsModel?: unknown }} input
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
 * @param {{ name: string, baseUrl: string, apiKey?: string, textGeneration?: { api?: unknown, models?: unknown }, ttsModels?: unknown, voicesByTtsModel?: unknown }} input
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
    textGeneration: input.textGeneration ?? existing.textGeneration,
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
  if (settings.selectedTextProviderId === id) settings.selectedTextProviderId = null;
  if (settings.selectedTtsProviderId === id) settings.selectedTtsProviderId = null;
  saveSettings(settings);
  notifyProviders();
}

/**
 * @param {'text'|'tts'} slot
 * @param {string | null} id
 */
export function selectProvider(slot, id) {
  const settings = loadSettings();
  if (id !== null && !settings.providers.some((p) => p.id === id)) {
    throw validationError('Configuration not found.');
  }
  if (slot === 'text') settings.selectedTextProviderId = id;
  else settings.selectedTtsProviderId = id;
  saveSettings(settings);
  notifyProviders();
}

/**
 * @param {'text'|'tts'} slot
 * @returns {string | null}
 */
export function getSelectedProviderId(slot) {
  const settings = loadSettings();
  return slot === 'text' ? settings.selectedTextProviderId : settings.selectedTtsProviderId;
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
