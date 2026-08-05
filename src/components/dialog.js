/**
 * Accessible modal dialog built on the native <dialog> element.
 * Provides labelled title, trapped focus (native modal behavior), Escape
 * handling, and focus restoration on close.
 */

let dialogIdCounter = 0;

/**
 * @typedef {Object} DialogHandle
 * @property {HTMLDialogElement} element
 * @property {HTMLElement} body content container
 * @property {(result?: string) => void} close
 * @property {(listener: (result: string | undefined) => void) => void} onClose
 */

/**
 * @param {Object} args
 * @param {string} args.title
 * @param {(body: HTMLElement, handle: DialogHandle) => void} args.render
 * @param {string} [args.className]
 * @param {boolean} [args.hideCloseButton]
 * @returns {DialogHandle}
 */
export function openDialog({ title, render, className, hideCloseButton }) {
  const dialog = document.createElement('dialog');
  dialog.className = `dialog ${className || ''}`.trim();
  dialog.setAttribute('aria-labelledby', `dialog-title-${++dialogIdCounter}`);

  const frame = document.createElement('div');
  frame.className = 'dialog-frame';

  const header = document.createElement('div');
  header.className = 'dialog-header';
  const heading = document.createElement('h2');
  heading.id = `dialog-title-${dialogIdCounter}`;
  heading.className = 'dialog-title';
  heading.textContent = title;
  header.append(heading);

  const handle = /** @type {DialogHandle} */ ({
    element: dialog,
    body: null,
    close,
    onClose,
  });

  if (!hideCloseButton) {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'dialog-close';
    closeButton.setAttribute('aria-label', 'Close dialog');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => close('dismiss'));
    header.append(closeButton);
  }

  const body = document.createElement('div');
  body.className = 'dialog-body';
  handle.body = body;

  frame.append(header, body);
  dialog.append(frame);
  document.body.append(dialog);

  /** @type {((result: string | undefined) => void)[]} */
  const closeListeners = [];
  const previouslyFocused = document.activeElement;

  dialog.addEventListener('close', () => {
    for (const listener of closeListeners) listener(dialog.returnValue || undefined);
    if (previouslyFocused instanceof HTMLElement) {
      previouslyFocused.focus();
    }
    dialog.remove();
  });
  dialog.addEventListener('cancel', (event) => {
    // Native Escape: allow, and treat as dismiss.
    event.preventDefault();
    close('dismiss');
  });

  /**
   * @param {string} [result]
   */
  function close(result) {
    if (typeof result === 'string') {
      dialog.close(result);
    } else {
      dialog.close();
    }
  }

  /**
   * @param {(result: string | undefined) => void} listener
   */
  function onClose(listener) {
    closeListeners.push(listener);
  }

  render(body, handle);
  dialog.showModal();

  const focusTarget = body.querySelector(
    'input:not([type="hidden"]), select, textarea, button:not(.dialog-close)',
  );
  if (focusTarget instanceof HTMLElement) {
    focusTarget.focus();
  }
  return handle;
}

/**
 * Destructive-action confirmation dialog.
 * @param {Object} args
 * @param {string} args.title
 * @param {string} args.message
 * @param {string} args.confirmLabel
 * @returns {Promise<boolean>} true when confirmed
 */
export function confirmDialog({ title, message, confirmLabel }) {
  return new Promise((resolve) => {
    const handle = openDialog({
      title,
      render(body, h) {
        const text = document.createElement('p');
        text.className = 'dialog-message';
        text.textContent = message;
        const actions = document.createElement('div');
        actions.className = 'dialog-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'button button-secondary';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => h.close('cancel'));
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'button button-danger';
        confirm.textContent = confirmLabel;
        confirm.addEventListener('click', () => h.close('confirm'));
        actions.append(cancel, confirm);
        body.append(text, actions);
      },
    });
    handle.onClose((result) => resolve(result === 'confirm'));
  });
}
