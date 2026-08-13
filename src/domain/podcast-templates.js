/** Canonical reusable Podcast Episode directions, Formats, and speaker profiles. */

import { AppError } from '../services/errors.js';

/** @typedef {{ id: string, name: string, instructions: string }} FormatTemplate */
/** @typedef {{ id: string, name: string, instructions: string }} EpisodeDirectionTemplate */
/** @typedef {{ id: string, label: string, defaultSpeakerName: string, role: string }} SpeakerProfile */

export const TEMPLATE_NAME_MAX_LENGTH = 100;
export const TEMPLATE_TEXT_MAX_LENGTH = 4000;
export const PODCAST_TEMPLATE_CATALOG_VERSION = 1;

export const STARTER_EPISODE_DIRECTION_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'direction-essential-overview',
    name: 'Essential Overview',
    instructions: 'Prioritize the central argument and the supporting ideas necessary to understand it. Omit secondary material that does not materially improve understanding.',
  }),
  Object.freeze({
    id: 'direction-focused-exploration',
    name: 'Focused Exploration',
    instructions: 'Choose one consequential question, tension, or theme in the source and explore it in depth rather than trying to cover the full source evenly.',
  }),
  Object.freeze({
    id: 'direction-critical-examination',
    name: 'Critical Examination',
    instructions: 'Examine the source\'s claims, assumptions, evidence, implications, and plausible alternatives without requiring opposition or a predetermined verdict.',
  }),
  Object.freeze({
    id: 'direction-practical-interpretation',
    name: 'Practical Interpretation',
    instructions: 'Explain why the source\'s ideas matter and develop implications, applications, or decisions that are supported by the supplied material.',
  }),
]);

export const STARTER_FORMAT_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'format-conversation',
    name: 'Conversation — Exploratory',
    instructions: [
      'Create an exploratory peer conversation using turn contingency, specific uptake, sequence organization, adjacency pairs, recipient design, grounding, repair, epistemic stance, co-construction, lexical pickup, discourse markers, and plausible turn-entry points.',
      'Turn contingency means each contribution depends on the live exchange and would not work equally well elsewhere. Specific uptake means identifying or clearly reusing another speaker’s claim, distinction, question, example, uncertainty, or wording; a generic transition such as “that connects to” is topical continuity, not interpersonal uptake.',
      'Build meaningful sequences in which questions receive responsive answers, clarification requests lead to reformulation, and speakers establish what they understand or still find unresolved. Use recipient design by addressing the particular contribution of the other speaker, and make epistemic stance audible when certainty or evidential basis matters.',
      'Develop explanations through co-construction: one speaker may introduce an idea, another may test or clarify it, and the first may refine it before they reach a shared formulation. Use lexical pickup and discourse markers such as “right,” “so,” “but,” “well,” or “I mean” only when they perform a real conversational function, and end turns where another speaker has a meaningful reason to enter.',
      'Do not create movable self-contained mini-monologues, rotate mechanically, give one participant permanent moderator control, or add decorative filler, generic acknowledgement, arbitrary questions, or forced disagreement.',
      'With one speaker, create a connected spoken exploration without pretending another participant exists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-conversation-critical',
    name: 'Conversation — Critical',
    instructions: [
      'Create a critical peer conversation using turn contingency, specific uptake, sequence organization, adjacency pairs, recipient design, grounding, repair, epistemic stance, co-construction, lexical pickup, discourse markers, and plausible turn-entry points.',
      'Turn contingency means each contribution depends on the live exchange and would not work equally well elsewhere. Specific uptake means identifying or clearly reusing another speaker’s claim, distinction, question, example, uncertainty, or wording; a generic transition such as “that connects to” is topical continuity, not interpersonal uptake.',
      'Organize claim–challenge–response sequences around the actual material. Let speakers test premises, causal inferences, scope, evidence, or implications with counterexamples and focused questions; the response should lead to defense, qualification, concession, repair, or a more precise unresolved disagreement.',
      'Use recipient design and grounding so speakers address the particular objection or answer they received. Make epistemic stance explicit when it matters, allow positions to change or narrow, and co-construct clearer conclusions across turns rather than having each speaker complete an independent case.',
      'Use lexical pickup and discourse markers only when they express a real response, and end turns at plausible points for a consequential reply. Do not create movable mini-monologues, rotate mechanically, add decorative filler, or manufacture misunderstanding, conflict, concession, or consensus.',
      'With one speaker, create a connected critical examination that tests claims and alternatives without simulating another participant.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-conversation-reflective',
    name: 'Conversation — Reflective',
    instructions: [
      'Create a reflective peer conversation using turn contingency, specific uptake, sequence organization, adjacency pairs, recipient design, grounding, repair, epistemic stance, co-construction, lexical pickup, discourse markers, and plausible turn-entry points.',
      'Turn contingency means each contribution depends on the live exchange and would not work equally well elsewhere. Specific uptake means identifying or clearly reusing another speaker’s claim, distinction, question, example, uncertainty, or wording; a generic transition such as “that connects to” is topical continuity, not interpersonal uptake.',
      'Let speakers explore interpretations, implications, tensions, and changes of stance through responsive questions, formulation, clarification, callbacks, and repair. They may revisit an earlier phrase or position and explain how the intervening exchange changed, complicated, or sharpened it.',
      'Use recipient design and grounding to establish shared understanding without assuming agreement. Build insights through co-construction, reuse meaningful language introduced by the other speaker, and use discourse markers only when they show a real shift, qualification, recognition, or hesitation.',
      'End turns where another speaker has a meaningful reason to enter. Do not create movable mini-monologues, rotate mechanically, add decorative filler or generic validation, force disagreement, or invent personal histories and experiences for the speakers.',
      'With one speaker, create a connected reflective exploration without pretending another participant or personal experience exists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-interview',
    name: 'Interview — Explanatory',
    instructions: [
      'Create an explanatory interview with the first speaker as interviewer and the remaining speakers as interviewees when multiple speakers are available. Organize it through question–answer adjacency pairs, answer-dependent follow-up, recipient design, formulation, and clarification.',
      'The interviewee answers the live question before expanding. The interviewer listens for a concrete term, distinction, example, ambiguity, or implication in that answer, briefly formulates their understanding when useful, and lets it determine the next question.',
      'Use clarification requests, definitions, contrasts, examples, and reformulation to build comprehension across sequences. Questions must create a relevant next action rather than disguise the interviewer’s own exposition or announce the next outline section.',
      'When several interviewees are present, they may respond to or extend one another through specific uptake instead of answering in rotation. Avoid a fixed questionnaire, repetitive validation, generic follow-ups, and questions unaffected by the preceding answer.',
      'With one speaker, create a structured spoken exploration without pretending an interviewer or interviewee exists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-interview-investigative',
    name: 'Interview — Investigative',
    instructions: [
      'Create an investigative interview with the first speaker as interviewer and the remaining speakers as interviewees when multiple speakers are available. Organize it through question–answer adjacency pairs, answer-dependent follow-up, recipient design, formulation, and clarification.',
      'The interviewee answers the live question before expanding. The interviewer identifies a specific claim, premise, evidential basis, causal inference, inconsistency, or uncertainty in that answer and uses it to request evidence, test an implication, or ask for greater precision.',
      'Follow-ups make prior answers consequential: an answer may resolve the issue, expose a new question, require repair, or narrow what remains disputed. Formulate the answer fairly before challenging it and distinguish uncertainty from evasion.',
      'When several interviewees are present, allow specific uptake, comparison, and response among them without round-robin questioning. Avoid a fixed questionnaire, outline transitions phrased as questions, repetitive validation, prosecutorial performance, and manufactured contradictions.',
      'With one speaker, create a structured investigative examination without pretending an interviewer or interviewee exists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-interview-interpretive',
    name: 'Interview — Interpretive',
    instructions: [
      'Create an interpretive interview with the first speaker as interviewer and the remaining speakers as interviewees when multiple speakers are available. Organize it through question–answer adjacency pairs, answer-dependent follow-up, recipient design, formulation, and clarification.',
      'The interviewee answers the live question before expanding. The interviewer picks up a specific interpretation, value, tension, implication, or uncertainty in that answer and uses it to explore significance, competing readings, or how the speaker’s stance develops.',
      'Use formulation to test understanding, clarification to distinguish nearby meanings, and callbacks to revisit earlier answers after the discussion has changed their context. Follow-ups must arise from the substance and wording of prior answers rather than from a prepared thematic list.',
      'When several interviewees are present, let them interpret or extend one another through specific uptake without mandatory rotation. Avoid a fixed questionnaire, generic affirmation, questions that merely announce a new topic, invented personal experience, and forced consensus or revelation.',
      'With one speaker, create a structured interpretive exploration without pretending an interviewer or interviewee exists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-narrative',
    name: 'Narrative — Chronological',
    instructions: [
      'Create a coherent non-interactive chronological narrative using discourse cohesion, anaphoric reference, temporal deixis, a stable narrative viewpoint, callbacks, information continuity, and purposeful handoffs.',
      'Orient the listener in time, establish the relevant sequence or stages, and make turning points legible. Use references such as “that decision,” “the earlier claim,” or “by this point” to carry established information forward instead of repeatedly restarting context.',
      'With multiple speakers, assign complementary narrative functions and make each handoff inherit the current time, subject, and listener position. A new speaker continues the narrative thread rather than addressing the prior narrator as a conversational partner.',
      'Do not fabricate scenes, chronology, quotations, or experience, and do not turn the narrative into an interview, panel, or simulated conversation.',
      'With one speaker, sustain the narrative without implying absent participants.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-narrative-causal',
    name: 'Narrative — Causal',
    instructions: [
      'Create a coherent non-interactive causal narrative using discourse cohesion, anaphoric reference, causal deixis, a stable narrative viewpoint, callbacks, information continuity, and purposeful handoffs.',
      'Organize the material around mechanisms, dependencies, causes, consequences, and turning points. Distinguish sequence from causation and carry earlier conditions forward through clear references so later effects remain connected to what produced them.',
      'With multiple speakers, assign complementary narrative functions and make each handoff inherit the active mechanism, question, and listener position. A new speaker develops the causal thread rather than addressing the prior narrator as a conversational partner.',
      'Do not fabricate mechanisms, evidence, events, or experience, and do not turn the narrative into an interview, panel, or simulated conversation.',
      'With one speaker, sustain the causal development without implying absent participants.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-narrative-thematic',
    name: 'Narrative — Thematic',
    instructions: [
      'Create a coherent non-interactive thematic narrative using discourse cohesion, anaphoric reference, thematic progression, a stable narrative viewpoint, callbacks, information continuity, and purposeful handoffs.',
      'Develop a small number of meaningful motifs, contrasts, or recurring questions. Revisit them with added context rather than restating the thesis, and use explicit reference to show how a later passage changes or deepens an earlier theme.',
      'With multiple speakers, assign complementary narrative functions and make each handoff inherit the active theme and listener position. A new speaker continues the thematic thread rather than addressing the prior narrator as a conversational partner.',
      'Do not fabricate scenes, evidence, quotations, or experience, and do not turn the narrative into an interview, panel, or simulated conversation.',
      'With one speaker, sustain the thematic development without implying absent participants.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-lecture',
    name: 'Lecture — Conceptual',
    instructions: [
      'Create a non-interactive conceptual lecture using cumulative conceptual scaffolding, information structure, listener-oriented metadiscourse, restrained consolidation, and teaching-function handoffs.',
      'Build understanding through a deliberate progression from definition to distinction, mechanism, implication, and consolidation. Introduce terminology when necessary, connect new claims to established concepts, and signal why each conceptual move matters without repeatedly announcing the outline.',
      'With multiple speakers, assign complementary teaching functions and preserve the conceptual thread across handoffs; a handoff may move from definition to example or mechanism to implication but must not simulate an exchange.',
      'Do not use fake listener questions, personified objections, interview behavior, panel behavior, or repetitive thesis restatement.',
      'With one speaker, deliver the explanation without implying other participants.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-lecture-case-led',
    name: 'Lecture — Case-led',
    instructions: [
      'Create a non-interactive case-led lecture using cumulative conceptual scaffolding, information structure, listener-oriented metadiscourse, restrained consolidation, and teaching-function handoffs.',
      'Move deliberately from a supported concrete case to the relevant general concept and back to the case to test or clarify the abstraction. Make the inferential bridge explicit, distinguish an example from general evidence, and frame any hypothetical illustration clearly as hypothetical.',
      'With multiple speakers, assign complementary teaching functions and preserve the conceptual thread across handoffs; a handoff may move from case description to analysis or from principle to application but must not simulate an exchange.',
      'Do not invent cases or experiences, use fake listener questions, turn examples into unsupported proof, or introduce interview or panel behavior.',
      'With one speaker, deliver the case-led explanation without implying other participants.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-lecture-argumentative',
    name: 'Lecture — Argumentative',
    instructions: [
      'Create a non-interactive argumentative lecture using cumulative conceptual scaffolding, information structure, listener-oriented metadiscourse, restrained consolidation, and teaching-function handoffs.',
      'Develop a deliberate progression from thesis to support, objection, qualification, and conclusion. State what an objection targets, explain its force fairly, and show whether the argument answers it, narrows its claim, or leaves a limitation unresolved.',
      'With multiple speakers, assign complementary teaching functions and preserve the argumentative thread across handoffs; speakers may present different parts of the reasoning but must not personify objections as a debate or simulated dialogue.',
      'Do not use fake listener questions, interview behavior, panel behavior, manufactured controversy, or repetitive thesis restatement.',
      'With one speaker, deliver the argumentative explanation without implying other participants.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-panel-discussion',
    name: 'Panel Discussion — Exploratory',
    instructions: [
      'Create an exploratory panel discussion with the first speaker as moderator and the remaining speakers as panelists when multiple speakers are available. Use moderator framing, panelist-to-panelist specific uptake, multi-party sequence organization, recipient design, and selective moderator synthesis.',
      'Specific uptake means a panelist identifies or clearly reuses another panelist’s claim, distinction, example, question, or wording. Panelists develop complementary perspectives by extending, clarifying, connecting, or productively complicating one another’s contributions rather than delivering adjacent expert statements.',
      'The moderator establishes the live issue, redirects when the exchange loses it, and formulates shared ground or unresolved questions only when useful. Panelists may address one another directly without moderator mediation, and participation follows conversational relevance rather than a fixed round.',
      'Do not force controversy, consensus, equal turn counts, repetitive moderator summaries, generic acknowledgement, or mechanical speaker rotation.',
      'With one speaker, create an analytical briefing without simulating a moderator or absent panelists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-panel-discussion-critical',
    name: 'Panel Discussion — Critical',
    instructions: [
      'Create a critical panel discussion with the first speaker as moderator and the remaining speakers as panelists when multiple speakers are available. Use moderator framing, panelist-to-panelist specific uptake, multi-party sequence organization, recipient design, and selective moderator synthesis.',
      'Specific uptake means a panelist identifies or clearly reuses another panelist’s claim, inference, example, question, or wording. Organize consequential challenge–response sequences in which counterexamples, qualifications, repair, concession, or a precisely stated unresolved disagreement can change the discussion.',
      'The moderator establishes the live issue, requests clarification or redirects when necessary, and synthesizes only when it helps distinguish positions. Panelists may challenge and answer one another directly without moderator mediation or mandatory turns.',
      'Do not manufacture controversy, concession, consensus, equal turn counts, repetitive moderator summaries, generic objections, or mechanical speaker rotation.',
      'With one speaker, create a critical analytical briefing without simulating a moderator or absent panelists.',
    ].join(' '),
  }),
  Object.freeze({
    id: 'format-panel-discussion-comparative',
    name: 'Panel Discussion — Comparative',
    instructions: [
      'Create a comparative panel discussion with the first speaker as moderator and the remaining speakers as panelists when multiple speakers are available. Use moderator framing, panelist-to-panelist specific uptake, multi-party sequence organization, recipient design, and selective moderator synthesis.',
      'Establish meaningful comparison dimensions before contrasting explanations, frameworks, implications, or tradeoffs. Specific uptake means a panelist identifies or clearly reuses another panelist’s distinction, criterion, example, or conclusion and explains how it changes the comparison.',
      'The moderator keeps comparison criteria stable, surfaces false equivalence or mismatched scope when necessary, and synthesizes agreements, differences, and unresolved tradeoffs without mediating every contribution. Panelists may compare and respond to one another directly without moderator mediation or fixed rounds.',
      'Do not force controversy, consensus, superficial balance, equal turn counts, repetitive moderator summaries, or mechanical speaker rotation.',
      'With one speaker, create a comparative analytical briefing without simulating a moderator or absent panelists.',
    ].join(' '),
  }),
]);

export const STARTER_SPEAKER_PROFILES = Object.freeze([
  Object.freeze({
    id: 'profile-host',
    label: 'Host — Facilitator',
    defaultSpeakerName: 'Maya',
    role: 'Maintains listener orientation, grounding, topic management, and continuity. Uses formulation—briefly restating or connecting a contribution—to clarify what is currently at issue, then makes room for the participation the selected Format requires. Moderates only when the Format assigns moderation and avoids announcing every transition, summarizing every turn, or using generic validation. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-host-peer-cohost',
    label: 'Host — Peer Co-host',
    defaultSpeakerName: 'Maya',
    role: 'Participates as a peer through specific uptake, lexical pickup, clarification, and co-construction. Responds to an identifiable claim, distinction, question, example, or wording and adds something that changes or develops the live issue rather than merely announcing a transition. Avoids permanent moderator behavior, generic acknowledgements, and summaries that close an exchange prematurely. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-host-synthesizer',
    label: 'Host — Synthesizer',
    defaultSpeakerName: 'Maya',
    role: 'Uses formulation, callbacks, comparison, and provisional synthesis to identify shared ground, meaningful differences, and unresolved questions. A synthesis should respond to the contributions actually made and create a useful next step rather than restating completed turns. Avoids monopolizing transitions, imposing consensus, or repeatedly resetting the topic for the audience. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-interviewer',
    label: 'Interviewer — Clarifier',
    defaultSpeakerName: 'Rowan',
    role: 'Develops inquiry through clarification requests, definitions, examples, distinctions, and reformulation. Uses specific wording or uncertainty from the prior substance to ask a concise question that creates a meaningful next action, and tests understanding through fair formulation rather than repetitive validation. Avoids a fixed questionnaire and questions that merely announce the next topic. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-interviewer-investigator',
    label: 'Interviewer — Investigator',
    defaultSpeakerName: 'Rowan',
    role: 'Develops answer-dependent inquiry by testing a specific claim, premise, evidential basis, causal inference, inconsistency, or uncertainty. Formulates the prior position fairly, requests precision or discriminating evidence, and lets the response resolve, narrow, or redirect the investigation. Avoids prosecutorial performance, generic suspicion, and prepared questions unaffected by prior substance. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-interviewer-interpretive',
    label: 'Interviewer — Interpretive',
    defaultSpeakerName: 'Rowan',
    role: 'Develops inquiry around meaning, significance, competing readings, implications, and changes of epistemic stance. Uses formulation and callbacks to test whether an interpretation has been understood, then follows a specific tension or consequence from the prior substance. Avoids vague invitations to elaborate, manufactured revelation, and questions that merely advance an outline. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-expert',
    label: 'Expert — Explainer',
    defaultSpeakerName: 'Leah',
    role: 'Responds to the live issue before elaborating and makes difficult material understandable through definitions, distinctions, examples, and conceptual scaffolding. Uses specific uptake when another contribution supplies the question, objection, or terminology, and distinguishes the source’s claims from analysis or interpretation. Avoids replacing every exchange or handoff with a complete lecture and never invents authority or personal experience. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-expert-analyst',
    label: 'Expert — Analyst',
    defaultSpeakerName: 'Leah',
    role: 'Separates claims, evidence, inference, assumptions, and uncertainty while responding to the current issue before expanding. Makes epistemic stance explicit when the basis or confidence of a conclusion matters, and uses repair to correct a premise, narrow a claim, or reformulate an explanation when the developing material warrants it. Avoids false precision, exhaustive independent lectures, and invented authority or experience. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-expert-contextualizer',
    label: 'Expert — Contextualizer',
    defaultSpeakerName: 'Leah',
    role: 'Connects the current issue to relevant history, systems, comparisons, dependencies, or consequences without abandoning the live thread. Makes the relationship between context and claim explicit, distinguishes background from evidence, and returns the added context to the question or progression already established. Avoids context dumps, unsupported generalization, and invented authority or personal experience. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-narrator',
    label: 'Narrator — Chronological',
    defaultSpeakerName: 'Nora',
    role: 'Maintains listener position, temporal orientation, sequence, narrative viewpoint, and anaphoric continuity. Uses callbacks and clear references to carry established people, events, claims, or stages across transitions and handoffs without restarting the topic. Avoids fabricated scenes and unnecessary recaps. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-narrator-causal',
    label: 'Narrator — Causal',
    defaultSpeakerName: 'Nora',
    role: 'Maintains listener position and continuity across mechanisms, dependencies, turning points, causes, and consequences. Uses anaphoric reference and callbacks to show how an established condition produces or constrains what follows, while distinguishing chronology from causation. Avoids fabricated mechanisms and repetitive causal summaries. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-narrator-thematic',
    label: 'Narrator — Thematic',
    defaultSpeakerName: 'Nora',
    role: 'Maintains listener position and continuity through recurring themes, motifs, contrasts, and callbacks. Reintroduces an earlier idea only when new context changes, deepens, or complicates it, and keeps handoffs connected to the active thematic thread. Avoids thesis restatement, fabricated symbolism, and topic resets. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-skeptic',
    label: 'Skeptic — Evidence Auditor',
    defaultSpeakerName: 'Elias',
    role: 'Tests the stated evidential basis of a specific claim and distinguishes observation, testimony, cited evidence, inference, and interpretation. Makes the object of doubt explicit and treats the response as consequential by accepting a resolved point, narrowing the concern, or identifying what evidence remains necessary. Avoids generic suspicion and serial objections that ignore prior answers. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-skeptic-scope-critic',
    label: 'Skeptic — Scope Critic',
    defaultSpeakerName: 'Elias',
    role: 'Tests a specific definition, category boundary, ambiguity, comparison, or generalization and asks whether a conclusion exceeds its premises. Makes the disputed scope explicit and treats clarification or repair as consequential by accepting a resolved distinction or narrowing what remains problematic. Avoids semantic nitpicking and objections that merely repeat after a definition has been supplied. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
  Object.freeze({
    id: 'profile-skeptic-alternative-hypothesis-tester',
    label: 'Skeptic — Alternative-Hypothesis Tester',
    defaultSpeakerName: 'Elias',
    role: 'Introduces plausible competing explanations for a specific observation or inference and asks what evidence would discriminate among them. Responds to the treatment of those alternatives by accepting eliminated possibilities, refining the comparison, or stating precisely what remains underdetermined. Avoids possibility dumping, reflexive contrarianism, and alternatives unsupported by the material. Apply these tendencies only through the participation structure allowed by the selected Format; do not introduce moderation, dialogue, or speaker relationships that the Format does not assign.',
  }),
]);

export function starterFormatTemplates() {
  return STARTER_FORMAT_TEMPLATES.map((record) => ({ ...record }));
}

export function starterEpisodeDirectionTemplates() {
  return STARTER_EPISODE_DIRECTION_TEMPLATES.map((record) => ({ ...record }));
}

export function starterSpeakerProfiles() {
  return STARTER_SPEAKER_PROFILES.map((record) => ({ ...record }));
}

/** Replace bundled Format IDs once while retaining custom records and name ownership. */
export function replaceFormatStarterCatalog(records) {
  return replaceStarterCatalog(records, STARTER_FORMAT_TEMPLATES, (record) => record.name);
}

/** Replace bundled Speaker Profile IDs once while retaining custom records and name ownership. */
export function replaceSpeakerProfileStarterCatalog(records) {
  return replaceStarterCatalog(records, STARTER_SPEAKER_PROFILES, (record) => record.label);
}

/** @param {unknown} value */
export function normalizeFormatTemplate(value) {
  if (!isRecord(value) || !isStableId(value.id)) return null;
  const name = boundedText(value.name, { required: true, max: TEMPLATE_NAME_MAX_LENGTH });
  const instructions = boundedText(value.instructions, { required: true, max: TEMPLATE_TEXT_MAX_LENGTH });
  return name !== null && instructions !== null
    ? { id: value.id, name, instructions }
    : null;
}

export const normalizeEpisodeDirectionTemplate = normalizeFormatTemplate;

/** @param {unknown} value */
export function normalizeSpeakerProfile(value) {
  if (!isRecord(value) || !isStableId(value.id)) return null;
  const label = boundedText(value.label, { required: true, max: TEMPLATE_NAME_MAX_LENGTH });
  const defaultSpeakerName = boundedText(value.defaultSpeakerName ?? '', {
    required: false,
    max: TEMPLATE_NAME_MAX_LENGTH,
  });
  const role = boundedText(value.role, { required: true, max: TEMPLATE_TEXT_MAX_LENGTH });
  return label !== null && defaultSpeakerName !== null && role !== null
    ? { id: value.id, label, defaultSpeakerName, role }
    : null;
}

/** @param {unknown} value */
export function normalizeFormatTemplates(value) {
  return normalizeCollection(value, normalizeFormatTemplate, (record) => record.name);
}

export function normalizeEpisodeDirectionTemplates(value) {
  return normalizeCollection(value, normalizeEpisodeDirectionTemplate, (record) => record.name);
}

/** @param {unknown} value */
export function normalizeSpeakerProfiles(value) {
  return normalizeCollection(value, normalizeSpeakerProfile, (record) => record.label);
}

/** @param {unknown} value */
export function isValidFormatTemplateCollection(value) {
  return Array.isArray(value) && normalizeFormatTemplates(value).length === value.length;
}

export function isValidEpisodeDirectionTemplateCollection(value) {
  return Array.isArray(value) && normalizeEpisodeDirectionTemplates(value).length === value.length;
}

/** @param {unknown} value */
export function isValidSpeakerProfileCollection(value) {
  return Array.isArray(value) && normalizeSpeakerProfiles(value).length === value.length;
}

/**
 * @param {{ name?: unknown, instructions?: unknown }} input
 * @param {{ id: string, name: string }[]} records
 * @param {string | null} [existingId]
 */
export function validateFormatTemplateInput(input, records, existingId = null) {
  const name = requireText(input.name, 'Format name', TEMPLATE_NAME_MAX_LENGTH);
  const instructions = requireText(input.instructions, 'Format instructions', TEMPLATE_TEXT_MAX_LENGTH);
  requireUniqueName(name, records, existingId, (record) => record.name, 'format template');
  return { name, instructions };
}

export function validateEpisodeDirectionTemplateInput(input, records, existingId = null) {
  const name = requireText(input.name, 'Episode direction name', TEMPLATE_NAME_MAX_LENGTH);
  const instructions = requireText(input.instructions, 'Episode direction instructions', TEMPLATE_TEXT_MAX_LENGTH);
  requireUniqueName(name, records, existingId, (record) => record.name, 'episode direction');
  return { name, instructions };
}

/**
 * @param {{ label?: unknown, defaultSpeakerName?: unknown, role?: unknown }} input
 * @param {{ id: string, label: string }[]} records
 * @param {string | null} [existingId]
 */
export function validateSpeakerProfileInput(input, records, existingId = null) {
  const label = requireText(input.label, 'Profile label', TEMPLATE_NAME_MAX_LENGTH);
  const defaultSpeakerName = optionalText(input.defaultSpeakerName, 'Default speaker name', TEMPLATE_NAME_MAX_LENGTH);
  const role = requireText(input.role, 'Role', TEMPLATE_TEXT_MAX_LENGTH);
  requireUniqueName(label, records, existingId, (record) => record.label, 'speaker profile');
  return { label, defaultSpeakerName, role };
}

function normalizeCollection(value, normalize, getName) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const ids = new Set();
  const names = new Set();
  for (const valueRecord of value) {
    const record = normalize(valueRecord);
    if (!record) continue;
    const normalizedName = getName(record).toLowerCase();
    if (ids.has(record.id) || names.has(normalizedName)) continue;
    ids.add(record.id);
    names.add(normalizedName);
    result.push(record);
  }
  return result;
}

function replaceStarterCatalog(current, starters, getName) {
  const starterIds = new Set(starters.map((record) => record.id));
  const custom = current.filter((record) => !starterIds.has(record.id));
  const customNames = new Set(custom.map((record) => getName(record).toLowerCase()));
  const availableStarters = starters
    .filter((record) => !customNames.has(getName(record).toLowerCase()))
    .map((record) => ({ ...record }));
  return [...availableStarters, ...custom.map((record) => ({ ...record }))];
}

function requireText(value, label, max) {
  const normalized = boundedText(value, { required: true, max });
  if (normalized === null) {
    const empty = typeof value !== 'string' || value.trim() === '';
    throw validationError(empty ? `${label} is required.` : `${label} must be ${max} characters or fewer.`);
  }
  return normalized;
}

function optionalText(value, label, max) {
  const normalized = boundedText(value ?? '', { required: false, max });
  if (normalized === null) throw validationError(`${label} must be ${max} characters or fewer.`);
  return normalized;
}

function boundedText(value, { required, max }) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) return null;
  return normalized;
}

function requireUniqueName(name, records, existingId, getName, kind) {
  const duplicate = records.some((record) =>
    record.id !== existingId && getName(record).toLowerCase() === name.toLowerCase());
  if (duplicate) throw validationError(`A ${kind} named “${name}” already exists.`);
}

function isStableId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validationError(message) {
  return new AppError({ kind: 'validation', message, retryable: false, status: undefined });
}
