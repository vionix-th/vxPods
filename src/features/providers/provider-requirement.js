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
 * @param {() => import('../../storage/local-settings.js').ProviderConfig | null} args.getSelected
 * @param {() => void} args.refresh
 * @param {(provider: import('../../storage/local-settings.js').ProviderConfig) => void | Promise<void>} args.onReady
 * @returns {boolean} true when a provider was available and onReady ran
 */
export function requireProvider({ slot, getSelected, refresh, onReady }) {
  const selected = getSelected();
  if (selected) {
    void onReady(selected);
    return true;
  }
  const providers = listProviders();
  if (providers.length === 1) {
    selectProvider(slot, providers[0].id);
    refresh();
    void onReady(providers[0]);
    return true;
  }

  /** @type {ReturnType<typeof openProviderSettings>} */
  let dialog;
  dialog = openProviderSettings({
    startCreate: providers.length === 0,
    closeOnSave: true,
    onSaved(provider) {
      selectProvider(slot, provider.id);
      refresh();
      dialog.close('saved');
      void onReady(provider);
    },
  });
  return false;
}
