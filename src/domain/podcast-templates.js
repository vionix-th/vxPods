/** Canonical reusable Podcast format templates and speaker profiles. */

import { AppError } from '../services/errors.js';

/** @typedef {{ id: string, name: string, instructions: string }} FormatTemplate */
/** @typedef {{ id: string, label: string, defaultSpeakerName: string, role: string }} SpeakerProfile */

export const TEMPLATE_NAME_MAX_LENGTH = 100;
export const TEMPLATE_TEXT_MAX_LENGTH = 4000;

export const STARTER_FORMAT_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'format-conversation',
    name: 'Conversation',
    instructions: [
      'Create an interactive peer conversation in which participants develop the subject together and respond to the substance of prior contributions.',
      'Do not give one participant permanent moderator control, rotate mechanically, or divide the material into independent mini-monologues.',
      'With one speaker, create a connected spoken exploration without pretending another participant exists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-interview',
    name: 'Interview',
    instructions: [
      'Create an interview with the first speaker as interviewer and the remaining speakers as interviewees when multiple speakers are available.',
      'Let interviewees answer directly and let later questions arise from the substance of prior answers rather than a fixed questionnaire.',
      'When several interviewees are present, they may respond to or extend one another when relevant instead of answering in rotation.',
      'With one speaker, create a structured spoken exploration without pretending an interviewer or interviewee exists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-narrative',
    name: 'Narrative',
    instructions: [
      'Create a coherent non-interactive spoken narrative using the temporal, causal, or thematic organization that best serves the material.',
      'With multiple speakers, give them coherent narrative functions and preserve continuity across handoffs.',
      'Do not force the narrative into an interview, panel, or simulated conversation.',
      'With one speaker, sustain the narrative without implying absent participants.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-lecture',
    name: 'Lecture',
    instructions: [
      'Create a non-interactive spoken lecture that builds an understandable explanation in a deliberate order and introduces terminology when the audience needs it.',
      'With multiple speakers, give them complementary teaching functions and preserve the conceptual thread across handoffs.',
      'Do not turn the lecture into an interview, panel, or simulated conversation.',
      'With one speaker, deliver the explanation without implying other participants.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-panel-discussion',
    name: 'Panel Discussion',
    instructions: [
      'Create a panel discussion with the first speaker as moderator and the remaining speakers as panelists when multiple speakers are available.',
      'The moderator frames and connects issues without mediating every contribution, and panelists engage one another when relevant.',
      'Do not use a fixed speaker rotation or force conflict or consensus.',
      'With one speaker, create an analytical briefing without simulating a moderator or absent panelists.',
    ].join(' '),
  }),
]);

export const STARTER_SPEAKER_PROFILES = Object.freeze([
  Object.freeze({
    id: 'profile-host',
    label: 'Host',
    defaultSpeakerName: 'Maya',
    role: 'Orients the listener, maintains continuity, connects contributions, and synthesizes when useful. Speaks clearly and economically without monopolizing questions or transitions unless the selected format assigns moderation.',
  }),
  Object.freeze({
    id: 'profile-interviewer',
    label: 'Interviewer',
    defaultSpeakerName: 'Rowan',
    role: 'Develops focused inquiry from prior answers and surfaces relevant definitions, implications, assumptions, or uncertainty. Speaks directly and keeps questions concise.',
  }),
  Object.freeze({
    id: 'profile-expert',
    label: 'Expert',
    defaultSpeakerName: 'Leah',
    role: 'Explains evidence, terminology, and implications clearly at the audience\'s level while distinguishing the source\'s claims from analysis or interpretation. Speaks precisely without inventing authority or personal experience.',
  }),
  Object.freeze({
    id: 'profile-narrator',
    label: 'Narrator',
    defaultSpeakerName: 'Nora',
    role: 'Maintains context and continuity across chronological, causal, or thematic development. Uses measured, speech-ready narration and keeps handoffs connected to the existing thread.',
  }),
  Object.freeze({
    id: 'profile-skeptic',
    label: 'Skeptic',
    defaultSpeakerName: 'Elias',
    role: 'Tests evidence, scope, terminology, and inference constructively and considers relevant alternative interpretations. Speaks directly and concisely without treating disagreement as an end in itself.',
  }),
]);

export function starterFormatTemplates() {
  return STARTER_FORMAT_TEMPLATES.map((record) => ({ ...record }));
}

export function starterSpeakerProfiles() {
  return STARTER_SPEAKER_PROFILES.map((record) => ({ ...record }));
}

/** @param {unknown} value */
export function normalizeFormatTemplate(value) {
  if (!isRecord(value) || !isStableId(value.id)) return null;
  const name = boundedText(value.name, { required: true, max: TEMPLATE_NAME_MAX_LENGTH });
  const instructions = boundedText(value.instructions, { required: true, max: TEMPLATE_TEXT_MAX_LENGTH });
  return name !== null && instructions !== null
    ? { id: value.id, name, instructions }
    : null;
}

/** @param {unknown} value */
export function normalizeSpeakerProfile(value) {
  if (!isRecord(value) || !isStableId(value.id)) return null;
  const label = boundedText(value.label, { required: true, max: TEMPLATE_NAME_MAX_LENGTH });
  const defaultSpeakerName = boundedText(value.defaultSpeakerName ?? '', {
    required: false,
    max: TEMPLATE_NAME_MAX_LENGTH,
  });
  const role = boundedText(value.role, { required: true, max: TEMPLATE_TEXT_MAX_LENGTH });
  return label !== null && defaultSpeakerName !== null && role !== null
    ? { id: value.id, label, defaultSpeakerName, role }
    : null;
}

/** @param {unknown} value */
export function normalizeFormatTemplates(value) {
  return normalizeCollection(value, normalizeFormatTemplate, (record) => record.name);
}

/** @param {unknown} value */
export function normalizeSpeakerProfiles(value) {
  return normalizeCollection(value, normalizeSpeakerProfile, (record) => record.label);
}

/** @param {unknown} value */
export function isValidFormatTemplateCollection(value) {
  return Array.isArray(value) && normalizeFormatTemplates(value).length === value.length;
}

/** @param {unknown} value */
export function isValidSpeakerProfileCollection(value) {
  return Array.isArray(value) && normalizeSpeakerProfiles(value).length === value.length;
}

/**
 * @param {{ name?: unknown, instructions?: unknown }} input
 * @param {{ id: string, name: string }[]} records
 * @param {string | null} [existingId]
 */
export function validateFormatTemplateInput(input, records, existingId = null) {
  const name = requireText(input.name, 'Format name', TEMPLATE_NAME_MAX_LENGTH);
  const instructions = requireText(input.instructions, 'Format instructions', TEMPLATE_TEXT_MAX_LENGTH);
  requireUniqueName(name, records, existingId, (record) => record.name, 'format template');
  return { name, instructions };
}

/**
 * @param {{ label?: unknown, defaultSpeakerName?: unknown, role?: unknown }} input
 * @param {{ id: string, label: string }[]} records
 * @param {string | null} [existingId]
 */
export function validateSpeakerProfileInput(input, records, existingId = null) {
  const label = requireText(input.label, 'Profile label', TEMPLATE_NAME_MAX_LENGTH);
  const defaultSpeakerName = optionalText(input.defaultSpeakerName, 'Default speaker name', TEMPLATE_NAME_MAX_LENGTH);
  const role = requireText(input.role, 'Role', TEMPLATE_TEXT_MAX_LENGTH);
  requireUniqueName(label, records, existingId, (record) => record.label, 'speaker profile');
  return { label, defaultSpeakerName, role };
}

function normalizeCollection(value, normalize, getName) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const ids = new Set();
  const names = new Set();
  for (const valueRecord of value) {
    const record = normalize(valueRecord);
    if (!record) continue;
    const normalizedName = getName(record).toLowerCase();
    if (ids.has(record.id) || names.has(normalizedName)) continue;
    ids.add(record.id);
    names.add(normalizedName);
    result.push(record);
  }
  return result;
}

function requireText(value, label, max) {
  const normalized = boundedText(value, { required: true, max });
  if (normalized === null) {
    const empty = typeof value !== 'string' || value.trim() === '';
    throw validationError(empty ? `${label} is required.` : `${label} must be ${max} characters or fewer.`);
  }
  return normalized;
}

function optionalText(value, label, max) {
  const normalized = boundedText(value ?? '', { required: false, max });
  if (normalized === null) throw validationError(`${label} must be ${max} characters or fewer.`);
  return normalized;
}

function boundedText(value, { required, max }) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) return null;
  return normalized;
}

function requireUniqueName(name, records, existingId, getName, kind) {
  const duplicate = records.some((record) =>
    record.id !== existingId && getName(record).toLowerCase() === name.toLowerCase());
  if (duplicate) throw validationError(`A ${kind} named “${name}” already exists.`);
}

function isStableId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validationError(message) {
  return new AppError({ kind: 'validation', message, retryable: false, status: undefined });
}
