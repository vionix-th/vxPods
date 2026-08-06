/**
 * Podcast workflow view: guided six-step pipeline.
 * Source → Shape → Script → Review/Edit → Render → Export.
 * A compact stepper shows pipeline position; downstream cards unlock as the
 * workflow advances. Script review offers a structured turn editor plus a
 * raw JSON view with validated advanced editing.
 */

import { createSourceInput } from '../../components/source-input.js';
import { createProviderSelect } from '../../components/provider-select.js';
import { selectField, textAreaField, textField, cardHeader } from '../../components/fields.js';
import { createProgress } from '../../components/progress.js';
import { renderError, clearError, notify } from '../../components/error-message.js';
import { confirmDialog } from '../../components/dialog.js';
import { requireProvider } from '../providers/provider-requirement.js';
import { subscribeProviders } from '../providers/provider-store.js';
import { createVoicePreview } from '../../components/voice-preview.js';
import { DEFAULT_CHAT_MODELS, DEFAULT_TTS_MODELS, DEFAULT_VOICES } from '../providers/provider-suggestions.js';
import { downloadBlob, downloadJson } from '../../utils/download.js';
import { AppError } from '../../services/errors.js';

const KNOWN_CHAT_MODELS = DEFAULT_CHAT_MODELS;
const KNOWN_TTS_MODELS = DEFAULT_TTS_MODELS;
const KNOWN_VOICES = DEFAULT_VOICES;

const DEFAULT_SPEAKERS = [
  { name: 'Host', role: 'Guides the discussion', voice: 'alloy' },
  { name: 'Guest', role: 'Explains the source', voice: 'verse' },
];

const STEPS = [
  { id: 'source', label: 'Source' },
  { id: 'shape', label: 'Shape' },
  { id: 'script', label: 'Script' },
  { id: 'review', label: 'Review' },
  { id: 'render', label: 'Render' },
  { id: 'export', label: 'Export' },
];

/**
 * @param {Object} args
 * @param {ReturnType<import('./podcast-controller.js').createPodcastController>} args.controller
 * @param {() => boolean} args.isOnline
 * @returns {{ element: HTMLElement, checkRecovery: () => Promise<void> }}
 */
export function createPodcastView({ controller, isOnline }) {
  const root = document.createElement('div');
  root.className = 'workflow podcast-workflow';

  // ---------- Stepper
  const stepper = document.createElement('nav');
  stepper.className = 'stepper';
  stepper.setAttribute('aria-label', 'Podcast progress');
  const stepperList = document.createElement('ol');
  stepperList.className = 'stepper-list';
  stepper.append(stepperList);
  /** @type {Map<string, HTMLLIElement>} */
  const stepItems = new Map();
  /** @type {Map<string, HTMLElement>} */
  const stepCards = new Map();
  for (const [index, step] of STEPS.entries()) {
    const item = document.createElement('li');
    item.className = 'stepper-item';
    item.dataset.step = step.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stepper-button';
    button.innerHTML = `<span class="stepper-num" aria-hidden="true">${index + 1}</span>`;
    const label = document.createElement('span');
    label.className = 'stepper-label';
    label.textContent = step.label;
    button.append(label);
    button.addEventListener('click', () => {
      const card = stepCards.get(step.id);
      if (card && !card.hidden) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        card.focus?.();
      }
    });
    item.append(button);
    stepperList.append(item);
    stepItems.set(step.id, item);
  }

  // ---------- Recovery panel
  const recoveryCard = document.createElement('section');
  recoveryCard.className = 'card recovery-card';
  recoveryCard.hidden = true;

  // ---------- Step 1: source
  const source = createSourceInput({
    title: 'Add source',
    help: 'vxPods uses this source to write a factual, conversational script.',
  });

  // ---------- Step 2: preferences
  const prefsCard = document.createElement('section');
  prefsCard.className = 'card';
  prefsCard.append(cardHeader('Podcast settings'));

  const formatField = selectField({
    label: 'Format',
    options: ['conversation', 'solo'],
    value: 'conversation',
  });
  const toneField = textField({ label: 'Tone', value: 'conversational' });
  const audienceField = textField({ label: 'Audience', value: 'general' });
  const chatProviderSelect = createProviderSelect({ slot: 'chat', label: 'Chat provider' });
  const chatModelField = selectField({
    label: 'Chat model',
    options: KNOWN_CHAT_MODELS,
    value: KNOWN_CHAT_MODELS[0],
  });
  const ttsProviderSelect = createProviderSelect({ slot: 'tts', label: 'TTS provider' });
  const ttsModelField = selectField({
    label: 'TTS model',
    options: KNOWN_TTS_MODELS,
    value: KNOWN_TTS_MODELS[0],
  });

  const speakersContainer = document.createElement('div');
  speakersContainer.className = 'speakers';

  prefsCard.append(
    formatField.wrapper,
    toneField.wrapper,
    audienceField.wrapper,
    chatProviderSelect.element,
    ttsProviderSelect.element,
    chatModelField.wrapper,
    ttsModelField.wrapper,
  );

  /** @type {{ name: HTMLInputElement, role: HTMLTextAreaElement, voice: HTMLSelectElement }[]} */
  let speakerInputs = [];
  /** @type {{ name: string, role: string, voice: string }[]} */
  let speakerValues = [];
  /** @type {Set<() => void>} */
  const clearVoicePreviewHandlers = new Set();

  function clearVoicePreviews() {
    for (const clear of clearVoicePreviewHandlers) clear();
    clearVoicePreviewHandlers.clear();
  }

  function renderSpeakerCards() {
    clearVoicePreviews();
    const count = formatField.input.value === 'solo' ? 1 : 2;
    speakersContainer.replaceChildren();
    speakerInputs = [];
    for (let i = 0; i < count; i += 1) {
      const values = speakerValues[i] || DEFAULT_SPEAKERS[i];
      const card = document.createElement('fieldset');
      card.className = 'speaker-card';
      const legend = document.createElement('legend');
      legend.textContent = `Speaker ${i + 1}`;
      const name = textField({ label: 'Name', value: values.name, required: true });
      const role = textAreaField({ label: 'Role', value: values.role, rows: 3 });
      const voice = selectField({
        label: 'Voice',
        options: [...new Set([...voiceOptions(), values.voice])],
        value: values.voice,
      });
      const voiceControls = document.createElement('div');
      voiceControls.className = 'voice-control-row';
      const preview = createVoicePreview({
        getSelected: ttsProviderSelect.getSelected,
        refresh: ttsProviderSelect.refresh,
        getModel: () => ttsModelField.input.value || KNOWN_TTS_MODELS[0],
        getVoice: () => voice.input.value,
        getSample: () => `Hello, I am ${name.input.value.trim() || `Speaker ${i + 1}`}. This is a short voice preview.`,
      });
      clearVoicePreviewHandlers.add(preview.clear);
      voiceControls.append(voice.input, preview.button);
      voice.wrapper.append(voiceControls, preview.player);
      card.append(legend, name.wrapper, role.wrapper, voice.wrapper);
      speakersContainer.append(card);
      speakerInputs.push({ name: name.input, role: role.input, voice: voice.input });
    }
  }

  formatField.input.addEventListener('change', () => {
    speakerValues = readSpeakers();
    renderSpeakerCards();
  });

  function refreshProviderSuggestions() {
    chatModelField.setOptions(chatProviderSelect.getSelected()?.chatModels ?? KNOWN_CHAT_MODELS);
    ttsModelField.setOptions(ttsProviderSelect.getSelected()?.ttsModels ?? KNOWN_TTS_MODELS);
    speakerValues = readSpeakers();
    renderSpeakerCards();
  }
  function voiceOptions() {
    const provider = ttsProviderSelect.getSelected();
    return provider?.voicesByTtsModel?.[ttsModelField.input.value] ?? KNOWN_VOICES;
  }
  chatProviderSelect.element.addEventListener('change', refreshProviderSuggestions);
  ttsProviderSelect.element.addEventListener('change', refreshProviderSuggestions);
  ttsModelField.input.addEventListener('change', () => {
    speakerValues = readSpeakers();
    renderSpeakerCards();
  });
  subscribeProviders(refreshProviderSuggestions);
  refreshProviderSuggestions();

  function readSpeakers() {
    return speakerInputs.map((inputs) => ({
      name: inputs.name.value.trim() || 'Speaker',
      role: inputs.role.value.trim(),
      voice: inputs.voice.value.trim() || 'alloy',
    }));
  }

  function applySpeakerChangesToScript() {
    const script = controller.store.get().script;
    if (!script) return;
    const speakers = readSpeakers();
    if (speakers.length !== script.speakers.length) {
      notify({
        type: 'error',
        title: 'Speaker count does not match',
        message: 'Regenerate or import a script to change between solo and conversation formats.',
      });
      return;
    }
    try {
      controller.applyEditedScript({
        ...script,
        speakers: script.speakers.map((speaker, index) => ({ ...speaker, ...speakers[index] })),
      });
      notify({ type: 'success', title: 'Script speakers updated', message: 'Changes apply to every turn in the script.' });
    } catch (err) {
      notify({ type: 'error', title: 'Could not update script speakers', message: err instanceof Error ? err.message : 'Unknown error.' });
    }
  }

  function hydrateSpeakerSettings(script) {
    formatField.input.value = script.format;
    speakerValues = script.speakers.map(({ name, role, voice }) => ({ name, role, voice }));
    renderSpeakerCards();
  }

  // ---------- Step 3: script generation
  const scriptCard = document.createElement('section');
  scriptCard.className = 'card';
  scriptCard.append(cardHeader('Generate or update script'));
  const scriptSummary = document.createElement('p');
  scriptSummary.className = 'help-text';
  const speakerSettings = document.createElement('section');
  speakerSettings.className = 'script-speaker-settings';
  const speakerSettingsTitle = document.createElement('h3');
  speakerSettingsTitle.textContent = 'Speakers';
  const speakerSettingsHelp = document.createElement('p');
  speakerSettingsHelp.className = 'help-text';
  speakerSettingsHelp.textContent = 'Names, roles, and voices apply to every matching turn in the script.';
  const applySpeakerChangesButton = document.createElement('button');
  applySpeakerChangesButton.type = 'button';
  applySpeakerChangesButton.className = 'button button-secondary';
  applySpeakerChangesButton.textContent = 'Apply speaker changes to script';
  applySpeakerChangesButton.hidden = true;
  speakerSettings.append(
    speakerSettingsTitle,
    speakerSettingsHelp,
    speakersContainer,
  );
  applySpeakerChangesButton.addEventListener('click', applySpeakerChangesToScript);
  const generateScriptButton = document.createElement('button');
  generateScriptButton.type = 'button';
  generateScriptButton.className = 'button button-primary';
  generateScriptButton.textContent = 'Generate script';
  const importScriptButton = document.createElement('button');
  importScriptButton.type = 'button';
  importScriptButton.className = 'button button-secondary';
  importScriptButton.textContent = 'Import script JSON';
  const importScriptInput = document.createElement('input');
  importScriptInput.type = 'file';
  importScriptInput.accept = '.json,application/json';
  importScriptInput.hidden = true;
  const scriptActions = document.createElement('div');
  scriptActions.className = 'action-row';
  scriptActions.append(
    generateScriptButton,
    applySpeakerChangesButton,
    importScriptButton,
    importScriptInput,
  );
  const scriptStatus = document.createElement('p');
  scriptStatus.className = 'help-text';
  scriptStatus.setAttribute('aria-live', 'polite');
  const scriptErrorRegion = document.createElement('div');
  scriptErrorRegion.className = 'error-region';
  scriptCard.append(scriptSummary, speakerSettings, scriptActions, scriptStatus);

  // ---------- Step 4: review & edit
  const reviewCard = document.createElement('section');
  reviewCard.className = 'card';
  reviewCard.hidden = true;
  reviewCard.tabIndex = -1;
  reviewCard.append(cardHeader('Review or edit script'));
  const reviewMeta = document.createElement('p');
  reviewMeta.className = 'help-text';

  // structured | JSON toggle
  const viewToggle = document.createElement('div');
  viewToggle.className = 'segmented';
  viewToggle.setAttribute('role', 'group');
  viewToggle.setAttribute('aria-label', 'Script view');
  const structuredToggle = document.createElement('button');
  structuredToggle.type = 'button';
  structuredToggle.className = 'segmented-button';
  structuredToggle.textContent = 'Structured';
  const jsonToggle = document.createElement('button');
  jsonToggle.type = 'button';
  jsonToggle.className = 'segmented-button';
  jsonToggle.textContent = 'JSON';
  viewToggle.append(structuredToggle, jsonToggle);

  // structured pane
  const structuredPane = document.createElement('div');
  const segmentsList = document.createElement('ol');
  segmentsList.className = 'segments-list';
  structuredPane.append(segmentsList);

  // JSON pane
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
  const editJsonButton = document.createElement('button');
  editJsonButton.type = 'button';
  editJsonButton.className = 'button button-secondary button-small';
  editJsonButton.textContent = 'Edit JSON';
  const applyJsonButton = document.createElement('button');
  applyJsonButton.type = 'button';
  applyJsonButton.className = 'button button-primary button-small';
  applyJsonButton.textContent = 'Apply JSON';
  applyJsonButton.hidden = true;
  const discardJsonButton = document.createElement('button');
  discardJsonButton.type = 'button';
  discardJsonButton.className = 'button button-ghost button-small';
  discardJsonButton.textContent = 'Discard changes';
  discardJsonButton.hidden = true;
  jsonActions.append(editJsonButton, applyJsonButton, discardJsonButton);
  const jsonErrorRegion = document.createElement('div');
  jsonErrorRegion.className = 'error-region';
  jsonPane.append(jsonView, jsonEditArea, jsonActions);

  // review actions
  const reviewActions = document.createElement('div');
  reviewActions.className = 'action-row';
  const renderButton = document.createElement('button');
  renderButton.type = 'button';
  renderButton.className = 'button button-primary';
  renderButton.textContent = 'Render audio';
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'button button-secondary';
  editButton.textContent = 'Edit script';
  const cancelEditButton = document.createElement('button');
  cancelEditButton.type = 'button';
  cancelEditButton.className = 'button button-ghost';
  cancelEditButton.textContent = 'Cancel edits';
  cancelEditButton.hidden = true;
  const addTurnButton = document.createElement('button');
  addTurnButton.type = 'button';
  addTurnButton.className = 'button button-secondary';
  addTurnButton.textContent = 'Add turn';
  addTurnButton.hidden = true;
  const downloadJsonButton = document.createElement('button');
  downloadJsonButton.type = 'button';
  downloadJsonButton.className = 'button button-secondary';
  downloadJsonButton.textContent = 'Download JSON';
  reviewActions.append(renderButton, editButton, cancelEditButton, addTurnButton, downloadJsonButton);
  const reviewErrorRegion = document.createElement('div');
  reviewErrorRegion.className = 'error-region';
  reviewCard.append(reviewMeta, viewToggle, structuredPane, jsonPane, reviewActions);

  /**
   * Edit draft: local mutable copy while editing; applied on save.
   * @type {{ id: string, speakerId: string, text: string, pauseAfterMs: number }[] | null}
   */
  let editDraft = null;
  let jsonMode = false;
  let jsonEditing = false;

  const editing = () => editDraft !== null;

  // ---------- Step 5: render
  const renderCard = document.createElement('section');
  renderCard.className = 'card';
  renderCard.hidden = true;
  renderCard.tabIndex = -1;
  renderCard.append(cardHeader('Render audio'));
  const renderNote = document.createElement('p');
  renderNote.className = 'help-text';
  renderNote.textContent = 'Completed audio is preserved locally and can resume after a reload.';
  const progress = createProgress({ total: 1, unit: 'segments' });
  const renderCounts = document.createElement('p');
  renderCounts.className = 'help-text';
  const currentSegment = document.createElement('p');
  currentSegment.className = 'help-text';
  const failedList = document.createElement('ul');
  failedList.className = 'failed-segments';
  const renderActions = document.createElement('div');
  renderActions.className = 'action-row';
  const cancelRenderButton = document.createElement('button');
  cancelRenderButton.type = 'button';
  cancelRenderButton.className = 'button button-secondary';
  cancelRenderButton.textContent = 'Cancel remaining';
  renderActions.append(cancelRenderButton);
  const renderErrorRegion = document.createElement('div');
  renderErrorRegion.className = 'error-region';
  renderCard.append(
    renderNote,
    progress.element,
    renderCounts,
    currentSegment,
    failedList,
    renderActions,
  );

  // ---------- Step 6: preview/export
  const exportCard = document.createElement('section');
  exportCard.className = 'card';
  exportCard.hidden = true;
  exportCard.tabIndex = -1;
  exportCard.append(cardHeader('Preview and export'));
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.className = 'audio-player';
  audio.setAttribute('aria-label', 'Podcast preview');
  const exportActions = document.createElement('div');
  exportActions.className = 'action-row';
  const downloadWavButton = document.createElement('button');
  downloadWavButton.type = 'button';
  downloadWavButton.className = 'button button-primary';
  downloadWavButton.textContent = 'Download WAV';
  const downloadMp3Button = document.createElement('button');
  downloadMp3Button.type = 'button';
  downloadMp3Button.className = 'button button-primary';
  downloadMp3Button.textContent = 'Download MP3';
  const downloadScriptButton = document.createElement('button');
  downloadScriptButton.type = 'button';
  downloadScriptButton.className = 'button button-secondary';
  downloadScriptButton.textContent = 'Download script JSON';
  const startOverButton = document.createElement('button');
  startOverButton.type = 'button';
  startOverButton.className = 'button button-danger';
  startOverButton.textContent = 'Start over';
  exportActions.append(downloadWavButton, downloadMp3Button, downloadScriptButton, startOverButton);
  const exportErrorRegion = document.createElement('div');
  exportErrorRegion.className = 'error-region';
  exportCard.append(audio, exportActions);

  root.append(recoveryCard, stepper, source.element, prefsCard, scriptCard, reviewCard, renderCard, exportCard);

  stepCards.set('source', source.element);
  stepCards.set('shape', prefsCard);
  stepCards.set('script', scriptCard);
  stepCards.set('review', reviewCard);
  stepCards.set('render', renderCard);
  stepCards.set('export', exportCard);

  /** @type {string | null} */
  let audioUrl = null;
  let previousScriptStatus = 'idle';
  let previousRenderStatus = 'idle';
  /** @type {HTMLButtonElement | null} */
  let resumeButton = null;

  // ---------- Stepper state

  /**
   * Furthest unlocked step becomes 'current'; earlier steps read 'done'.
   * @param {import('./podcast-controller.js').PodcastState} state
   */
  function syncStepper(state) {
    const sourceFilled = source.getText().trim().length > 0;
    const hasScript = Boolean(state.script);
    const renderStarted = state.renderStatus !== 'idle';
    const renderReady = state.renderStatus === 'ready' && Boolean(state.output);

    let furthestIndex = 0; // source
    if (sourceFilled) furthestIndex = 2; // script generation available
    if (hasScript) furthestIndex = 3; // review
    if (renderStarted) furthestIndex = 4; // render
    if (renderReady) furthestIndex = 5; // export

    STEPS.forEach((step, index) => {
      const item = stepItems.get(step.id);
      const s = index < furthestIndex ? 'done' : index === furthestIndex ? 'current' : 'todo';
      item.dataset.state = s;
      const button = item.querySelector('button');
      if (s === 'current') button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      const card = stepCards.get(step.id);
      button.disabled = !card || card.hidden;
    });
  }

  // ---------- Preferences behavior

  function readPrefs() {
    return {
      format: /** @type {'solo'|'conversation'} */ (formatField.input.value),
      tone: toneField.input.value.trim() || 'conversational',
      audience: audienceField.input.value.trim() || 'general',
      speakers: readSpeakers(),
      chatModel: chatModelField.input.value.trim() || KNOWN_CHAT_MODELS[0],
      ttsModel: ttsModelField.input.value.trim() || KNOWN_TTS_MODELS[0],
    };
  }

  function updateScriptSummary() {
    const provider = chatProviderSelect.getSelected();
    scriptSummary.textContent = provider
      ? `Generate with ${provider.name} (${chatModelField.input.value || KNOWN_CHAT_MODELS[0]}).`
      : 'Add a Chat provider configuration first.';
  }
  chatProviderSelect.element.addEventListener('change', updateScriptSummary);
  chatModelField.input.addEventListener('input', updateScriptSummary);
  updateScriptSummary();

  source.element.addEventListener('input', () => syncStepper(controller.store.get()));

  // ---------- Script generation

  generateScriptButton.addEventListener('click', async () => {
    clearError(scriptErrorRegion);
    requireProvider({
      slot: 'chat',
      getSelected: chatProviderSelect.getSelected,
      refresh: chatProviderSelect.refresh,
      onReady: (provider) => controller.generateScript(source.getText(), readPrefs(), provider),
    });
  });

  importScriptButton.addEventListener('click', () => importScriptInput.click());
  importScriptInput.addEventListener('change', async () => {
    const file = importScriptInput.files?.[0];
    importScriptInput.value = '';
    if (!file) return;
    clearError(scriptErrorRegion);
    try {
      const importedScript = controller.validateImportedScript(await file.text());
      const hasScript = Boolean(controller.store.get().script);
      const recoverableJob = await controller.getRecoverableJob();
      if (hasScript || recoverableJob) {
        const confirmed = await confirmDialog({
          title: 'Replace current script',
          message: 'Importing a script replaces the current script and discards any unfinished render.',
          confirmLabel: 'Replace script',
        });
        if (!confirmed) return;
        await controller.discardRender();
      }
      controller.importScript(importedScript);
      hydrateSpeakerSettings(importedScript);
      exitEditMode();
      setJsonMode(false);
      notify({ type: 'success', title: 'Script imported', message: 'Review the validated script or render audio.' });
    } catch (err) {
      renderError(scriptErrorRegion, err, { onDismiss: () => {} });
    }
  });

  // ---------- Review: structured editor

  /**
   * Read-only ordered turns with speaker badges.
   * @param {import('./podcast-script.js').PodcastScript} script
   */
  function renderSegmentsReadOnly(script) {
    segmentsList.replaceChildren();
    script.segments.forEach((segment, index) => {
      const item = document.createElement('li');
      item.className = 'segment-item';
      const speakerIndex = script.speakers.findIndex((s) => s.id === segment.speakerId);
      const speaker = script.speakers[speakerIndex];
      const badge = document.createElement('span');
      badge.className = `segment-speaker speaker-${(speakerIndex % 2) + 1}`;
      badge.textContent = speaker ? speaker.name : segment.speakerId;
      const text = document.createElement('p');
      text.className = 'segment-text';
      text.textContent = segment.text;
      item.append(badge, text);
      segmentsList.append(item);
    });
  }

  /**
   * Editable turn list operating on the local draft.
   * @param {import('./podcast-script.js').PodcastScript} script
   */
  function renderSegmentsEditable(script) {
    segmentsList.replaceChildren();
    editDraft.forEach((segment, index) => {
      const item = document.createElement('li');
      item.className = 'segment-item segment-editing';

      const head = document.createElement('div');
      head.className = 'segment-edit-head';

      const speakerSelect = document.createElement('select');
      speakerSelect.setAttribute('aria-label', `Speaker for turn ${index + 1}`);
      for (const speaker of script.speakers) {
        const opt = document.createElement('option');
        opt.value = speaker.id;
        opt.textContent = speaker.name;
        speakerSelect.append(opt);
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
        renderSegmentsEditable(script);
      });
      const down = toolButton(`Move turn ${index + 1} down`, '↓');
      down.disabled = index === editDraft.length - 1;
      down.addEventListener('click', () => {
        [editDraft[index], editDraft[index + 1]] = [editDraft[index + 1], editDraft[index]];
        renderSegmentsEditable(script);
      });
      const remove = toolButton(`Delete turn ${index + 1}`, '✕');
      remove.classList.add('segment-delete');
      remove.addEventListener('click', () => {
        editDraft.splice(index, 1);
        renderSegmentsEditable(script);
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

  /**
   * @param {string} label
   * @param {string} glyph
   */
  function toolButton(label, glyph) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'segment-tool';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = glyph;
    return button;
  }

  editButton.addEventListener('click', () => {
    const script = controller.store.get().script;
    if (!script) return;
    if (!editing()) {
      editDraft = script.segments.map((s) => ({ ...s }));
      editButton.textContent = 'Save edits';
      cancelEditButton.hidden = false;
      addTurnButton.hidden = false;
      renderButton.disabled = true;
      jsonToggle.disabled = true;
      renderSegmentsEditable(script);
      progress.announce('Editing script. Save or cancel edits before rendering.');
    } else {
      saveEdits();
    }
  });

  cancelEditButton.addEventListener('click', () => {
    exitEditMode();
    const script = controller.store.get().script;
    if (script) renderSegmentsReadOnly(script);
  });

  addTurnButton.addEventListener('click', () => {
    const script = controller.store.get().script;
    if (!script || !editDraft) return;
    // Deterministic, collision-free id: one above the highest numeric suffix.
    const maxSuffix = editDraft.reduce((max, s) => {
      const match = /(\d+)$/.exec(s.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    editDraft.push({
      id: `segment-${String(maxSuffix + 1).padStart(4, '0')}`,
      speakerId: script.speakers[0].id,
      text: '',
      pauseAfterMs: 350,
    });
    renderSegmentsEditable(script);
    const areas = segmentsList.querySelectorAll('textarea');
    areas[areas.length - 1]?.focus();
  });

  function saveEdits() {
    const script = controller.store.get().script;
    if (!script || !editDraft) return;
    const edited = { ...script, segments: editDraft.map((s) => ({ ...s })) };
    try {
      const applied = controller.applyEditedScript(edited);
      exitEditMode();
      clearError(reviewErrorRegion);
      renderSegmentsReadOnly(applied);
      progress.announce('Script edits saved.');
    } catch (err) {
      renderError(reviewErrorRegion, err, { onDismiss: () => {} });
    }
  }

  function exitEditMode() {
    editDraft = null;
    editButton.textContent = 'Edit script';
    cancelEditButton.hidden = true;
    addTurnButton.hidden = true;
    renderButton.disabled = false;
    jsonToggle.disabled = false;
  }

  // ---------- Review: JSON view

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

  structuredToggle.addEventListener('click', () => setJsonMode(false));
  jsonToggle.addEventListener('click', () => setJsonMode(true));

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
    clearError(jsonErrorRegion);
  }

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
    jsonEditArea.focus();
  });

  discardJsonButton.addEventListener('click', renderJsonView);

  applyJsonButton.addEventListener('click', () => {
    clearError(jsonErrorRegion);
    let parsed;
    try {
      parsed = JSON.parse(jsonEditArea.value);
    } catch {
      renderError(
        jsonErrorRegion,
        new AppError({
          kind: 'schema',
          message: 'Not valid JSON. Check syntax and retry.',
          retryable: false,
          status: undefined,
        }),
      );
      return;
    }
    try {
      controller.applyEditedScript(parsed);
      renderJsonView();
      progress.announce('JSON applied and validated.');
    } catch (err) {
      const errors = err instanceof AppError && err.cause?.errors ? err.cause.errors : null;
      if (errors) {
        const listMessage = `${err.message} ${errors.slice(1).join(' ')}`.trim();
        renderError(
          jsonErrorRegion,
          new AppError({
            kind: 'schema',
            message: listMessage,
            retryable: false,
            status: undefined,
          }),
        );
      } else {
        renderError(jsonErrorRegion, err);
      }
    }
  });

  // ---------- Render + export actions

  downloadJsonButton.addEventListener('click', () => {
    try {
      const { json, filename } = controller.exportScriptJson();
      downloadJson(json, filename);
    } catch (err) {
      renderError(reviewErrorRegion, err, { onDismiss: () => {} });
    }
  });

  renderButton.addEventListener('click', async () => {
    clearError(reviewErrorRegion);
    requireProvider({
      slot: 'tts',
      getSelected: ttsProviderSelect.getSelected,
      refresh: ttsProviderSelect.refresh,
      onReady: async (provider) => {
        const existing = await controller.getRecoverableJob();
        if (existing) {
          const confirmed = await confirmDialog({
            title: 'Replace recoverable render',
            message: `An unfinished render (${completedCount(existing)} of ${existing.script.segments.length} segments) exists. Starting a new render removes it.`,
            confirmLabel: 'Replace render',
          });
          if (!confirmed) return;
        }
        await controller.startRender(provider, readPrefs().ttsModel);
      },
    });
  });

  cancelRenderButton.addEventListener('click', () => controller.cancelRender());
  downloadWavButton.addEventListener('click', () => doExport('wav'));
  downloadMp3Button.addEventListener('click', () => doExport('mp3'));

  /**
   * @param {'wav'|'mp3'} format
   */
  async function doExport(format) {
    clearError(exportErrorRegion);
    const button = format === 'wav' ? downloadWavButton : downloadMp3Button;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = format === 'mp3' ? 'Encoding MP3…' : 'Preparing…';
    try {
      const { blob, filename } = await controller.exportAudio(format, (done, total) => {
        button.textContent = `Encoding MP3: ${Math.round((done / total) * 100)}%`;
      });
      downloadBlob(blob, filename);
      progress.announce('Export complete.');
    } catch (err) {
      renderError(exportErrorRegion, err, {
        actionLabel: 'Retry export',
        onAction: () => doExport(format),
        onDismiss: () => {},
      });
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  downloadScriptButton.addEventListener('click', () => {
    try {
      const { json, filename } = controller.exportScriptJson();
      downloadJson(json, filename);
    } catch (err) {
      renderError(exportErrorRegion, err, { onDismiss: () => {} });
    }
  });

  startOverButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Start over',
      message: 'This removes the current script and any recoverable render data.',
      confirmLabel: 'Discard and start over',
    });
    if (!confirmed) return;
    await controller.discardRender();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrl = null;
    }
    exitEditMode();
    reviewCard.hidden = true;
    renderCard.hidden = true;
    exportCard.hidden = true;
    source.setText('');
  });

  // ---------- Controller state rendering

  controller.store.subscribe((state) => {
    const generating = state.status === 'generating';
    scriptGenerating = generating;
    syncOnline();
    scriptStatus.textContent = generating ? 'Writing and validating JSON script…' : '';

    if (state.status === 'failed' && state.error) {
      renderError(scriptErrorRegion, state.error, {
        actionLabel: state.repairAvailable ? 'Repair script' : 'Generate again',
        onAction: () => {
          clearError(scriptErrorRegion);
          if (state.repairAvailable) controller.repairScript();
          else generateScriptButton.click();
        },
        onDismiss: () => {},
      });
    }

    if (state.script && state.status === 'ready') {
      applySpeakerChangesButton.hidden = false;
      applySpeakerChangesButton.disabled = state.renderStatus !== 'idle';
      const wasHidden = reviewCard.hidden;
      reviewCard.hidden = false;
      reviewMeta.textContent =
        `${state.script.title} — ${state.script.speakers.map((s) => s.name).join(', ')} · ` +
        `${state.script.segments.length} turns`;
      if (!editing()) renderSegmentsReadOnly(state.script);
      if (jsonMode && !jsonEditing) renderJsonView();
      if (wasHidden) reviewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (previousScriptStatus !== 'ready') {
        notify({ type: 'success', title: 'Script ready', message: 'Review it or render audio.' });
      }
    }

    const renderActive = state.renderStatus !== 'idle';
    if (renderActive && renderCard.hidden) {
      renderCard.hidden = false;
      renderCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const script = state.script;
    if (script && renderActive) {
      const total = script.segments.length;
      const states = Object.values(state.segmentStates);
      const completed = states.filter((s) => s === 'completed').length;
      const failed = states.filter((s) => s === 'failed').length;
      const pending = states.filter((s) => s === 'pending' || s === 'active').length;
      progress.update({ completed, total });
      renderCounts.textContent = `Pending: ${pending} · Failed: ${failed} · Completed: ${completed}`;
      if (state.activeSegmentId) {
        const index = script.segments.findIndex((s) => s.id === state.activeSegmentId);
        const speaker = script.speakers.find((s) => s.id === script.segments[index]?.speakerId);
        currentSegment.textContent = `Rendering turn ${index + 1} of ${total} (${speaker?.name ?? 'unknown speaker'})`;
      } else {
        currentSegment.textContent = '';
      }

      failedList.replaceChildren();
      for (const segment of script.segments) {
        if (state.segmentStates[segment.id] !== 'failed') continue;
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = `Turn ${script.segments.indexOf(segment) + 1} failed. `;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'button button-secondary button-small';
        retry.textContent = 'Retry segment';
        retry.addEventListener('click', () => {
          requireProvider({
            slot: 'tts',
            getSelected: ttsProviderSelect.getSelected,
            refresh: ttsProviderSelect.refresh,
            onReady: (provider) => controller.retrySegment(segment.id, provider, readPrefs().ttsModel),
          });
        });
        item.append(label, retry);
        failedList.append(item);
      }
    }

    if (state.renderStatus === 'rendering') {
      progress.announce('Rendering podcast audio.');
      cancelRenderButton.disabled = false;
    }
    if (state.renderStatus === 'cancelled') {
      progress.announce('Render cancelled. Completed segments are saved locally.');
      if (previousRenderStatus !== 'cancelled') {
        notify({ type: 'warning', title: 'Render cancelled', message: 'Completed audio stays available locally.' });
      }
    }
    if (state.renderStatus === 'failed' && state.renderError) {
      progress.announce(`Render failed: ${state.renderError.message}`);
      renderError(renderErrorRegion, state.renderError, { onDismiss: () => {} });
    }
    if (state.renderStatus === 'ready' && state.output) {
      progress.announce('Podcast audio ready.');
      const wasHidden = exportCard.hidden;
      exportCard.hidden = false;
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(state.output.wav);
      audio.src = audioUrl;
      if (wasHidden) exportCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (previousRenderStatus !== 'ready') {
        notify({ type: 'success', title: 'Audio ready', message: 'Preview it or download WAV or MP3.' });
      }
    }

    syncStepper(state);
    previousScriptStatus = state.status;
    previousRenderStatus = state.renderStatus;
  });

  // ---------- Recovery

  async function checkRecovery() {
    const job = await controller.getRecoverableJob();
    if (!job || job.status === 'ready') return;
    recoveryCard.hidden = false;
    recoveryCard.replaceChildren();
    recoveryCard.append(cardHeader('Unfinished podcast render'));

    const meta = document.createElement('p');
    meta.className = 'help-text';
    const updated = new Date(job.updatedAt).toLocaleString();
    meta.textContent =
      `${job.script.title} — ${completedCount(job)} of ${job.script.segments.length} turns completed. ` +
      `Last updated ${updated}. Requires TTS configuration “${job.settings.ttsProviderName ?? 'unknown'}” and model “${job.settings.ttsModel}”.`;

    const actions = document.createElement('div');
    actions.className = 'action-row';
    const resume = document.createElement('button');
    resumeButton = resume;
    syncOnline();
    resume.type = 'button';
    resume.className = 'button button-primary';
    resume.textContent = 'Resume render';
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'button button-danger';
    discard.textContent = 'Discard';
    actions.append(resume, discard);

    const recoveryError = document.createElement('div');
    recoveryError.className = 'error-region';

    resume.addEventListener('click', async () => {
      clearError(recoveryError);
      requireProvider({
        slot: 'tts',
        getSelected: ttsProviderSelect.getSelected,
        refresh: ttsProviderSelect.refresh,
        onReady: async (provider) => {
          recoveryCard.hidden = true;
          await controller.resumeRender(provider);
        },
      });
    });

    discard.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Discard render',
        message: 'Completed turns will be removed. This cannot be undone.',
        confirmLabel: 'Discard render',
      });
      if (!confirmed) return;
      await controller.discardRender();
      recoveryCard.hidden = true;
    });

    recoveryCard.append(meta, actions);
  }

  /**
   * @param {import('../../storage/render-job-store.js').RenderJob} job
   */
  function completedCount(job) {
    return Object.values(job.segmentStates).filter((s) => s === 'completed').length;
  }

  // ---------- Online state

  let scriptGenerating = false;
  function syncOnline() {
    const online = isOnline();
    generateScriptButton.disabled = scriptGenerating || !online;
    renderButton.disabled = editing() || !online;
    if (resumeButton) resumeButton.disabled = !online;
  }
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);

  setJsonMode(false);
  syncStepper(controller.store.get());

  return {
    element: root,
    checkRecovery,
    getPromptPreview() {
      return { source: source.getText(), prefs: readPrefs() };
    },
  };
}
