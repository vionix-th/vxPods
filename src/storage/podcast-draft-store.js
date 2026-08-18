/** Browser-local, non-portable current podcast episode draft. */

import { AppError } from '../services/errors.js';

export const PODCAST_DRAFT_STORAGE_KEY = 'vxpods.podcast-draft';
export const PODCAST_DRAFT_SCHEMA_VERSION = 1;

/**
 * @typedef {Object} PodcastDraft
 * @property {number} schemaVersion
 * @property {string} source
 * @property {string | null} directionTemplateId
 * @property {string} episodeDirection
 * @property {string | null} formatTemplateId
 * @property {string} formatInstructions
 * @property {string} audience
 * @property {string} textModel
 * @property {string} ttsModel
 * @property {{id: string, name: string, role: string, voice: string, profileId?: string}[]} speakers
 * @property {boolean} reviewPlan
 */

/** @returns {{ status: 'empty'|'valid'|'corrupt'|'unsupported'|'unavailable', draft: PodcastDraft | null, error: AppError | null }} */
export function inspectPodcastDraft(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage?.getItem?.(PODCAST_DRAFT_STORAGE_KEY) ?? null;
  } catch (cause) {
    return { status: 'unavailable', draft: null, error: readError('Episode draft could not be read.', cause) };
  }
  if (raw === null) return { status: 'empty', draft: null, error: null };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return { status: 'corrupt', draft: null, error: readError('Saved episode draft is damaged and was not restored.', cause) };
  }
  if (parsed?.schemaVersion !== PODCAST_DRAFT_SCHEMA_VERSION) {
    return { status: 'unsupported', draft: null, error: readError('Saved episode draft uses an unsupported version and was not restored.') };
  }
  try {
    return { status: 'valid', draft: validatePodcastDraft(parsed), error: null };
  } catch (cause) {
    return { status: 'corrupt', draft: null, error: readError('Saved episode draft is invalid and was not restored.', cause) };
  }
}

export function loadPodcastDraft(storage = globalThis.localStorage) {
  return inspectPodcastDraft(storage).draft;
}

/** @param {PodcastDraft} draft */
export function savePodcastDraft(draft, storage = globalThis.localStorage) {
  const valid = validatePodcastDraft(draft);
  try {
    storage.setItem(PODCAST_DRAFT_STORAGE_KEY, JSON.stringify(valid));
  } catch (cause) {
    throw writeError(cause);
  }
}

export function clearPodcastDraft(storage = globalThis.localStorage) {
  try {
    storage.removeItem(PODCAST_DRAFT_STORAGE_KEY);
  } catch (cause) {
    throw writeError(cause, 'Failed to remove saved episode draft.');
  }
}

/** @param {unknown} value @returns {PodcastDraft} */
export function validatePodcastDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Draft must be an object.');
  const draft = /** @type {Record<string, unknown>} */ (value);
  const text = (key, allowNull = false) => {
    const item = draft[key];
    if (allowNull && item === null) return null;
    if (typeof item !== 'string') throw new TypeError(`Draft ${key} must be text.`);
    return item;
  };
  if (!Array.isArray(draft.speakers) || draft.speakers.length < 1 || draft.speakers.length > 8) {
    throw new TypeError('Draft speakers must contain one through eight speakers.');
  }
  const ids = new Set();
  const speakers = draft.speakers.map((speaker) => {
    if (!speaker || typeof speaker !== 'object' || Array.isArray(speaker)) throw new TypeError('Draft speaker is invalid.');
    const record = /** @type {Record<string, unknown>} */ (speaker);
    if (![record.id, record.name, record.role, record.voice].every((item) => typeof item === 'string') || !record.id) {
      throw new TypeError('Draft speaker fields are invalid.');
    }
    if (ids.has(record.id)) throw new TypeError('Draft speaker IDs must be unique.');
    if (record.profileId !== undefined && (typeof record.profileId !== 'string' || !record.profileId)) {
      throw new TypeError('Draft speaker profile ID is invalid.');
    }
    ids.add(record.id);
    return {
      id: record.id,
      name: record.name,
      role: record.role,
      voice: record.voice,
      ...(record.profileId ? { profileId: record.profileId } : {}),
    };
  });
  if (typeof draft.reviewPlan !== 'boolean') throw new TypeError('Draft reviewPlan must be boolean.');
  return {
    schemaVersion: PODCAST_DRAFT_SCHEMA_VERSION,
    source: text('source'),
    directionTemplateId: text('directionTemplateId', true),
    episodeDirection: text('episodeDirection'),
    formatTemplateId: text('formatTemplateId', true),
    formatInstructions: text('formatInstructions'),
    audience: text('audience'),
    textModel: text('textModel'),
    ttsModel: text('ttsModel'),
    speakers,
    reviewPlan: draft.reviewPlan,
  };
}

function readError(message, cause) {
  return new AppError({ kind: 'storage', message, retryable: false, status: undefined, cause });
}

function writeError(cause, fallback = 'Failed to save episode draft.') {
  const quota = cause instanceof DOMException &&
    (cause.name === 'QuotaExceededError' || cause.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  return new AppError({
    kind: 'storage',
    message: quota ? 'Browser storage is full. Free space or clear local data, then retry.' : fallback,
    retryable: false,
    status: undefined,
    cause,
  });
}
