/**
 * Podcast script generation: prompt construction, untrusted JSON extraction,
 * schema validation, and normalization. Pure functions; no I/O.
 */

import { renderPromptTemplate, resolvePromptTemplates } from '../../domain/prompt-templates.js';
import { MIN_SPEAKERS, MAX_SPEAKERS } from '../../domain/podcast-script-schema.js';
import { validateEpisodePlan } from '../../domain/episode-plan-schema.js';

export {
  SCRIPT_SCHEMA_VERSION,
  MAX_PAUSE_MS,
  MIN_SPEAKERS,
  MAX_SPEAKERS,
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
 * @property {string} episodeDirection
 * @property {string} formatInstructions
 * @property {string} audience
 * @property {{ id: string, name: string, role: string, voice: string }[]} speakers 1-8
 * @property {string} textModel
 * @property {string} ttsModel
 */

/**
 * @typedef {Object} PodcastScript
 * @property {number} schemaVersion
 * @property {string} title
 * @property {string} language
 * @property {{ id: string, name: string, role: string, voice: string }[]} speakers
 * @property {{ id: string, speakerId: string, text: string, pauseAfterMs: number }[]} segments
 */

/**
 * Build API-neutral messages for source-anchored script generation.
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

/** Build the planning request from source and request-scoped editorial inputs. */
export function buildPlanPrompt(source, prefs, templateOverrides = {}) {
  const templates = resolvePromptTemplates(templateOverrides);
  const values = buildScriptPromptValues(source, prefs);
  return [
    { role: 'system', content: renderPromptTemplate(templates.plannerSystem, values) },
    { role: 'user', content: renderPromptTemplate(templates.plannerUser, values) },
  ];
}

/** Build a complete-plan revision request using the same current planning inputs. */
export function buildPlanRevisionMessages(source, prefs, plan, request, templateOverrides = {}) {
  const templates = resolvePromptTemplates(templateOverrides);
  return [
    ...buildPlanPrompt(source, prefs, templateOverrides),
    { role: 'assistant', content: JSON.stringify(plan) },
    {
      role: 'user',
      content: renderPromptTemplate(templates.planRevisionUser, { revisionRequest: request }),
    },
  ];
}

/** Add a validated editorial plan to the existing script prompt without changing its override contract. */
export function buildWriterPrompt(source, prefs, plan, templateOverrides = {}) {
  const templates = resolvePromptTemplates(templateOverrides);
  return [
    ...buildScriptPrompt(source, prefs, templateOverrides),
    {
      role: 'user',
      content: renderPromptTemplate(templates.episodePlanHandoff, {
        episodePlan: JSON.stringify(plan, null, 2),
      }),
    },
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
    .map((speaker, index) =>
      `speaker ${index + 1}: id "${speaker.id}", name "${speaker.name}", role "${speaker.role}"`)
    .join('; ');
  return {
    episodeDirection: prefs.episodeDirection,
    formatDescription: prefs.formatInstructions,
    audience: prefs.audience,
    speakers: speakerList,
    speakerIds: prefs.speakers.map((speaker) => speaker.id).join(', '),
    voices: prefs.speakers.map((speaker) => `${speaker.id} uses voice "${speaker.voice}"`).join('; '),
    source,
  };
}

/**
 * Validate request-scoped Podcast generation preferences before prompt construction.
 * @param {PodcastPreferences} prefs
 * @returns {{ valid: true } | { valid: false, errors: string[] }}
 */
export function validatePodcastPreferences(prefs) {
  const errors = [];
  if (!prefs || typeof prefs !== 'object') return { valid: false, errors: ['Podcast settings are missing.'] };
  if (typeof prefs.formatInstructions !== 'string' || !prefs.formatInstructions.trim()) {
    errors.push('Format instructions must not be empty.');
  }
  if (typeof prefs.episodeDirection !== 'string' || !prefs.episodeDirection.trim()) {
    errors.push('Episode direction must not be empty.');
  }
  if (!Array.isArray(prefs.speakers) || prefs.speakers.length < MIN_SPEAKERS || prefs.speakers.length > MAX_SPEAKERS) {
    errors.push(`Choose ${MIN_SPEAKERS}-${MAX_SPEAKERS} speakers.`);
  } else {
    const ids = new Set();
    for (const [index, speaker] of prefs.speakers.entries()) {
      if (!speaker || typeof speaker !== 'object') {
        errors.push(`Speaker ${index + 1} is invalid.`);
        continue;
      }
      if (typeof speaker.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(speaker.id)) {
        errors.push(`Speaker ${index + 1} has an invalid ID.`);
      } else if (ids.has(speaker.id)) {
        errors.push(`Speaker ID “${speaker.id}” is duplicated.`);
      } else {
        ids.add(speaker.id);
      }
      if (typeof speaker.name !== 'string' || !speaker.name.trim()) {
        errors.push(`Speaker ${index + 1} needs a name.`);
      }
      if (typeof speaker.role !== 'string') errors.push(`Speaker ${index + 1} has an invalid role.`);
      if (typeof speaker.voice !== 'string' || !speaker.voice.trim()) {
        errors.push(`Speaker ${index + 1} needs a voice.`);
      }
    }
  }
  return errors.length ? { valid: false, errors } : { valid: true };
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

/** Build the one allowed validation-only repair for an invalid EpisodePlan. */
export function buildPlanRepairMessages(priorOutput, errors, templateOverrides = {}) {
  const templates = resolvePromptTemplates(templateOverrides);
  return [
    { role: 'system', content: renderPromptTemplate(templates.planRepairSystem, {}) },
    { role: 'assistant', content: priorOutput },
    {
      role: 'user',
      content: renderPromptTemplate(templates.planRepairUser, {
        validationErrors: errors.map((error) => `- ${error}`).join('\n'),
      }),
    },
  ];
}

/** Parse and validate untrusted model output as a canonical EpisodePlan. */
export function parseEpisodePlan(raw, speakerIds) {
  const parsed = extractJson(raw);
  return validateEpisodePlan(parsed, speakerIds);
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
