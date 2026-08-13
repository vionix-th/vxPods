import { describe, expect, it } from 'vitest';
import {
  MAX_PLAN_ITEMS,
  normalizeEpisodePlan,
  validateEpisodePlan,
} from '../../src/domain/episode-plan-schema.js';

const speakerIds = ['speaker-1', 'speaker-2'];
const validPlan = {
  schemaVersion: 1,
  workingTitle: 'Working title',
  editorialGoal: 'Develop the central argument.',
  listenerPromise: 'Understand the argument and its implications.',
  formatApproach: 'Use a responsive peer conversation.',
  priorities: ['Central argument'],
  exclusions: [],
  speakerContributions: [
    { speakerId: 'speaker-2', contribution: 'Explain the implications.' },
    { speakerId: 'speaker-1', contribution: 'Maintain the central question.' },
  ],
  beats: [{ id: 'beat-1', title: 'The question', purpose: 'Establish the interpretive problem.' }],
  ending: 'Consolidate what changes for the listener.',
};

describe('EpisodePlan', () => {
  it('validates, trims, orders contributions by cast, and drops unknown fields', () => {
    const result = validateEpisodePlan({ ...validPlan, workingTitle: '  Working title  ', internal: true }, speakerIds);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.plan.workingTitle).toBe('Working title');
    expect(result.plan.speakerContributions.map((entry) => entry.speakerId)).toEqual(speakerIds);
    expect(result.plan).not.toHaveProperty('internal');
    expect(result.plan.beats[0]).toEqual({
      id: 'beat-1', title: 'The question', purpose: 'Establish the interpretive problem.',
    });
  });

  it('requires exactly one contribution for every current speaker', () => {
    const missing = { ...structuredClone(validPlan), speakerContributions: [validPlan.speakerContributions[0]] };
    expect(validateEpisodePlan(missing, speakerIds)).toMatchObject({ valid: false });
    const duplicate = structuredClone(validPlan);
    duplicate.speakerContributions[1].speakerId = 'speaker-2';
    expect(validateEpisodePlan(duplicate, speakerIds)).toMatchObject({ valid: false });
  });

  it('supports plans for one through eight ordered speakers', () => {
    for (const count of [1, 8]) {
      const ids = Array.from({ length: count }, (_, index) => `speaker-${index + 1}`);
      const plan = {
        ...structuredClone(validPlan),
        speakerContributions: ids.slice().reverse().map((speakerId) => ({
          speakerId,
          contribution: `Contribution for ${speakerId}.`,
        })),
      };
      const result = validateEpisodePlan(plan, ids);
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.plan.speakerContributions.map((entry) => entry.speakerId)).toEqual(ids);
    }
  });

  it('enforces item bounds, stable unique beat ids, and text limits', () => {
    expect(validateEpisodePlan({ ...validPlan, priorities: [] }, speakerIds).valid).toBe(false);
    expect(validateEpisodePlan({
      ...validPlan,
      priorities: Array.from({ length: MAX_PLAN_ITEMS + 1 }, () => 'item'),
    }, speakerIds).valid).toBe(false);
    const duplicateBeats = {
      ...validPlan,
      beats: [validPlan.beats[0], { ...validPlan.beats[0] }],
    };
    expect(validateEpisodePlan(duplicateBeats, speakerIds).valid).toBe(false);
    expect(validateEpisodePlan({ ...validPlan, workingTitle: 'x'.repeat(201) }, speakerIds).valid).toBe(false);
  });

  it('rejects invalid schema and malformed fields', () => {
    expect(validateEpisodePlan({ ...validPlan, schemaVersion: 2 }, speakerIds).valid).toBe(false);
    expect(validateEpisodePlan({ ...validPlan, beats: 'invalid' }, speakerIds).valid).toBe(false);
    expect(validateEpisodePlan({ ...validPlan, exclusions: [''] }, speakerIds).valid).toBe(false);
  });

  it('normalizes a previously validated plan deterministically', () => {
    const normalized = normalizeEpisodePlan(validPlan, speakerIds);
    expect(normalized.schemaVersion).toBe(1);
    expect(normalized.speakerContributions[0].speakerId).toBe('speaker-1');
  });
});
