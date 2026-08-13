/** Canonical session-only editorial plan contract. */

export const EPISODE_PLAN_SCHEMA_VERSION = 1;
export const MAX_PLAN_ITEMS = 12;
export const PLAN_TITLE_MAX_LENGTH = 200;
export const PLAN_TEXT_MAX_LENGTH = 4000;

/**
 * @typedef {Object} EpisodePlan
 * @property {number} schemaVersion
 * @property {string} workingTitle
 * @property {string} editorialGoal
 * @property {string} listenerPromise
 * @property {string} formatApproach
 * @property {string[]} priorities
 * @property {string[]} exclusions
 * @property {{ speakerId: string, contribution: string }[]} speakerContributions
 * @property {{ id: string, title: string, purpose: string }[]} beats
 * @property {string} ending
 */

/**
 * @param {unknown} value
 * @param {string[]} speakerIds
 * @returns {{ valid: true, plan: EpisodePlan } | { valid: false, errors: string[] }}
 */
export function validateEpisodePlan(value, speakerIds) {
  const errors = [];
  if (!isRecord(value)) return { valid: false, errors: ['Episode plan must be an object.'] };
  if (value.schemaVersion !== EPISODE_PLAN_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${EPISODE_PLAN_SCHEMA_VERSION}.`);
  }
  validateText(value.workingTitle, 'workingTitle', PLAN_TITLE_MAX_LENGTH, errors);
  validateText(value.editorialGoal, 'editorialGoal', PLAN_TEXT_MAX_LENGTH, errors);
  validateText(value.listenerPromise, 'listenerPromise', PLAN_TEXT_MAX_LENGTH, errors);
  validateText(value.formatApproach, 'formatApproach', PLAN_TEXT_MAX_LENGTH, errors);
  validateText(value.ending, 'ending', PLAN_TEXT_MAX_LENGTH, errors);
  validateTextList(value.priorities, 'priorities', 1, errors);
  validateTextList(value.exclusions, 'exclusions', 0, errors);

  const expectedIds = Array.isArray(speakerIds) ? speakerIds : [];
  if (!Array.isArray(value.speakerContributions)) {
    errors.push('speakerContributions must be an array.');
  } else {
    const seen = new Set();
    for (const [index, contribution] of value.speakerContributions.entries()) {
      if (!isRecord(contribution)) {
        errors.push(`speakerContributions[${index}] must be an object.`);
        continue;
      }
      if (!expectedIds.includes(contribution.speakerId)) {
        errors.push(`speakerContributions[${index}].speakerId must reference a current speaker.`);
      } else if (seen.has(contribution.speakerId)) {
        errors.push(`speakerContributions contains duplicate speakerId “${contribution.speakerId}”.`);
      } else {
        seen.add(contribution.speakerId);
      }
      validateText(
        contribution.contribution,
        `speakerContributions[${index}].contribution`,
        PLAN_TEXT_MAX_LENGTH,
        errors,
      );
    }
    for (const id of expectedIds) {
      if (!seen.has(id)) errors.push(`speakerContributions must include speakerId “${id}”.`);
    }
    if (value.speakerContributions.length !== expectedIds.length) {
      errors.push('speakerContributions must contain exactly one entry for every current speaker.');
    }
  }

  if (!Array.isArray(value.beats) || value.beats.length < 1 || value.beats.length > MAX_PLAN_ITEMS) {
    errors.push(`beats must contain 1-${MAX_PLAN_ITEMS} entries.`);
  } else {
    const beatIds = new Set();
    for (const [index, beat] of value.beats.entries()) {
      if (!isRecord(beat)) {
        errors.push(`beats[${index}] must be an object.`);
        continue;
      }
      if (!isStableId(beat.id)) errors.push(`beats[${index}].id must be a stable ASCII id.`);
      else if (beatIds.has(beat.id)) errors.push(`beats contains duplicate id “${beat.id}”.`);
      else beatIds.add(beat.id);
      validateText(beat.title, `beats[${index}].title`, PLAN_TITLE_MAX_LENGTH, errors);
      validateText(beat.purpose, `beats[${index}].purpose`, PLAN_TEXT_MAX_LENGTH, errors);
    }
  }

  return errors.length
    ? { valid: false, errors }
    : { valid: true, plan: normalizeEpisodePlan(value, expectedIds) };
}

/** @param {Record<string, unknown>} value @param {string[]} speakerIds @returns {EpisodePlan} */
export function normalizeEpisodePlan(value, speakerIds) {
  const contributions = new Map(
    value.speakerContributions.map((entry) => [entry.speakerId, entry.contribution.trim()]),
  );
  return {
    schemaVersion: EPISODE_PLAN_SCHEMA_VERSION,
    workingTitle: value.workingTitle.trim(),
    editorialGoal: value.editorialGoal.trim(),
    listenerPromise: value.listenerPromise.trim(),
    formatApproach: value.formatApproach.trim(),
    priorities: value.priorities.map((item) => item.trim()),
    exclusions: value.exclusions.map((item) => item.trim()),
    speakerContributions: speakerIds.map((speakerId) => ({
      speakerId,
      contribution: contributions.get(speakerId),
    })),
    beats: value.beats.map((beat) => ({
      id: beat.id,
      title: beat.title.trim(),
      purpose: beat.purpose.trim(),
    })),
    ending: value.ending.trim(),
  };
}

function validateText(value, path, maxLength, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${path} must be non-empty text.`);
  else if (value.trim().length > maxLength) errors.push(`${path} must be ${maxLength} characters or fewer.`);
}

function validateTextList(value, path, minimum, errors) {
  if (!Array.isArray(value) || value.length < minimum || value.length > MAX_PLAN_ITEMS) {
    errors.push(`${path} must contain ${minimum}-${MAX_PLAN_ITEMS} entries.`);
    return;
  }
  value.forEach((item, index) => validateText(item, `${path}[${index}]`, PLAN_TEXT_MAX_LENGTH, errors));
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStableId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
}
