/**
 * Global notification stack. Errors persist until dismissed; warnings and
 * informational notifications close after a short, pausable timeout.
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

const AUTO_CLOSE_MS = 6000;
let notificationCounter = 0;
const activeNotifications = new Map();

/**
 * @returns {HTMLElement | null}
 */
function notificationStack() {
  if (typeof document === 'undefined') return null;
  let stack = document.querySelector('#notification-stack');
  if (stack) return /** @type {HTMLElement} */ (stack);
  stack = document.createElement('div');
  stack.id = 'notification-stack';
  stack.className = 'notification-stack';
  stack.setAttribute('aria-label', 'Notifications');
  document.body.append(stack);
  return stack;
}

/**
 * @param {Object} args
 * @param {'error'|'warning'|'success'|'info'} args.type
 * @param {string} args.title
 * @param {string} args.message
 * @param {string} [args.actionLabel]
 * @param {() => void} [args.onAction]
 * @param {number} [args.timeoutMs]
 * @returns {string | null}
 */
export function notify({ type, title, message, actionLabel, onAction, timeoutMs }) {
  const stack = notificationStack();
  if (!stack) return null;
  const duplicate = [...activeNotifications.values()].find(
    (item) => item.type === type && item.title === title && item.message === message,
  );
  if (duplicate) return duplicate.id;

  const id = `notification-${++notificationCounter}`;
  const toast = document.createElement('div');
  toast.id = id;
  toast.className = `notification notification-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const content = document.createElement('div');
  content.className = 'notification-content';
  const heading = document.createElement('p');
  heading.className = 'notification-title';
  heading.textContent = title;
  const text = document.createElement('p');
  text.className = 'notification-text';
  text.textContent = message;
  content.append(heading, text);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'notification-close';
  close.setAttribute('aria-label', `Dismiss ${title}`);
  close.textContent = '×';
  close.addEventListener('click', () => dismissNotification(id));

  toast.append(content);
  if (actionLabel && onAction) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'button button-secondary button-small';
    action.textContent = actionLabel;
    action.addEventListener('click', () => {
      dismissNotification(id);
      onAction();
    });
    toast.append(action);
  }
  toast.append(close);
  stack.prepend(toast);

  const item = { id, type, title, message, toast, timeout: null };
  activeNotifications.set(id, item);
  if (type !== 'error') {
    const schedule = () => {
      item.timeout = window.setTimeout(() => dismissNotification(id), timeoutMs ?? AUTO_CLOSE_MS);
    };
    const pause = () => {
      if (item.timeout !== null) window.clearTimeout(item.timeout);
      item.timeout = null;
    };
    toast.addEventListener('mouseenter', pause);
    toast.addEventListener('mouseleave', schedule);
    toast.addEventListener('focusin', pause);
    toast.addEventListener('focusout', schedule);
    schedule();
  }
  return id;
}

/**
 * @param {string | null | undefined} id
 */
export function dismissNotification(id) {
  if (!id) return;
  const item = activeNotifications.get(id);
  if (!item) return;
  if (item.timeout !== null) window.clearTimeout(item.timeout);
  item.toast.remove();
  activeNotifications.delete(id);
}

/**
 * Render a normalized error in the global stack. The container is retained
 * only for call-site compatibility and holds its associated toast id.
 * @param {HTMLElement | null | undefined} container
 * @param {AppError | Error | unknown} error
 * @param {Object} [options]
 * @param {string} [options.actionLabel]
 * @param {() => void} [options.onAction]
 * @param {() => void} [options.onDismiss]
 * @returns {string | null}
 */
export function renderError(container, error, options = {}) {
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
  const previousId = container?.dataset.notificationId;
  const id = notify({
    type: 'error',
    title: KIND_LABELS[normalized.kind] || 'Error',
    message: normalized.message,
    actionLabel: options.actionLabel,
    onAction: options.onAction,
  });
  if (previousId && previousId !== id) dismissNotification(previousId);
  if (container && id) container.dataset.notificationId = id;
  return id;
}

/**
 * @param {HTMLElement | null | undefined} container
 */
export function clearError(container) {
  if (!container) return;
  dismissNotification(container.dataset.notificationId);
  delete container.dataset.notificationId;
}
