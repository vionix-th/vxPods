/**
 * Provider prerequisite flow shared by generation actions. Missing provider
 * configuration opens creation directly, selects the saved configuration for
 * the required operation, then resumes the originating action.
 */

import { listProviders, selectProvider } from './provider-store.js';
import { openProviderSettings } from './provider-form.js';

/**
 * @param {Object} args
 * @param {'text'|'tts'} args.slot
 * @param {() => import('../../domain/provider-config.js').ProviderConfig | null} args.getSelected
 * @param {() => void} args.refresh
 * @returns {Promise<import('../../domain/provider-config.js').ProviderConfig | null>}
 */
export async function requireProvider({ slot, getSelected, refresh }) {
  const selected = getSelected();
  if (selected) return selected;
  const providers = listProviders();
  if (providers.length === 1) {
    selectProvider(slot, providers[0].id);
    refresh();
    return providers[0];
  }

  return new Promise((resolve) => {
    let settled = false;
    /** @type {ReturnType<typeof openProviderSettings>} */
    let dialog;
    dialog = openProviderSettings({
      startCreate: providers.length === 0,
      closeOnSave: true,
      onSaved(provider) {
        selectProvider(slot, provider.id);
        refresh();
        settled = true;
        resolve(provider);
        dialog.close('saved');
      },
    });
    dialog.onClose(() => {
      if (!settled) resolve(null);
    });
  });
}
