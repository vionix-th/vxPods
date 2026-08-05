/**
 * Inline error presentation. Normalized AppError categories map to
 * user-facing copy plus an optional next action.
 */

import { AppError } from '../services/errors.js';

const KIND_LABELS = {
  validation: 'Input problem',
  auth: 'Authentication failed',
  unsupported: 'Unsupported endpoint or model',
  'rate-limit': 'Rate limit',
  network: 'Network or CORS failure',
  offline: 'Offline',
  storage: 'Browser storage problem',
  schema: 'Script format problem',
  encoding: 'Audio encoding problem',
  cancelled: 'Cancelled',
  provider: 'Provider error',
};

/**
 * Render an inline error region into a container, replacing prior content.
 * @param {HTMLElement} container
 * @param {AppError | Error | unknown} error
 * @param {Object} [options]
 * @param {string} [options.actionLabel]
 * @param {() => void} [options.onAction]
 * @param {() => void} [options.onDismiss]
 * @returns {HTMLElement} the rendered error element
 */
export function renderError(container, error, options = {}) {
  container.replaceChildren();
  const normalized =
    error instanceof AppError
      ? error
      : new AppError({
          kind: 'provider',
          message: error instanceof Error ? error.message : 'Unexpected error.',
          retryable: false,
          status: undefined,
          cause: error,
        });

  const region = document.createElement('div');
  region.className = 'error-message';
  region.setAttribute('role', 'alert');

  const title = document.createElement('p');
  title.className = 'error-title';
  title.textContent = KIND_LABELS[normalized.kind] || 'Error';

  const message = document.createElement('p');
  message.className = 'error-text';
  message.textContent = normalized.message;

  region.append(title, message);

  if (options.actionLabel && options.onAction) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'button button-secondary button-small';
    action.textContent = options.actionLabel;
    action.addEventListener('click', options.onAction);
    region.append(action);
  }
  if (options.onDismiss) {
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'button button-ghost button-small';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => {
      container.replaceChildren();
      options.onDismiss();
    });
    region.append(dismiss);
  }

  container.append(region);
  return region;
}

/**
 * Clear any rendered error from a container.
 * @param {HTMLElement} container
 */
export function clearError(container) {
  container.replaceChildren();
}
