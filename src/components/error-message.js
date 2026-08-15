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
 * Contextual feedback for an active dialog or form. Unlike global toasts,
 * this stays inside the interaction that produced it and therefore remains
 * visible above a native modal dialog.
 * @returns {{ element: HTMLElement, clear: () => void, show: (notice: { type: 'error'|'warning'|'success'|'info', title: string, message: string }) => void, showError: (error: AppError | Error | unknown) => void }}
 */
export function createLocalNotice() {
  const element = document.createElement('div');
  element.className = 'local-notice';
  element.hidden = true;
  const content = document.createElement('div');
  content.className = 'local-notice-content';
  const title = document.createElement('p');
  title.className = 'local-notice-title';
  const message = document.createElement('p');
  message.className = 'local-notice-message';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'local-notice-close';
  close.setAttribute('aria-label', 'Dismiss message');
  close.textContent = '×';
  close.addEventListener('click', clear);
  content.append(title, message);
  element.append(content, close);

  function clear() {
    element.hidden = true;
    element.className = 'local-notice';
    element.removeAttribute('role');
    element.removeAttribute('aria-live');
  }

  function show({ type, title: nextTitle, message: nextMessage }) {
    content.querySelector('.error-diagnostics')?.remove();
    element.className = `local-notice local-notice-${type}`;
    element.setAttribute('role', type === 'error' ? 'alert' : 'status');
    element.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    title.textContent = nextTitle;
    message.textContent = nextMessage;
    close.setAttribute('aria-label', `Dismiss ${nextTitle}`);
    element.hidden = false;
  }

  function showError(error) {
    const normalized = normalizeError(error);
    show({
      type: 'error',
      title: KIND_LABELS[normalized.kind] || 'Error',
      message: normalized.message,
    });
    appendDiagnosticDisclosure(content, normalized);
  }

  return { element, clear, show, showError };
}

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
 * @param {AppError} [args.error]
 * @returns {string | null}
 */
export function notify({ type, title, message, actionLabel, onAction, timeoutMs, error }) {
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
  if (error) appendDiagnosticDisclosure(content, error);

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
 * Own one replaceable global error notification without fake DOM containers.
 * @returns {{ show: (error: AppError | Error | unknown, options?: { actionLabel?: string, onAction?: () => void }) => string | null, clear: () => void }}
 */
export function createErrorScope() {
  let notificationId = null;
  return {
    show(error, options = {}) {
      const normalized = normalizeError(error);
      const previousId = notificationId;
      notificationId = notify({
        type: 'error',
        title: KIND_LABELS[normalized.kind] || 'Error',
        message: normalized.message,
        error: normalized,
        actionLabel: options.actionLabel,
        onAction: options.onAction,
      });
      if (previousId && previousId !== notificationId) dismissNotification(previousId);
      return notificationId;
    },
    clear() {
      dismissNotification(notificationId);
      notificationId = null;
    },
  };
}

/**
 * Produce the deliberately small, redacted context shown under Technical details.
 * @param {AppError} error
 * @returns {{ label: string, value: string }[]}
 */
export function formatErrorDiagnostics(error) {
  const diagnostics = error.diagnostics;
  if (!diagnostics) return [];
  const values = [
    ['Category', error.kind],
    ['Operation', diagnostics.operation],
    ['HTTP status', diagnostics.status],
    ['Endpoint', diagnostics.endpoint],
    ['Model', diagnostics.model],
    ['Requested JSON format', diagnostics.jsonResponseFormat],
    ['Response type', diagnostics.contentType],
    ['Provider request ID', diagnostics.requestId],
  ];
  return values
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => ({ label: String(label), value: String(value) }));
}

/** @param {HTMLElement} content @param {AppError} error */
function appendDiagnosticDisclosure(content, error) {
  const rows = formatErrorDiagnostics(error);
  if (rows.length === 0) return;
  const details = document.createElement('details');
  details.className = 'error-diagnostics';
  const summary = document.createElement('summary');
  summary.textContent = 'Technical details';
  const list = document.createElement('dl');
  for (const row of rows) {
    const term = document.createElement('dt');
    term.textContent = row.label;
    const description = document.createElement('dd');
    description.textContent = row.value;
    list.append(term, description);
  }
  details.append(summary, list);
  content.append(details);
}

/** @param {AppError | Error | unknown} error */
function normalizeError(error) {
  return error instanceof AppError
    ? error
    : new AppError({
        kind: 'provider',
        message: error instanceof Error ? error.message : 'Unexpected error.',
        retryable: false,
        status: undefined,
        cause: error,
      });
}
