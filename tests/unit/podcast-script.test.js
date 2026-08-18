import { describe, it, expect } from 'vitest';
import {
  extractJson,
  validateScript,
  normalizeScript,
  buildScriptPrompt,
  buildPlanPrompt,
  buildPlanRevisionMessages,
  buildPlanRepairMessages,
  buildWriterPrompt,
  buildScriptRevisionMessages,
  buildRepairMessages,
  exportableScript,
  validatePodcastPreferences,
} from '../../src/features/podcast/podcast-script.js';
import {
  DEFAULT_PROMPT_TEMPLATES,
  resolvePromptTemplates,
  validatePromptTemplate,
} from '../../src/domain/prompt-templates.js';
import {
  STARTER_EPISODE_DIRECTION_TEMPLATES,
  STARTER_FORMAT_TEMPLATES,
  STARTER_SPEAKER_PROFILES,
} from '../../src/domain/podcast-templates.js';

const prefs = {
  episodeDirection: 'Prioritize the central argument.',
  formatInstructions: 'Create a natural conversation.',
  audience: 'general',
  speakers: [
    { id: 'speaker-1', name: 'Host', role: 'Guides', voice: 'alloy' },
    { id: 'speaker-2', name: 'Guest', role: 'Explains', voice: 'verse' },
  ],
  textModel: 'gpt-4o-mini',
  ttsModel: 'tts-1',
};

const validScript = {
  schemaVersion: 1,
  title: 'Demo',
  language: 'en',
  speakers: [
    { id: 'speaker-1', name: 'Host', role: 'Guides', voice: 'alloy' },
    { id: 'speaker-2', name: 'Guest', role: 'Explains', voice: 'verse' },
  ],
  segments: [
    { id: 'segment-0001', speakerId: 'speaker-1', text: 'Welcome.', pauseAfterMs: 350 },
    { id: 'segment-0002', speakerId: 'speaker-2', text: 'Thanks.', pauseAfterMs: 0 },
  ],
};

const validPlan = {
  schemaVersion: 1,
  workingTitle: 'Plan',
  editorialGoal: 'Explain the central claim.',
  listenerPromise: 'Understand the claim.',
  formatApproach: 'Use a responsive conversation.',
  priorities: ['Central claim'],
  exclusions: [],
  speakerContributions: [
    { speakerId: 'speaker-1', contribution: 'Frame the issue.' },
    { speakerId: 'speaker-2', contribution: 'Explain the claim.' },
  ],
  beats: [{ id: 'beat-1', title: 'Issue', purpose: 'Develop the issue.' }],
  ending: 'Consolidate the takeaway.',
};

describe('buildScriptPrompt', () => {
  it('delimits source and states the schema, Script Brief, and source-use contract', () => {
    const messages = buildScriptPrompt('SOURCE TEXT HERE', prefs);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('schemaVersion');
    expect(messages[0].content).toContain('Instruction ownership');
    expect(messages[0].content).toContain('Source use');
    expect(messages[0].content).toContain('factual and topical foundation');
    expect(messages[0].content).toContain('analyze, interpret, question, compare, or criticize');
    expect(messages[0].content).toContain('clearly hypothetical illustrations');
    expect(messages[0].content).toContain('Do not attribute a claim to the source');
    expect(messages[0].content).toContain('Do not write simultaneous speech');
    expect(messages[0].content).toContain('adjacent turns and speaker handoffs');
    expect(messages[0].content).toContain('Do not add translations');
    expect(messages[0].content).not.toContain('sourceGrounded');
    expect(messages[0].content).not.toContain('Every factual claim');
    expect(messages[0].content).not.toContain('conceptual repair');
    expect(messages[0].content).not.toContain('manufacture conflict');
    expect(messages[0].content).not.toContain('Vary segment length');
    expect(messages[1].content).toContain('SCRIPT BRIEF');
    expect(messages[1].content).toContain('coherent, engaging podcast script');
    expect(messages[1].content).toContain('written for listening');
    expect(messages[1].content).toContain('authoritative for structure, interaction, and show-level delivery');
    expect(messages[1].content).toContain('reference and topic material');
    expect(messages[1].content).not.toContain('Tone:');
    expect(messages[1].content).toContain('<<<SOURCE');
    expect(messages[1].content).toContain('SOURCE TEXT HERE');
    expect(messages[1].content).toContain('SOURCE>>>');
    expect(messages[1].content).toContain('speaker-1');
    expect(messages[1].content).toContain('Create a natural conversation.');
    expect(messages[1].content).toContain('alloy');
    expect(messages[1].content).not.toContain('Approximate duration');
  });

  it('uses a valid local template override without persisting source text', () => {
    const messages = buildScriptPrompt('SOURCE TEXT HERE', prefs, {
      scriptUser: 'Custom {{formatDescription}} {{audience}} {{speakers}} {{speakerIds}} {{voices}} {{source}}',
    });
    expect(messages[1].content).toContain('Custom');
    expect(messages[0].content).toContain('source language');
    expect(messages[1].content).toContain('SOURCE TEXT HERE');
  });
});

describe('buildRepairMessages', () => {
  it('includes prior output and errors', () => {
    const messages = buildRepairMessages('{"bad":true}', ['title missing']);
    expect(messages.some((m) => m.content.includes('{"bad":true}'))).toBe(true);
    expect(messages.some((m) => m.content.includes('title missing'))).toBe(true);
    expect(messages[0].content).toContain('smallest changes required');
    expect(messages[0].content).toContain('Do not add or rewrite script content');
    expect(messages[0].content).not.toContain('sourceGrounded');
  });

  it('uses a valid repair override', () => {
    const messages = buildRepairMessages('{"bad":true}', ['title missing'], {
      repairUser: 'Fix these: {{validationErrors}}',
    });
    expect(messages[2].content).toBe('Fix these: - title missing');
  });
});

describe('two-stage prompt construction', () => {
  it('builds a planner request with separated editorial ownership and current inputs', () => {
    const messages = buildPlanPrompt('SOURCE TEXT HERE', prefs);
    expect(messages[0].content).toContain('editorial planner');
    expect(messages[0].content).toContain('Episode direction supplies purpose');
    expect(messages[0].content).toContain('not exact dialogue or turn order');
    expect(messages[1].content).toContain(prefs.episodeDirection);
    expect(messages[1].content).toContain(prefs.formatInstructions);
    expect(messages[1].content).toContain('SOURCE TEXT HERE');
  });

  it('hands the approved plan to the writer without invalidating existing script overrides', () => {
    const messages = buildWriterPrompt('SOURCE', prefs, validPlan, {
      scriptUser: 'Custom {{formatDescription}} {{audience}} {{speakers}} {{speakerIds}} {{voices}} {{source}}',
    });
    expect(messages[1].content).toContain('Custom');
    expect(messages[2].content).toContain('APPROVED EPISODE PLAN');
    expect(messages[2].content).toContain('Central claim');
  });

  it('passes complete selected linguistic Format and Role contracts to planning and writing', () => {
    const format = STARTER_FORMAT_TEMPLATES.find((record) => record.id === 'format-conversation-critical');
    const host = STARTER_SPEAKER_PROFILES.find((record) => record.id === 'profile-host-peer-cohost');
    const expert = STARTER_SPEAKER_PROFILES.find((record) => record.id === 'profile-expert-analyst');
    const linguisticPrefs = {
      ...prefs,
      formatInstructions: format.instructions,
      speakers: [
        { ...prefs.speakers[0], role: host.role },
        { ...prefs.speakers[1], role: expert.role },
      ],
    };

    const planning = buildPlanPrompt('SOURCE', linguisticPrefs);
    const writing = buildWriterPrompt('SOURCE', linguisticPrefs, validPlan);
    for (const messages of [planning, writing]) {
      expect(JSON.stringify(messages)).toContain('turn contingency');
      expect(JSON.stringify(messages)).toContain('claim–challenge–response');
      expect(JSON.stringify(messages)).toContain('specific uptake');
      expect(JSON.stringify(messages)).toContain('claims, evidence, inference');
      expect(JSON.stringify(messages)).toContain('participation structure allowed by the selected Format');
    }
    expect(writing[0].content).toContain('adjacent turns and speaker handoffs');
  });

  it('passes bilingual vocabulary sequencing and language-reader boundaries to planning and writing', () => {
    const direction = STARTER_EPISODE_DIRECTION_TEMPLATES.find((record) =>
      record.id === 'direction-language-learning-teach');
    const format = STARTER_FORMAT_TEMPLATES.find((record) => record.id === 'format-vocabulary-teach');
    const targetReader = STARTER_SPEAKER_PROFILES.find((record) => record.id === 'profile-target-language-reader');
    const nativeReader = STARTER_SPEAKER_PROFILES.find((record) => record.id === 'profile-native-language-reader');
    const vocabularyPrefs = {
      ...prefs,
      episodeDirection: direction.instructions,
      formatInstructions: format.instructions,
      speakers: [
        { ...prefs.speakers[0], role: targetReader.role },
        { ...prefs.speakers[1], role: nativeReader.role },
      ],
    };
    const source = 'borrow — ยืม\nCan I borrow your book? — ฉันขอยืมหนังสือของคุณได้ไหม';

    const planning = JSON.stringify(buildPlanPrompt(source, vocabularyPrefs));
    expect(planning).toContain('source order');
    expect(planning).toContain('Do not invent translations');
    expect(planning).toContain('Does not translate');
    expect(planning).toContain('borrow — ยืม');
    expect(planning).toContain('Can I borrow your book? — ฉันขอยืมหนังสือของคุณได้ไหม');

    const writing = JSON.stringify(buildWriterPrompt(source, vocabularyPrefs, validPlan));
    expect(writing).toContain('source order');
    expect(writing).toContain('Omit unavailable fields rather than inventing them');
    expect(writing).toContain('Does not translate');
    expect(writing).toContain('primary target-language BCP 47 tag');
    expect(writing).toContain('borrow — ยืม');
    expect(writing).toContain('Can I borrow your book? — ฉันขอยืมหนังสือของคุณได้ไหม');
  });

  it('builds complete-plan revision and validation-only repair requests', () => {
    const revision = buildPlanRevisionMessages('SOURCE', prefs, validPlan, 'Narrow the focus.');
    expect(revision.at(-2).content).toContain('workingTitle');
    expect(revision.at(-1).content).toContain('Narrow the focus.');
    const repair = buildPlanRepairMessages('{"bad":true}', ['workingTitle must be non-empty text.']);
    expect(repair[1].content).toContain('"bad"');
    expect(repair[2].content).toContain('workingTitle');
  });

  it('builds complete-script revision from writing context, prior script, and request', () => {
    const revision = buildScriptRevisionMessages('SOURCE', prefs, validPlan, validScript, 'Make it more critical.');
    expect(revision).toHaveLength(5);
    expect(revision.at(-2).content).toContain('segment-0001');
    expect(revision.at(-1).content).toContain('Make it more critical.');
    expect(revision.at(-1).content).toContain('complete replacement PodcastScript');
  });
});

describe('prompt templates', () => {
  it('keeps every bundled planning, writing, and repair template valid', () => {
    for (const [id, template] of Object.entries(DEFAULT_PROMPT_TEMPLATES)) {
      expect(validatePromptTemplate(id, template), id).toEqual({ valid: true });
    }
  });

  it('rejects unsupported placeholders', () => {
    expect(validatePromptTemplate('scriptUser', DEFAULT_PROMPT_TEMPLATES.scriptUser).valid).toBe(true);
    expect(validatePromptTemplate('scriptUser', '{{formatDescription}} {{audience}} {{speakers}} {{speakerIds}} {{voices}} {{source}} {{unknownPlaceholder}}').valid).toBe(false);
  });

  it('falls back to bundled default for invalid local overrides', () => {
    expect(resolvePromptTemplates({ scriptUser: 'missing placeholders' }).scriptUser).toBe(
      DEFAULT_PROMPT_TEMPLATES.scriptUser,
    );
  });

  it('identifies required placeholders', () => {
    const result = validatePromptTemplate('repairUser', 'No errors here');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toContain('{{validationErrors}}');
  });

  it('requires revision request placeholder for script revision', () => {
    const result = validatePromptTemplate('scriptRevisionUser', 'Rewrite script.');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toContain('{{revisionRequest}}');
  });
});

describe('extractJson', () => {
  it('parses direct JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses fenced JSON', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON embedded in prose', () => {
    expect(extractJson('Sure! {"a":1} hope this helps')).toEqual({ a: 1 });
  });

  it('throws on empty output', () => {
    expect(() => extractJson('  ')).toThrowError(/empty/);
  });

  it('throws when no object present', () => {
    expect(() => extractJson('no json here')).toThrowError(/JSON/);
  });
});

describe('validateScript', () => {
  it('accepts a valid script and normalizes it', () => {
    const result = validateScript(validScript);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.script.title).toBe('Demo');
      expect(result.script.segments).toHaveLength(2);
    }
  });

  it('accepts a legacy v1 sourceGrounded field and drops it from the canonical script', () => {
    const legacy = { ...structuredClone(validScript), sourceGrounded: true };
    const result = validateScript(legacy);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.script).not.toHaveProperty('sourceGrounded');
    expect(exportableScript(legacy)).not.toHaveProperty('sourceGrounded');
  });

  it('rejects scripts without the current-format marker', () => {
    const result = validateScript({ ...validScript, schemaVersion: undefined });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toContain('schemaVersion');
  });

  it('rejects unknown speaker references', () => {
    const bad = structuredClone(validScript);
    bad.segments[0].speakerId = 'nobody';
    const result = validateScript(bad);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toContain('unknown speaker');
  });

  it('rejects empty segment text', () => {
    const bad = structuredClone(validScript);
    bad.segments[0].text = '   ';
    expect(validateScript(bad).valid).toBe(false);
  });

  it('rejects duplicate segment ids', () => {
    const bad = structuredClone(validScript);
    bad.segments[1].id = bad.segments[0].id;
    expect(validateScript(bad).valid).toBe(false);
  });

  it('rejects invalid pause values', () => {
    const bad = structuredClone(validScript);
    bad.segments[0].pauseAfterMs = 6000;
    expect(validateScript(bad).valid).toBe(false);
    bad.segments[0].pauseAfterMs = 3.5;
    expect(validateScript(bad).valid).toBe(false);
  });

  it('accepts and canonicalizes non-English BCP 47 language tags', () => {
    const thai = structuredClone(validScript);
    thai.language = 'TH';
    const result = validateScript(thai);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.script.language).toBe('th');
  });

  it('rejects invalid language tags', () => {
    const bad = structuredClone(validScript);
    bad.language = 'not a language';
    expect(validateScript(bad).valid).toBe(false);
  });

  it('enforces the 1-8 speaker range independently of format', () => {
    const none = { ...structuredClone(validScript), speakers: [] };
    expect(validateScript(none).valid).toBe(false);
    const eight = structuredClone(validScript);
    eight.speakers = Array.from({ length: 8 }, (_, index) => ({
      id: `speaker-${index + 1}`, name: `Speaker ${index + 1}`, role: '', voice: 'alloy',
    }));
    eight.segments = [{ id: 'segment-1', speakerId: 'speaker-8', text: 'Eight.', pauseAfterMs: 0 }];
    expect(validateScript(eight).valid).toBe(true);
    const nine = structuredClone(eight);
    nine.speakers.push({ id: 'speaker-9', name: 'Speaker 9', role: '', voice: 'alloy' });
    expect(validateScript(nine).valid).toBe(false);
  });

  it('rejects invalid field types', () => {
    const bad = structuredClone(validScript);
    // @ts-expect-error intentionally wrong type
    bad.segments = 'nope';
    expect(validateScript(bad).valid).toBe(false);
  });
});

describe('normalizeScript', () => {
  it('discards unknown properties', () => {
    const withExtra = structuredClone(validScript);
    withExtra.internal = { secret: 'x' };
    withExtra.segments[0].recoveryNote = 'internal';
    const normalized = normalizeScript(withExtra);
    expect('internal' in normalized).toBe(false);
    expect('recoveryNote' in normalized.segments[0]).toBe(false);
  });
});

describe('exportableScript', () => {
  it('contains canonical fields only', () => {
    const exported = exportableScript({ ...validScript, extra: 1 });
    expect(Object.keys(exported).sort()).toEqual([
      'language',
      'schemaVersion',
      'segments',
      'speakers',
      'title',
    ]);
  });
});

describe('validatePodcastPreferences', () => {
  it('accepts dynamic speakers and rejects empty format instructions', () => {
    expect(validatePodcastPreferences(prefs).valid).toBe(true);
    expect(validatePodcastPreferences({ ...prefs, formatInstructions: ' ' }).valid).toBe(false);
  });
});
