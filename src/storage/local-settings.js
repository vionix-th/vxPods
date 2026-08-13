/**
 * Versioned browser-local settings. Schema version 1 is the current baseline.
 */

import { AppError } from '../services/errors.js';
import { TEMPLATE_IDS, validatePromptTemplate } from '../domain/prompt-templates.js';
import {
  isValidFormatTemplateCollection,
  isValidEpisodeDirectionTemplateCollection,
  isValidSpeakerProfileCollection,
  normalizeFormatTemplates,
  normalizeEpisodeDirectionTemplates,
  normalizeSpeakerProfiles,
  starterFormatTemplates,
  starterEpisodeDirectionTemplates,
  starterSpeakerProfiles,
} from '../domain/podcast-templates.js';
import {
  isValidProviderRecord,
  normalizeProviderRecord,
} from '../domain/provider-config.js';

export const STORAGE_KEY = 'vxpods.settings';
export const SETTINGS_SCHEMA_VERSION = 1;
/** @type {Set<() => void>} */
const restoreListeners = new Set();

/** @typedef {import('../domain/provider-config.js').ProviderConfig} ProviderConfig */

/**
 * @typedef {Object} SettingsDocument
 * @property {number} schemaVersion
 * @property {ProviderConfig[]} providers
 * @property {string | null} selectedTextProviderId
 * @property {string | null} selectedTtsProviderId
 * @property {{ mode: 'tts' | 'podcast' }} preferences
 * @property {Partial<Record<import('../domain/prompt-templates.js').PromptTemplateId, string>>} promptTemplates
 * @property {import('../domain/podcast-templates.js').FormatTemplate[]} formatTemplates
 * @property {import('../domain/podcast-templates.js').EpisodeDirectionTemplate[]} episodeDirectionTemplates
 * @property {import('../domain/podcast-templates.js').SpeakerProfile[]} speakerProfiles
 */

export function defaultSettings() {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    providers: [],
    selectedTextProviderId: null,
    selectedTtsProviderId: null,
    preferences: { mode: 'tts' },
    promptTemplates: {},
    episodeDirectionTemplates: starterEpisodeDirectionTemplates(),
    formatTemplates: starterFormatTemplates(),
    speakerProfiles: starterSpeakerProfiles(),
  };
}

/**
 * Read settings without conflating missing data with unreadable, corrupt, or
 * unsupported data. Callers may render defaults for continuity, but writes
 * must not replace invalid raw data without an explicit restore/reset action.
 *
 * @param {Storage} [storage]
 * @returns {{ status: 'empty'|'valid'|'corrupt'|'unsupported'|'unavailable', settings: SettingsDocument, error: AppError | null }}
 */
export function inspectSettings(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = typeof storage?.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null;
  } catch (cause) {
    return {
      status: 'unavailable',
      settings: defaultSettings(),
      error: settingsReadError('Browser settings could not be read.', cause),
    };
  }
  if (raw == null) return { status: 'empty', settings: defaultSettings(), error: null };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return {
      status: 'corrupt',
      settings: defaultSettings(),
      error: settingsReadError(
        'Saved settings are damaged. Restore a settings backup or clear local data before saving new settings.',
        cause,
      ),
    };
  }
  if (parsed?.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    return {
      status: 'unsupported',
      settings: defaultSettings(),
      error: settingsReadError(
        'Saved settings use an unsupported schema version. Restore a compatible backup or clear local data before saving new settings.',
      ),
    };
  }
  try {
    assertDocumentShape(parsed);
    return { status: 'valid', settings: validateDocument(parsed), error: null };
  } catch (cause) {
    return {
      status: 'corrupt',
      settings: defaultSettings(),
      error: settingsReadError(
        'Saved settings are invalid. Restore a settings backup or clear local data before saving new settings.',
        cause,
      ),
    };
  }
}

export function loadSettings(storage = globalThis.localStorage) {
  return inspectSettings(storage).settings;
}

/**
 * @param {SettingsDocument} doc
 * @param {Storage} [storage]
 * @param {{ replaceInvalid?: boolean }} [options]
 */
export function saveSettings(doc, storage = globalThis.localStorage, options = {}) {
  const existing = inspectSettings(storage);
  if (existing.status === 'unavailable') throw existing.error;
  if (
    !options.replaceInvalid &&
    (existing.status === 'corrupt' || existing.status === 'unsupported')
  ) {
    throw existing.error;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(validateDocument(doc)));
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
  if (!isValidFormatTemplateCollection(raw.formatTemplates)) {
    throw validationError('Settings file contains invalid format templates.');
  }
  if (Object.hasOwn(raw, 'episodeDirectionTemplates') &&
      !isValidEpisodeDirectionTemplateCollection(raw.episodeDirectionTemplates)) {
    throw validationError('Settings file contains invalid episode direction templates.');
  }
  if (!isValidSpeakerProfileCollection(raw.speakerProfiles)) {
    throw validationError('Settings file contains invalid speaker profiles.');
  }
  return validateDocument(raw);
}

export function restoreSettingsBackup(backup, storage = globalThis.localStorage) {
  const settings = validateSettingsBackup(backup);
  saveSettings(settings, storage, { replaceInvalid: true });
  for (const listener of restoreListeners) listener();
  return settings;
}

export function subscribeSettingsRestore(listener) {
  restoreListeners.add(listener);
  return () => restoreListeners.delete(listener);
}

export function clearSettings(storage = globalThis.localStorage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (err) {
    throw normalizeStorageError(err, 'Failed to remove saved browser settings.');
  }
}

function assertDocumentShape(doc) {
  if (!Array.isArray(doc.providers) ||
      !doc.preferences ||
      (doc.preferences.mode !== 'tts' && doc.preferences.mode !== 'podcast')) {
    throw new TypeError('Settings document has invalid required fields.');
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
    episodeDirectionTemplates: Object.hasOwn(doc, 'episodeDirectionTemplates')
      ? normalizeEpisodeDirectionTemplates(doc.episodeDirectionTemplates)
      : starterEpisodeDirectionTemplates(),
    formatTemplates: normalizeFormatTemplates(doc.formatTemplates),
    speakerProfiles: normalizeSpeakerProfiles(doc.speakerProfiles),
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

function normalizeStorageError(err, fallbackMessage = 'Failed to write browser storage.') {
  const quota = err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  return new AppError({
    kind: 'storage',
    message: quota
      ? 'Browser storage is full. Free space or clear local data, then retry.'
      : fallbackMessage,
    retryable: false,
    status: undefined,
    cause: err,
  });
}

function settingsReadError(message, cause) {
  return new AppError({
    kind: 'storage',
    message,
    retryable: false,
    status: undefined,
    cause,
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
