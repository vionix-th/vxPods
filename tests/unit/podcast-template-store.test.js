import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFormatTemplate,
  addSpeakerProfile,
  deleteFormatTemplate,
  deleteSpeakerProfile,
  listFormatTemplates,
  listSpeakerProfiles,
  restoreFormatStarters,
  restoreSpeakerProfileStarters,
  subscribePodcastTemplates,
  updateFormatTemplate,
  updateSpeakerProfile,
} from '../../src/features/podcast/podcast-template-store.js';
import {
  STARTER_FORMAT_TEMPLATES,
  STARTER_SPEAKER_PROFILES,
} from '../../src/domain/podcast-templates.js';

beforeEach(() => localStorage.clear());

describe('podcast template store', () => {
  it('seeds starters in canonical order', () => {
    expect(listFormatTemplates().map((record) => record.name)).toEqual(
      STARTER_FORMAT_TEMPLATES.map((record) => record.name),
    );
    expect(listSpeakerProfiles().map((record) => record.label)).toEqual(
      STARTER_SPEAKER_PROFILES.map((record) => record.label),
    );
  });

  it('creates, updates, and deletes formats with unique names', () => {
    const created = addFormatTemplate({ name: 'Briefing', instructions: 'Use concise briefing sections.' });
    expect(listFormatTemplates().at(-1)).toEqual(created);
    const updated = updateFormatTemplate(created.id, { name: 'Daily Briefing', instructions: 'Open with key facts.' });
    expect(updated.name).toBe('Daily Briefing');
    expect(() => addFormatTemplate({ name: 'daily briefing', instructions: 'Duplicate.' })).toThrow(/already exists/i);
    deleteFormatTemplate(created.id);
    expect(listFormatTemplates().some((record) => record.id === created.id)).toBe(false);
  });

  it('creates, updates, and deletes speaker profiles without voices', () => {
    const created = addSpeakerProfile({ label: 'Coach', defaultSpeakerName: 'Coach', role: 'Explains through practice.' });
    expect(created).not.toHaveProperty('voice');
    const updated = updateSpeakerProfile(created.id, {
      label: 'Teacher', defaultSpeakerName: '', role: 'Builds understanding step by step.',
    });
    expect(updated).toMatchObject({ label: 'Teacher', defaultSpeakerName: '' });
    deleteSpeakerProfile(created.id);
    expect(listSpeakerProfiles().some((record) => record.id === created.id)).toBe(false);
  });

  it('persists deleting every starter until explicit restore', () => {
    for (const record of listFormatTemplates()) deleteFormatTemplate(record.id);
    for (const record of listSpeakerProfiles()) deleteSpeakerProfile(record.id);
    expect(listFormatTemplates()).toEqual([]);
    expect(listSpeakerProfiles()).toEqual([]);
    expect(restoreFormatStarters()).toEqual([]);
    expect(restoreSpeakerProfileStarters()).toEqual([]);
    expect(listFormatTemplates()).toHaveLength(STARTER_FORMAT_TEMPLATES.length);
    expect(listSpeakerProfiles()).toHaveLength(STARTER_SPEAKER_PROFILES.length);
  });

  it('retains custom records and skips starter names occupied by custom records', () => {
    deleteFormatTemplate('format-conversation');
    const custom = addFormatTemplate({ name: 'Conversation', instructions: 'Custom conversation.' });
    expect(restoreFormatStarters()).toEqual(['Conversation']);
    expect(listFormatTemplates().find((record) => record.name === 'Conversation')).toEqual(custom);
  });

  it('notifies subscribers after mutations', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePodcastTemplates(listener);
    addFormatTemplate({ name: 'News', instructions: 'Use a news bulletin structure.' });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
