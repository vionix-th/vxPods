import { textAreaField, textField } from '../../components/fields.js';
import { createErrorScope } from '../../components/error-message.js';

/**
 * Structured, session-only EpisodePlan review and editing surface.
 *
 * @param {Object} args
 * @param {(plan: import('../../domain/episode-plan-schema.js').EpisodePlan) => import('../../domain/episode-plan-schema.js').EpisodePlan} args.onApply
 * @param {() => void | Promise<void>} args.onGenerate
 * @param {(request: string) => void | Promise<void>} args.onRevise
 * @param {() => void | Promise<void>} args.onCreateNew
 * @param {() => void} [args.onCancelGeneration]
 * @param {(message: string) => void} [args.announce]
 * @param {(editing: boolean) => void} [args.onEditingChange]
 */
export function createEpisodePlanReview({
  onApply,
  onGenerate,
  onRevise,
  onCreateNew,
  onCancelGeneration = () => {},
  announce = () => {},
  onEditingChange = () => {},
}) {
  const element = document.createElement('section');
  element.className = 'episode-plan card-subsection';
  element.hidden = true;
  element.tabIndex = -1;
  const heading = document.createElement('h3');
  heading.textContent = 'Editorial plan';
  const stale = document.createElement('p');
  stale.className = 'inline-notice inline-notice-warning';
  stale.hidden = true;
  stale.textContent = 'This plan reflects earlier source or podcast settings. Update it before writing a new script.';
  const content = document.createElement('div');
  const errors = createErrorScope();
  const actions = document.createElement('div');
  actions.className = 'action-row';
  const generate = button('Generate script from plan', 'button-primary');
  const edit = button('Edit plan', 'button-secondary');
  const cancelEdit = button('Cancel edits', 'button-ghost');
  cancelEdit.hidden = true;
  const cancelGeneration = button('Cancel generation', 'button-secondary');
  cancelGeneration.hidden = true;
  const createNew = button('Create new plan', 'button-secondary');
  actions.append(generate, edit, cancelEdit, cancelGeneration, createNew);
  const revisionGroup = document.createElement('div');
  revisionGroup.className = 'episode-plan-revision';
  const revision = textAreaField({
    label: 'Ask for changes to this plan',
    rows: 3,
    help: 'The model returns a complete replacement plan using the current source and podcast settings.',
  });
  const revise = button('Revise plan', 'button-secondary');
  revisionGroup.append(revision.wrapper, revise);
  // Keep revision in the reading flow: review the plan, request changes, then
  // choose a transition such as generating the script or creating a new plan.
  element.append(heading, stale, content, revisionGroup, actions);

  /** @type {import('../../domain/episode-plan-schema.js').EpisodePlan | null} */
  let current = null;
  /** @type {import('./podcast-script.js').PodcastPreferences | null} */
  let prefs = null;
  /** @type {import('../../domain/episode-plan-schema.js').EpisodePlan | null} */
  let editDraft = null;
  let uiState = { stale: false, busy: false, cancelling: false, offline: false };

  const isEditing = () => editDraft !== null;

  function syncActions() {
    const editing = isEditing();
    edit.textContent = editing ? 'Save edits' : 'Edit plan';
    edit.disabled = Boolean(uiState.busy);
    cancelEdit.hidden = !editing;
    cancelGeneration.hidden = !uiState.busy;
    cancelGeneration.disabled = Boolean(uiState.cancelling);
    generate.disabled = Boolean(editing || uiState.stale || uiState.busy || uiState.offline);
    createNew.disabled = Boolean(editing || uiState.busy || uiState.offline);
    revisionGroup.hidden = editing;
    revise.disabled = Boolean(uiState.busy || uiState.offline);
    revision.input.disabled = Boolean(uiState.busy || uiState.offline);
  }

  function renderReadOnly() {
    content.replaceChildren();
    if (current) content.append(readView(current, prefs));
  }

  function renderEditable({ focusSelector } = {}) {
    if (!editDraft) return;
    content.replaceChildren();
    const form = document.createElement('form');
    form.className = 'episode-plan-form';
    form.noValidate = true;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveEdits();
    });

    const workingTitle = textField({ label: 'Working title', value: editDraft.workingTitle, required: true });
    workingTitle.input.maxLength = 200;
    workingTitle.input.addEventListener('input', () => { editDraft.workingTitle = workingTitle.input.value; });
    const editorialGoal = draftTextArea('Editorial goal', 'editorialGoal', 3);
    const listenerPromise = draftTextArea('Listener promise', 'listenerPromise', 3);
    const formatApproach = draftTextArea('Format approach', 'formatApproach', 3);
    const ending = draftTextArea('Ending', 'ending', 3);

    const priorities = editableTextList('Priorities', editDraft.priorities, {
      minimum: 1,
      onRender: renderEditable,
    });
    const exclusions = editableTextList('Exclusions', editDraft.exclusions, {
      minimum: 0,
      onRender: renderEditable,
    });
    const contributions = document.createElement('fieldset');
    const contributionLegend = document.createElement('legend');
    contributionLegend.textContent = 'Speaker contributions';
    contributions.append(contributionLegend);
    editDraft.speakerContributions.forEach((entry, index) => {
      const speaker = prefs?.speakers.find((item) => item.id === entry.speakerId);
      const field = textAreaField({
        label: `${speaker?.name ?? entry.speakerId} contribution`,
        value: entry.contribution,
        required: true,
        rows: 2,
      });
      field.input.maxLength = 4000;
      field.input.dataset.planFocus = `contribution-${index}`;
      field.input.addEventListener('input', () => { entry.contribution = field.input.value; });
      contributions.append(field.wrapper);
    });
    const beats = editableBeats(editDraft.beats, renderEditable);

    form.append(
      workingTitle.wrapper,
      editorialGoal.wrapper,
      listenerPromise.wrapper,
      formatApproach.wrapper,
      priorities,
      exclusions,
      contributions,
      beats,
      ending.wrapper,
    );
    content.append(form);
    if (focusSelector) content.querySelector(focusSelector)?.focus();

    function draftTextArea(label, key, rows) {
      const field = textAreaField({ label, value: editDraft[key], required: true, rows });
      field.input.maxLength = 4000;
      field.input.addEventListener('input', () => { editDraft[key] = field.input.value; });
      return field;
    }
  }

  function enterEditMode() {
    if (!current) return;
    editDraft = structuredClone(current);
    onEditingChange(true);
    errors.clear();
    syncActions();
    renderEditable();
    content.querySelector('input, textarea')?.focus();
    announce('Editing editorial plan. Save or cancel edits before writing the script.');
  }

  function exitEditMode({ restoreFocus = false } = {}) {
    const wasEditing = isEditing();
    editDraft = null;
    syncActions();
    renderReadOnly();
    if (wasEditing) onEditingChange(false);
    if (restoreFocus) edit.focus();
  }

  function saveEdits() {
    if (!editDraft) return;
    errors.clear();
    try {
      current = onApply(structuredClone(editDraft));
      exitEditMode({ restoreFocus: true });
      announce('Editorial plan edits saved.');
    } catch (error) {
      errors.show(error);
      announce('Editorial plan edits could not be saved. Correct the plan and try again.');
    }
  }

  edit.addEventListener('click', () => {
    if (isEditing()) saveEdits();
    else enterEditMode();
  });
  cancelEdit.addEventListener('click', () => {
    errors.clear();
    exitEditMode({ restoreFocus: true });
    announce('Editorial plan edits cancelled.');
  });
  cancelGeneration.addEventListener('click', () => onCancelGeneration());
  createNew.addEventListener('click', () => onCreateNew());
  generate.addEventListener('click', () => onGenerate());
  revise.addEventListener('click', async () => {
    errors.clear();
    try {
      await onRevise(revision.input.value);
      revision.input.value = '';
    } catch (error) {
      errors.show(error);
    }
  });

  return {
    element,
    errors,
    isEditing,
    update(plan, nextPrefs, state = {}) {
      current = plan;
      prefs = nextPrefs;
      uiState = {
        stale: Boolean(state.stale),
        busy: Boolean(state.busy),
        cancelling: Boolean(state.cancelling),
        offline: Boolean(state.offline),
      };
      if (!plan) {
        element.hidden = true;
        editDraft = null;
        errors.clear();
        return;
      }
      element.hidden = false;
      stale.hidden = !uiState.stale;
      syncActions();
      // Controller and connectivity updates must not replace in-progress edits.
      if (!isEditing()) renderReadOnly();
    },
    reset() {
      const wasEditing = isEditing();
      current = null;
      prefs = null;
      editDraft = null;
      uiState = { stale: false, busy: false, cancelling: false, offline: false };
      revision.input.value = '';
      errors.clear();
      element.hidden = true;
      if (wasEditing) onEditingChange(false);
    },
  };
}

function readView(plan, prefs) {
  const fragment = document.createDocumentFragment();
  fragment.append(
    readSection('Working title', plan.workingTitle),
    readSection('Editorial goal', plan.editorialGoal),
    readSection('Listener promise', plan.listenerPromise),
    readSection('Format approach', plan.formatApproach),
    readList('Priorities', plan.priorities),
    readList('Exclusions', plan.exclusions, 'No explicit exclusions.'),
  );
  const contributions = document.createElement('section');
  const heading = document.createElement('h4');
  heading.textContent = 'Speaker contributions';
  const list = document.createElement('dl');
  for (const entry of plan.speakerContributions) {
    const name = document.createElement('dt');
    name.textContent = prefs?.speakers.find((speaker) => speaker.id === entry.speakerId)?.name ?? entry.speakerId;
    const description = document.createElement('dd');
    description.textContent = entry.contribution;
    list.append(name, description);
  }
  contributions.append(heading, list);
  const beats = document.createElement('section');
  const beatHeading = document.createElement('h4');
  beatHeading.textContent = 'Episode progression';
  const beatList = document.createElement('ol');
  for (const beat of plan.beats) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = beat.title;
    const purpose = document.createElement('p');
    purpose.textContent = beat.purpose;
    item.append(title, purpose);
    beatList.append(item);
  }
  beats.append(beatHeading, beatList);
  fragment.append(contributions, beats, readSection('Ending', plan.ending));
  return fragment;
}

function readSection(titleText, value) {
  const section = document.createElement('section');
  const title = document.createElement('h4');
  title.textContent = titleText;
  const text = document.createElement('p');
  text.textContent = value;
  section.append(title, text);
  return section;
}

function readList(titleText, values, emptyText = '') {
  const section = document.createElement('section');
  const title = document.createElement('h4');
  title.textContent = titleText;
  if (!values.length) {
    const empty = document.createElement('p');
    empty.textContent = emptyText;
    section.append(title, empty);
    return section;
  }
  const list = document.createElement('ul');
  for (const value of values) {
    const item = document.createElement('li');
    item.textContent = value;
    list.append(item);
  }
  section.append(title, list);
  return section;
}

function editableTextList(titleText, values, { minimum, onRender }) {
  const element = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = titleText;
  const rows = document.createElement('div');
  rows.className = 'episode-plan-edit-list';
  values.forEach((value, index) => {
    const row = document.createElement('div');
    row.className = 'episode-plan-edit-row';
    const field = textAreaField({ label: `${titleText.slice(0, -1)} ${index + 1}`, value, required: true, rows: 2 });
    field.input.maxLength = 4000;
    field.input.dataset.planFocus = `${titleText.toLowerCase()}-${index}`;
    field.input.addEventListener('input', () => { values[index] = field.input.value; });
    const tools = document.createElement('div');
    tools.className = 'segment-tools';
    const remove = toolButton(`Delete ${titleText.slice(0, -1).toLowerCase()} ${index + 1}`, '✕');
    remove.classList.add('segment-delete');
    remove.disabled = values.length <= minimum;
    remove.addEventListener('click', () => {
      values.splice(index, 1);
      onRender({ focusSelector: `[data-plan-add="${titleText.toLowerCase()}"]` });
    });
    tools.append(remove);
    row.append(field.wrapper, tools);
    rows.append(row);
  });
  const add = button(`Add ${titleText.slice(0, -1).toLowerCase()}`, 'button-secondary button-small');
  add.dataset.planAdd = titleText.toLowerCase();
  add.disabled = values.length >= 12;
  add.addEventListener('click', () => {
    if (values.length >= 12) return;
    values.push('');
    onRender({ focusSelector: `[data-plan-focus="${titleText.toLowerCase()}-${values.length - 1}"]` });
  });
  element.append(legend, rows, add);
  return element;
}

function editableBeats(values, onRender) {
  const element = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Episode progression';
  const rows = document.createElement('div');
  rows.className = 'episode-plan-beats';
  values.forEach((beat, index) => {
    const row = document.createElement('fieldset');
    row.className = 'episode-plan-beat';
    const rowLegend = document.createElement('legend');
    rowLegend.textContent = `Beat ${index + 1}`;
    const head = document.createElement('div');
    head.className = 'episode-plan-beat-head';
    const tools = document.createElement('div');
    tools.className = 'segment-tools';
    const up = toolButton(`Move beat ${index + 1} up`, '↑');
    const down = toolButton(`Move beat ${index + 1} down`, '↓');
    const remove = toolButton(`Delete beat ${index + 1}`, '✕');
    remove.classList.add('segment-delete');
    up.disabled = index === 0;
    down.disabled = index === values.length - 1;
    remove.disabled = values.length === 1;
    up.addEventListener('click', () => {
      [values[index - 1], values[index]] = [values[index], values[index - 1]];
      onRender({ focusSelector: `[data-plan-focus="beat-title-${index - 1}"]` });
    });
    down.addEventListener('click', () => {
      [values[index], values[index + 1]] = [values[index + 1], values[index]];
      onRender({ focusSelector: `[data-plan-focus="beat-title-${index + 1}"]` });
    });
    remove.addEventListener('click', () => {
      values.splice(index, 1);
      const nextIndex = Math.min(index, values.length - 1);
      onRender({ focusSelector: `[data-plan-focus="beat-title-${nextIndex}"]` });
    });
    tools.append(up, down, remove);
    head.append(tools);
    const title = textField({ label: 'Beat title', value: beat.title, required: true });
    title.input.maxLength = 200;
    title.input.dataset.planFocus = `beat-title-${index}`;
    const purpose = textAreaField({ label: 'Beat purpose', value: beat.purpose, required: true, rows: 2 });
    purpose.input.maxLength = 4000;
    title.input.addEventListener('input', () => { beat.title = title.input.value; });
    purpose.input.addEventListener('input', () => { beat.purpose = purpose.input.value; });
    row.append(rowLegend, head, title.wrapper, purpose.wrapper);
    rows.append(row);
  });
  const add = button('Add beat', 'button-secondary button-small');
  add.disabled = values.length >= 12;
  add.addEventListener('click', () => {
    if (values.length >= 12) return;
    const ids = new Set(values.map((beat) => beat.id));
    let number = values.length + 1;
    while (ids.has(`beat-${number}`)) number += 1;
    values.push({ id: `beat-${number}`, title: '', purpose: '' });
    onRender({ focusSelector: `[data-plan-focus="beat-title-${values.length - 1}"]` });
  });
  element.append(legend, rows, add);
  return element;
}

function button(label, classes) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = `button ${classes}`;
  control.textContent = label;
  return control;
}

function toolButton(label, glyph) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'segment-tool';
  control.setAttribute('aria-label', label);
  control.title = label;
  control.textContent = glyph;
  return control;
}
