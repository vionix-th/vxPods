import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFormatTemplate,
  addEpisodeDirectionTemplate,
  addSpeakerProfile,
  deleteFormatTemplate,
  deleteEpisodeDirectionTemplate,
  deleteSpeakerProfile,
  listFormatTemplates,
  listEpisodeDirectionTemplates,
  listSpeakerProfiles,
  restoreFormatStarters,
  restoreEpisodeDirectionStarters,
  restoreSpeakerProfileStarters,
  subscribePodcastTemplates,
  updateFormatTemplate,
  updateEpisodeDirectionTemplate,
  updateSpeakerProfile,
} from '../../src/features/podcast/podcast-template-store.js';
import {
  STARTER_FORMAT_TEMPLATES,
  STARTER_EPISODE_DIRECTION_TEMPLATES,
  STARTER_SPEAKER_PROFILES,
  TEMPLATE_TEXT_MAX_LENGTH,
} from '../../src/domain/podcast-templates.js';

beforeEach(() => localStorage.clear());

describe('podcast template store', () => {
  it('seeds starters in canonical order', () => {
    expect(listEpisodeDirectionTemplates().map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'direction-essential-overview', name: 'Essential Overview' },
      { id: 'direction-focused-exploration', name: 'Focused Exploration' },
      { id: 'direction-critical-examination', name: 'Critical Examination' },
      { id: 'direction-practical-interpretation', name: 'Practical Interpretation' },
    ]);
    expect(listFormatTemplates().map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'format-conversation', name: 'Conversation' },
      { id: 'format-interview', name: 'Interview' },
      { id: 'format-narrative', name: 'Narrative' },
      { id: 'format-lecture', name: 'Lecture' },
      { id: 'format-panel-discussion', name: 'Panel Discussion' },
    ]);
    expect(listSpeakerProfiles().map((record) => record.label)).toEqual(
      STARTER_SPEAKER_PROFILES.map((record) => record.label),
    );
  });

  it('keeps Episode direction starters editorially distinct and bounded', () => {
    const directions = Object.fromEntries(
      STARTER_EPISODE_DIRECTION_TEMPLATES.map((record) => [record.id, record.instructions]),
    );
    expect(directions['direction-essential-overview']).toContain('central argument');
    expect(directions['direction-focused-exploration']).toContain('in depth');
    expect(directions['direction-critical-examination']).toContain('plausible alternatives');
    expect(directions['direction-practical-interpretation']).toContain('why');
    for (const record of STARTER_EPISODE_DIRECTION_TEMPLATES) {
      expect(record.instructions.length).toBeLessThanOrEqual(TEMPLATE_TEXT_MAX_LENGTH);
    }
  });

  it('creates, updates, deletes, and restores Episode directions', () => {
    const created = addEpisodeDirectionTemplate({ name: 'Author intent', instructions: 'Follow the author\'s chosen angle.' });
    expect(listEpisodeDirectionTemplates().at(-1)).toEqual(created);
    const updated = updateEpisodeDirectionTemplate(created.id, {
      name: 'Author focus', instructions: 'Follow the author\'s selected focus.',
    });
    expect(updated.name).toBe('Author focus');
    expect(() => addEpisodeDirectionTemplate({
      name: 'author focus', instructions: 'Duplicate.',
    })).toThrow(/already exists/i);
    deleteEpisodeDirectionTemplate(created.id);
    expect(listEpisodeDirectionTemplates().some((record) => record.id === created.id)).toBe(false);
    deleteEpisodeDirectionTemplate('direction-essential-overview');
    expect(restoreEpisodeDirectionStarters()).toEqual([]);
    expect(listEpisodeDirectionTemplates()[0].id).toBe('direction-essential-overview');
  });

  it('gives every starter format a distinct format-aware discourse contract', () => {
    const formats = Object.fromEntries(
      STARTER_FORMAT_TEMPLATES.map((record) => [record.id, record.instructions]),
    );

    expect(formats['format-conversation']).toContain('develop the subject together');
    expect(formats['format-conversation']).toContain('permanent moderator');
    expect(formats['format-conversation']).toContain('rotate mechanically');
    expect(formats['format-interview']).toContain('first speaker as interviewer');
    expect(formats['format-interview']).toContain('substance of prior answers');
    expect(formats['format-interview']).toContain('several interviewees');
    expect(formats['format-interview']).toContain('fixed questionnaire');
    expect(formats['format-narrative']).toContain('non-interactive spoken narrative');
    expect(formats['format-narrative']).toContain('temporal, causal, or thematic organization');
    expect(formats['format-narrative']).toContain('continuity across handoffs');
    expect(formats['format-lecture']).toContain('non-interactive spoken lecture');
    expect(formats['format-lecture']).toContain('deliberate order');
    expect(formats['format-lecture']).toContain('complementary teaching functions');
    expect(formats['format-panel-discussion']).toContain('first speaker as moderator');
    expect(formats['format-panel-discussion']).toContain('without mediating every contribution');
    expect(formats['format-panel-discussion']).toContain('panelists engage one another');
    expect(formats['format-panel-discussion']).toContain('fixed speaker rotation');
    for (const record of STARTER_FORMAT_TEMPLATES) {
      expect(record.instructions).toContain('With one speaker');
      expect(record.instructions).not.toContain('source-grounded');
      expect(record.instructions.length).toBeLessThanOrEqual(TEMPLATE_TEXT_MAX_LENGTH);
    }
  });

  it('keeps starter roles stable and focused on contribution and delivery', () => {
    expect(STARTER_SPEAKER_PROFILES.map(({ id, label, defaultSpeakerName }) => ({
      id,
      label,
      defaultSpeakerName,
    }))).toEqual([
      { id: 'profile-host', label: 'Host', defaultSpeakerName: 'Maya' },
      { id: 'profile-interviewer', label: 'Interviewer', defaultSpeakerName: 'Rowan' },
      { id: 'profile-expert', label: 'Expert', defaultSpeakerName: 'Leah' },
      { id: 'profile-narrator', label: 'Narrator', defaultSpeakerName: 'Nora' },
      { id: 'profile-skeptic', label: 'Skeptic', defaultSpeakerName: 'Elias' },
    ]);

    const roles = Object.fromEntries(
      STARTER_SPEAKER_PROFILES.map((record) => [record.id, record.role]),
    );
    for (const record of STARTER_SPEAKER_PROFILES) {
      expect(record.role).not.toContain('source-grounded');
      expect(record.role).not.toContain('In interactive formats');
      expect(record.role).not.toContain('In non-interactive formats');
      expect(record.role.length).toBeLessThanOrEqual(TEMPLATE_TEXT_MAX_LENGTH);
    }
    expect(roles['profile-host']).toContain('without monopolizing questions or transitions');
    expect(roles['profile-interviewer']).toContain('focused inquiry from prior answers');
    expect(roles['profile-expert']).toContain('source\'s claims from analysis or interpretation');
    expect(roles['profile-narrator']).toContain('context and continuity');
    expect(roles['profile-skeptic']).toContain('alternative interpretations');
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
