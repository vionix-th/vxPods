/**
 * Podcast workflow view. Its navigation follows the actual page sections,
 * including generated sections as they become available.
 */

import { createSourceInput } from '../../components/source-input.js';
import { createProviderSelect } from '../../components/provider-select.js';
import { selectField, textAreaField, textField, cardHeader } from '../../components/fields.js';
import { createProgress } from '../../components/progress.js';
import { createErrorScope, notify } from '../../components/error-message.js';
import { confirmDialog } from '../../components/dialog.js';
import { requireProvider } from '../providers/provider-requirement.js';
import { openProviderSettings } from '../providers/provider-form.js';
import {
  getSelectedProviderId,
  listProviders,
  selectProvider,
  subscribeProviders,
} from '../providers/provider-store.js';
import { createPodcastScriptReview } from './podcast-script-review.js';
import { createEpisodePlanReview } from './episode-plan-review.js';
import { createPodcastSpeakerSettings } from './podcast-speaker-settings.js';
import {
  TEXT_GENERATION_API_LABELS,
} from '../../domain/provider-config.js';
import { downloadBlob, downloadJson } from '../../utils/download.js';
import { AppError } from '../../services/errors.js';
import {
  STARTER_EPISODE_DIRECTION_TEMPLATES,
  STARTER_FORMAT_TEMPLATES,
} from '../../domain/podcast-templates.js';
import {
  listEpisodeDirectionTemplates,
  listFormatTemplates,
  subscribePodcastTemplates,
} from './podcast-template-store.js';

const SECTIONS = [
  { id: 'source', label: 'Source' },
  { id: 'settings', label: 'Configure' },
  { id: 'generate', label: 'Generate' },
  { id: 'plan', label: 'Plan' },
  { id: 'script', label: 'Script' },
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

  // ---------- Section navigation
  const stepper = document.createElement('nav');
  stepper.className = 'stepper';
  stepper.setAttribute('aria-label', 'Podcast sections');
  const stepperList = document.createElement('ol');
  stepperList.className = 'stepper-list';
  stepper.append(stepperList);
  /** @type {Map<string, HTMLLIElement>} */
  const stepItems = new Map();
  /** @type {Map<string, HTMLElement>} */
  const stepCards = new Map();
  for (const section of SECTIONS) {
    const item = document.createElement('li');
    item.className = 'stepper-item';
    item.dataset.section = section.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stepper-button';
    button.textContent = section.label;
    button.addEventListener('click', () => {
      const card = stepCards.get(section.id);
      if (card && !card.hidden) {
        setCurrentSection(section.id);
        scrollTo(card);
        card.focus?.();
      }
    });
    item.append(button);
    stepperList.append(item);
    stepItems.set(section.id, item);
  }

  // ---------- Recovery panel
  const recoveryCard = document.createElement('section');
  recoveryCard.className = 'card recovery-card';
  recoveryCard.hidden = true;

  // ---------- Step 1: source
  const source = createSourceInput({
    title: 'Add source',
    help: 'vxPods uses this material as the basis for a spoken script in the selected format.',
  });

  // ---------- Step 2: preferences
  const prefsCard = document.createElement('section');
  prefsCard.className = 'card';
  prefsCard.append(cardHeader('Podcast settings'));

  const directionStarter = STARTER_EPISODE_DIRECTION_TEMPLATES[0];
  let selectedDirectionTemplateId = listEpisodeDirectionTemplates().find((record) =>
    record.id === directionStarter.id)?.id ?? directionStarter.id;
  const directionTemplateField = selectField({
    label: 'Episode direction template',
    options: [],
    value: selectedDirectionTemplateId,
  });
  const directionInstructionsField = textAreaField({
    label: 'Episode direction',
    value: listEpisodeDirectionTemplates().find((record) => record.id === selectedDirectionTemplateId)?.instructions
      ?? directionStarter.instructions,
    required: true,
    rows: 4,
    help: 'Define this episode’s purpose, angle, priorities, depth, and intentional omissions.',
  });
  directionInstructionsField.input.maxLength = 4000;
  const directionResetButton = document.createElement('button');
  directionResetButton.type = 'button';
  directionResetButton.className = 'button button-ghost button-small';
  directionResetButton.textContent = 'Reset to direction template';
  const directionStatus = document.createElement('p');
  directionStatus.className = 'help-text';
  directionStatus.setAttribute('aria-live', 'polite');
  const directionEditor = document.createElement('section');
  directionEditor.className = 'format-draft-editor';
  directionEditor.append(
    directionTemplateField.wrapper,
    directionInstructionsField.wrapper,
    directionStatus,
    directionResetButton,
  );

  const conversationStarter = STARTER_FORMAT_TEMPLATES[0];
  let selectedFormatTemplateId = listFormatTemplates().find((record) =>
    record.id === conversationStarter.id)?.id ?? conversationStarter.id;
  const formatTemplateField = selectField({
    label: 'Format template',
    options: [],
    value: selectedFormatTemplateId,
  });
  const formatInstructionsField = textAreaField({
    label: 'Format instructions',
    value: listFormatTemplates().find((record) => record.id === selectedFormatTemplateId)?.instructions
      ?? conversationStarter.instructions,
    required: true,
    rows: 5,
    help: 'Define discourse structure, linguistic behavior, interaction, and show-level delivery. Bundled variants provide editable terminology and definitions.',
  });
  formatInstructionsField.input.maxLength = 4000;
  const formatResetButton = document.createElement('button');
  formatResetButton.type = 'button';
  formatResetButton.className = 'button button-ghost button-small';
  formatResetButton.textContent = 'Reset to template';
  const formatStatus = document.createElement('p');
  formatStatus.className = 'help-text';
  formatStatus.setAttribute('aria-live', 'polite');
  const formatEditor = document.createElement('section');
  formatEditor.className = 'format-draft-editor';
  formatEditor.append(
    formatTemplateField.wrapper,
    formatInstructionsField.wrapper,
    formatStatus,
    formatResetButton,
  );
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
    options: [],
  });
  const ttsProviderSelect = createProviderSelect({
    label: 'TTS provider',
    getProviders: listProviders,
    getSelectedId: () => getSelectedProviderId('tts'),
    onSelect: (id) => selectProvider('tts', id),
  });
  const ttsModelField = selectField({
    label: 'TTS model',
    options: [],
  });

  prefsCard.append(
    directionEditor,
    formatEditor,
    audienceField.wrapper,
    textProviderSelect.element,
    ttsProviderSelect.element,
    textModelField.wrapper,
    ttsModelField.wrapper,
  );

  function refreshDirectionTemplates() {
    const templates = listEpisodeDirectionTemplates();
    const selected = templates.find((record) => record.id === selectedDirectionTemplateId);
    const optionIds = templates.map((record) => record.id);
    if (!selected) optionIds.push('__custom__');
    directionTemplateField.setOptions(optionIds);
    for (const option of directionTemplateField.input.options) {
      option.textContent = option.value === '__custom__'
        ? 'Custom (saved template unavailable)'
        : templates.find((record) => record.id === option.value)?.name ?? option.value;
    }
    directionTemplateField.input.value = selected ? selectedDirectionTemplateId : '__custom__';
    updateDirectionDraftState();
  }

  function updateDirectionDraftState() {
    const selected = listEpisodeDirectionTemplates().find((record) => record.id === selectedDirectionTemplateId);
    const dirty = !selected || directionInstructionsField.input.value !== selected.instructions;
    directionStatus.textContent = dirty ? 'Temporary changes.' : 'Using saved Episode direction instructions.';
    directionResetButton.disabled = !selected || !dirty;
  }

  directionTemplateField.input.addEventListener('change', async () => {
    const nextId = directionTemplateField.input.value;
    if (nextId === '__custom__') return;
    const current = listEpisodeDirectionTemplates().find((record) => record.id === selectedDirectionTemplateId);
    const dirty = !current || directionInstructionsField.input.value !== current.instructions;
    if (dirty) {
      const confirmed = await confirmDialog({
        title: 'Switch Episode direction',
        message: 'Discard temporary Episode direction changes and load another template?',
        confirmLabel: 'Discard and switch',
      });
      if (!confirmed) {
        refreshDirectionTemplates();
        return;
      }
    }
    const next = listEpisodeDirectionTemplates().find((record) => record.id === nextId);
    if (!next) return refreshDirectionTemplates();
    selectedDirectionTemplateId = next.id;
    directionInstructionsField.input.value = next.instructions;
    updateDirectionDraftState();
    markScriptDraftStale();
  });
  directionInstructionsField.input.addEventListener('input', () => {
    updateDirectionDraftState();
    markScriptDraftStale();
  });
  directionResetButton.addEventListener('click', () => {
    const selected = listEpisodeDirectionTemplates().find((record) => record.id === selectedDirectionTemplateId);
    if (!selected) return;
    directionInstructionsField.input.value = selected.instructions;
    updateDirectionDraftState();
    markScriptDraftStale();
    directionInstructionsField.input.focus();
  });

  function refreshFormatTemplates() {
    const templates = listFormatTemplates();
    const selected = templates.find((record) => record.id === selectedFormatTemplateId);
    const optionIds = templates.map((record) => record.id);
    if (!selected) optionIds.push('__custom__');
    formatTemplateField.setOptions(optionIds);
    for (const option of formatTemplateField.input.options) {
      option.textContent = option.value === '__custom__'
        ? 'Custom (saved template unavailable)'
        : templates.find((record) => record.id === option.value)?.name ?? option.value;
    }
    formatTemplateField.input.value = selected ? selectedFormatTemplateId : '__custom__';
    updateFormatDraftState();
  }

  function updateFormatDraftState() {
    const selected = listFormatTemplates().find((record) => record.id === selectedFormatTemplateId);
    const dirty = !selected || formatInstructionsField.input.value !== selected.instructions;
    formatStatus.textContent = dirty ? 'Temporary changes.' : 'Using saved template instructions.';
    formatResetButton.disabled = !selected || !dirty;
  }

  formatTemplateField.input.addEventListener('change', async () => {
    const nextId = formatTemplateField.input.value;
    if (nextId === '__custom__') return;
    const current = listFormatTemplates().find((record) => record.id === selectedFormatTemplateId);
    const dirty = !current || formatInstructionsField.input.value !== current.instructions;
    if (dirty) {
      const confirmed = await confirmDialog({
        title: 'Switch format template',
        message: 'Discard temporary format-instruction changes and load another template?',
        confirmLabel: 'Discard and switch',
      });
      if (!confirmed) {
        refreshFormatTemplates();
        return;
      }
    }
    const next = listFormatTemplates().find((record) => record.id === nextId);
    if (!next) {
      refreshFormatTemplates();
      return;
    }
    selectedFormatTemplateId = next.id;
    formatInstructionsField.input.value = next.instructions;
    updateFormatDraftState();
    markScriptDraftStale();
  });
  formatInstructionsField.input.addEventListener('input', () => {
    updateFormatDraftState();
    markScriptDraftStale();
  });
  formatResetButton.addEventListener('click', () => {
    const selected = listFormatTemplates().find((record) => record.id === selectedFormatTemplateId);
    if (!selected) return;
    formatInstructionsField.input.value = selected.instructions;
    updateFormatDraftState();
    markScriptDraftStale();
    formatInstructionsField.input.focus();
  });
  subscribePodcastTemplates(() => {
    refreshDirectionTemplates();
    refreshFormatTemplates();
  });
  refreshDirectionTemplates();
  refreshFormatTemplates();

  function refreshProviderSuggestions() {
    textProviderSelect.refresh();
    ttsProviderSelect.refresh();
    const textModels = textProviderSelect.getSelected()?.textGeneration.models ?? [];
    const ttsModels = ttsProviderSelect.getSelected()?.ttsModels ?? [];
    textModelField.setOptions(textModels);
    textModelField.input.disabled = textModels.length === 0;
    ttsModelField.setOptions(ttsModels.map((entry) => entry.model));
    ttsModelField.input.disabled = ttsModels.length === 0;
    speakerSettings.refresh();
  }
  function voiceOptions() {
    const provider = ttsProviderSelect.getSelected();
    return provider ? selectedTtsModel()?.voices ?? [] : [];
  }
  function selectedTtsModel() {
    const models = ttsProviderSelect.getSelected()?.ttsModels ?? [];
    return models.find((entry) => entry.model === ttsModelField.input.value);
  }
  textProviderSelect.element.addEventListener('change', refreshProviderSuggestions);
  ttsProviderSelect.element.addEventListener('change', refreshProviderSuggestions);
  ttsModelField.input.addEventListener('change', () => speakerSettings.refresh());
  subscribeProviders(refreshProviderSuggestions);

  // ---------- Step 3: editorial planning and script generation
  const scriptCard = document.createElement('section');
  scriptCard.className = 'card';
  scriptCard.append(cardHeader('Plan and generate'));
  const scriptSummary = document.createElement('p');
  scriptSummary.className = 'help-text';
  const speakerSettings = createPodcastSpeakerSettings({
    providerSelect: ttsProviderSelect,
    getTtsModel: selectedTtsModel,
    getVoiceOptions: voiceOptions,
    controller,
    onStructureChange: markScriptDraftStale,
  });
  refreshProviderSuggestions();
  const reviewPlanLabel = document.createElement('label');
  reviewPlanLabel.className = 'checkbox-row';
  const reviewPlanInput = document.createElement('input');
  reviewPlanInput.type = 'checkbox';
  const reviewPlanText = document.createElement('span');
  reviewPlanText.textContent = 'Review plan before writing';
  reviewPlanLabel.append(reviewPlanInput, reviewPlanText);
  const generateScriptButton = document.createElement('button');
  generateScriptButton.type = 'button';
  generateScriptButton.className = 'button button-primary';
  generateScriptButton.textContent = 'Generate script';
  const cancelGenerationButton = document.createElement('button');
  cancelGenerationButton.type = 'button';
  cancelGenerationButton.className = 'button button-secondary';
  cancelGenerationButton.textContent = 'Cancel generation';
  cancelGenerationButton.hidden = true;
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
    cancelGenerationButton,
    speakerSettings.applyButton,
    importScriptButton,
    importScriptInput,
  );
  const scriptStatus = document.createElement('p');
  scriptStatus.className = 'help-text';
  scriptStatus.setAttribute('aria-live', 'polite');
  const scriptStale = document.createElement('p');
  scriptStale.className = 'inline-notice inline-notice-warning';
  scriptStale.hidden = true;
  scriptStale.textContent = 'Current script uses previous generation settings. Generate again to apply format or cast changes.';
  const scriptErrors = createErrorScope();
  const planReview = createEpisodePlanReview({
    announce: (message) => progress.announce(message),
    onEditingChange: () => syncOnline(),
    onApply: (plan) => controller.applyEditedPlan(plan, source.getText(), readPrefs()),
    onGenerate: () => runScriptFromPlan(),
    onCreateNew: () => runPlanOnly(),
    onCancelGeneration: () => controller.cancelGeneration(),
    onRevise: async (request) => {
      const provider = await selectedTextProvider();
      if (!provider) return;
      await controller.revisePlan(source.getText(), readPrefs(), provider, request);
    },
  });
  scriptCard.append(
    scriptSummary,
    scriptStale,
    speakerSettings.element,
    reviewPlanLabel,
    scriptActions,
    scriptStatus,
    planReview.element,
  );

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
  stepCards.set('settings', prefsCard);
  stepCards.set('generate', scriptCard);
  stepCards.set('plan', planReview.element);
  stepCards.set('script', review.element);
  stepCards.set('render', renderCard);
  stepCards.set('export', exportCard);

  /** @type {string | null} */
  let audioUrl = null;
  let previousScriptStatus = 'idle';
  let previousRenderStatus = 'idle';
  let lastReviewedScript = null;
  let lastPresentedPlan = null;
  /** @type {HTMLButtonElement | null} */
  let resumeButton = null;

  // ---------- Section navigation state

  let currentSectionId = 'source';

  function setCurrentSection(id) {
    currentSectionId = id;
    for (const section of SECTIONS) {
      const item = stepItems.get(section.id);
      const card = stepCards.get(section.id);
      const available = Boolean(card && !card.hidden);
      item.hidden = !available;
      item.dataset.state = section.id === currentSectionId ? 'current' : 'available';
      const button = item.querySelector('button');
      button.disabled = !available;
      if (section.id === currentSectionId) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    }
  }

  function syncSectionNavigation() {
    const available = SECTIONS.filter((section) => {
      const card = stepCards.get(section.id);
      return card && !card.hidden;
    });
    if (!available.some((section) => section.id === currentSectionId)) {
      currentSectionId = available[0]?.id ?? 'source';
    }
    setCurrentSection(currentSectionId);
  }

  function updateCurrentSectionFromScroll() {
    const offset = stepper.getBoundingClientRect().height + 16;
    const available = SECTIONS.filter((section) => {
      const card = stepCards.get(section.id);
      return card && !card.hidden;
    });
    const active = [...available].reverse().find((section) =>
      stepCards.get(section.id).getBoundingClientRect().top <= offset,
    ) ?? available[0];
    if (active && active.id !== currentSectionId) setCurrentSection(active.id);
  }

  let sectionScrollFrame = null;
  globalThis.addEventListener('scroll', () => {
    if (sectionScrollFrame !== null) return;
    sectionScrollFrame = globalThis.requestAnimationFrame(() => {
      sectionScrollFrame = null;
      updateCurrentSectionFromScroll();
    });
  }, { passive: true });

  // ---------- Preferences behavior

  let generationShapeChanged = false;

  function markScriptDraftStale() {
    if (!controller.store.get().script && !controller.store.get().plan) return;
    generationShapeChanged = true;
    controller.markPlanningInputsStale();
    syncSpeakerApplyState();
  }

  function clearScriptDraftStale() {
    generationShapeChanged = false;
    scriptStale.hidden = !generationShapeChanged;
    syncSpeakerApplyState();
  }

  function syncSpeakerApplyState() {
    const state = controller.store.get();
    speakerSettings.applyButton.disabled = state.renderStatus !== 'idle' ||
      Boolean(state.script && !speakerSettings.matchesScriptCast(state.script));
  }

  function readPrefs() {
    return {
      episodeDirection: directionInstructionsField.input.value.trim(),
      formatInstructions: formatInstructionsField.input.value.trim(),
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

  source.element.addEventListener('input', () => {
    syncSectionNavigation();
    markScriptDraftStale();
  });
  audienceField.input.addEventListener('input', markScriptDraftStale);
  reviewPlanInput.addEventListener('change', () => {
    generateScriptButton.textContent = reviewPlanInput.checked ? 'Create plan' : 'Generate script';
  });

  // ---------- Script generation

  async function selectedTextProvider() {
    scriptErrors.clear();
    const provider = await requireProvider({
      slot: 'text',
      getSelected: textProviderSelect.getSelected,
      refresh: textProviderSelect.refresh,
    });
    if (!provider) return null;
    const prefs = readPrefs();
    if (!prefs.textModel) {
      scriptErrors.show(new AppError({
        kind: 'validation',
        message: 'No script models are configured. Add a model in provider settings.',
        retryable: false,
        status: undefined,
      }));
      return null;
    }
    return provider;
  }

  async function runPlanOnly() {
    const provider = await selectedTextProvider();
    if (!provider) return;
    try {
      await controller.generatePlan(source.getText(), readPrefs(), provider);
    } catch (error) {
      scriptErrors.show(error);
    }
  }

  async function runScriptFromPlan() {
    const provider = await selectedTextProvider();
    if (!provider) return;
    try {
      await controller.generateScriptFromPlan(source.getText(), readPrefs(), provider);
    } catch (error) {
      scriptErrors.show(error);
    }
  }

  generateScriptButton.addEventListener('click', async () => {
    const provider = await selectedTextProvider();
    if (!provider) return;
    try {
      if (reviewPlanInput.checked) await controller.generatePlan(source.getText(), readPrefs(), provider);
      else await controller.generateScript(source.getText(), readPrefs(), provider);
    } catch (error) {
      scriptErrors.show(error);
    }
    if (controller.store.get().script && !controller.store.get().scriptStale) clearScriptDraftStale();
  });
  cancelGenerationButton.addEventListener('click', () => controller.cancelGeneration());

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
      clearScriptDraftStale();
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
    let downloadTriggered = false;
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
      downloadTriggered = true;
      await controller.completeExport();
      progress.announce('Export complete.');
    } catch (err) {
      const retry = downloadTriggered ? {} : {
        actionLabel: 'Retry export',
        onAction: () => doExport(format),
      };
      exportErrors.show(err, retry);
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
    planReview.reset();
    controller.resetGenerationSession();
    renderCard.hidden = true;
    exportCard.hidden = true;
    source.setText('');
  });

  // ---------- Controller state rendering

  controller.store.subscribe((state) => {
    const generating = state.status === 'generating' || state.status === 'cancelling';
    scriptGenerating = generating;
    syncOnline();
    const phaseLabels = {
      planning: 'Planning episode…',
      'revising-plan': 'Revising editorial plan…',
      'repairing-plan': 'Repairing and validating editorial plan…',
      'writing-script': 'Writing and validating script…',
      'repairing-script': 'Repairing and validating script…',
    };
    scriptStatus.textContent = generating
      ? state.status === 'cancelling' ? 'Cancelling generation…' : phaseLabels[state.generationPhase] ?? 'Generating…'
      : '';
    // A saved plan has its own action bar directly above the plan. Keeping the
    // cancellation control there avoids sending the user back past the plan
    // just to stop the operation they started from it.
    cancelGenerationButton.hidden = !generating || Boolean(state.plan);
    cancelGenerationButton.disabled = state.status === 'cancelling';
    scriptStale.hidden = !state.scriptStale;
    scriptStale.textContent = state.planStale
      ? 'The current plan and script reflect earlier source or podcast settings. The existing script remains renderable.'
      : 'The current script reflects an earlier editorial plan. It remains renderable until regenerated.';
    planReview.update(state.plan, readPrefs(), {
      stale: state.planStale,
      busy: generating,
      cancelling: state.status === 'cancelling',
      offline: !isOnline(),
    });

    if (state.status === 'cancelled' && previousScriptStatus === 'cancelling') {
      progress.announce('Podcast generation cancelled. Existing plan and script are preserved.');
      generateScriptButton.focus();
    }

    if (state.status === 'failed' && state.error) {
      const failedInPlan = ['planning', 'revising-plan', 'repairing-plan'].includes(state.failedGenerationPhase);
      const actionLabel = state.planRepairAvailable
        ? 'Repair plan'
        : state.repairAvailable
          ? 'Repair script'
          : failedInPlan
            ? 'Retry plan'
            : state.failedGenerationPhase === 'writing-script'
              ? 'Retry script'
              : 'Generate again';
      scriptErrors.show(state.error, {
        actionLabel,
        onAction: () => {
          scriptErrors.clear();
          if (state.planRepairAvailable) controller.repairPlan();
          else if (state.repairAvailable) controller.repairScript();
          else if (failedInPlan) controller.retryPlanGeneration();
          else if (state.failedGenerationPhase === 'writing-script') controller.retryScriptGeneration();
          else generateScriptButton.click();
        },
      });
    }

    if (state.plan && state.status === 'ready' && state.plan !== lastPresentedPlan) {
      if (!state.script || state.scriptStale) {
        notify({ type: 'success', title: 'Editorial plan ready', message: 'Review, revise, or use it to generate the script.' });
      }
      lastPresentedPlan = state.plan;
    }

    if (state.script && state.status === 'ready') {
      speakerSettings.applyButton.hidden = false;
      syncSpeakerApplyState();
      const wasHidden = review.element.hidden;
      review.element.hidden = false;
      const scriptChanged = state.script !== lastReviewedScript;
      if (scriptChanged) {
        speakerSettings.hydrate(state.script);
        review.update(state.script);
        lastReviewedScript = state.script;
      }
      syncSpeakerApplyState();
      if (wasHidden && !state.scriptStale) scrollTo(review.element);
      if (scriptChanged && !state.scriptStale) {
        notify({ type: 'success', title: 'Script ready', message: 'Review it or render audio.' });
      }
    }

    const renderActive = state.renderStatus !== 'idle';
    if (renderActive && renderCard.hidden) {
      renderCard.hidden = false;
      scrollTo(renderCard);
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
          try {
            const job = await controller.getRecoverableJob();
            const provider = job && providerForJob(job);
            if (!job || !provider) {
              showMissingRecoveryProvider(renderErrors, job);
              return;
            }
            await controller.retrySegment(segment.id, provider);
          } catch (error) {
            renderErrors.show(error);
          }
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
      if (wasHidden) scrollTo(exportCard);
      if (previousRenderStatus === 'rendering') {
        notify({ type: 'success', title: 'Audio ready', message: 'Preview it or download WAV or MP3.' });
      }
    }

    syncSectionNavigation();
    updateCurrentSectionFromScroll();
    previousScriptStatus = state.status;
    previousRenderStatus = state.renderStatus;
  });

  // ---------- Recovery

  async function checkRecovery() {
    let job;
    try {
      job = await controller.getRecoverableJob();
    } catch (error) {
      renderInvalidRecovery(error);
      return;
    }
    if (!job) return;
    if (job.status === 'ready') {
      try {
        await controller.restoreReadyRender();
      } catch (error) {
        renderInvalidRecovery(error);
      }
      return;
    }
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
      const provider = providerForJob(job);
      if (!provider) {
        showMissingRecoveryProvider(recoveryErrors, job);
        return;
      }
      try {
        await controller.resumeRender(provider);
        recoveryCard.hidden = true;
      } catch (error) {
        recoveryErrors.show(error);
      }
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

  function providerForJob(job) {
    return listProviders().find((provider) => provider.id === job.settings.ttsProviderId) ?? null;
  }

  function showMissingRecoveryProvider(errorScope, job) {
    const name = job?.settings.ttsProviderName ?? job?.settings.ttsProviderId ?? 'unknown';
    errorScope.show(new AppError({
      kind: 'validation',
      message: `This render requires TTS configuration “${name}”. Restore it or discard the render.`,
      retryable: false,
      status: undefined,
    }), {
      actionLabel: 'Open provider settings',
      onAction: () => openProviderSettings({ onChange: refreshProviderSuggestions }),
    });
  }

  function renderInvalidRecovery(error) {
    recoveryCard.hidden = false;
    recoveryCard.replaceChildren();
    recoveryCard.append(cardHeader('Saved render unavailable'));
    const message = document.createElement('p');
    message.className = 'help-text';
    message.textContent = error instanceof Error ? error.message : 'Saved render data could not be read.';
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'button button-danger';
    discard.textContent = 'Discard saved render';
    discard.addEventListener('click', async () => {
      try {
        await controller.discardRender();
        recoveryCard.hidden = true;
      } catch (discardError) {
        renderErrors.show(discardError);
      }
    });
    recoveryCard.append(message, discard);
  }

  /**
   * @param {import('../../storage/render-job-store.js').RenderJob} job
   */
  function completedCount(job) {
    return Object.values(job.segmentStates).filter((s) => s === 'completed').length;
  }

  function scrollTo(element) {
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  // ---------- Online state

  let scriptGenerating = false;
  function syncOnline() {
    const online = isOnline();
    const currentState = controller.store.get();
    const renderStatus = currentState.renderStatus;
    const planEditing = planReview.isEditing();
    generateScriptButton.disabled = planEditing || scriptGenerating || !online;
    importScriptButton.disabled = planEditing || scriptGenerating;
    reviewPlanInput.disabled = planEditing || scriptGenerating;
    review.renderButton.disabled = review.isEditing() || !online || renderStatus === 'rendering' || renderStatus === 'exporting';
    planReview.update(currentState.plan, readPrefs(), {
      stale: currentState.planStale,
      busy: scriptGenerating,
      offline: !online,
    });
    if (resumeButton) resumeButton.disabled = !online;
  }
  subscribeOnline(syncOnline);

  syncSectionNavigation();
  updateCurrentSectionFromScroll();

  return {
    element: root,
    checkRecovery,
    getPromptPreview() {
      return { source: source.getText(), prefs: readPrefs(), plan: controller.store.get().plan };
    },
  };
}
