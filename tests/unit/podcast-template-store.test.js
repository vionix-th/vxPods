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

const FORMAT_CATALOG = [
  ['format-conversation', 'Conversation — Exploratory'],
  ['format-conversation-critical', 'Conversation — Critical'],
  ['format-conversation-reflective', 'Conversation — Reflective'],
  ['format-interview', 'Interview — Explanatory'],
  ['format-interview-investigative', 'Interview — Investigative'],
  ['format-interview-interpretive', 'Interview — Interpretive'],
  ['format-narrative', 'Narrative — Chronological'],
  ['format-narrative-causal', 'Narrative — Causal'],
  ['format-narrative-thematic', 'Narrative — Thematic'],
  ['format-lecture', 'Lecture — Conceptual'],
  ['format-lecture-case-led', 'Lecture — Case-led'],
  ['format-lecture-argumentative', 'Lecture — Argumentative'],
  ['format-panel-discussion', 'Panel Discussion — Exploratory'],
  ['format-panel-discussion-critical', 'Panel Discussion — Critical'],
  ['format-panel-discussion-comparative', 'Panel Discussion — Comparative'],
];

const PROFILE_CATALOG = [
  ['profile-host', 'Host — Facilitator', 'Maya'],
  ['profile-host-peer-cohost', 'Host — Peer Co-host', 'Maya'],
  ['profile-host-synthesizer', 'Host — Synthesizer', 'Maya'],
  ['profile-interviewer', 'Interviewer — Clarifier', 'Rowan'],
  ['profile-interviewer-investigator', 'Interviewer — Investigator', 'Rowan'],
  ['profile-interviewer-interpretive', 'Interviewer — Interpretive', 'Rowan'],
  ['profile-expert', 'Expert — Explainer', 'Leah'],
  ['profile-expert-analyst', 'Expert — Analyst', 'Leah'],
  ['profile-expert-contextualizer', 'Expert — Contextualizer', 'Leah'],
  ['profile-narrator', 'Narrator — Chronological', 'Nora'],
  ['profile-narrator-causal', 'Narrator — Causal', 'Nora'],
  ['profile-narrator-thematic', 'Narrator — Thematic', 'Nora'],
  ['profile-skeptic', 'Skeptic — Evidence Auditor', 'Elias'],
  ['profile-skeptic-scope-critic', 'Skeptic — Scope Critic', 'Elias'],
  ['profile-skeptic-alternative-hypothesis-tester', 'Skeptic — Alternative-Hypothesis Tester', 'Elias'],
];

beforeEach(() => localStorage.clear());

describe('podcast template store', () => {
  it('seeds starters in canonical order', () => {
    expect(listEpisodeDirectionTemplates().map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'direction-essential-overview', name: 'Essential Overview' },
      { id: 'direction-focused-exploration', name: 'Focused Exploration' },
      { id: 'direction-critical-examination', name: 'Critical Examination' },
      { id: 'direction-practical-interpretation', name: 'Practical Interpretation' },
    ]);
    expect(listFormatTemplates().map(({ id, name }) => [id, name])).toEqual(FORMAT_CATALOG);
    expect(listSpeakerProfiles().map(({ id, label, defaultSpeakerName }) =>
      [id, label, defaultSpeakerName])).toEqual(PROFILE_CATALOG);
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

  it('gives every flat Format variant a complete linguistic contract', () => {
    const formats = Object.fromEntries(
      STARTER_FORMAT_TEMPLATES.map((record) => [record.id, record.instructions]),
    );
    const families = {
      conversation: STARTER_FORMAT_TEMPLATES.slice(0, 3),
      interview: STARTER_FORMAT_TEMPLATES.slice(3, 6),
      narrative: STARTER_FORMAT_TEMPLATES.slice(6, 9),
      lecture: STARTER_FORMAT_TEMPLATES.slice(9, 12),
      panel: STARTER_FORMAT_TEMPLATES.slice(12, 15),
    };

    for (const record of families.conversation) {
      for (const term of [
        'turn contingency', 'specific uptake', 'sequence organization', 'adjacency pairs',
        'recipient design', 'grounding', 'repair', 'epistemic stance', 'co-construction',
        'lexical pickup', 'discourse markers', 'turn-entry points',
      ]) expect(record.instructions).toContain(term);
      expect(record.instructions).toContain('topical continuity, not interpersonal uptake');
      expect(record.instructions).toContain('mini-monologues');
      expect(record.instructions).toContain('rotate mechanically');
      expect(record.instructions).toContain('decorative filler');
    }
    expect(formats['format-conversation']).toContain('shared formulation');
    expect(formats['format-conversation-critical']).toContain('claim–challenge–response');
    expect(formats['format-conversation-critical']).toContain('counterexamples');
    expect(formats['format-conversation-reflective']).toContain('changes of stance');
    expect(formats['format-conversation-reflective']).toContain('invent personal histories');

    for (const record of families.interview) {
      for (const term of [
        'question–answer adjacency pairs', 'answer-dependent follow-up', 'recipient design',
        'formulation', 'clarification', 'fixed questionnaire',
      ]) expect(record.instructions).toContain(term);
      expect(record.instructions).toContain('first speaker as interviewer');
    }
    expect(formats['format-interview']).toContain('definitions');
    expect(formats['format-interview-investigative']).toContain('causal inference');
    expect(formats['format-interview-interpretive']).toContain('competing readings');

    for (const record of families.narrative) {
      for (const term of [
        'non-interactive', 'discourse cohesion', 'anaphoric reference', 'narrative viewpoint',
        'callbacks', 'information continuity', 'purposeful handoffs', 'simulated conversation',
      ]) expect(record.instructions).toContain(term);
      expect(record.instructions).not.toContain('specific uptake');
      expect(record.instructions).not.toContain('adjacency pairs');
    }
    expect(formats['format-narrative']).toContain('temporal deixis');
    expect(formats['format-narrative-causal']).toContain('mechanisms');
    expect(formats['format-narrative-thematic']).toContain('motifs');

    for (const record of families.lecture) {
      for (const term of [
        'non-interactive', 'conceptual scaffolding', 'information structure',
        'listener-oriented metadiscourse', 'restrained consolidation', 'teaching-function handoffs',
      ]) expect(record.instructions).toContain(term);
      expect(record.instructions).not.toContain('specific uptake');
      expect(record.instructions).not.toContain('adjacency pairs');
    }
    expect(formats['format-lecture']).toContain('definition to distinction');
    expect(formats['format-lecture-case-led']).toContain('concrete case');
    expect(formats['format-lecture-argumentative']).toContain('thesis to support');

    for (const record of families.panel) {
      for (const term of [
        'first speaker as moderator', 'panelist-to-panelist specific uptake',
        'multi-party sequence organization', 'recipient design', 'selective moderator synthesis',
      ]) expect(record.instructions).toContain(term);
      expect(record.instructions).toContain('without moderator mediation');
      expect(record.instructions).toMatch(/fixed round|mandatory turns/);
    }
    expect(formats['format-panel-discussion']).toContain('complementary perspectives');
    expect(formats['format-panel-discussion-critical']).toContain('challenge–response');
    expect(formats['format-panel-discussion-comparative']).toContain('comparison dimensions');

    expect(STARTER_FORMAT_TEMPLATES).toHaveLength(15);
    for (const record of STARTER_FORMAT_TEMPLATES) {
      expect(record.instructions).toContain('With one speaker');
      expect(record.instructions).not.toContain('source-grounded');
      expect(record.instructions.length).toBeLessThanOrEqual(TEMPLATE_TEXT_MAX_LENGTH);
    }
  });

  it('keeps flat Role variants stable, distinct, and subordinate to Format', () => {
    expect(STARTER_SPEAKER_PROFILES.map(({ id, label, defaultSpeakerName }) =>
      [id, label, defaultSpeakerName])).toEqual(PROFILE_CATALOG);

    const roles = Object.fromEntries(
      STARTER_SPEAKER_PROFILES.map((record) => [record.id, record.role]),
    );
    expect(STARTER_SPEAKER_PROFILES).toHaveLength(15);
    for (const record of STARTER_SPEAKER_PROFILES) {
      expect(record.role).not.toContain('source-grounded');
      expect(record.role).toContain('only through the participation structure allowed by the selected Format');
      expect(record.role).toContain('do not introduce moderation, dialogue, or speaker relationships');
      expect(record.role.length).toBeLessThanOrEqual(TEMPLATE_TEXT_MAX_LENGTH);
    }
    expect(roles['profile-host']).toContain('grounding');
    expect(roles['profile-host-peer-cohost']).toContain('co-construction');
    expect(roles['profile-host-synthesizer']).toContain('provisional synthesis');
    expect(roles['profile-interviewer']).toContain('clarification requests');
    expect(roles['profile-interviewer-investigator']).toContain('evidential basis');
    expect(roles['profile-interviewer-interpretive']).toContain('competing readings');
    expect(roles['profile-expert']).toContain('conceptual scaffolding');
    expect(roles['profile-expert-analyst']).toContain('claims, evidence, inference');
    expect(roles['profile-expert-contextualizer']).toContain('history, systems, comparisons');
    expect(roles['profile-narrator']).toContain('temporal orientation');
    expect(roles['profile-narrator-causal']).toContain('mechanisms');
    expect(roles['profile-narrator-thematic']).toContain('recurring themes');
    expect(roles['profile-skeptic']).toContain('evidential basis');
    expect(roles['profile-skeptic-scope-critic']).toContain('category boundary');
    expect(roles['profile-skeptic-alternative-hypothesis-tester']).toContain('competing explanations');
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
    const custom = addFormatTemplate({ name: 'Conversation — Exploratory', instructions: 'Custom conversation.' });
    expect(restoreFormatStarters()).toEqual(['Conversation — Exploratory']);
    expect(listFormatTemplates().find((record) => record.name === 'Conversation — Exploratory')).toEqual(custom);
  });

  it('notifies subscribers after mutations', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePodcastTemplates(listener);
    addFormatTemplate({ name: 'News', instructions: 'Use a news bulletin structure.' });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
