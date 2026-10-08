import { openDialog } from '../components/dialog.js';

export const SUPPORT_URL = 'https://ko-fi.com/vionixconsulting';
export const SUPPORT_EMBED_URL = `${SUPPORT_URL}/?hidefeed=true&widget=true&embed=true&preview=true`;

export function openSupportDialog() {
  const handle = openDialog({
    title: 'Support vxPods',
    className: 'support-dialog',
    render(body, dialog) {
      const description = document.createElement('p');
      description.textContent = 'Optional one-time or monthly support helps maintain vxPods and other free Vionix projects. Contributions go to Vionix Consulting through Ko-fi. Donating is not required to use this app.';
      const fallback = document.createElement('a');
      fallback.href = SUPPORT_URL;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'Open Ko-fi in new tab';
      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      status.textContent = 'Loading Ko-fi…';
      const frame = document.createElement('iframe');
      frame.src = SUPPORT_EMBED_URL;
      frame.title = 'Support Vionix Consulting on Ko-fi';
      frame.referrerPolicy = 'no-referrer';
      const timer = setTimeout(() => {
        status.textContent = 'Taking longer than expected. Try opening Ko-fi in a new tab.';
      }, 10_000);
      frame.addEventListener('load', () => {
        clearTimeout(timer);
        status.remove();
      });
      dialog.onClose(() => {
        clearTimeout(timer);
        frame.remove();
      });
      body.append(description, fallback, status, frame);
    },
  });
  handle.element.querySelector('.dialog-close').focus();
}

export function supportButton(onClick = openSupportDialog) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost';
  button.textContent = 'Support this project';
  button.addEventListener('click', onClick);
  return button;
}
