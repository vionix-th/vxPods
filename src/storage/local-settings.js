/**
 * Versioned localStorage document for provider configurations and selections.
 * All reads validate; corrupt or unknown-version data falls back to defaults
 * without throwing. Semantic changes require a sequential migration.
 */

import { AppError } from '../services/errors.js';
import { TEMPLATE_IDS, validatePromptTemplate } from '../features/podcast/prompt-templates.js';

const STORAGE_KEY = 'vxpods.settings';
export const SETTINGS_SCHEMA_VERSION = 3;

/**
 * @typedef {Object} ProviderConfig
 * @property {string} id
 * @property {string} name
 * @property {string} baseUrl normalized API root ending in /v1
 * @property {string} apiKey
 */

/**
 * @typedef {Object} SettingsDocument
 * @property {number} schemaVersion
 * @property {ProviderConfig[]} providers
 * @property {string | null} selectedChatProviderId
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
    selectedChatProviderId: null,
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
    ? doc.providers.filter(isValidProviderRecord)
    : [];
  const ids = new Set(providers.map((p) => p.id));
  const selectedChatProviderId =
    typeof doc.selectedChatProviderId === 'string' && ids.has(doc.selectedChatProviderId)
      ? doc.selectedChatProviderId
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
    selectedChatProviderId,
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

export { STORAGE_KEY };
