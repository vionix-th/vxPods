import { supportReminders } from './support-reminder-policy.js';
import { icon } from '../components/icon.js';
import { openDialog } from '../components/dialog.js';
import { donationMethods } from './donation.js';

export const SUPPORT_URL = 'https://ko-fi.com/vionixconsulting';
export const SUPPORT_EMBED_URL = `${SUPPORT_URL}/?hidefeed=true&widget=true&embed=true&preview=true`;

const donationCopy = {
  "cash": "Cash",
  "crypto": "Crypto",
  "method": "Donation method",
  "network": "Network",
  "receivingAddress": "Receiving address",
  "copyAddress": "Copy address",
  "copied": "Copied",
  "copySuccess": "Address copied.",
  "copyManually": "Copy manually",
  "copyError": "Could not copy. Select the address and copy it manually.",
  "showQR": "Show QR code",
  "hideQR": "Hide QR code",
  "assets": "{asset}, USDC, USDT and other tokens",
  "qrLabel": "{network} receiving address QR code",
  "qrFailed": "QR code unavailable. Copy the address instead."
};
function donationText(key, params = {}) {
  return donationCopy[key].replace(/\{(\w+)\}/g, (_match, name) => params[name]);
}

export function openSupportDialog(returnFocus) {
  if (document.querySelector('dialog[open]')) return;
  const opener = returnFocus instanceof HTMLElement ? returnFocus : document.activeElement;
  void supportReminders.postpone();
  window.dispatchEvent(new Event('support-dialog-open'));
  const handle = openDialog({
    title: 'Support vxPods',
    returnFocus: opener,
    className: 'support-dialog',
    render(body, dialog) {
      const fallback = document.createElement('a');
      fallback.href = SUPPORT_URL;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'Open Ko-fi in new tab';
      fallback.hidden = true;
      const feedback = document.createElement('div');
      feedback.className = 'support-feedback';
      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      status.textContent = 'Loading Ko-fi…';
      const frame = document.createElement('iframe');
      frame.src = SUPPORT_EMBED_URL;
      frame.title = 'Support Vionix Consulting on Ko-fi';
      frame.referrerPolicy = 'no-referrer';
      const timer = setTimeout(() => {
        status.textContent = 'Taking longer than expected.';
        fallback.hidden = false;
      }, 10_000);
      frame.addEventListener('load', () => {
        clearTimeout(timer);
        feedback.hidden = true;
      });
      dialog.onClose(() => {
        clearTimeout(timer);
        frame.remove();
      });
      feedback.append(status, fallback);
      const panel = document.createElement('div');
      panel.className = 'support-panel';
      panel.append(frame);
      const kofiPanel = document.createElement('div');
      kofiPanel.className = 'support-kofi';
      kofiPanel.append(feedback, panel);
      body.append(kofiPanel);
      const methods = donationMethods({ body, kofiPanel, id: dialog.element.getAttribute('aria-labelledby'), text: donationText });
      dialog.onClose(() => methods.dispose());
    },
  });
  handle.element.querySelector('.dialog-close').focus();
}

export function supportButton(onClick = openSupportDialog) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost support-trigger';
  const label = document.createElement('span');
  label.textContent = 'Support';
  button.append(icon('heart'), label);
  button.setAttribute('aria-label', 'Support this project');
  button.addEventListener('click', (event) => {
    button.focus();
    onClick(event);
  });
  return button;
}
