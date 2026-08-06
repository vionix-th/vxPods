/**
 * Provider settings dialog: saved configuration list plus create/edit form
 * with preset selection, masked key handling, and connection tests.
 */

import { openDialog, confirmDialog } from '../../components/dialog.js';
import { renderError, clearError, notify } from '../../components/error-message.js';
import { testTextGenerationConnection } from '../../services/text-generation-client.js';
import { testSpeechConnection } from '../../services/speech-client.js';
import { toAppError } from '../../services/errors.js';
import { downloadJson } from '../../utils/download.js';
import { renderPromptTemplateSettings } from '../podcast/prompt-template-form.js';
import {
  PROVIDER_PRESETS,
  addProvider,
  deleteProvider,
  exportSettingsBackup,
  listProviders,
  restoreSettingsBackup,
  updateProvider,
  validateSettingsBackup,
} from './provider-store.js';
import {
  DEFAULT_TTS_MODELS,
  DEFAULT_VOICES,
  TEXT_GENERATION_APIS,
  TEXT_GENERATION_API_LABELS,
  defaultTextModels,
  normalizeSuggestions,
} from './provider-suggestions.js';

const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_VOICE = 'alloy';

/**
 * Open the provider management dialog.
 * @param {Object} [options]
 * @param {() => void} [options.onChange] called after any mutation
 * @param {boolean} [options.startCreate] open directly on a new configuration form
 * @param {boolean} [options.closeOnSave] close dialog after a successful save
 * @param {(provider: import('../../storage/local-settings.js').ProviderConfig) => void} [options.onSaved]
 * @param {() => Promise<void>} [options.onClearLocalData] clear all browser-local application data
 */
export function openSettings(options = {}) {
  const handle = openDialog({
    title: 'Settings',
    className: 'settings-dialog',
    render(body) {
      if (options.startCreate) renderProviderFormPage(body, options, null);
      else renderSettingsSection(body, options, 'providers');
    },
  });
  return handle;
}

/** Backward-compatible provider-focused entry point. */
export function openProviderSettings(options = {}) {
  return openSettings(options);
}

/**
 * Render a settings page within a shared navigation frame.
 * @param {HTMLElement} body
 * @param {Object} options
 * @param {'providers'|'templates'|'data'} activeSection
 */
function renderSettingsSection(body, options, activeSection) {
  renderSettingsFrame(body, activeSection, (section) => renderSettingsSection(body, options, section), (content) => {
    const navigation = createNavigation(body, options);
    if (activeSection === 'providers') {
      renderProviderManager(content, navigation);
      return;
    }
    if (activeSection === 'templates') {
      renderPromptTemplateSettings(content, {
        onBack: navigation.openProviders,
        onChange: options.onChange,
        getPromptPreview: options.getPromptPreview,
      });
      return;
    }
    renderDataPrivacy(content, navigation);
  });
}

/**
 * @param {HTMLElement} body
 * @param {Object} options
 * @param {import('../../storage/local-settings.js').ProviderConfig | null} existing
 */
function renderProviderFormPage(body, options, existing) {
  renderSettingsFrame(body, 'providers', (section) => renderSettingsSection(body, options, section), (content) => {
    renderForm(content, createNavigation(body, options), existing);
  });
}

/**
 * @param {HTMLElement} body
 * @param {'providers'|'templates'|'data'} activeSection
 * @param {(section: 'providers'|'templates'|'data') => void} navigate
 * @param {(content: HTMLElement) => void} renderContent
 */
function renderSettingsFrame(body, activeSection, navigate, renderContent) {
  body.replaceChildren();
  const layout = document.createElement('div');
  layout.className = 'settings-layout';
  const navigation = document.createElement('nav');
  navigation.className = 'settings-navigation';
  navigation.setAttribute('aria-label', 'Settings sections');
  const content = document.createElement('section');
  content.className = 'settings-content';

  const sections = [
    ['providers', 'Providers'],
    ['templates', 'Prompt templates'],
    ['data', 'Data & privacy'],
  ];
  for (const [id, label] of sections) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-nav-button';
    button.textContent = label;
    const selected = id === activeSection;
    button.setAttribute('aria-current', selected ? 'page' : 'false');
    if (selected) button.classList.add('is-active');
    button.addEventListener('click', () => {
      if (id !== activeSection) navigate(/** @type {'providers'|'templates'|'data'} */ (id));
    });
    navigation.append(button);
  }

  layout.append(navigation, content);
  body.append(layout);
  renderContent(content);
}

/**
 * @param {HTMLElement} body
 * @param {Object} options
 */
function createNavigation(body, options) {
  return {
    ...options,
    openProviders: () => renderSettingsSection(body, options, 'providers'),
    openProviderForm: (existing) => renderProviderFormPage(body, options, existing),
    openPromptTemplates: () => renderSettingsSection(body, options, 'templates'),
    openDataPrivacy: () => renderSettingsSection(body, options, 'data'),
  };
}

/**
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void, openProviderForm: (existing: import('../../storage/local-settings.js').ProviderConfig | null) => void }} options
 */
function renderProviderManager(body, options) {
  body.replaceChildren();

  const heading = document.createElement('h3');
  heading.textContent = 'Providers';

  const explainer = document.createElement('p');
  explainer.className = 'help-text';
  explainer.textContent =
    'Configurations stay in this browser and requests go directly to the selected provider.';

  const list = document.createElement('ul');
  list.className = 'provider-list';

  const providers = listProviders();
  if (providers.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'provider-empty';
    empty.textContent = 'No saved configurations yet.';
    list.append(empty);
  }
  for (const provider of providers) {
    list.append(renderProviderRow(provider, body, options));
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'button button-primary';
  addButton.textContent = 'Add provider';
  addButton.addEventListener('click', () => options.openProviderForm(null));

  const pageHeader = document.createElement('header');
  pageHeader.className = 'settings-page-header';
  const copy = document.createElement('div');
  copy.className = 'settings-page-copy';
  copy.append(heading, explainer);
  pageHeader.append(copy, addButton);

  body.append(pageHeader, list);
}

/**
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void, onClearLocalData?: () => Promise<void>, openDataPrivacy: () => void }} options
 */
function renderDataPrivacy(body, options) {
  body.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = 'Data & privacy';
  const lead = document.createElement('p');
  lead.className = 'help-text';
  lead.textContent =
    'Provider configurations, keys, selections, and prompt templates stay in this browser. Generation requests go directly to the provider you select.';
  const backup = document.createElement('section');
  backup.className = 'settings-data-section';
  const backupHeading = document.createElement('h4');
  backupHeading.textContent = 'Settings backup';
  const backupHelp = document.createElement('p');
  backupHelp.className = 'help-text';
  backupHelp.textContent = 'Exports include unencrypted API keys. Keep backup files private.';
  const backupActions = document.createElement('div');
  backupActions.className = 'action-row';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'button button-secondary';
  exportButton.textContent = 'Export settings';
  exportButton.addEventListener('click', () => {
    downloadJson(exportSettingsBackup(), 'vxpods-settings.json');
    notify({
      type: 'warning',
      title: 'Sensitive export created',
      message: 'Settings export includes unencrypted API keys. Store it securely and do not share it.',
    });
  });
  const restoreButton = document.createElement('button');
  restoreButton.type = 'button';
  restoreButton.className = 'button button-secondary';
  restoreButton.textContent = 'Restore settings';
  const restoreInput = document.createElement('input');
  restoreInput.type = 'file';
  restoreInput.accept = '.json,application/json';
  restoreInput.hidden = true;
  const restoreError = document.createElement('div');
  restoreButton.addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files?.[0];
    restoreInput.value = '';
    if (!file) return;
    try {
      const backup = await file.text();
      const settings = validateSettingsBackup(backup);
      const confirmed = await confirmDialog({
        title: 'Restore settings',
        message: 'This fully replaces all saved provider configurations, model and voice lists, selections, and prompt templates. Existing settings will be lost.',
        confirmLabel: 'Replace all settings',
      });
      if (!confirmed) return;
      restoreSettingsBackup(settings);
      options.onChange?.();
      notify({ type: 'success', title: 'Settings restored', message: 'Saved settings were fully replaced.' });
      renderDataPrivacy(body, options);
    } catch (err) {
      renderError(restoreError, toAppError(err));
    }
  });
  backupActions.append(exportButton, restoreButton, restoreInput);
  backup.append(backupHeading, backupHelp, backupActions);

  const danger = document.createElement('section');
  danger.className = 'settings-data-section settings-danger-zone';
  const dangerHeading = document.createElement('h4');
  dangerHeading.textContent = 'Danger zone';
  const dangerHelp = document.createElement('p');
  dangerHelp.className = 'help-text';
  dangerHelp.textContent =
    'Clear all saved provider configurations, plaintext keys, selections, prompt templates, and unfinished work from this browser.';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'button button-danger';
  clearButton.textContent = 'Clear local data';
  clearButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Clear local data',
      message:
        'This permanently removes saved provider configurations, plaintext API keys, selections, prompt templates, and unfinished work from this browser.',
      confirmLabel: 'Clear local data',
    });
    if (!confirmed || !options.onClearLocalData) return;
    try {
      await options.onClearLocalData();
    } catch (err) {
      notify({ type: 'error', title: 'Could not clear local data', message: toAppError(err).message });
    }
  });
  danger.append(dangerHeading, dangerHelp, clearButton);

  const pageHeader = document.createElement('header');
  pageHeader.className = 'settings-page-header';
  const copy = document.createElement('div');
  copy.className = 'settings-page-copy';
  copy.append(heading, lead);
  pageHeader.append(copy);

  body.append(pageHeader, backup, danger);
}

/**
 * @param {import('../../storage/local-settings.js').ProviderConfig} provider
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void, openProviderForm: (existing: import('../../storage/local-settings.js').ProviderConfig | null) => void }} options
 */
function renderProviderRow(provider, body, options) {
  const item = document.createElement('li');
  item.className = 'provider-row';

  const info = document.createElement('div');
  info.className = 'provider-info';
  const name = document.createElement('span');
  name.className = 'provider-name';
  name.textContent = provider.name;
  const url = document.createElement('span');
  url.className = 'provider-url';
  url.textContent = provider.baseUrl;
  url.title = provider.baseUrl;
  const keyState = document.createElement('span');
  keyState.className = 'provider-key-state';
  keyState.textContent = `Key saved · ${TEXT_GENERATION_API_LABELS[provider.textGeneration.api]}`;
  info.append(name, url, keyState);

  const actions = document.createElement('div');
  actions.className = 'provider-actions';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'button button-secondary button-small';
  edit.textContent = 'Edit';
  edit.addEventListener('click', () => options.openProviderForm(provider));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button button-danger button-small';
  remove.textContent = 'Delete';
  remove.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete configuration',
      message: `Delete “${provider.name}”? Selections using it will be cleared.`,
      confirmLabel: 'Delete configuration',
    });
    if (!confirmed) return;
    deleteProvider(provider.id);
    options.onChange?.();
    renderProviderManager(body, options);
  });

  actions.append(edit, remove);
  item.append(info, actions);
  return item;
}

/**
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void, openProviders: () => void }} options
 * @param {import('../../storage/local-settings.js').ProviderConfig | null} existing
 */
function renderForm(body, options, existing) {
  body.replaceChildren();

  const pageHeader = document.createElement('header');
  pageHeader.className = 'settings-page-header';
  const pageCopy = document.createElement('div');
  pageCopy.className = 'settings-page-copy';
  const pageTitle = document.createElement('h3');
  pageTitle.textContent = existing ? 'Edit provider' : 'Add provider';
  const pageLead = document.createElement('p');
  pageLead.className = 'help-text';
  pageLead.textContent = 'Save a configuration for direct text generation and speech requests from this browser.';
  pageCopy.append(pageTitle, pageLead);
  pageHeader.append(pageCopy);

  const form = document.createElement('form');
  form.className = 'provider-form settings-form';
  form.noValidate = true;

  const errorRegion = document.createElement('div');
  errorRegion.className = 'error-region';

  // Preset selector
  const presetField = fieldset('Preset');
  const presetName = `preset-${Math.random().toString(36).slice(2, 8)}`;
  let selectedPreset = 'manual';
  if (existing) {
    selectedPreset =
      Object.entries(PROVIDER_PRESETS).find(([, p]) => p.baseUrl === existing.baseUrl)?.[0] ||
      'manual';
  }
  /** @type {HTMLInputElement[]} */
  const presetRadios = [];
  for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
    const label = document.createElement('label');
    label.className = 'radio-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = presetName;
    radio.value = key;
    radio.checked = key === selectedPreset;
    presetRadios.push(radio);
    const text = document.createElement('span');
    text.textContent = preset.label;
    label.append(radio, text);
    presetField.append(label);
  }

  // Name
  const nameField = textField({
    label: 'Name',
    value: existing?.name ?? '',
    required: true,
    autocomplete: 'off',
  });

  // Base URL
  const urlField = textField({
    label: 'Base URL',
    value: existing?.baseUrl ?? PROVIDER_PRESETS.openai.baseUrl,
    required: true,
    inputmode: 'url',
    help: 'OpenAI-compatible API root ending in /v1.',
  });

  // API key with show/hide
  const keyWrapper = document.createElement('div');
  keyWrapper.className = 'field';
  const keyLabel = document.createElement('label');
  const keyId = `key-${Math.random().toString(36).slice(2, 8)}`;
  keyLabel.setAttribute('for', keyId);
  keyLabel.textContent = existing ? 'API key (leave empty to keep saved key)' : 'API key';
  const keyRow = document.createElement('div');
  keyRow.className = 'key-row';
  const keyInput = document.createElement('input');
  keyInput.id = keyId;
  keyInput.type = 'password';
  keyInput.autocomplete = 'off';
  keyInput.placeholder = existing ? '••••••••' : '';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'button button-ghost button-small';
  toggle.textContent = 'Show';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => {
    const show = keyInput.type === 'password';
    keyInput.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(show));
  });
  keyRow.append(keyInput, toggle);
  keyWrapper.append(keyLabel, keyRow);

  const textApiField = fieldset('Text generation API');
  const textApiName = `text-api-${Math.random().toString(36).slice(2, 8)}`;
  let selectedTextApi = existing?.textGeneration.api ?? TEXT_GENERATION_APIS.chatCompletions;
  /** @type {HTMLInputElement[]} */
  const textApiRadios = [];
  for (const api of Object.values(TEXT_GENERATION_APIS)) {
    const label = document.createElement('label');
    label.className = 'radio-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = textApiName;
    radio.value = api;
    radio.checked = api === selectedTextApi;
    textApiRadios.push(radio);
    const text = document.createElement('span');
    text.textContent = TEXT_GENERATION_API_LABELS[api];
    label.append(radio, text);
    textApiField.append(label);
  }

  const capabilityEditor = document.createElement('section');
  capabilityEditor.className = 'capability-editor';
  const editorTitle = document.createElement('h3');
  editorTitle.textContent = 'Available models and voices';
  const editorLead = document.createElement('p');
  editorLead.className = 'help-text';
  editorLead.textContent =
    'Maintain the exact identifiers accepted by this provider. Voice options belong to a specific TTS model and appear automatically in the generation workflows.';
  const textModelsEditor = createIdentifierListEditor({
    title: 'Text generation models',
    description: 'Used for podcast script generation.',
    itemLabel: 'Text generation model',
    addLabel: 'Add text generation model',
    values: existing?.textGeneration.models ?? defaultTextModels(selectedTextApi),
  });
  const ttsModelsEditor = createTtsModelEditor({
    models: existing?.ttsModels ?? DEFAULT_TTS_MODELS,
    voicesByTtsModel: existing?.voicesByTtsModel ?? {},
  });
  const restoreDefaults = document.createElement('button');
  restoreDefaults.type = 'button';
  restoreDefaults.className = 'button button-ghost button-small';
  restoreDefaults.textContent = 'Restore all standard defaults';
  restoreDefaults.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Restore all model and voice defaults',
      message: 'This replaces every configured text generation model, TTS model, and model-specific voice list for this provider. Save the configuration to keep the restored values.',
      confirmLabel: 'Restore all defaults',
    });
    if (!confirmed) return;
    textModelsEditor.reset(defaultTextModels(selectedTextApi));
    ttsModelsEditor.reset(DEFAULT_TTS_MODELS);
  });
  capabilityEditor.append(
    editorTitle,
    editorLead,
    textModelsEditor.element,
    ttsModelsEditor.element,
    restoreDefaults,
  );

  // Actions
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'button button-ghost';
  back.textContent = 'Back';
  back.addEventListener('click', options.openProviders);

  const testText = document.createElement('button');
  testText.type = 'button';
  testText.className = 'button button-secondary';
  testText.textContent = 'Test generation';

  const testSpeech = document.createElement('button');
  testSpeech.type = 'button';
  testSpeech.className = 'button button-secondary';
  testSpeech.textContent = 'Test Speech';

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'button button-primary';
  save.textContent = existing ? 'Save changes' : 'Save configuration';

  actions.append(back, testText, testSpeech, save);

  const status = document.createElement('p');
  status.className = 'help-text';
  status.setAttribute('aria-live', 'polite');

  form.append(presetField, nameField.wrapper, urlField.wrapper, keyWrapper, textApiField, capabilityEditor, errorRegion, status, actions);
  body.append(pageHeader, form);

  function currentPreset() {
    return presetRadios.find((r) => r.checked)?.value ?? 'manual';
  }
  for (const radio of presetRadios) {
    radio.addEventListener('change', () => {
      const preset = PROVIDER_PRESETS[currentPreset()];
      if (preset.baseUrl) urlField.input.value = preset.baseUrl;
      urlField.input.disabled = currentPreset() !== 'manual';
    });
  }
  urlField.input.disabled = currentPreset() !== 'manual';

  for (const radio of textApiRadios) {
    radio.addEventListener('change', async () => {
      if (!radio.checked || radio.value === selectedTextApi) return;
      const nextApi = radio.value;
      const confirmed = await confirmDialog({
        title: 'Change text generation API',
        message: `Changing to ${TEXT_GENERATION_API_LABELS[nextApi]} replaces the configured text generation model list with its standard defaults.`,
        confirmLabel: 'Change API',
      });
      if (!confirmed) {
        for (const option of textApiRadios) option.checked = option.value === selectedTextApi;
        return;
      }
      selectedTextApi = nextApi;
      textModelsEditor.reset(defaultTextModels(selectedTextApi));
    });
  }

  function readForm() {
    const { ttsModels, voicesByTtsModel } = ttsModelsEditor.values();
    return {
      name: nameField.input.value,
      baseUrl: urlField.input.value,
      apiKey: keyInput.value,
      textGeneration: {
        api: selectedTextApi,
        models: textModelsEditor.values(),
      },
      ttsModels,
      voicesByTtsModel,
    };
  }

  async function runTest(kind) {
    clearError(errorRegion);
    const capability = kind === 'text' ? TEXT_GENERATION_API_LABELS[selectedTextApi] : 'Speech';
    status.textContent = `Testing ${capability}…`;
    const values = readForm();
    const provider = {
      baseUrl: values.baseUrl.trim(),
      apiKey: values.apiKey.trim() || existing?.apiKey || '',
    };
    try {
      if (kind === 'text') {
        provider.textGeneration = values.textGeneration;
        await testTextGenerationConnection(provider, values.textGeneration.models[0]);
      } else {
        await testSpeechConnection(
          provider,
          values.ttsModels[0] || DEFAULT_TTS_MODEL,
          values.voicesByTtsModel[values.ttsModels[0]]?.[0] || DEFAULT_VOICE,
        );
      }
      status.textContent = `${capability} endpoint reachable.`;
      notify({
        type: 'success',
        title: 'Connection verified',
        message: `${capability} endpoint is reachable.`,
      });
    } catch (err) {
      status.textContent = '';
      renderError(errorRegion, toAppError(err));
    }
  }

  testText.addEventListener('click', () => runTest('text'));
  testSpeech.addEventListener('click', () => runTest('speech'));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError(errorRegion);
    try {
      if (existing) {
        const saved = updateProvider(existing.id, readForm());
        options.onSaved?.(saved);
      } else {
        const saved = addProvider(readForm());
        options.onSaved?.(saved);
      }
      options.onChange?.();
      notify({
        type: 'success',
        title: 'Provider saved',
        message: 'Configuration is ready to use.',
      });
      if (!options.closeOnSave) options.openProviders();
    } catch (err) {
      renderError(errorRegion, toAppError(err));
    }
  });
}

/**
 * @param {string} legend
 * @returns {HTMLFieldSetElement}
 */
function fieldset(legend) {
  const set = document.createElement('fieldset');
  set.className = 'field fieldset';
  const legendEl = document.createElement('legend');
  legendEl.textContent = legend;
  set.append(legendEl);
  return set;
}

/**
 * @param {Object} args
 * @param {string} args.label
 * @param {string} args.value
 * @param {boolean} [args.required]
 * @param {string} [args.autocomplete]
 * @param {string} [args.inputmode]
 * @param {string} [args.help]
 */
function textField({ label, value, required, autocomplete, inputmode, help }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const id = `field-${Math.random().toString(36).slice(2, 8)}`;
  const labelEl = document.createElement('label');
  labelEl.setAttribute('for', id);
  labelEl.textContent = required ? `${label} (required)` : label;
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.value = value;
  if (autocomplete) input.autocomplete = autocomplete;
  if (inputmode) input.inputMode = inputmode;
  if (required) input.required = true;
  wrapper.append(labelEl, input);
  if (help) {
    const helpEl = document.createElement('p');
    helpEl.className = 'help-text';
    helpEl.textContent = help;
    wrapper.append(helpEl);
  }
  return { wrapper, input };
}

/**
 * @param {{ title: string, description: string, itemLabel: string, addLabel: string, values: string[] }} args
 */
function createIdentifierListEditor({ title, description, itemLabel, addLabel, values }) {
  const element = document.createElement('section');
  element.className = 'identifier-list-editor';
  const heading = document.createElement('h4');
  heading.textContent = title;
  const help = document.createElement('p');
  help.className = 'help-text';
  help.textContent = description;
  const chips = document.createElement('div');
  chips.className = 'model-chip-list';
  chips.setAttribute('role', 'list');
  const detail = document.createElement('div');
  detail.className = 'identifier-detail';
  const entries = values.map((value) => ({ value }));
  let selectedIndex = 0;

  function render() {
    chips.replaceChildren();
    detail.replaceChildren();
    entries.forEach((entry, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `model-chip${index === selectedIndex ? ' is-selected' : ''}`;
      chip.textContent = entry.value || `New ${itemLabel.toLowerCase()}`;
      chip.setAttribute('aria-pressed', String(index === selectedIndex));
      chip.addEventListener('click', () => {
        selectedIndex = index;
        render();
      });
      chips.append(chip);
    });
    const entry = entries[selectedIndex];
    if (!entry) return;
    const field = textField({ label: `${itemLabel} identifier`, value: entry.value });
    field.input.addEventListener('input', () => {
      entry.value = field.input.value;
      chips.children[selectedIndex].textContent = entry.value || `New ${itemLabel.toLowerCase()}`;
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button button-ghost button-small';
    remove.textContent = `Remove ${itemLabel.toLowerCase()}`;
    remove.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: `Remove ${itemLabel.toLowerCase()}`,
        message: `Remove “${entry.value || `this ${itemLabel.toLowerCase()}`}” from this provider configuration?`,
        confirmLabel: `Remove ${itemLabel.toLowerCase()}`,
      });
      if (!confirmed) return;
      entries.splice(selectedIndex, 1);
      selectedIndex = Math.max(0, selectedIndex - 1);
      render();
    });
    detail.append(field.wrapper, remove);
  }
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'button button-secondary button-small';
  addButton.textContent = addLabel;
  addButton.addEventListener('click', () => {
    entries.push({ value: '' });
    selectedIndex = entries.length - 1;
    render();
  });
  render();
  element.append(heading, help, chips, detail, addButton);
  return {
    element,
    values: () => normalizeSuggestions(entries.map((entry) => entry.value), []),
    reset(nextValues) {
      entries.splice(0, entries.length, ...nextValues.map((value) => ({ value })));
      selectedIndex = 0;
      render();
    },
  };
}

/**
 * @param {{ models: string[], voicesByTtsModel: Record<string, string[]> }} args
 */
function createTtsModelEditor({ models, voicesByTtsModel }) {
  const element = document.createElement('section');
  element.className = 'tts-model-editor';
  const heading = document.createElement('h4');
  heading.textContent = 'TTS models and voices';
  const help = document.createElement('p');
  help.className = 'help-text';
  help.textContent = 'Each model has its own voice menu in the TTS and Podcast workflows.';
  const chips = document.createElement('div');
  chips.className = 'model-chip-list';
  chips.setAttribute('role', 'list');
  const detail = document.createElement('section');
  detail.className = 'tts-model-detail';
  const entries = models.map((model) => ({ model, voices: [...(voicesByTtsModel[model] ?? DEFAULT_VOICES)] }));
  let selectedIndex = 0;

  function render() {
    chips.replaceChildren();
    detail.replaceChildren();
    entries.forEach((entry, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `model-chip${index === selectedIndex ? ' is-selected' : ''}`;
      chip.textContent = entry.model || 'New TTS model';
      chip.setAttribute('aria-pressed', String(index === selectedIndex));
      chip.addEventListener('click', () => {
        selectedIndex = index;
        render();
      });
      chips.append(chip);
    });
    const entry = entries[selectedIndex];
    if (!entry) return;
    const modelField = textField({ label: 'TTS model identifier', value: entry.model });
    modelField.input.addEventListener('input', () => {
      entry.model = modelField.input.value;
      chips.children[selectedIndex].textContent = entry.model || 'New TTS model';
    });
    const voicesHeading = document.createElement('h5');
    voicesHeading.textContent = 'Available voices';
    const voiceChips = document.createElement('div');
    voiceChips.className = 'voice-chip-list';
    function renderVoices() {
      voiceChips.replaceChildren();
      entry.voices.forEach((voice, index) => {
        const chip = document.createElement('span');
        chip.className = 'voice-chip';
        const text = document.createElement('span');
        text.textContent = voice;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'voice-chip-remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove voice ${voice}`);
        remove.addEventListener('click', async () => {
          const confirmed = await confirmDialog({
            title: 'Remove voice',
            message: `Remove “${voice}” from ${entry.model || 'this TTS model'}?`,
            confirmLabel: 'Remove voice',
          });
          if (!confirmed) return;
          entry.voices.splice(index, 1);
          renderVoices();
        });
        chip.append(text, remove);
        voiceChips.append(chip);
      });
    }
    const addVoice = textField({ label: 'Add voice', value: '' });
    const addVoiceButton = document.createElement('button');
    addVoiceButton.type = 'button';
    addVoiceButton.className = 'button button-secondary button-small';
    addVoiceButton.textContent = 'Add voice';
    const commitVoice = () => {
      const voice = addVoice.input.value.trim();
      if (!voice || entry.voices.includes(voice)) return;
      entry.voices.push(voice);
      addVoice.input.value = '';
      renderVoices();
    };
    addVoiceButton.addEventListener('click', commitVoice);
    addVoice.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitVoice();
      }
    });
    const removeModel = document.createElement('button');
    removeModel.type = 'button';
    removeModel.className = 'button button-ghost button-small';
    removeModel.textContent = 'Remove model';
    removeModel.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Remove TTS model',
        message: `Remove “${entry.model || 'this TTS model'}” and its configured voices?`,
        confirmLabel: 'Remove model',
      });
      if (!confirmed) return;
      entries.splice(selectedIndex, 1);
      selectedIndex = Math.max(0, selectedIndex - 1);
      render();
    });
    const addVoiceRow = document.createElement('div');
    addVoiceRow.className = 'add-voice-row';
    addVoiceRow.append(addVoice.wrapper, addVoiceButton);
    renderVoices();
    const restoreVoices = document.createElement('button');
    restoreVoices.type = 'button';
    restoreVoices.className = 'button button-ghost button-small';
    restoreVoices.textContent = 'Restore standard voices';
    restoreVoices.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Restore model voice defaults',
        message: `Replace the configured voices for ${entry.model || 'this TTS model'} with the standard voice list?`,
        confirmLabel: 'Restore voices',
      });
      if (!confirmed) return;
      entry.voices = [...DEFAULT_VOICES];
      renderVoices();
    });
    detail.append(modelField.wrapper, voicesHeading, voiceChips, addVoiceRow, restoreVoices, removeModel);
  }
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'button button-secondary button-small';
  addButton.textContent = 'Add TTS model';
  addButton.addEventListener('click', () => {
    entries.push({ model: '', voices: [...DEFAULT_VOICES] });
    selectedIndex = entries.length - 1;
    render();
  });
  render();
  element.append(heading, help, chips, detail, addButton);
  return {
    element,
    reset(nextModels) {
      entries.splice(
        0,
        entries.length,
        ...nextModels.map((model) => ({ model, voices: [...DEFAULT_VOICES] })),
      );
      selectedIndex = 0;
      render();
    },
    values() {
      const ttsModels = normalizeSuggestions(entries.map((entry) => entry.model), []);
      const voicesByTtsModel = Object.fromEntries(
        entries
          .filter((entry) => entry.model.trim())
          .map((entry) => [entry.model.trim(), normalizeSuggestions(entry.voices, [])]),
      );
      return { ttsModels, voicesByTtsModel };
    },
  };
}
