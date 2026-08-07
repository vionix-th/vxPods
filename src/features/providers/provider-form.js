/**
 * Provider settings dialog: saved configuration list plus create/edit form
 * with preset selection, visible key editing, and connection tests.
 */

import { openDialog, confirmDialog } from '../../components/dialog.js';
import { createLocalNotice } from '../../components/error-message.js';
import { textField } from '../../components/fields.js';
import { createIdentifierListEditor, createTtsModelEditor } from './provider-capability-editors.js';
import { testTextGenerationConnection } from '../../services/text-generation-client.js';
import { testSpeechConnection } from '../../services/speech-client.js';
import { toAppError } from '../../services/errors.js';
import { renderPromptTemplateSettings } from '../podcast/prompt-template-form.js';
import { renderProviderDataSettings } from './provider-data-settings.js';
import {
  PROVIDER_PRESETS,
  addProvider,
  deleteProvider,
  listProviders,
  updateProvider,
} from './provider-store.js';
import {
  TEXT_GENERATION_APIS,
  TEXT_GENERATION_API_LABELS,
  defaultTextModels,
  providerSuggestionsForPreset,
} from '../../domain/provider-config.js';

const DEFAULT_VOICE = 'alloy';

/**
 * Open the provider management dialog.
 * @param {Object} [options]
 * @param {() => void} [options.onChange] called after any mutation
 * @param {boolean} [options.startCreate] open directly on a new configuration form
 * @param {boolean} [options.closeOnSave] close dialog after a successful save
 * @param {(provider: import('../../domain/provider-config.js').ProviderConfig) => void} [options.onSaved]
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
function renderSettingsSection(body, options, activeSection, notice) {
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
    renderProviderDataSettings(content, navigation);
  }, notice);
}

/**
 * @param {HTMLElement} body
 * @param {Object} options
 * @param {import('../../domain/provider-config.js').ProviderConfig | null} existing
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
function renderSettingsFrame(body, activeSection, navigate, renderContent, notice) {
  body.replaceChildren();
  const layout = document.createElement('div');
  layout.className = 'settings-layout';
  const navigation = document.createElement('nav');
  navigation.className = 'settings-navigation';
  navigation.setAttribute('aria-label', 'Settings sections');
  const content = document.createElement('section');
  content.className = 'settings-content';
  const localNotice = createLocalNotice();

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

  layout.append(navigation, localNotice.element, content);
  body.append(layout);
  if (notice) localNotice.show(notice);
  renderContent(content);
}

/**
 * @param {HTMLElement} body
 * @param {Object} options
 */
function createNavigation(body, options) {
  return {
    ...options,
    openProviders: (notice) => renderSettingsSection(body, options, 'providers', notice),
    openProviderForm: (existing) => renderProviderFormPage(body, options, existing),
    openPromptTemplates: () => renderSettingsSection(body, options, 'templates'),
    openDataPrivacy: () => renderSettingsSection(body, options, 'data'),
  };
}

/**
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void, openProviderForm: (existing: import('../../domain/provider-config.js').ProviderConfig | null) => void }} options
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
 * @param {import('../../domain/provider-config.js').ProviderConfig} provider
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void, openProviderForm: (existing: import('../../domain/provider-config.js').ProviderConfig | null) => void }} options
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
 * @param {import('../../domain/provider-config.js').ProviderConfig | null} existing
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

  const notice = createLocalNotice();

  // Preset selector
  const presetField = fieldset('Preset');
  const presetName = `preset-${Math.random().toString(36).slice(2, 8)}`;
  let selectedPreset = 'openai';
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

  // API key is intentionally visible: provider settings are browser-local,
  // plaintext configuration explicitly controlled by the user.
  const keyWrapper = document.createElement('div');
  keyWrapper.className = 'field';
  const keyLabel = document.createElement('label');
  const keyId = `key-${Math.random().toString(36).slice(2, 8)}`;
  keyLabel.setAttribute('for', keyId);
  keyLabel.textContent = 'API key';
  const keyInput = document.createElement('input');
  keyInput.id = keyId;
  keyInput.type = 'text';
  keyInput.autocomplete = 'off';
  keyInput.value = existing?.apiKey ?? '';
  keyWrapper.append(keyLabel, keyInput);

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
    values: existing?.textGeneration.models ?? providerSuggestionsForPreset(selectedPreset).textGeneration.models,
  });
  const ttsModelsEditor = createTtsModelEditor({
    models: existing?.ttsModels ?? providerSuggestionsForPreset(selectedPreset).ttsModels,
  });
  const restoreDefaults = document.createElement('button');
  restoreDefaults.type = 'button';
  restoreDefaults.className = 'button button-ghost button-small';
  restoreDefaults.textContent = 'Restore all standard defaults';
  restoreDefaults.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Restore all model and voice defaults',
      message: 'This replaces every configured text generation model, TTS model, and model-specific voice list with defaults for the selected preset. Save the configuration to keep them.',
      confirmLabel: 'Restore all defaults',
    });
    if (!confirmed) return;
    applySuggestionDefaults();
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
  back.addEventListener('click', () => options.openProviders());

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

  form.append(presetField, nameField.wrapper, urlField.wrapper, keyWrapper, textApiField, capabilityEditor, notice.element, status, actions);
  body.append(pageHeader, form);

  function currentPreset() {
    return presetRadios.find((r) => r.checked)?.value ?? 'manual';
  }
  for (const radio of presetRadios) {
    radio.addEventListener('change', async () => {
      if (!radio.checked || radio.value === selectedPreset) return;
      const nextPreset = /** @type {'openai'|'openrouter'|'manual'} */ (radio.value);
      const confirmed = await confirmDialog({
        title: 'Apply preset defaults',
        message: `Changing to ${PROVIDER_PRESETS[nextPreset].label} replaces configured model and voice lists with this preset’s defaults.`,
        confirmLabel: 'Apply defaults',
      });
      if (!confirmed) {
        for (const option of presetRadios) option.checked = option.value === selectedPreset;
        return;
      }
      selectedPreset = nextPreset;
      const preset = PROVIDER_PRESETS[selectedPreset];
      urlField.input.value = preset.baseUrl;
      urlField.input.disabled = selectedPreset !== 'manual';
      applySuggestionDefaults();
    });
  }
  urlField.input.disabled = currentPreset() !== 'manual';

  function applySuggestionDefaults() {
    const defaults = providerSuggestionsForPreset(selectedPreset);
    selectedTextApi = defaults.textGeneration.api;
    for (const option of textApiRadios) option.checked = option.value === selectedTextApi;
    textModelsEditor.reset(defaults.textGeneration.models);
    ttsModelsEditor.reset(defaults.ttsModels);
  }

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
    const ttsModels = ttsModelsEditor.values();
    return {
      name: nameField.input.value,
      baseUrl: urlField.input.value,
      apiKey: keyInput.value,
      textGeneration: {
        api: selectedTextApi,
        models: textModelsEditor.values(),
      },
      ttsModels,
    };
  }

  async function runTest(kind) {
    notice.clear();
    const capability = kind === 'text' ? TEXT_GENERATION_API_LABELS[selectedTextApi] : 'Speech';
    status.textContent = `Testing ${capability}…`;
    const values = readForm();
    const model = kind === 'text' ? values.textGeneration.models[0] : values.ttsModels[0];
    if (!model) {
      status.textContent = '';
      notice.show({
        type: 'error',
        title: 'Input problem',
        message: `Add a ${kind === 'text' ? 'text generation' : 'TTS'} model before testing this endpoint.`,
      });
      return;
    }
    const provider = {
      baseUrl: values.baseUrl.trim(),
      apiKey: values.apiKey.trim() || existing?.apiKey || '',
    };
    try {
      if (kind === 'text') {
        provider.textGeneration = values.textGeneration;
        await testTextGenerationConnection(provider, model);
      } else {
        await testSpeechConnection(
          provider,
          model,
          model.voices[0] || DEFAULT_VOICE,
        );
      }
      status.textContent = `${capability} endpoint reachable.`;
      notice.show({
        type: 'success',
        title: 'Connection verified',
        message: `${capability} endpoint is reachable.`,
      });
    } catch (err) {
      status.textContent = '';
      notice.showError(toAppError(err));
    }
  }

  testText.addEventListener('click', () => runTest('text'));
  testSpeech.addEventListener('click', () => runTest('speech'));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    notice.clear();
    try {
      if (existing) {
        const saved = updateProvider(existing.id, readForm());
        options.onSaved?.(saved);
      } else {
        const saved = addProvider(readForm());
        options.onSaved?.(saved);
      }
      options.onChange?.();
      if (!options.closeOnSave) {
        options.openProviders({ type: 'success', title: 'Provider saved', message: 'Configuration is ready to use.' });
      }
    } catch (err) {
      notice.showError(toAppError(err));
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
