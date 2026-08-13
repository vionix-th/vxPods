import { confirmDialog } from '../../components/dialog.js';
import { createLocalNotice } from '../../components/error-message.js';
import { toAppError } from '../../services/errors.js';
import { downloadJson } from '../../utils/download.js';
import {
  exportSettingsBackup,
  restoreSettingsBackup,
  validateSettingsBackup,
} from './provider-store.js';

/**
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void, onClearLocalData?: () => Promise<void> }} options
 */
export function renderProviderDataSettings(body, options) {
  body.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = 'Data & privacy';
  const lead = document.createElement('p');
  lead.className = 'help-text';
  lead.textContent =
    'Provider configurations, keys, selections, Podcast templates, and advanced prompts stay in this browser. Generation requests go directly to the provider you select.';
  const notice = createLocalNotice();

  const backup = document.createElement('section');
  backup.className = 'settings-data-section';
  const backupHeading = document.createElement('h4');
  backupHeading.textContent = 'Settings backup';
  const backupHelp = document.createElement('p');
  backupHelp.className = 'help-text';
  backupHelp.textContent = 'Exports include unencrypted API keys. Keep backup files private.';
  const backupActions = document.createElement('div');
  backupActions.className = 'action-row';
  const exportButton = actionButton('Export settings');
  exportButton.addEventListener('click', () => {
    downloadJson(exportSettingsBackup(), 'vxpods-settings.json');
    notice.show({
      type: 'warning',
      title: 'Sensitive export created',
      message: 'Settings export includes unencrypted API keys. Store it securely and do not share it.',
    });
  });
  const restoreButton = actionButton('Restore settings');
  const restoreInput = document.createElement('input');
  restoreInput.type = 'file';
  restoreInput.accept = '.json,application/json';
  restoreInput.hidden = true;
  restoreButton.addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files?.[0];
    restoreInput.value = '';
    if (!file) return;
    try {
      const settings = validateSettingsBackup(await file.text());
      const confirmed = await confirmDialog({
        title: 'Restore settings',
        message: 'This fully replaces all saved provider configurations, model and voice lists, selections, Episode directions, Format templates, speaker profiles, and advanced prompts. Existing settings will be lost.',
        confirmLabel: 'Replace all settings',
      });
      if (!confirmed) return;
      restoreSettingsBackup(settings);
      options.onChange?.();
      notice.show({ type: 'success', title: 'Settings restored', message: 'Saved settings were fully replaced.' });
    } catch (error) {
      notice.showError(toAppError(error));
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
    'Clear all saved provider configurations, plaintext keys, selections, Podcast templates, advanced prompts, and unfinished work from this browser.';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'button button-danger';
  clearButton.textContent = 'Clear local data';
  clearButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Clear local data',
      message:
        'This permanently removes saved provider configurations, plaintext API keys, selections, Podcast templates, advanced prompts, and unfinished work from this browser.',
      confirmLabel: 'Clear local data',
    });
    if (!confirmed || !options.onClearLocalData) return;
    try {
      await options.onClearLocalData();
    } catch (error) {
      notice.showError(toAppError(error));
    }
  });
  danger.append(dangerHeading, dangerHelp, clearButton);

  const pageHeader = document.createElement('header');
  pageHeader.className = 'settings-page-header';
  const copy = document.createElement('div');
  copy.className = 'settings-page-copy';
  copy.append(heading, lead);
  pageHeader.append(copy);
  body.append(pageHeader, notice.element, backup, danger);
}

/** @param {string} label */
function actionButton(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-secondary';
  button.textContent = label;
  return button;
}
