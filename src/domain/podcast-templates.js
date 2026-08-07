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
      'Create a genuinely interactive conversation rather than dividing the source into alternating mini-monologues.',
      'Build each substantive turn from a preceding contribution: respond, extend, qualify, clarify, question, or respectfully challenge it.',
      'Let the exchange develop through relevant follow-ups and callbacks before changing topics, while still covering the source coherently.',
      'Vary turn length by conversational purpose. Use brief acknowledgements, discourse markers, and names sparingly and only where they clarify the social action or addressee.',
      'Keep each speaker distinct according to their role, but do not manufacture disagreement, unsupported personal anecdotes, filler, or verbal tics.',
      'With one speaker, use a natural spoken explanation without pretending another participant exists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-interview',
    name: 'Interview',
    instructions: [
      'Use the first speaker as interviewer and the remaining speakers as interviewees.',
      'Organize the source into a purposeful question sequence, but make each next question respond to the substance of the preceding answer instead of reading like a fixed questionnaire.',
      'Use follow-ups to clarify terms, examine implications, surface source-supported uncertainty, and connect earlier answers.',
      'Let interviewees answer directly before elaborating, and keep their contributions distinct according to their roles.',
      'Use names primarily to select an addressee when more than one interviewee is present; avoid repetitive greetings, thanks, and agreement.',
      'With one speaker, present a clearly structured spoken exploration using rhetorical questions without pretending a second speaker exists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-narrative',
    name: 'Narrative',
    instructions: [
      'Shape the source into a coherent spoken narrative with an engaging opening, clear progression, meaningful transitions, and a concise resolution or closing perspective.',
      'Preserve chronology when it matters; otherwise organize by the causal or thematic sequence best supported by the source.',
      'Use callbacks to maintain continuity and explain why each development matters.',
      'With multiple speakers, assign coherent narrative functions or topic passages and use purposeful handoffs; do not force an interview, panel, or artificial banter.',
      'Do not invent scenes, quotations, motives, sensory details, or personal experiences absent from the source.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-lecture',
    name: 'Lecture',
    instructions: [
      'Present a structured spoken lecture that establishes the topic, builds concepts in a deliberate order, explains necessary terminology, and closes with a concise synthesis.',
      'Match explanatory depth to the audience and use transitions that make the reasoning easy to follow.',
      'Prefer connected explanation over conversational filler, rhetorical theatrics, or repeated recaps.',
      'With multiple speakers, assign coherent sections or complementary teaching functions and use explicit, economical handoffs; do not turn the lecture into an interview or panel unless the source requires quoted exchange.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-panel-discussion',
    name: 'Panel Discussion',
    instructions: [
      'Create a moderated panel discussion. Use the first speaker as moderator and the remaining speakers as panelists when multiple speakers are available.',
      'Have the moderator frame issues, direct questions to relevant panelists, connect contributions, and periodically synthesize the source-supported points at issue.',
      'Have panelists respond to one another by comparing interpretations, extending evidence, qualifying claims, or identifying uncertainty according to their roles.',
      'Develop a point for several turns when useful instead of cycling mechanically through every speaker.',
      'Use names when selecting or changing the addressee, not as decoration. Represent agreement and disagreement only where the source supports the underlying positions; do not manufacture controversy.',
      'With one speaker, present a source-grounded analytical briefing without simulating absent panelists.',
    ].join(' '),
  }),
]);

export const STARTER_SPEAKER_PROFILES = Object.freeze([
  Object.freeze({
    id: 'profile-host',
    label: 'Host',
    defaultSpeakerName: 'Host',
    role: 'Facilitates the selected format: frames the topic, connects new points to earlier contributions, manages transitions, and synthesizes key ideas without adding facts. Uses questions, acknowledgements, and speaker names only when they serve a clear interactional purpose.',
  }),
  Object.freeze({
    id: 'profile-interviewer',
    label: 'Interviewer',
    defaultSpeakerName: 'Interviewer',
    role: 'Listens closely to the preceding answer, asks focused follow-ups, clarifies terminology and implications, and surfaces assumptions supported by the source. Avoids reading a fixed question list or repeatedly acknowledging every answer.',
  }),
  Object.freeze({
    id: 'profile-expert',
    label: 'Expert',
    defaultSpeakerName: 'Expert',
    role: 'Explains source-supported evidence, terminology, and implications precisely at the audience\'s level. Responds directly to the question or prior contribution, distinguishes evidence from interpretation, and states uncertainty without inventing authority or experience.',
  }),
  Object.freeze({
    id: 'profile-narrator',
    label: 'Narrator',
    defaultSpeakerName: 'Narrator',
    role: 'Maintains chronology, context, and narrative continuity through purposeful transitions and callbacks. Provides measured spoken narration without forcing banter, commentary, or invented scene detail.',
  }),
  Object.freeze({
    id: 'profile-skeptic',
    label: 'Skeptic',
    defaultSpeakerName: 'Skeptic',
    role: 'Tests claims constructively by requesting evidence, identifying uncertainty, offering source-supported qualifications, and asking for clarification. Does not disagree reflexively, manufacture objections, or introduce facts absent from the source.',
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
