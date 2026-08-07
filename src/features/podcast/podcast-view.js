/**
 * Podcast workflow view: guided six-step pipeline.
 * Source → Shape → Script → Review/Edit → Render → Export.
 * A compact stepper shows pipeline position; downstream cards unlock as the
 * workflow advances. Script review offers a structured turn editor plus a
 * raw JSON view with validated advanced editing.
 */

import { createSourceInput } from '../../components/source-input.js';
import { createProviderSelect } from '../../components/provider-select.js';
import { selectField, textField, cardHeader } from '../../components/fields.js';
import { createProgress } from '../../components/progress.js';
import { createErrorScope, notify } from '../../components/error-message.js';
import { confirmDialog } from '../../components/dialog.js';
import { requireProvider } from '../providers/provider-requirement.js';
import {
  getSelectedProviderId,
  listProviders,
  selectProvider,
  subscribeProviders,
} from '../providers/provider-store.js';
import { createPodcastScriptReview } from './podcast-script-review.js';
import { createPodcastSpeakerSettings } from './podcast-speaker-settings.js';
import {
  DEFAULT_TTS_MODELS,
  DEFAULT_VOICES,
  TEXT_GENERATION_API_LABELS,
  TEXT_GENERATION_APIS,
  defaultTextModels,
} from '../../domain/provider-config.js';
import { downloadBlob, downloadJson } from '../../utils/download.js';
import { AppError } from '../../services/errors.js';

const KNOWN_TEXT_MODELS = defaultTextModels(TEXT_GENERATION_APIS.chatCompletions);
const KNOWN_TTS_MODELS = DEFAULT_TTS_MODELS;
const KNOWN_VOICES = DEFAULT_VOICES;

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
 * @param {(listener: (online: boolean) => void) => () => void} args.subscribeOnline
 * @returns {{ element: HTMLElement, checkRecovery: () => Promise<void> }}
 */
export function createPodcastView({ controller, isOnline, subscribeOnline }) {
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
  const textProviderSelect = createProviderSelect({
    label: 'Script configuration',
    getProviders: listProviders,
    getSelectedId: () => getSelectedProviderId('text'),
    onSelect: (id) => selectProvider('text', id),
    showTextApi: true,
  });
  const textModelField = selectField({
    label: 'Script model',
    options: KNOWN_TEXT_MODELS,
    value: KNOWN_TEXT_MODELS[0],
  });
  const ttsProviderSelect = createProviderSelect({
    label: 'TTS provider',
    getProviders: listProviders,
    getSelectedId: () => getSelectedProviderId('tts'),
    onSelect: (id) => selectProvider('tts', id),
  });
  const ttsModelField = selectField({
    label: 'TTS model',
    options: KNOWN_TTS_MODELS.map((entry) => entry.model),
    value: KNOWN_TTS_MODELS[0].model,
  });

  prefsCard.append(
    formatField.wrapper,
    toneField.wrapper,
    audienceField.wrapper,
    textProviderSelect.element,
    ttsProviderSelect.element,
    textModelField.wrapper,
    ttsModelField.wrapper,
  );

  function refreshProviderSuggestions() {
    textProviderSelect.refresh();
    ttsProviderSelect.refresh();
    textModelField.setOptions(textProviderSelect.getSelected()?.textGeneration.models ?? KNOWN_TEXT_MODELS);
    ttsModelField.setOptions((ttsProviderSelect.getSelected()?.ttsModels ?? KNOWN_TTS_MODELS).map((entry) => entry.model));
    speakerSettings.refresh();
  }
  function voiceOptions() {
    const provider = ttsProviderSelect.getSelected();
    return provider ? selectedTtsModel()?.voices ?? [] : KNOWN_VOICES;
  }
  function selectedTtsModel() {
    const models = ttsProviderSelect.getSelected()?.ttsModels ?? KNOWN_TTS_MODELS;
    return models.find((entry) => entry.model === ttsModelField.input.value) ?? models[0];
  }
  textProviderSelect.element.addEventListener('change', refreshProviderSuggestions);
  ttsProviderSelect.element.addEventListener('change', refreshProviderSuggestions);
  ttsModelField.input.addEventListener('change', () => speakerSettings.refresh());
  subscribeProviders(refreshProviderSuggestions);

  // ---------- Step 3: script generation
  const scriptCard = document.createElement('section');
  scriptCard.className = 'card';
  scriptCard.append(cardHeader('Generate or update script'));
  const scriptSummary = document.createElement('p');
  scriptSummary.className = 'help-text';
  const speakerSettings = createPodcastSpeakerSettings({
    formatInput: formatField.input,
    providerSelect: ttsProviderSelect,
    getTtsModel: selectedTtsModel,
    getVoiceOptions: voiceOptions,
    controller,
  });
  refreshProviderSuggestions();
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
    speakerSettings.applyButton,
    importScriptButton,
    importScriptInput,
  );
  const scriptStatus = document.createElement('p');
  scriptStatus.className = 'help-text';
  scriptStatus.setAttribute('aria-live', 'polite');
  const scriptErrors = createErrorScope();
  scriptCard.append(scriptSummary, speakerSettings.element, scriptActions, scriptStatus);

  // ---------- Step 4: review & edit
  const review = createPodcastScriptReview({
    controller,
    announce: (message) => progress.announce(message),
    onRender: startRender,
  });

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
  const renderErrors = createErrorScope();
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
  const exportErrors = createErrorScope();
  exportCard.append(audio, exportActions);

  root.append(recoveryCard, stepper, source.element, prefsCard, scriptCard, review.element, renderCard, exportCard);

  stepCards.set('source', source.element);
  stepCards.set('shape', prefsCard);
  stepCards.set('script', scriptCard);
  stepCards.set('review', review.element);
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
      speakers: speakerSettings.read(),
      textModel: textModelField.input.value.trim(),
      ttsModel: ttsModelField.input.value.trim(),
    };
  }

  function updateScriptSummary() {
    const provider = textProviderSelect.getSelected();
    const api = provider ? TEXT_GENERATION_API_LABELS[provider.textGeneration.api] : '';
    scriptSummary.textContent = provider
      ? textModelField.input.value
        ? `Generate with ${provider.name} · ${api} · ${textModelField.input.value}.`
        : `Add a script model to ${provider.name} in provider settings.`
      : 'Add a script configuration first.';
  }
  textProviderSelect.element.addEventListener('change', updateScriptSummary);
  textModelField.input.addEventListener('input', updateScriptSummary);
  updateScriptSummary();

  source.element.addEventListener('input', () => syncStepper(controller.store.get()));

  // ---------- Script generation

  generateScriptButton.addEventListener('click', async () => {
    scriptErrors.clear();
    const provider = await requireProvider({
      slot: 'text',
      getSelected: textProviderSelect.getSelected,
      refresh: textProviderSelect.refresh,
    });
    if (!provider) return;
    const prefs = readPrefs();
    if (!prefs.textModel) {
      scriptErrors.show(new AppError({
        kind: 'validation',
        message: 'No script models are configured. Add a model in provider settings.',
        retryable: false,
        status: undefined,
      }));
      return;
    }
    await controller.generateScript(source.getText(), prefs, provider);
  });

  importScriptButton.addEventListener('click', () => importScriptInput.click());
  importScriptInput.addEventListener('change', async () => {
    const file = importScriptInput.files?.[0];
    importScriptInput.value = '';
    if (!file) return;
    scriptErrors.clear();
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
      speakerSettings.hydrate(importedScript);
      review.exitEditMode();
      review.setJsonMode(false);
      notify({ type: 'success', title: 'Script imported', message: 'Review the validated script or render audio.' });
    } catch (err) {
      scriptErrors.show(err);
    }
  });

  // ---------- Render + export actions

  async function startRender() {
    review.errors.clear();
    const provider = await requireProvider({
      slot: 'tts',
      getSelected: ttsProviderSelect.getSelected,
      refresh: ttsProviderSelect.refresh,
    });
    if (!provider) return;
    const model = readPrefs().ttsModel;
    if (!model) {
      review.errors.show(new AppError({
        kind: 'validation',
        message: 'No TTS models are configured. Add a model in provider settings.',
        retryable: false,
        status: undefined,
      }));
      return;
    }
    if (!(selectedTtsModel()?.voices ?? []).length) {
      review.errors.show(new AppError({
        kind: 'validation',
        message: `No voices are configured for ${model}. Add a voice in provider settings.`,
        retryable: false,
        status: undefined,
      }));
      return;
    }
    const existing = await controller.getRecoverableJob();
    if (existing) {
      const confirmed = await confirmDialog({
        title: 'Replace recoverable render',
        message: `An unfinished render (${completedCount(existing)} of ${existing.script.segments.length} segments) exists. Starting a new render removes it.`,
        confirmLabel: 'Replace render',
      });
      if (!confirmed) return;
    }
    await controller.startRender(provider, selectedTtsModel());
  }

  cancelRenderButton.addEventListener('click', () => controller.cancelRender());
  downloadWavButton.addEventListener('click', () => doExport('wav'));
  downloadMp3Button.addEventListener('click', () => doExport('mp3'));

  /**
   * @param {'wav'|'mp3'} format
   */
  async function doExport(format) {
    exportErrors.clear();
    const button = format === 'wav' ? downloadWavButton : downloadMp3Button;
    downloadWavButton.disabled = true;
    downloadMp3Button.disabled = true;
    startOverButton.disabled = true;
    const original = button.textContent;
    button.textContent = format === 'mp3' ? 'Encoding MP3…' : 'Preparing…';
    try {
      const { blob, filename } = await controller.exportAudio(format, (done, total) => {
        button.textContent = `Encoding MP3: ${Math.round((done / total) * 100)}%`;
      });
      downloadBlob(blob, filename);
      progress.announce('Export complete.');
    } catch (err) {
      exportErrors.show(err, {
        actionLabel: 'Retry export',
        onAction: () => doExport(format),
      });
    } finally {
      downloadWavButton.disabled = false;
      downloadMp3Button.disabled = false;
      startOverButton.disabled = false;
      button.textContent = original;
    }
  }

  downloadScriptButton.addEventListener('click', () => {
    try {
      const { json, filename } = controller.exportScriptJson();
      downloadJson(json, filename);
    } catch (err) {
      exportErrors.show(err);
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
    review.reset();
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
      scriptErrors.show(state.error, {
        actionLabel: state.repairAvailable ? 'Repair script' : 'Generate again',
        onAction: () => {
          scriptErrors.clear();
          if (state.repairAvailable) controller.repairScript();
          else generateScriptButton.click();
        },
      });
    }

    if (state.script && state.status === 'ready') {
      speakerSettings.applyButton.hidden = false;
      speakerSettings.applyButton.disabled = state.renderStatus !== 'idle';
      const wasHidden = review.element.hidden;
      review.element.hidden = false;
      review.update(state.script);
      if (wasHidden) review.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        retry.addEventListener('click', async () => {
          const provider = await requireProvider({
            slot: 'tts',
            getSelected: ttsProviderSelect.getSelected,
            refresh: ttsProviderSelect.refresh,
          });
          if (provider) await controller.retrySegment(segment.id, provider, selectedTtsModel());
        });
        item.append(label, retry);
        failedList.append(item);
      }
    }

    if (state.renderStatus === 'rendering') {
      progress.announce('Rendering podcast audio.');
    }
    cancelRenderButton.disabled = state.renderStatus !== 'rendering';
    if (state.renderStatus === 'cancelled') {
      progress.announce('Render cancelled. Completed segments are saved locally.');
      if (previousRenderStatus !== 'cancelled') {
        notify({ type: 'warning', title: 'Render cancelled', message: 'Completed audio stays available locally.' });
      }
    }
    if (state.renderStatus === 'failed' && state.renderError) {
      progress.announce(`Render failed: ${state.renderError.message}`);
      renderErrors.show(state.renderError);
    }
    if (state.renderStatus === 'ready' && state.output) {
      progress.announce('Podcast audio ready.');
      const wasHidden = exportCard.hidden;
      exportCard.hidden = false;
      if (previousRenderStatus !== 'exporting') {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        audioUrl = URL.createObjectURL(state.output.wav);
        audio.src = audioUrl;
      }
      if (wasHidden) exportCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (previousRenderStatus === 'rendering') {
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
      `Last updated ${updated}. Requires TTS configuration “${job.settings.ttsProviderName ?? 'unknown'}” and model “${job.settings.ttsModel.model}”.`;

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

    const recoveryErrors = createErrorScope();

    resume.addEventListener('click', async () => {
      recoveryErrors.clear();
      const provider = await requireProvider({
        slot: 'tts',
        getSelected: ttsProviderSelect.getSelected,
        refresh: ttsProviderSelect.refresh,
      });
      if (!provider) return;
      recoveryCard.hidden = true;
      await controller.resumeRender(provider);
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
    const renderStatus = controller.store.get().renderStatus;
    generateScriptButton.disabled = scriptGenerating || !online;
    review.renderButton.disabled = review.isEditing() || !online || renderStatus === 'rendering' || renderStatus === 'exporting';
    if (resumeButton) resumeButton.disabled = !online;
  }
  subscribeOnline(syncOnline);

  syncStepper(controller.store.get());

  return {
    element: root,
    checkRecovery,
    getPromptPreview() {
      return { source: source.getText(), prefs: readPrefs() };
    },
  };
}
