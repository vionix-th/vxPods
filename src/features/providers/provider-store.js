/**
 * Provider configuration records: validation, URL normalization, and CRUD
 * over the browser-local settings document.
 */

import { AppError } from '../../services/errors.js';
import {
  loadSettings,
  restoreSettingsBackup as restoreSettingsBackupDocument,
  saveSettings,
  subscribeSettingsRestore,
  validateSettingsBackup as validateSettingsBackupDocument,
} from '../../storage/local-settings.js';
import { validateProviderInput } from '../../domain/provider-config.js';

export { normalizeBaseUrl, validateProviderInput } from '../../domain/provider-config.js';

export const PROVIDER_PRESETS = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  manual: { label: 'Manual URL', baseUrl: '' },
};

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
 * @returns {import('../../domain/provider-config.js').ProviderConfig[]}
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
  return restoreSettingsBackupDocument(backup);
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

subscribeSettingsRestore(notifyProviders);

/**
 * Create a provider. Returns the stored record.
 * @param {{ name: string, baseUrl: string, auth?: 'none'|'bearer', apiKey?: string, textGeneration?: { api?: unknown, jsonResponseFormat?: unknown, models?: unknown }, requestOptions?: unknown, ttsModels?: unknown }} input
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
 * @param {{ name: string, baseUrl: string, auth?: 'none'|'bearer', apiKey?: string, textGeneration?: { api?: unknown, jsonResponseFormat?: unknown, models?: unknown }, requestOptions?: unknown, ttsModels?: unknown }} input
 */
export function updateProvider(id, input) {
  const settings = loadSettings();
  const index = settings.providers.findIndex((p) => p.id === id);
  if (index === -1) throw validationError('Configuration not found.');
  const existing = settings.providers[index];
  const valid = validateProviderInput({
    name: input.name,
    baseUrl: input.baseUrl,
    auth: input.auth ?? existing.auth,
    apiKey: input.auth === 'none' ? '' : (input.apiKey?.trim() ? input.apiKey : existing.apiKey),
    textGeneration: input.textGeneration ?? existing.textGeneration,
    requestOptions: input.requestOptions ?? existing.requestOptions,
    ttsModels: input.ttsModels ?? existing.ttsModels,
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
