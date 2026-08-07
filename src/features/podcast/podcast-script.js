/**
 * Podcast script generation: prompt construction, untrusted JSON extraction,
 * schema validation, and normalization. Pure functions; no I/O.
 */

import { renderPromptTemplate, resolvePromptTemplates } from '../../domain/prompt-templates.js';

export {
  SCRIPT_SCHEMA_VERSION,
  MAX_PAUSE_MS,
  validateScript,
  normalizeScript,
  exportableScript,
} from '../../domain/podcast-script-schema.js';
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
export function buildScriptPrompt(source, prefs, templateOverrides = {}) {
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
export function buildRepairMessages(priorOutput, errors, templateOverrides = {}) {
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
