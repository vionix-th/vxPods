/**
 * Versioned localStorage settings. R1 intentionally starts at schema 1 with
 * canonical TTS model objects; pre-release legacy documents are discarded.
 */

import { AppError } from '../services/errors.js';
import { TEMPLATE_IDS, validatePromptTemplate } from '../domain/prompt-templates.js';
import {
  isValidProviderRecord,
  normalizeProviderRecord,
} from '../domain/provider-config.js';

export const STORAGE_KEY = 'vxpods.settings';
export const SETTINGS_SCHEMA_VERSION = 1;

/** @typedef {import('../domain/provider-config.js').ProviderConfig} ProviderConfig */

/**
 * @typedef {Object} SettingsDocument
 * @property {number} schemaVersion
 * @property {ProviderConfig[]} providers
 * @property {string | null} selectedTextProviderId
 * @property {string | null} selectedTtsProviderId
 * @property {{ mode: 'tts' | 'podcast' }} preferences
 * @property {Partial<Record<import('../domain/prompt-templates.js').PromptTemplateId, string>>} promptTemplates
 */

export function defaultSettings() {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    providers: [],
    selectedTextProviderId: null,
    selectedTtsProviderId: null,
    preferences: { mode: 'tts' },
    promptTemplates: {},
  };
}

export function loadSettings(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return defaultSettings();
  }
  if (raw == null) return defaultSettings();
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== SETTINGS_SCHEMA_VERSION) return defaultSettings();
    return validateDocument(parsed);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(doc, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch (err) {
    throw normalizeStorageError(err);
  }
}

export function validateSettingsBackup(backup) {
  let raw = backup;
  if (typeof backup === 'string') {
    try {
      raw = JSON.parse(backup);
    } catch {
      throw validationError('Settings file is not valid JSON.');
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw validationError('Settings file must contain a settings object.');
  }
  if (raw.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    throw validationError('Settings file has an unsupported schema version.');
  }
  if (!Array.isArray(raw.providers) || raw.providers.some((provider) => !isValidProviderRecord(provider))) {
    throw validationError('Settings file contains an invalid provider configuration.');
  }
  return validateDocument(raw);
}

export function restoreSettingsBackup(backup, storage = globalThis.localStorage) {
  const settings = validateSettingsBackup(backup);
  saveSettings(settings, storage);
  return settings;
}

export function clearSettings(storage = globalThis.localStorage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* removal failure leaves data in place */
  }
}

function validateDocument(doc) {
  const providers = Array.isArray(doc.providers)
    ? doc.providers.filter(isValidProviderRecord).map(normalizeProviderRecord)
    : [];
  const ids = new Set(providers.map((provider) => provider.id));
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    providers,
    selectedTextProviderId: typeof doc.selectedTextProviderId === 'string' && ids.has(doc.selectedTextProviderId)
      ? doc.selectedTextProviderId
      : null,
    selectedTtsProviderId: typeof doc.selectedTtsProviderId === 'string' && ids.has(doc.selectedTtsProviderId)
      ? doc.selectedTtsProviderId
      : null,
    preferences: { mode: doc.preferences?.mode === 'podcast' ? 'podcast' : 'tts' },
    promptTemplates: validPromptTemplateOverrides(doc.promptTemplates),
  };
}

function validPromptTemplateOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const overrides = {};
  for (const id of TEMPLATE_IDS) {
    if (validatePromptTemplate(id, value[id]).valid) overrides[id] = value[id];
  }
  return overrides;
}

function normalizeStorageError(err) {
  const quota = err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  return new AppError({
    kind: 'storage',
    message: quota
      ? 'Browser storage is full. Free space or clear local data, then retry.'
      : 'Failed to write browser storage.',
    retryable: false,
    status: undefined,
    cause: err,
  });
}

function validationError(message) {
  return new AppError({
    kind: 'validation',
    message,
    retryable: false,
    status: undefined,
  });
}
