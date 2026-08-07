/**
 * Provider selector. Data and persistence callbacks come from feature owner.
 */

/**
 * @typedef {Object} ProviderSelectHandle
 * @property {HTMLElement} element
 * @property {() => import('../domain/provider-config.js').ProviderConfig | null} getSelected
 * @property {() => void} refresh re-read saved configurations
 */

/**
 * @param {Object} args
 * @param {string} args.label
 * @param {() => import('../domain/provider-config.js').ProviderConfig[]} args.getProviders
 * @param {() => string | null} args.getSelectedId
 * @param {(id: string | null) => void} args.onSelect
 * @param {boolean} [args.showTextApi]
 * @returns {ProviderSelectHandle}
 */
export function createProviderSelect({ label, getProviders, getSelectedId, onSelect, showTextApi = false }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field provider-select';

  const id = `provider-select-${Math.random().toString(36).slice(2, 8)}`;
  const labelEl = document.createElement('label');
  labelEl.setAttribute('for', id);
  labelEl.textContent = label;

  const select = document.createElement('select');
  select.id = id;
  wrapper.append(labelEl, select);

  function refresh() {
    const providers = getProviders();
    const storedId = getSelectedId();
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
      const api = showTextApi ? ` · ${apiLabel(provider.textGeneration.api)}` : '';
      opt.textContent = `${provider.name} (${hostOf(provider.baseUrl)})${api}`;
      select.append(opt);
    }
    const target =
      storedId && providers.some((p) => p.id === storedId) ? storedId : providers[0].id;
    if (select.value !== target || storedId !== target) {
      select.value = target;
      if (storedId !== target) onSelect(target);
    }
  }

  select.addEventListener('change', () => {
    onSelect(select.value || null);
  });

  refresh();

  return {
    element: wrapper,
    getSelected() {
      const providers = getProviders();
      return providers.find((p) => p.id === select.value) ?? null;
    },
    refresh,
  };
}

/** @param {'chat-completions'|'responses'} api */
function apiLabel(api) {
  return api === 'responses' ? 'Responses' : 'Chat Completions';
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
