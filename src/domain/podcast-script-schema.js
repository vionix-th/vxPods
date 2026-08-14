/** Canonical podcast script contract, normalization, and validation. */

export const SCRIPT_SCHEMA_VERSION = 1;
export const MAX_PAUSE_MS = 5000;
export const MIN_SPEAKERS = 1;
export const MAX_SPEAKERS = 8;

export const PODCAST_SCRIPT_JSON_SCHEMA = {
  name: 'podcast_script',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      schemaVersion: { type: 'integer', const: SCRIPT_SCHEMA_VERSION },
      title: { type: 'string' },
      language: { type: 'string' },
      speakers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
            voice: { type: 'string' },
          },
          required: ['id', 'name', 'role', 'voice'],
        },
      },
      segments: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            speakerId: { type: 'string' },
            text: { type: 'string' },
            pauseAfterMs: { type: 'integer', minimum: 0, maximum: MAX_PAUSE_MS },
          },
          required: ['id', 'speakerId', 'text', 'pauseAfterMs'],
        },
      },
    },
    required: ['schemaVersion', 'title', 'language', 'speakers', 'segments'],
  },
};

/**
 * @typedef {Object} PodcastScript
 * @property {number} schemaVersion
 * @property {string} title
 * @property {string} language
 * @property {{ id: string, name: string, role: string, voice: string }[]} speakers
 * @property {{ id: string, speakerId: string, text: string, pauseAfterMs: number }[]} segments
 */

/**
 * Validate a parsed value against the canonical script schema.
 * @param {unknown} value
 * @returns {{ valid: true, script: PodcastScript } | { valid: false, errors: string[] }}
 */
export function validateScript(value) {
  /** @type {string[]} */
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['Script must be a JSON object.'] };
  }
  const v = /** @type {Record<string, unknown>} */ (value);

  if (v.schemaVersion !== SCRIPT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCRIPT_SCHEMA_VERSION}.`);
  }
  if (typeof v.title !== 'string' || v.title.trim() === '') {
    errors.push('title must be a non-empty string.');
  }
  if (!canonicalLanguageTag(v.language)) {
    errors.push('language must be a valid BCP 47 language tag.');
  }
  const speakers = Array.isArray(v.speakers) ? v.speakers : null;
  if (!speakers) {
    errors.push('speakers must be an array.');
  } else {
    if (speakers.length < MIN_SPEAKERS || speakers.length > MAX_SPEAKERS) {
      errors.push(`speakers must contain ${MIN_SPEAKERS}-${MAX_SPEAKERS} speakers.`);
    }
    const ids = new Set();
    for (const [index, speaker] of speakers.entries()) {
      if (!speaker || typeof speaker !== 'object') {
        errors.push(`speakers[${index}] must be an object.`);
        continue;
      }
      const current = /** @type {Record<string, unknown>} */ (speaker);
      if (!isStableId(current.id)) {
        errors.push(`speakers[${index}].id must be a stable ASCII identifier.`);
      } else if (ids.has(current.id)) {
        errors.push(`Duplicate speaker id "${current.id}".`);
      } else {
        ids.add(current.id);
      }
      if (typeof current.name !== 'string' || current.name.trim() === '') {
        errors.push(`speakers[${index}].name must be a non-empty string.`);
      }
      if (typeof current.role !== 'string') {
        errors.push(`speakers[${index}].role must be a string.`);
      }
      if (typeof current.voice !== 'string' || current.voice.trim() === '') {
        errors.push(`speakers[${index}].voice must be a non-empty string.`);
      }
    }
  }

  const segments = Array.isArray(v.segments) ? v.segments : null;
  if (!segments) {
    errors.push('segments must be an array.');
  } else if (segments.length === 0) {
    errors.push('segments must not be empty.');
  } else {
    const speakerIds = new Set(
      (speakers || [])
        .filter((speaker) => speaker && typeof speaker === 'object')
        .map((speaker) => /** @type {Record<string, unknown>} */ (speaker).id),
    );
    const ids = new Set();
    for (const [index, segment] of segments.entries()) {
      if (!segment || typeof segment !== 'object') {
        errors.push(`segments[${index}] must be an object.`);
        continue;
      }
      const current = /** @type {Record<string, unknown>} */ (segment);
      if (!isStableId(current.id)) {
        errors.push(`segments[${index}].id must be a stable ASCII identifier.`);
      } else if (ids.has(current.id)) {
        errors.push(`Duplicate segment id "${current.id}".`);
      } else {
        ids.add(current.id);
      }
      if (typeof current.speakerId !== 'string' || !speakerIds.has(current.speakerId)) {
        errors.push(`segments[${index}].speakerId references an unknown speaker.`);
      }
      if (typeof current.text !== 'string' || current.text.trim() === '') {
        errors.push(`segments[${index}].text must be non-empty.`);
      }
      if (
        typeof current.pauseAfterMs !== 'number' ||
        !Number.isInteger(current.pauseAfterMs) ||
        current.pauseAfterMs < 0 ||
        current.pauseAfterMs > MAX_PAUSE_MS
      ) {
        errors.push(`segments[${index}].pauseAfterMs must be an integer 0-${MAX_PAUSE_MS}.`);
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, script: normalizeScript(v) };
}

/** @param {Record<string, unknown>} value @returns {PodcastScript} */
export function normalizeScript(value) {
  return {
    schemaVersion: SCRIPT_SCHEMA_VERSION,
    title: String(value.title).trim(),
    language: canonicalLanguageTag(value.language) || '',
    speakers: value.speakers.map((speaker) => ({
      id: String(speaker.id),
      name: String(speaker.name).trim(),
      role: typeof speaker.role === 'string' ? speaker.role : '',
      voice: String(speaker.voice).trim(),
    })),
    segments: value.segments.map((segment, index) => ({
      id: typeof segment.id === 'string' && segment.id
        ? segment.id
        : `segment-${String(index + 1).padStart(4, '0')}`,
      speakerId: String(segment.speakerId),
      text: String(segment.text),
      pauseAfterMs: segment.pauseAfterMs,
    })),
  };
}

/** @param {PodcastScript} script @returns {PodcastScript} */
export function exportableScript(script) {
  return normalizeScript(script);
}

function isStableId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id);
}

function canonicalLanguageTag(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}
