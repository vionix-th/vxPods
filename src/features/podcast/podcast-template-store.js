/** CRUD facade for reusable Podcast format templates and speaker profiles. */

import { AppError } from '../../services/errors.js';
import { loadSettings, saveSettings, subscribeSettingsRestore } from '../../storage/local-settings.js';
import {
  STARTER_FORMAT_TEMPLATES,
  STARTER_SPEAKER_PROFILES,
  validateFormatTemplateInput,
  validateSpeakerProfileInput,
} from '../../domain/podcast-templates.js';

/** @type {Set<() => void>} */
const listeners = new Set();

export function listFormatTemplates() {
  return loadSettings().formatTemplates;
}

export function listSpeakerProfiles() {
  return loadSettings().speakerProfiles;
}

export function subscribePodcastTemplates(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyPodcastTemplates() {
  for (const listener of listeners) listener();
}

subscribeSettingsRestore(notifyPodcastTemplates);

export function addFormatTemplate(input) {
  const settings = loadSettings();
  const valid = validateFormatTemplateInput(input, settings.formatTemplates);
  const record = { id: generateId('format'), ...valid };
  settings.formatTemplates.push(record);
  persist(settings);
  return record;
}

export function updateFormatTemplate(id, input) {
  const settings = loadSettings();
  const index = settings.formatTemplates.findIndex((record) => record.id === id);
  if (index === -1) throw validationError('Format template not found.');
  const valid = validateFormatTemplateInput(input, settings.formatTemplates, id);
  settings.formatTemplates[index] = { id, ...valid };
  persist(settings);
  return settings.formatTemplates[index];
}

export function deleteFormatTemplate(id) {
  const settings = loadSettings();
  if (!settings.formatTemplates.some((record) => record.id === id)) {
    throw validationError('Format template not found.');
  }
  settings.formatTemplates = settings.formatTemplates.filter((record) => record.id !== id);
  persist(settings);
}

export function addSpeakerProfile(input) {
  const settings = loadSettings();
  const valid = validateSpeakerProfileInput(input, settings.speakerProfiles);
  const record = { id: generateId('profile'), ...valid };
  settings.speakerProfiles.push(record);
  persist(settings);
  return record;
}

export function updateSpeakerProfile(id, input) {
  const settings = loadSettings();
  const index = settings.speakerProfiles.findIndex((record) => record.id === id);
  if (index === -1) throw validationError('Speaker profile not found.');
  const valid = validateSpeakerProfileInput(input, settings.speakerProfiles, id);
  settings.speakerProfiles[index] = { id, ...valid };
  persist(settings);
  return settings.speakerProfiles[index];
}

export function deleteSpeakerProfile(id) {
  const settings = loadSettings();
  if (!settings.speakerProfiles.some((record) => record.id === id)) {
    throw validationError('Speaker profile not found.');
  }
  settings.speakerProfiles = settings.speakerProfiles.filter((record) => record.id !== id);
  persist(settings);
}

export function restoreFormatStarters() {
  const settings = loadSettings();
  const { records, skipped } = restoreStarters(
    settings.formatTemplates,
    STARTER_FORMAT_TEMPLATES,
    (record) => record.name,
  );
  settings.formatTemplates = records;
  persist(settings);
  return skipped;
}

export function restoreSpeakerProfileStarters() {
  const settings = loadSettings();
  const { records, skipped } = restoreStarters(
    settings.speakerProfiles,
    STARTER_SPEAKER_PROFILES,
    (record) => record.label,
  );
  settings.speakerProfiles = records;
  persist(settings);
  return skipped;
}

function restoreStarters(current, starters, getName) {
  const starterIds = new Set(starters.map((record) => record.id));
  const custom = current.filter((record) => !starterIds.has(record.id));
  const customNames = new Set(custom.map((record) => getName(record).toLowerCase()));
  const skipped = [];
  const restored = [];
  for (const starter of starters) {
    if (customNames.has(getName(starter).toLowerCase())) {
      skipped.push(getName(starter));
    } else {
      restored.push({ ...starter });
    }
  }
  return { records: [...restored, ...custom], skipped };
}

function persist(settings) {
  saveSettings(settings);
  notifyPodcastTemplates();
}

function generateId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function validationError(message) {
  return new AppError({ kind: 'validation', message, retryable: false, status: undefined });
}
