/**
 * Provider selector: saved configurations for one slot (chat or tts).
 * Provider management is available from the persistent app header.
 */

import {
  listProviders,
  selectProvider,
  getSelectedProviderId,
  subscribeProviders,
} from '../features/providers/provider-store.js';

/**
 * @typedef {Object} ProviderSelectHandle
 * @property {HTMLElement} element
 * @property {() => import('../storage/local-settings.js').ProviderConfig | null} getSelected
 * @property {() => void} refresh re-read saved configurations
 */

/**
 * @param {Object} args
 * @param {'chat'|'tts'} args.slot
 * @param {string} args.label
 * @returns {ProviderSelectHandle}
 */
export function createProviderSelect({ slot, label }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field provider-select';

  const id = `provider-select-${slot}-${Math.random().toString(36).slice(2, 8)}`;
  const labelEl = document.createElement('label');
  labelEl.setAttribute('for', id);
  labelEl.textContent = label;

  const select = document.createElement('select');
  select.id = id;
  wrapper.append(labelEl, select);

  function refresh() {
    const providers = listProviders();
    const storedId = getSelectedProviderId(slot);
    select.replaceChildren();
    if (providers.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No saved configurations';
      select.append(opt);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    for (const provider of providers) {
      const opt = document.createElement('option');
      opt.value = provider.id;
      opt.textContent = `${provider.name} (${hostOf(provider.baseUrl)})`;
      select.append(opt);
    }
    const target =
      storedId && providers.some((p) => p.id === storedId) ? storedId : providers[0].id;
    if (select.value !== target || storedId !== target) {
      select.value = target;
      if (storedId !== target) selectProvider(slot, target);
    }
  }

  select.addEventListener('change', () => {
    selectProvider(slot, select.value || null);
  });

  // Stay in sync with mutations from anywhere (dialog, other selects).
  subscribeProviders(refresh);

  refresh();

  return {
    element: wrapper,
    getSelected() {
      const providers = listProviders();
      return providers.find((p) => p.id === select.value) ?? null;
    },
    refresh,
  };
}

/**
 * @param {string} baseUrl
 */
function hostOf(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}
