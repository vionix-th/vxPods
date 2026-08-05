/**
 * Provider settings dialog: saved configuration list plus create/edit form
 * with preset selection, masked key handling, and connection tests.
 */

import { openDialog, confirmDialog } from '../../components/dialog.js';
import { renderError, clearError } from '../../components/error-message.js';
import { testChatConnection } from '../../services/chat-completions-client.js';
import { testSpeechConnection } from '../../services/speech-client.js';
import { toAppError } from '../../services/errors.js';
import {
  PROVIDER_PRESETS,
  addProvider,
  deleteProvider,
  listProviders,
  updateProvider,
} from './provider-store.js';

const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_VOICE = 'alloy';

/**
 * Open the provider management dialog.
 * @param {Object} [options]
 * @param {() => void} [options.onChange] called after any mutation
 * @param {string} [options.editId] open the form directly for this record
 */
export function openProviderSettings(options = {}) {
  const handle = openDialog({
    title: 'Provider settings',
    className: 'provider-dialog',
    render(body) {
      renderManager(body, options);
    },
  });
  return handle;
}

/**
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void }} options
 */
function renderManager(body, options) {
  body.replaceChildren();

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
  addButton.textContent = 'Add configuration';
  addButton.addEventListener('click', () => renderForm(body, options, null));

  body.append(explainer, list, addButton);
}

/**
 * @param {import('../../storage/local-settings.js').ProviderConfig} provider
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void }} options
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
  keyState.textContent = 'Key saved';
  info.append(name, url, keyState);

  const actions = document.createElement('div');
  actions.className = 'provider-actions';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'button button-secondary button-small';
  edit.textContent = 'Edit';
  edit.addEventListener('click', () => renderForm(body, options, provider));

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
    renderManager(body, options);
  });

  actions.append(edit, remove);
  item.append(info, actions);
  return item;
}

/**
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void }} options
 * @param {import('../../storage/local-settings.js').ProviderConfig | null} existing
 */
function renderForm(body, options, existing) {
  body.replaceChildren();

  const form = document.createElement('form');
  form.className = 'provider-form';
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

  // Actions
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'button button-ghost';
  back.textContent = 'Back';
  back.addEventListener('click', () => renderManager(body, options));

  const testChat = document.createElement('button');
  testChat.type = 'button';
  testChat.className = 'button button-secondary';
  testChat.textContent = 'Test Chat';

  const testSpeech = document.createElement('button');
  testSpeech.type = 'button';
  testSpeech.className = 'button button-secondary';
  testSpeech.textContent = 'Test Speech';

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'button button-primary';
  save.textContent = existing ? 'Save changes' : 'Save configuration';

  actions.append(back, testChat, testSpeech, save);

  const status = document.createElement('p');
  status.className = 'help-text';
  status.setAttribute('aria-live', 'polite');

  form.append(presetField, nameField.wrapper, urlField.wrapper, keyWrapper, status, errorRegion, actions);
  body.append(form);

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

  function readForm() {
    return {
      name: nameField.input.value,
      baseUrl: urlField.input.value,
      apiKey: keyInput.value,
    };
  }

  async function runTest(kind) {
    clearError(errorRegion);
    status.textContent = `Testing ${kind === 'chat' ? 'Chat' : 'Speech'}…`;
    const values = readForm();
    const provider = {
      baseUrl: values.baseUrl.trim(),
      apiKey: values.apiKey.trim() || existing?.apiKey || '',
    };
    try {
      if (kind === 'chat') {
        await testChatConnection(provider, DEFAULT_CHAT_MODEL);
      } else {
        await testSpeechConnection(provider, DEFAULT_TTS_MODEL, DEFAULT_VOICE);
      }
      status.textContent = `${kind === 'chat' ? 'Chat' : 'Speech'} endpoint reachable.`;
    } catch (err) {
      status.textContent = '';
      renderError(errorRegion, toAppError(err));
    }
  }

  testChat.addEventListener('click', () => runTest('chat'));
  testSpeech.addEventListener('click', () => runTest('speech'));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError(errorRegion);
    try {
      if (existing) {
        updateProvider(existing.id, readForm());
      } else {
        addProvider(readForm());
      }
      options.onChange?.();
      renderManager(body, options);
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
