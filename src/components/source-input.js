/**
 * Source text input: paste/type area, UTF-8 .txt/.md import, clear,
 * character count, and removable filename metadata.
 */

import { AppError } from '../services/errors.js';
import { createErrorScope } from './error-message.js';
import { cardHeader } from './fields.js';
import { createToolButton } from './tool-button.js';

const ACCEPTED_EXTENSIONS = ['.txt', '.md'];

/**
 * @typedef {Object} SourceInputHandle
 * @property {HTMLElement} element
 * @property {() => string} getText
 * @property {(text: string) => void} setText
 * @property {{ show: (error: unknown) => string | null, clear: () => void }} errors
 */

/**
 * @param {Object} args
 * @param {string} args.title card heading text
 * @param {string} [args.help]
 * @returns {SourceInputHandle}
 */
export function createSourceInput({ title, help }) {
  const wrapper = document.createElement('section');
  wrapper.className = 'source-input card';

  wrapper.append(cardHeader(title));

  const id = `source-${Math.random().toString(36).slice(2, 8)}`;
  const textareaLabel = document.createElement('label');
  textareaLabel.setAttribute('for', id);
  textareaLabel.textContent = 'Text to speak (required)';

  const textarea = document.createElement('textarea');
  textarea.id = id;
  textarea.rows = 10;
  textarea.required = true;

  if (help) {
    const helpEl = document.createElement('p');
    helpEl.className = 'help-text';
    helpEl.textContent = help;
    wrapper.append(helpEl);
  }

  const fileMeta = document.createElement('p');
  fileMeta.className = 'file-meta';
  fileMeta.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'source-actions';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.txt,.md,text/plain,text/markdown';
  fileInput.hidden = true;

  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'button button-secondary';
  importButton.textContent = 'Import .txt or .md';
  importButton.addEventListener('click', () => fileInput.click());

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'button button-ghost';
  clearButton.textContent = 'Clear';
  clearButton.addEventListener('click', () => {
    textarea.value = '';
    hideFileMeta();
    updateCount();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  });

  actions.append(importButton, clearButton);

  const count = document.createElement('p');
  count.className = 'char-count';
  count.setAttribute('aria-live', 'off');

  const errors = createErrorScope();
  wrapper.append(textareaLabel, fileMeta, textarea, count, actions, fileInput);

  function updateCount() {
    const n = textarea.value.length;
    count.textContent = `${n.toLocaleString()} character${n === 1 ? '' : 's'}`;
  }
  textarea.addEventListener('input', updateCount);
  updateCount();

  /** @param {string} name */
  function showFileMeta(name) {
    fileMeta.replaceChildren();
    fileMeta.hidden = false;
    const text = document.createElement('span');
    text.textContent = `Imported from file: ${name}`;
    const remove = createToolButton({
      label: 'Remove imported file label',
      glyph: '×',
      onClick: hideFileMeta,
    });
    fileMeta.append(text, remove);
  }

  function hideFileMeta() {
    fileMeta.hidden = true;
    fileMeta.replaceChildren();
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      showImportError(
        new AppError({
          kind: 'validation',
          message: 'Only .txt and .md files can be imported.',
          retryable: false,
          status: undefined,
        }),
      );
      return;
    }
    try {
      const text = await file.text(); // decodes as UTF-8
      textarea.value = text;
      showFileMeta(file.name);
      updateCount();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      clearImportError();
    } catch (err) {
      showImportError(
        new AppError({
          kind: 'validation',
          message: 'Could not read that file. Current text was kept.',
          retryable: false,
          status: undefined,
          cause: err,
        }),
      );
    }
  });

  /** @param {AppError} err */
  function showImportError(err) {
    errors.show(err);
  }

  function clearImportError() {
    errors.clear();
  }

  return {
    element: wrapper,
    getText: () => textarea.value,
    setText(text) {
      textarea.value = text;
      hideFileMeta();
      updateCount();
    },
    errors,
  };
}
