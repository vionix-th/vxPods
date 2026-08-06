/**
 * Versioned localStorage document for provider configurations and selections.
 * All reads validate; corrupt or unknown-version data falls back to defaults
 * without throwing. Semantic changes require a sequential migration.
 */

import { AppError } from '../services/errors.js';
import { TEMPLATE_IDS, validatePromptTemplate } from '../features/podcast/prompt-templates.js';
import {
  DEFAULT_TTS_MODELS,
  DEFAULT_VOICES,
  TEXT_GENERATION_APIS,
  defaultProviderSuggestions,
  defaultTextModels,
  isTextGenerationApi,
  normalizeSuggestions,
  normalizeVoicesByTtsModel,
  voicesForTtsModels,
} from '../features/providers/provider-suggestions.js';

const STORAGE_KEY = 'vxpods.settings';
export const SETTINGS_SCHEMA_VERSION = 8;

/**
 * @typedef {Object} ProviderConfig
 * @property {string} id
 * @property {string} name
 * @property {string} baseUrl normalized API root ending in /v1
 * @property {string} apiKey
 * @property {{ api: 'chat-completions'|'responses', models: string[] }} textGeneration locally managed text-generation contract and model suggestions
 * @property {string[]} ttsModels locally managed TTS model suggestions
 * @property {Record<string, string[]>} voicesByTtsModel locally managed voices keyed by TTS model
 */

/**
 * @typedef {Object} SettingsDocument
 * @property {number} schemaVersion
 * @property {ProviderConfig[]} providers
 * @property {string | null} selectedTextProviderId
 * @property {string | null} selectedTtsProviderId
 * @property {{ mode: 'tts' | 'podcast' }} preferences
 * @property {Partial<Record<import('../features/podcast/prompt-templates.js').PromptTemplateId, string>>} promptTemplates
 */

/**
 * @returns {SettingsDocument}
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

/**
 * Load and validate the settings document. Never throws.
 * @param {Storage} [storage]
 * @returns {SettingsDocument}
 */
export function loadSettings(storage = globalThis.localStorage) {
  let raw = null;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return defaultSettings();
  }
  if (raw == null) return defaultSettings();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultSettings();
  }
  return migrateAndValidate(parsed);
}

/**
 * Persist the settings document.
 * @param {SettingsDocument} doc
 * @param {Storage} [storage]
 * @throws {import('../services/errors.js').AppError} storage kind on quota failure
 */
export function saveSettings(doc, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch (err) {
    throw normalizeStorageError(err);
  }
}

/**
 * Parse, migrate, and validate a settings backup without changing storage.
 * @param {unknown} backup
 * @returns {SettingsDocument}
 */
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
  let document = /** @type {Record<string, unknown>} */ ({ ...raw });
  let version = Number(document.schemaVersion);
  if (!Number.isInteger(version) || version < 1 || version > SETTINGS_SCHEMA_VERSION) {
    throw validationError('Settings file has an unsupported schema version.');
  }
  if (!Array.isArray(document.providers) || document.providers.some((provider) => !isValidProviderIdentity(provider))) {
    throw validationError('Settings file contains an invalid provider configuration.');
  }
  while (version < SETTINGS_SCHEMA_VERSION) {
    document = MIGRATIONS[version](document);
    version += 1;
  }
  if (document.providers.some((provider) => !isValidProviderRecord(provider))) {
    throw validationError('Settings file contains an invalid provider configuration.');
  }
  return validateDocument(document);
}

/**
 * Fully replace local settings from a validated backup.
 * Invalid input never changes existing settings.
 * @param {unknown} backup
 * @param {Storage} [storage]
 * @returns {SettingsDocument}
 */
export function restoreSettingsBackup(backup, storage = globalThis.localStorage) {
  const settings = validateSettingsBackup(backup);
  saveSettings(settings, storage);
  return settings;
}

/**
 * Remove the settings document entirely.
 * @param {Storage} [storage]
 */
export function clearSettings(storage = globalThis.localStorage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* removal failure leaves data in place; nothing more to do */
  }
}

/**
 * Apply sequential migrations, then validate shape.
 * @param {unknown} raw
 * @returns {SettingsDocument}
 */
function migrateAndValidate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultSettings();
  let doc = /** @type {Record<string, unknown>} */ ({ ...raw });
  let version = Number(doc.schemaVersion);
  if (!Number.isInteger(version) || version < 1 || version > SETTINGS_SCHEMA_VERSION) {
    return defaultSettings();
  }
  while (version < SETTINGS_SCHEMA_VERSION) {
    doc = MIGRATIONS[version](doc);
    version += 1;
  }
  return validateDocument(doc);
}

/**
 * Sequential migration chain: MIGRATIONS[fromVersion] upgrades to fromVersion+1.
 * @type {Record<number, (doc: Record<string, unknown>) => Record<string, unknown>>}
 */
const MIGRATIONS = {
  1: (doc) => ({ ...doc, schemaVersion: 2, promptTemplates: {} }),
  2: (doc) => ({
    ...doc,
    schemaVersion: 3,
    promptTemplates: migrateDurationTemplate(doc.promptTemplates),
  }),
  3: (doc) => ({
    ...doc,
    schemaVersion: 4,
    providers: Array.isArray(doc.providers)
      ? doc.providers.map((provider) => ({ ...provider, ...defaultProviderSuggestions() }))
      : doc.providers,
  }),
  4: (doc) => ({ ...doc, schemaVersion: 5 }),
  5: (doc) => ({
    ...doc,
    schemaVersion: 6,
    providers: Array.isArray(doc.providers)
      ? doc.providers.map((provider) => {
          const ttsModels = normalizeSuggestions(provider.ttsModels, DEFAULT_TTS_MODELS);
          return {
            ...provider,
            voicesByTtsModel: voicesForTtsModels(ttsModels.length ? ttsModels : DEFAULT_TTS_MODELS, normalizeSuggestions(provider.voices, DEFAULT_VOICES)),
          };
        })
      : doc.providers,
  }),
  6: (doc) => ({
    ...doc,
    schemaVersion: 7,
    providers: Array.isArray(doc.providers)
      ? doc.providers.map((provider) => {
          const { chatModels, ...rest } = provider;
          return {
            ...rest,
            textGeneration: {
              api: TEXT_GENERATION_APIS.chatCompletions,
              models: normalizeSuggestions(chatModels, defaultTextModels(TEXT_GENERATION_APIS.chatCompletions)),
            },
          };
        })
      : doc.providers,
    selectedTextProviderId: doc.selectedChatProviderId ?? null,
  }),
  7: (doc) => ({ ...doc, schemaVersion: 8 }),
};

/**
 * Remove deprecated duration instructions from user-owned script templates.
 * A one-line custom template containing this token falls back to bundled copy
 * rather than leaving malformed prompt text behind.
 * @param {unknown} templates
 */
function migrateDurationTemplate(templates) {
  if (!templates || typeof templates !== 'object' || Array.isArray(templates)) return templates;
  const next = { ...templates };
  if (typeof next.scriptUser !== 'string') return next;
  const lines = next.scriptUser.split('\n').filter((line) => !line.includes('{{durationMinutes}}'));
  if (lines.join('\n').trim()) next.scriptUser = lines.join('\n');
  else delete next.scriptUser;
  return next;
}

/**
 * Keep only structurally valid values; drop invalid providers and dangling
 * selections instead of rejecting the whole document.
 * @param {Record<string, unknown>} doc
 * @returns {SettingsDocument}
 */
function validateDocument(doc) {
  const providers = Array.isArray(doc.providers)
    ? doc.providers.filter(isValidProviderRecord).map(normalizeProviderRecord)
    : [];
  const ids = new Set(providers.map((p) => p.id));
  const selectedTextProviderId =
    typeof doc.selectedTextProviderId === 'string' && ids.has(doc.selectedTextProviderId)
      ? doc.selectedTextProviderId
      : null;
  const selectedTtsProviderId =
    typeof doc.selectedTtsProviderId === 'string' && ids.has(doc.selectedTtsProviderId)
      ? doc.selectedTtsProviderId
      : null;
  const mode = doc.preferences?.mode === 'podcast' ? 'podcast' : 'tts';
  const promptTemplates = validPromptTemplateOverrides(doc.promptTemplates);
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    providers,
    selectedTextProviderId,
    selectedTtsProviderId,
    preferences: { mode },
    promptTemplates,
  };
}

/**
 * Invalid overrides are dropped independently so a corrupt edited template
 * cannot discard valid provider configuration or other prompt overrides.
 * @param {unknown} value
 */
function validPromptTemplateOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = /** @type {Record<string, unknown>} */ (value);
  /** @type {SettingsDocument['promptTemplates']} */
  const overrides = {};
  for (const id of TEMPLATE_IDS) {
    if (validatePromptTemplate(id, input[id]).valid) overrides[id] = /** @type {string} */ (input[id]);
  }
  return overrides;
}

/**
 * @param {unknown} value
 * @returns {value is ProviderConfig}
 */
function isValidProviderRecord(value) {
  if (!isValidProviderIdentity(value)) return false;
  const v = /** @type {Record<string, any>} */ (value);
  return isTextGenerationApi(v.textGeneration?.api) && Array.isArray(v.textGeneration?.models);
}

/** @param {unknown} value */
function isValidProviderIdentity(value) {
  if (!value || typeof value !== 'object') return false;
  const v = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.name === 'string' &&
    v.name.trim().length > 0 &&
    typeof v.baseUrl === 'string' &&
    v.baseUrl.length > 0 &&
    typeof v.apiKey === 'string' &&
    v.apiKey.length > 0
  );
}

/** @param {ProviderConfig} provider */
function normalizeProviderRecord(provider) {
  const api = provider.textGeneration.api;
  const textModels = normalizeSuggestions(provider.textGeneration.models, defaultTextModels(api));
  const ttsModels = normalizeSuggestions(provider.ttsModels, DEFAULT_TTS_MODELS);
  const validTtsModels = ttsModels.length ? ttsModels : [...DEFAULT_TTS_MODELS];
  return {
    ...provider,
    textGeneration: {
      api,
      models: textModels.length ? textModels : defaultTextModels(api),
    },
    ttsModels: validTtsModels,
    voicesByTtsModel: normalizeVoicesByTtsModel(provider.voicesByTtsModel, validTtsModels),
  };
}

/**
 * @param {unknown} err
 */
function normalizeStorageError(err) {
  const quota =
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  if (quota) {
    return new AppError({
      kind: 'storage',
      message: 'Browser storage is full. Free space or clear local data, then retry.',
      retryable: false,
      status: undefined,
      cause: err,
    });
  }
  return new AppError({
    kind: 'storage',
    message: 'Failed to write browser storage.',
    retryable: false,
    status: undefined,
    cause: err,
  });
}

/** @param {string} message */
function validationError(message) {
  return new AppError({
    kind: 'validation',
    message,
    retryable: false,
    status: undefined,
  });
}

export { STORAGE_KEY };
