import { describe, it, expect } from 'vitest';
import {
  extractJson,
  validateScript,
  normalizeScript,
  buildScriptPrompt,
  buildRepairMessages,
  estimateDurationSeconds,
  exportableScript,
} from '../../src/features/podcast/podcast-script.js';
import {
  DEFAULT_PROMPT_TEMPLATES,
  resolvePromptTemplates,
  validatePromptTemplate,
} from '../../src/features/podcast/prompt-templates.js';

const prefs = {
  format: 'conversation',
  targetMinutes: 5,
  tone: 'conversational',
  audience: 'general',
  speakers: [
    { name: 'Host', role: 'Guides', voice: 'alloy' },
    { name: 'Guest', role: 'Explains', voice: 'verse' },
  ],
  chatModel: 'gpt-4o-mini',
  ttsModel: 'tts-1',
};

const validScript = {
  schemaVersion: 1,
  title: 'Demo',
  language: 'en',
  format: 'conversation',
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
    expect(messages[1].content).toContain('<<<SOURCE');
    expect(messages[1].content).toContain('SOURCE TEXT HERE');
    expect(messages[1].content).toContain('SOURCE>>>');
    expect(messages[1].content).toContain('speaker-1');
    expect(messages[1].content).toContain('alloy');
    expect(messages[1].content).toContain('Approximate duration: 5 minutes.');
  });

  it('uses a valid local template override without persisting source text', () => {
    const messages = buildScriptPrompt('SOURCE TEXT HERE', prefs, {
      scriptUser: 'Custom {{formatDescription}} {{durationMinutes}} {{tone}} {{audience}} {{speakers}} {{speakerIds}} {{voices}} {{source}}',
    });
    expect(messages[1].content).toContain('Custom');
    expect(messages[1].content).toContain('SOURCE TEXT HERE');
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

  it('rejects schema-version mismatch', () => {
    const result = validateScript({ ...validScript, schemaVersion: 2 });
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

  it('enforces speaker count by format', () => {
    const solo = { ...structuredClone(validScript), format: 'solo' };
    expect(validateScript(solo).valid).toBe(false);
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
      'format',
      'language',
      'schemaVersion',
      'segments',
      'sourceGrounded',
      'speakers',
      'title',
    ]);
  });
});

describe('estimateDurationSeconds', () => {
  it('accounts for words and pauses', () => {
    const seconds = estimateDurationSeconds(validScript);
    expect(seconds).toBeGreaterThan(0);
  });
});
