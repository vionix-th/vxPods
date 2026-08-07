/** Canonical, browser-local podcast prompt-template contract. */

export const TEMPLATE_IDS = /** @type {const} */ ([
  'scriptSystem',
  'scriptUser',
  'repairSystem',
  'repairUser',
]);

/** @typedef {typeof TEMPLATE_IDS[number]} PromptTemplateId */

export const DEFAULT_PROMPT_TEMPLATES = Object.freeze({
  scriptSystem: [
    'You write podcast scripts as strict JSON only.',
    'Output exactly one JSON object with this shape and no other text:',
    '{"schemaVersion":2,"title":string,"language":string,"sourceGrounded":true,' +
      '"speakers":[{"id":string,"name":string,"role":string,"voice":string}],' +
      '"segments":[{"id":string,"speakerId":string,"text":string,"pauseAfterMs":number}]}',
    'Rules:',
    '- Every factual claim must come from supplied source. Do not invent facts.',
    '- Write the title and every segment in the source language. Do not translate unless the source explicitly asks for translation.',
    '- Set language to the source language BCP 47 tag, for example "th" or "en".',
    '- Introductions, transitions, and summaries may restate source material.',
    '- Write natural, speech-ready plain text. No markdown, no stage directions.',
    '- pauseAfterMs is an integer from 0 to 5000.',
    '- Use exact speaker ids and voices given by user.',
  ].join('\n'),
  scriptUser: [
    'Format instructions: {{formatDescription}}',
    'Tone: {{tone}}. Audience: {{audience}}.',
    'Speakers (use these exactly): {{speakers}}.',
    'Speaker ids: {{speakerIds}}.',
    'Voices: {{voices}}.',
    'Preserve the source language in the title and spoken segments. Do not translate it.',
    '',
    'SOURCE TEXT (between markers):',
    '<<<SOURCE',
    '{{source}}',
    'SOURCE>>>',
  ].join('\n'),
  repairSystem: 'Fix JSON podcast script so it passes validation. Output corrected JSON object only, no other text.',
  repairUser: 'Validation errors:\n{{validationErrors}}\nReturn corrected JSON only.',
});

export const PROMPT_TEMPLATE_METADATA = Object.freeze({
  scriptSystem: {
    title: 'Script system instructions',
    help: 'Output contract and source-grounding instructions for script generation.',
    requiredPlaceholders: [],
  },
  scriptUser: {
    title: 'Script user instructions',
    help: 'Podcast settings and source placement for script generation.',
    requiredPlaceholders: [
      'formatDescription',
      'tone',
      'audience',
      'speakers',
      'speakerIds',
      'voices',
      'source',
    ],
  },
  repairSystem: {
    title: 'Repair system instructions',
    help: 'Instructions used for one validation-repair request.',
    requiredPlaceholders: [],
  },
  repairUser: {
    title: 'Repair user instructions',
    help: 'Validation errors supplied to one repair request.',
    requiredPlaceholders: ['validationErrors'],
  },
});

/** @param {unknown} id @returns {id is PromptTemplateId} */
export function isPromptTemplateId(id) {
  return TEMPLATE_IDS.includes(/** @type {PromptTemplateId} */ (id));
}

/**
 * @param {PromptTemplateId} id
 * @param {unknown} template
 * @returns {{ valid: true } | { valid: false, errors: string[] }}
 */
export function validatePromptTemplate(id, template) {
  if (!isPromptTemplateId(id)) return { valid: false, errors: ['Unknown prompt template.'] };
  if (typeof template !== 'string' || template.trim() === '') {
    return { valid: false, errors: ['Template must not be empty.'] };
  }
  const errors = PROMPT_TEMPLATE_METADATA[id].requiredPlaceholders
    .filter((name) => !template.includes(`{{${name}}}`))
    .map((name) => `Missing required placeholder {{${name}}}.`);
  return errors.length ? { valid: false, errors } : { valid: true };
}

/** @param {unknown} overrides */
export function resolvePromptTemplates(overrides) {
  const resolved = { ...DEFAULT_PROMPT_TEMPLATES };
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return resolved;
  const records = /** @type {Record<string, unknown>} */ (overrides);
  for (const id of TEMPLATE_IDS) {
    if (validatePromptTemplate(id, records[id]).valid) resolved[id] = /** @type {string} */ (records[id]);
  }
  return resolved;
}

/** @param {string} template @param {Record<string, string | number>} values */
export function renderPromptTemplate(template, values) {
  return template.replace(/{{([a-zA-Z][a-zA-Z0-9]*)}}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
