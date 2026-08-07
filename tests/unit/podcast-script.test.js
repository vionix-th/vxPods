import { describe, it, expect } from 'vitest';
import {
  extractJson,
  validateScript,
  normalizeScript,
  buildScriptPrompt,
  buildRepairMessages,
  exportableScript,
  validatePodcastPreferences,
} from '../../src/features/podcast/podcast-script.js';
import {
  DEFAULT_PROMPT_TEMPLATES,
  resolvePromptTemplates,
  validatePromptTemplate,
} from '../../src/domain/prompt-templates.js';

const prefs = {
  formatInstructions: 'Create a natural conversation.',
  tone: 'conversational',
  audience: 'general',
  speakers: [
    { id: 'speaker-1', name: 'Host', role: 'Guides', voice: 'alloy' },
    { id: 'speaker-2', name: 'Guest', role: 'Explains', voice: 'verse' },
  ],
  textModel: 'gpt-4o-mini',
  ttsModel: 'tts-1',
};

const validScript = {
  schemaVersion: 2,
  title: 'Demo',
  language: 'en',
  sourceGrounded: true,
  speakers: [
    { id: 'speaker-1', name: 'Host', role: 'Guides', voice: 'alloy' },
    { id: 'speaker-2', name: 'Guest', role: 'Explains', voice: 'verse' },
  ],
  segments: [
    { id: 'segment-0001', speakerId: 'speaker-1', text: 'Welcome.', pauseAfterMs: 350 },
    { id: 'segment-0002', speakerId: 'speaker-2', text: 'Thanks.', pauseAfterMs: 0 },
  ],
};

describe('buildScriptPrompt', () => {
  it('delimits source and states schema + grounding', () => {
    const messages = buildScriptPrompt('SOURCE TEXT HERE', prefs);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('schemaVersion');
    expect(messages[0].content).toContain('factual claim');
    expect(messages[0].content).toContain('Do not translate');
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
      scriptUser: 'Custom {{formatDescription}} {{tone}} {{audience}} {{speakers}} {{speakerIds}} {{voices}} {{source}}',
    });
    expect(messages[1].content).toContain('Custom');
    expect(messages[0].content).toContain('source language');
    expect(messages[1].content).toContain('SOURCE TEXT HERE');
  });

  it('renders legacy format placeholders for existing advanced overrides', () => {
    const messages = buildScriptPrompt('SOURCE', prefs, {
      scriptSystem: 'Legacy format: {{format}}',
    });
    expect(messages[0].content).toContain('Legacy format: conversation');
  });
});

describe('buildRepairMessages', () => {
  it('includes prior output and errors', () => {
    const messages = buildRepairMessages('{"bad":true}', ['title missing']);
    expect(messages.some((m) => m.content.includes('{"bad":true}'))).toBe(true);
    expect(messages.some((m) => m.content.includes('title missing'))).toBe(true);
  });

  it('uses a valid repair override', () => {
    const messages = buildRepairMessages('{"bad":true}', ['title missing'], {
      repairUser: 'Fix these: {{validationErrors}}',
    });
    expect(messages[2].content).toBe('Fix these: - title missing');
  });
});

describe('prompt templates', () => {
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

  it('rejects unsupported schema versions', () => {
    const result = validateScript({ ...validScript, schemaVersion: 3 });
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

  it('migrates version 1 scripts and removes legacy format', () => {
    const legacy = { ...structuredClone(validScript), schemaVersion: 1, format: 'conversation' };
    const result = validateScript(legacy);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.script.schemaVersion).toBe(2);
      expect(result.script).not.toHaveProperty('format');
    }
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
      'sourceGrounded',
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
