/**
 * Podcast script generation: prompt construction, untrusted JSON extraction,
 * schema validation, and normalization. Pure functions; no I/O.
 */

import { renderPromptTemplate, resolvePromptTemplates } from './prompt-templates.js';
import { loadSettings } from '../../storage/local-settings.js';

export const SCRIPT_SCHEMA_VERSION = 1;
export const MAX_PAUSE_MS = 5000;
const SOURCE_LANGUAGE_POLICY = [
  'Language policy: write the title and every spoken segment in the source language.',
  'Do not translate unless the source explicitly asks for translation.',
  'Set language to the source language BCP 47 tag, such as th or en.',
].join(' ');

/**
 * @typedef {Object} PodcastPreferences
 * @property {'solo'|'conversation'} format
 * @property {string} tone
 * @property {string} audience
 * @property {{ name: string, role: string, voice: string }[]} speakers 1 or 2
 * @property {string} textModel
 * @property {string} ttsModel
 */

/**
 * @typedef {Object} PodcastScript
 * @property {number} schemaVersion
 * @property {string} title
 * @property {string} language
 * @property {'solo'|'conversation'} format
 * @property {boolean} sourceGrounded
 * @property {{ id: string, name: string, role: string, voice: string }[]} speakers
 * @property {{ id: string, speakerId: string, text: string, pauseAfterMs: number }[]} segments
 */

/**
 * Build API-neutral messages for source-grounded script generation.
 * Source text is clearly delimited from instructions.
 *
 * @param {string} source
 * @param {PodcastPreferences} prefs
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
export function buildScriptPrompt(source, prefs, templateOverrides = loadSettings().promptTemplates) {
  const templates = resolvePromptTemplates(templateOverrides);
  const values = buildScriptPromptValues(source, prefs);
  return [
    {
      role: 'system',
      content: `${renderPromptTemplate(templates.scriptSystem, values)}\n\n${SOURCE_LANGUAGE_POLICY}`,
    },
    { role: 'user', content: renderPromptTemplate(templates.scriptUser, values) },
  ];
}

/**
 * Build runtime values for script prompt rendering and preview. Values remain
 * request-scoped; callers must not persist source text.
 * @param {string} source
 * @param {PodcastPreferences} prefs
 */
export function buildScriptPromptValues(source, prefs) {
  const speakerList = prefs.speakers
    .map((s, i) => `speaker ${i + 1}: name "${s.name}", role "${s.role}"`)
    .join('; ');
  const formatText =
    prefs.format === 'solo'
      ? 'a solo narration by the single speaker'
      : 'a natural two-speaker conversation between the two speakers';
  return {
    format: prefs.format,
    formatDescription: formatText,
    tone: prefs.tone,
    audience: prefs.audience,
    speakers: speakerList,
    speakerIds: prefs.speakers.map((_, i) => `speaker-${i + 1}`).join(', '),
    voices: prefs.speakers.map((s, i) => `speaker-${i + 1} uses voice "${s.voice}"`).join('; '),
    source,
  };
}

/**
 * Build the one allowed repair request: validation errors plus prior output.
 * @param {string} priorOutput
 * @param {string[]} errors
 * @returns {{ role: 'system'|'user'|'assistant', content: string }[]}
 */
export function buildRepairMessages(priorOutput, errors, templateOverrides = loadSettings().promptTemplates) {
  const templates = resolvePromptTemplates(templateOverrides);
  return [
    {
      role: 'system',
      content: renderPromptTemplate(templates.repairSystem, {}),
    },
    { role: 'assistant', content: priorOutput },
    {
      role: 'user',
      content: renderPromptTemplate(templates.repairUser, {
        validationErrors: errors.map((e) => `- ${e}`).join('\n'),
      }),
    },
  ];
}

/**
 * Extract a JSON object from untrusted model text. Tries direct parse, then
 * fenced code block, then first-to-last brace slice.
 * @param {string} text
 * @returns {unknown}
 * @throws {Error} when no JSON object can be isolated
 */
export function extractJson(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('Model output was empty.');
  try {
    return JSON.parse(raw);
  } catch {
    /* continue */
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      /* continue */
    }
  }
  throw new Error('Model output did not contain a JSON object.');
}

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
  if (v.format !== 'solo' && v.format !== 'conversation') {
    errors.push('format must be "solo" or "conversation".');
  }
  if (v.sourceGrounded !== true) {
    errors.push('sourceGrounded must be true.');
  }

  const speakers = Array.isArray(v.speakers) ? v.speakers : null;
  if (!speakers) {
    errors.push('speakers must be an array.');
  } else {
    const expected = v.format === 'solo' ? 1 : 2;
    if (v.format && speakers.length !== expected) {
      errors.push(`format "${v.format}" requires exactly ${expected} speaker(s).`);
    }
    const ids = new Set();
    for (const [i, speaker] of speakers.entries()) {
      if (!speaker || typeof speaker !== 'object') {
        errors.push(`speakers[${i}] must be an object.`);
        continue;
      }
      const s = /** @type {Record<string, unknown>} */ (speaker);
      if (!isStableId(s.id)) errors.push(`speakers[${i}].id must be a stable ASCII identifier.`);
      else if (ids.has(s.id)) errors.push(`Duplicate speaker id "${s.id}".`);
      else ids.add(s.id);
      if (typeof s.name !== 'string' || s.name.trim() === '') {
        errors.push(`speakers[${i}].name must be a non-empty string.`);
      }
      if (typeof s.role !== 'string') errors.push(`speakers[${i}].role must be a string.`);
      if (typeof s.voice !== 'string' || s.voice.trim() === '') {
        errors.push(`speakers[${i}].voice must be a non-empty string.`);
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
        .filter((s) => s && typeof s === 'object')
        .map((s) => /** @type {Record<string, unknown>} */ (s).id),
    );
    const ids = new Set();
    for (const [i, segment] of segments.entries()) {
      if (!segment || typeof segment !== 'object') {
        errors.push(`segments[${i}] must be an object.`);
        continue;
      }
      const s = /** @type {Record<string, unknown>} */ (segment);
      if (!isStableId(s.id)) errors.push(`segments[${i}].id must be a stable ASCII identifier.`);
      else if (ids.has(s.id)) errors.push(`Duplicate segment id "${s.id}".`);
      else ids.add(s.id);
      if (typeof s.speakerId !== 'string' || !speakerIds.has(s.speakerId)) {
        errors.push(`segments[${i}].speakerId references an unknown speaker.`);
      }
      if (typeof s.text !== 'string' || s.text.trim() === '') {
        errors.push(`segments[${i}].text must be non-empty.`);
      }
      if (
        typeof s.pauseAfterMs !== 'number' ||
        !Number.isInteger(s.pauseAfterMs) ||
        s.pauseAfterMs < 0 ||
        s.pauseAfterMs > MAX_PAUSE_MS
      ) {
        errors.push(`segments[${i}].pauseAfterMs must be an integer 0-${MAX_PAUSE_MS}.`);
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, script: normalizeScript(v) };
}

/**
 * Keep canonical fields only; unknown properties are discarded.
 * @param {Record<string, unknown>} v
 * @returns {PodcastScript}
 */
export function normalizeScript(v) {
  return {
    schemaVersion: SCRIPT_SCHEMA_VERSION,
    title: String(v.title).trim(),
    language: canonicalLanguageTag(v.language) || '',
    format: /** @type {'solo'|'conversation'} */ (v.format),
    sourceGrounded: true,
    speakers: v.speakers.map((s) => ({
      id: String(s.id),
      name: String(s.name).trim(),
      role: typeof s.role === 'string' ? s.role : '',
      voice: String(s.voice).trim(),
    })),
    segments: v.segments.map((s, i) => ({
      id: typeof s.id === 'string' && s.id ? s.id : `segment-${String(i + 1).padStart(4, '0')}`,
      speakerId: String(s.speakerId),
      text: String(s.text),
      pauseAfterMs: s.pauseAfterMs,
    })),
  };
}

/**
 * Strip recovery/internal metadata for export. Canonical fields only.
 * @param {PodcastScript} script
 * @returns {PodcastScript}
 */
export function exportableScript(script) {
  return normalizeScript(script);
}

/**
 * @param {unknown} id
 * @returns {id is string}
 */
function isStableId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id);
}

/**
 * Canonicalize a BCP 47 language tag using the platform locale parser.
 * @param {unknown} value
 * @returns {string | null}
 */
function canonicalLanguageTag(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}
