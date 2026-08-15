import { cardHeader, textAreaField } from '../../components/fields.js';
import { createErrorScope } from '../../components/error-message.js';
import { AppError } from '../../services/errors.js';
import { downloadJson } from '../../utils/download.js';

/**
 * Owns script inspection and editing. Rendering remains a workflow concern and
 * is requested through the injected callback.
 *
 * @param {Object} args
 * @param {ReturnType<import('./podcast-controller.js').createPodcastController>} args.controller
 * @param {(message: string) => void} args.announce
 * @param {() => void | Promise<void>} args.onRender
 * @param {(request: string) => Promise<import('./podcast-script.js').PodcastScript | null>} args.onRevise
 * @param {() => void} [args.onCancelGeneration]
 */
export function createPodcastScriptReview({ controller, announce, onRender, onRevise, onCancelGeneration = () => {} }) {
  const element = document.createElement('section');
  element.className = 'card';
  element.hidden = true;
  element.tabIndex = -1;
  element.append(cardHeader('Review or edit script'));

  const meta = document.createElement('p');
  meta.className = 'help-text';

  const viewToggle = document.createElement('div');
  viewToggle.className = 'segmented';
  viewToggle.setAttribute('role', 'group');
  viewToggle.setAttribute('aria-label', 'Script view');
  const structuredToggle = toggleButton('Structured');
  const jsonToggle = toggleButton('JSON');
  viewToggle.append(structuredToggle, jsonToggle);

  const structuredPane = document.createElement('div');
  const segmentsList = document.createElement('ol');
  segmentsList.className = 'segments-list';
  structuredPane.append(segmentsList);

  const jsonPane = document.createElement('div');
  jsonPane.hidden = true;
  const jsonView = document.createElement('pre');
  jsonView.className = 'script-json';
  jsonView.tabIndex = 0;
  const jsonEditArea = document.createElement('textarea');
  jsonEditArea.className = 'script-json-edit';
  jsonEditArea.rows = 16;
  jsonEditArea.spellcheck = false;
  jsonEditArea.hidden = true;
  jsonEditArea.setAttribute('aria-label', 'Raw script JSON');
  const jsonActions = document.createElement('div');
  jsonActions.className = 'action-row';
  const editJsonButton = actionButton('Edit JSON', 'button button-secondary button-small');
  const applyJsonButton = actionButton('Apply JSON', 'button button-primary button-small');
  applyJsonButton.hidden = true;
  const discardJsonButton = actionButton('Discard changes', 'button button-ghost button-small');
  discardJsonButton.hidden = true;
  jsonActions.append(editJsonButton, applyJsonButton, discardJsonButton);
  const jsonErrors = createErrorScope();
  jsonPane.append(jsonView, jsonEditArea, jsonActions);

  const actions = document.createElement('div');
  actions.className = 'action-row';
  const renderButton = actionButton('Render audio', 'button button-primary');
  const editButton = actionButton('Edit script', 'button button-secondary');
  const cancelEditButton = actionButton('Cancel edits', 'button button-ghost');
  cancelEditButton.hidden = true;
  const addTurnButton = actionButton('Add turn', 'button button-secondary');
  addTurnButton.hidden = true;
  const downloadButton = actionButton('Download JSON', 'button button-secondary');
  actions.append(renderButton, editButton, cancelEditButton, addTurnButton, downloadButton);
  const errors = createErrorScope();
  const revisionGroup = document.createElement('div');
  revisionGroup.className = 'episode-plan-revision';
  const revision = textAreaField({
    label: 'Ask for changes to this script',
    rows: 3,
    help: 'The model returns a complete replacement script using the current source, plan, and podcast settings.',
  });
  const reviseButton = actionButton('Revise script', 'button button-secondary');
  const cancelRevisionButton = actionButton('Cancel revision', 'button button-secondary');
  cancelRevisionButton.hidden = true;
  revisionGroup.append(revision.wrapper, reviseButton, cancelRevisionButton);
  element.append(meta, viewToggle, structuredPane, jsonPane, revisionGroup, actions);

  /** @type {{ id: string, speakerId: string, text: string, pauseAfterMs: number }[] | null} */
  let editDraft = null;
  let jsonMode = false;
  let jsonEditing = false;
  let uiState = { revising: false, offline: false, canRevise: false, renderUnavailable: false };

  const isEditing = () => editDraft !== null;

  /** @param {import('./podcast-script.js').PodcastScript} script */
  function renderReadOnly(script) {
    segmentsList.replaceChildren();
    for (const segment of script.segments) {
      const item = document.createElement('li');
      item.className = 'segment-item';
      const speakerIndex = script.speakers.findIndex((speaker) => speaker.id === segment.speakerId);
      const speaker = script.speakers[speakerIndex];
      const badge = document.createElement('span');
      badge.className = `segment-speaker speaker-${(speakerIndex % 2) + 1}`;
      badge.textContent = speaker ? speaker.name : segment.speakerId;
      const text = document.createElement('p');
      text.className = 'segment-text';
      text.textContent = segment.text;
      item.append(badge, text);
      segmentsList.append(item);
    }
  }

  /** @param {import('./podcast-script.js').PodcastScript} script */
  function renderEditable(script) {
    if (!editDraft) return;
    segmentsList.replaceChildren();
    editDraft.forEach((segment, index) => {
      const item = document.createElement('li');
      item.className = 'segment-item segment-editing';
      const head = document.createElement('div');
      head.className = 'segment-edit-head';

      const speakerSelect = document.createElement('select');
      speakerSelect.setAttribute('aria-label', `Speaker for turn ${index + 1}`);
      for (const speaker of script.speakers) {
        const option = document.createElement('option');
        option.value = speaker.id;
        option.textContent = speaker.name;
        speakerSelect.append(option);
      }
      speakerSelect.value = segment.speakerId;
      speakerSelect.addEventListener('change', () => {
        segment.speakerId = speakerSelect.value;
      });

      const pauseField = document.createElement('label');
      pauseField.className = 'segment-pause-field';
      const pauseLabel = document.createElement('span');
      pauseLabel.textContent = 'Pause after (ms)';
      const pauseInput = document.createElement('input');
      pauseInput.type = 'number';
      pauseInput.min = '0';
      pauseInput.max = '5000';
      pauseInput.step = '1';
      pauseInput.value = String(segment.pauseAfterMs);
      pauseInput.setAttribute('aria-label', `Pause after turn ${index + 1}, in milliseconds`);
      pauseInput.addEventListener('input', () => {
        segment.pauseAfterMs = Number(pauseInput.value);
      });
      pauseField.append(pauseLabel, pauseInput);

      const tools = document.createElement('div');
      tools.className = 'segment-tools';
      const up = toolButton(`Move turn ${index + 1} up`, '↑');
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        [editDraft[index - 1], editDraft[index]] = [editDraft[index], editDraft[index - 1]];
        renderEditable(script);
      });
      const down = toolButton(`Move turn ${index + 1} down`, '↓');
      down.disabled = index === editDraft.length - 1;
      down.addEventListener('click', () => {
        [editDraft[index], editDraft[index + 1]] = [editDraft[index + 1], editDraft[index]];
        renderEditable(script);
      });
      const remove = toolButton(`Delete turn ${index + 1}`, '✕');
      remove.classList.add('segment-delete');
      remove.addEventListener('click', () => {
        editDraft.splice(index, 1);
        renderEditable(script);
      });
      tools.append(up, down, remove);
      head.append(speakerSelect, pauseField, tools);

      const area = document.createElement('textarea');
      area.rows = 3;
      area.value = segment.text;
      area.setAttribute('aria-label', `Turn ${index + 1} text`);
      area.addEventListener('input', () => {
        segment.text = area.value;
      });
      item.append(head, area);
      segmentsList.append(item);
    });
  }

  function exitEditMode() {
    editDraft = null;
    editButton.textContent = 'Edit script';
    cancelEditButton.hidden = true;
    addTurnButton.hidden = true;
    syncActions();
  }

  function syncActions() {
    const editing = isEditing();
    const revising = Boolean(uiState.revising);
    const revisionAvailable = Boolean(uiState.canRevise && !editing);
    editButton.disabled = revising;
    addTurnButton.disabled = revising;
    cancelEditButton.disabled = revising;
    editJsonButton.disabled = revising;
    applyJsonButton.disabled = revising;
    discardJsonButton.disabled = revising;
    structuredToggle.disabled = revising;
    jsonToggle.disabled = editing || revising;
    renderButton.disabled = editing || revising || Boolean(uiState.offline) || Boolean(uiState.renderUnavailable);
    revisionGroup.hidden = !uiState.canRevise || editing || jsonEditing;
    revision.input.disabled = !revisionAvailable || revising || Boolean(uiState.offline);
    reviseButton.disabled = !revisionAvailable || revising || Boolean(uiState.offline);
    jsonEditArea.disabled = revising;
    cancelRevisionButton.hidden = !revising;
    cancelRevisionButton.disabled = !revising;
  }

  function renderJsonView() {
    const script = controller.store.get().script;
    if (!script) return;
    jsonView.textContent = JSON.stringify(script, null, 2);
    jsonView.hidden = false;
    jsonEditArea.hidden = true;
    jsonEditing = false;
    editJsonButton.hidden = false;
    applyJsonButton.hidden = true;
    discardJsonButton.hidden = true;
    jsonErrors.clear();
    syncActions();
  }

  function setJsonMode(on) {
    jsonMode = on;
    structuredToggle.classList.toggle('is-active', !on);
    structuredToggle.setAttribute('aria-pressed', String(!on));
    jsonToggle.classList.toggle('is-active', on);
    jsonToggle.setAttribute('aria-pressed', String(on));
    structuredPane.hidden = on;
    jsonPane.hidden = !on;
    if (on) renderJsonView();
  }

  function saveEdits() {
    const script = controller.store.get().script;
    if (!script || !editDraft) return;
    try {
      const applied = controller.applyEditedScript({
        ...script,
        segments: editDraft.map((segment) => ({ ...segment })),
      });
      exitEditMode();
      errors.clear();
      renderReadOnly(applied);
      announce('Script edits saved.');
    } catch (error) {
      errors.show(error);
    }
  }

  editButton.addEventListener('click', () => {
    const script = controller.store.get().script;
    if (!script) return;
    if (isEditing()) {
      saveEdits();
      return;
    }
    editDraft = script.segments.map((segment) => ({ ...segment }));
    editButton.textContent = 'Save edits';
    cancelEditButton.hidden = false;
    addTurnButton.hidden = false;
    renderEditable(script);
    syncActions();
    announce('Editing script. Save or cancel edits before rendering.');
  });

  cancelEditButton.addEventListener('click', () => {
    exitEditMode();
    const script = controller.store.get().script;
    if (script) renderReadOnly(script);
  });

  reviseButton.addEventListener('click', async () => {
    errors.clear();
    try {
      const revised = await onRevise(revision.input.value);
      if (revised) {
        revision.input.value = '';
        announce('Script revision applied.');
      }
    } catch (error) {
      errors.show(error);
    }
  });
  cancelRevisionButton.addEventListener('click', onCancelGeneration);

  addTurnButton.addEventListener('click', () => {
    const script = controller.store.get().script;
    if (!script || !editDraft) return;
    const maxSuffix = editDraft.reduce((max, segment) => {
      const match = /(\d+)$/.exec(segment.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    editDraft.push({
      id: `segment-${String(maxSuffix + 1).padStart(4, '0')}`,
      speakerId: script.speakers[0].id,
      text: '',
      pauseAfterMs: 350,
    });
    renderEditable(script);
    const areas = segmentsList.querySelectorAll('textarea');
    areas[areas.length - 1]?.focus();
  });

  structuredToggle.addEventListener('click', () => setJsonMode(false));
  jsonToggle.addEventListener('click', () => setJsonMode(true));
  editJsonButton.addEventListener('click', () => {
    const script = controller.store.get().script;
    if (!script) return;
    jsonEditing = true;
    jsonView.hidden = true;
    jsonEditArea.value = JSON.stringify(script, null, 2);
    jsonEditArea.hidden = false;
    editJsonButton.hidden = true;
    applyJsonButton.hidden = false;
    discardJsonButton.hidden = false;
    syncActions();
    jsonEditArea.focus();
  });
  discardJsonButton.addEventListener('click', renderJsonView);
  applyJsonButton.addEventListener('click', () => {
    jsonErrors.clear();
    let parsed;
    try {
      parsed = JSON.parse(jsonEditArea.value);
    } catch {
      jsonErrors.show(schemaError('Not valid JSON. Check syntax and retry.'));
      return;
    }
    try {
      controller.applyEditedScript(parsed);
      renderJsonView();
      announce('JSON applied and validated.');
    } catch (error) {
      const details = error instanceof AppError && error.cause?.errors ? error.cause.errors : null;
      jsonErrors.show(details
        ? schemaError(`${error.message} ${details.slice(1).join(' ')}`.trim())
        : error);
    }
  });
  downloadButton.addEventListener('click', () => {
    try {
      const { json, filename } = controller.exportScriptJson();
      downloadJson(json, filename);
    } catch (error) {
      errors.show(error);
    }
  });
  renderButton.addEventListener('click', onRender);

  setJsonMode(false);
  syncActions();

  return {
    element,
    renderButton,
    errors,
    isEditing,
    exitEditMode,
    setJsonMode,
    setUiState(next) {
      uiState = { ...uiState, ...next };
      syncActions();
    },
    /** @param {import('./podcast-script.js').PodcastScript} script */
    update(script) {
      meta.textContent = `${script.title} — ${script.speakers.map((speaker) => speaker.name).join(', ')} · ${script.segments.length} turns`;
      if (!isEditing()) renderReadOnly(script);
      if (jsonMode && !jsonEditing) renderJsonView();
    },
    reset() {
      exitEditMode();
      setJsonMode(false);
      element.hidden = true;
      errors.clear();
      jsonErrors.clear();
    },
  };
}

/** @param {string} label */
function toggleButton(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'segmented-button';
  button.textContent = label;
  return button;
}

/** @param {string} label @param {string} className */
function actionButton(label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

/** @param {string} label @param {string} glyph */
function toolButton(label, glyph) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'segment-tool';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = glyph;
  return button;
}

/** @param {string} message */
function schemaError(message) {
  return new AppError({ kind: 'schema', message, retryable: false, status: undefined });
}
