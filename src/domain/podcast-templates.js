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
    instructions: 'Create a natural conversation among the available speakers. Let speakers respond to one another, use clear transitions, and avoid repetitive agreement.',
  }),
  Object.freeze({
    id: 'format-interview',
    name: 'Interview',
    instructions: 'Use the first speaker as interviewer and remaining speakers as interviewees. Ask focused questions, use relevant follow-ups, and keep answers grounded in the source. If only one speaker is available, present a narrated question-and-answer structure.',
  }),
  Object.freeze({
    id: 'format-narrative',
    name: 'Narrative',
    instructions: 'Shape the source into a coherent narrative with an opening, logical progression, and concise closing. Use available speakers as narrators or quoted perspectives without inventing facts.',
  }),
  Object.freeze({
    id: 'format-lecture',
    name: 'Lecture',
    instructions: 'Present a structured lecture with an introduction, clearly ordered explanations, useful transitions, and a closing recap. Divide material naturally among available speakers.',
  }),
  Object.freeze({
    id: 'format-panel-discussion',
    name: 'Panel Discussion',
    instructions: 'Create a moderated panel discussion. Use the first speaker as moderator when multiple speakers exist, give other speakers distinct source-grounded perspectives, and summarize agreements or differences. With one speaker, narrate those perspectives explicitly.',
  }),
]);

export const STARTER_SPEAKER_PROFILES = Object.freeze([
  Object.freeze({
    id: 'profile-host',
    label: 'Host',
    defaultSpeakerName: 'Host',
    role: 'Welcoming guide who frames the topic, manages transitions, and summarizes key points without adding facts.',
  }),
  Object.freeze({
    id: 'profile-interviewer',
    label: 'Interviewer',
    defaultSpeakerName: 'Interviewer',
    role: 'Curious interviewer who asks focused questions, follows up on important details, and surfaces assumptions.',
  }),
  Object.freeze({
    id: 'profile-expert',
    label: 'Expert',
    defaultSpeakerName: 'Expert',
    role: 'Clear subject-matter expert who explains evidence, terminology, and implications in accessible language.',
  }),
  Object.freeze({
    id: 'profile-narrator',
    label: 'Narrator',
    defaultSpeakerName: 'Narrator',
    role: 'Measured storyteller who maintains coherent chronology, context, and narrative continuity.',
  }),
  Object.freeze({
    id: 'profile-skeptic',
    label: 'Skeptic',
    defaultSpeakerName: 'Skeptic',
    role: 'Constructive skeptic who tests claims, identifies uncertainty, and asks for source-supported clarification.',
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
