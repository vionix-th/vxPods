import qrcode from 'qrcode-generator';

function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  node.append(...children.flat());
  return node;
}
function button(children, onClick, className, attributes = {}) {
  const node = el('button', { type: 'button', class: className, ...attributes }, children);
  node.addEventListener('click', onClick);
  return node;
}
const donationIcons = {
  cash: ['M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', 'M6 12h.01M18 12h.01'],
  crypto: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'm12 7 4 5-4 5-4-5 4-5Z'],
  check: ['m5 12 4 4L19 6'],
  copy: ['M9 9h12v12H9z', 'M15 9V3H3v12h6'],
  bitcoin: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', 'M8 7h6a2.5 2.5 0 0 1 0 5H9h6a2.5 2.5 0 0 1 0 5H8M10 7v10M11 5v2m3-2v2M11 17v2m3-2v2'],
  ethereum: ['m12 2 7 10-7 4-7-4 7-10Z', 'm5 15 7 7 7-7-7 4-7-4Z', 'M12 2v14'],
  solana: ['m6 4-3 4h15l3-4H6Z', 'm3 10 3 4h15l-3-4H3Z', 'm6 16-3 4h15l3-4H6Z'],
  zcash: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', 'M8 7h8L8 17h8M12 5v2m0 10v2'],
  monero: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', 'M5 16V9l7 7 7-7v7M5 16h4m6 0h4'],
  chevronDown: ['m6 9 6 6 6-6'],
  base: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', 'M3 12h14'],
  arbitrum: ['m12 2 9 5v10l-9 5-9-5V7l9-5Z', 'm8 17 4-10 5 10M14 11l4 8'],
  optimism: ['M7 7a4 5 0 1 0 0 10 4 5 0 0 0 0-10Z', 'M15 17V7h3a3 3 0 0 1 0 6h-3'],
  polygon: ['m9 5 4 2.5v5L9 15l-4-2.5v-5L9 5Z', 'm15 9 4 2.5v5L15 19l-4-2.5v-5L15 9Z'],
  bnb: ['m12 8 4 4-4 4-4-4 4-4Z', 'm12 2 3 3-3 3-3-3 3-3ZM12 16l3 3-3 3-3-3 3-3ZM2 12l3-3 3 3-3 3-3-3ZM16 12l3-3 3 3-3 3-3-3Z'],
};
function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  for (const d of donationIcons[name]) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
// Public receiving addresses only. Network support is explicitly maintained by the wallet owner.
const evmAddress = '0x0D4aAc6d3C5DF6D162F121992eBD441728B143a2';

const donationNetworks = [
  { id: 'bitcoin', name: 'Bitcoin', icon: 'bitcoin', assets: 'BTC', address: 'bc1qesd92qv7h3mlh4qqs4grz3e32phvxj6spwkcyz' },
  { id: 'ethereum', name: 'Ethereum Mainnet', icon: 'ethereum', assets: 'ETH, USDC, USDT and other tokens', chainId: 1, address: evmAddress },
  { id: 'solana', name: 'Solana', icon: 'solana', assets: 'SOL, USDC, USDT and other tokens', address: '7oLWWpSrEG6aDKVZDAyuAjF3kDKEgAmnG3Q7JAb9uUXy' },
  { id: 'base', name: 'Base', icon: 'base', assets: 'ETH, USDC, USDT and other tokens', chainId: 8453, address: evmAddress },
  { id: 'arbitrum', name: 'Arbitrum One', icon: 'arbitrum', assets: 'ETH, USDC, USDT and other tokens', chainId: 42161, address: evmAddress },
  { id: 'optimism', name: 'Optimism', icon: 'optimism', assets: 'ETH, USDC, USDT and other tokens', chainId: 10, address: evmAddress },
  { id: 'polygon', name: 'Polygon PoS', icon: 'polygon', assets: 'POL, USDC, USDT and other tokens', chainId: 137, address: evmAddress },
  { id: 'bnb', name: 'BNB Smart Chain', icon: 'bnb', assets: 'BNB, USDC, USDT and other tokens', chainId: 56, address: evmAddress },
  { id: 'zcash', name: 'Zcash', icon: 'zcash', assets: 'ZEC', address: 't1ffcdEs6WUZsK4iTpSg3fYM3STmZ8rfXjy' },
  { id: 'monero', name: 'Monero', icon: 'monero', assets: 'XMR', address: '47XCwRMTyEvav4QMqeh8ChaLg4Ubt7ASSWvyW9BG8vB19wXUS4E7C1qWkFnyzFFoTcf8AAmrUDG11EE2B6GFgFAWArkriQd' },
];

// Standard wallet payment URIs; amounts remain donor-entered.
function donationWalletUri(network) {
  return network.chainId === undefined
    ? `${network.id}:${network.address}`
    : `ethereum:${network.address}@${network.chainId}`;
}

/** Select-only combobox; a native popover keeps icon rows above the dialog's scroll area. */
function donationNetworkSelector(id, networks, onChange, text) {
  let selected = 0;
  let active = 0;
  let search = '';
  let searchedAt = 0;
  const label = el('label', { id: `${id}-network-label`, for: `${id}-network` }, text('network'));
  const value = el('span', { id: `${id}-network-value`, class: 'donation-network-value' });
  const mark = el('span', { class: 'donation-network-icon', 'aria-hidden': 'true' });
  const menu = el('div', {
    id: `${id}-networks`, class: 'donation-network-menu', popover: 'auto',
    role: 'listbox', 'aria-labelledby': label.id,
  });
  const trigger = button([mark, value, icon('chevronDown', 16)], () => {
    if (menu.matches(':popover-open')) close();
    else open(selected);
  }, 'donation-network-trigger', {
    id: `${id}-network`, role: 'combobox', 'aria-haspopup': 'listbox',
    'aria-expanded': 'false', 'aria-controls': menu.id,
    'aria-labelledby': `${label.id} ${value.id}`,
  });
  const options = networks.map((network, index) => {
    const row = el('div', {
      id: `${id}-network-${network.id}`, role: 'option', 'aria-selected': index === selected,
      class: 'donation-network-option',
    }, icon(network.icon, 20), el('span', {}, network.name), icon('check', 16));
    row.addEventListener('pointerdown', (event) => { if (event.pointerType === 'mouse') event.preventDefault(); });
    row.addEventListener('click', () => choose(index));
    return row;
  });
  menu.append(...options);

  function position() {
    const bounds = trigger.getBoundingClientRect();
    const inset = 12;
    const gap = 6;
    const below = window.innerHeight - bounds.bottom - gap - inset;
    const above = bounds.top - gap - inset;
    const upward = below < 220 && above > below;
    const height = Math.max(0, Math.min(networks.length * 44 + 14, upward ? above : below));
    menu.style.width = `${Math.min(bounds.width, window.innerWidth - inset * 2)}px`;
    menu.style.maxHeight = `${height}px`;
    menu.style.left = `${Math.max(inset, Math.min(bounds.left, window.innerWidth - bounds.width - inset))}px`;
    menu.style.top = `${Math.max(inset, upward ? bounds.top - gap - height : bounds.bottom + gap)}px`;
  }
  function highlight(index) {
    active = Math.max(0, Math.min(networks.length - 1, index));
    options.forEach((row, index) => row.classList.toggle('is-active', index === active));
    trigger.setAttribute('aria-activedescendant', options[active].id);
    const row = options[active];
    if (row.offsetTop < menu.scrollTop) menu.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > menu.scrollTop + menu.clientHeight)
      menu.scrollTop = row.offsetTop + row.offsetHeight - menu.clientHeight;
  }
  function open(index) {
    trigger.focus({ preventScroll: true });
    menu.showPopover();
    highlight(index);
  }
  function close() {
    if (menu.matches(':popover-open')) menu.hidePopover();
  }
  function renderSelection() {
    mark.replaceChildren(icon(networks[selected].icon, 20));
    value.textContent = networks[selected].name;
    options.forEach((row, index) => row.setAttribute('aria-selected', index === selected));
  }
  function choose(index, restoreFocus = true) {
    const changed = selected !== index;
    selected = index;
    renderSelection();
    close();
    if (restoreFocus) trigger.focus();
    if (changed) onChange(networks[selected]);
  }
  menu.addEventListener('beforetoggle', (event) => {
    const opened = event.newState === 'open';
    trigger.setAttribute('aria-expanded', opened);
    if (opened) {
      position();
      window.addEventListener('resize', position);
      window.addEventListener('scroll', position, true);
    } else {
      search = '';
      trigger.removeAttribute('aria-activedescendant');
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    }
  });
  trigger.addEventListener('keydown', (event) => {
    const opened = menu.matches(':popover-open');
    if (event.key === 'Tab') { if (opened) choose(active, false); return; }
    if (event.key === 'Escape') {
      if (opened) { event.preventDefault(); event.stopPropagation(); close(); }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Enter' || event.key === ' ') { if (opened) choose(active); else open(selected); }
      else if (event.key === 'Home') { if (!opened) open(0); else highlight(0); }
      else if (event.key === 'End') { if (!opened) open(networks.length - 1); else highlight(networks.length - 1); }
      else if (!opened) open(selected);
      else highlight(active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      search = (Date.now() - searchedAt < 700 ? search : '') + event.key.toLowerCase();
      searchedAt = Date.now();
      const match = networks.findIndex((network) => network.name.toLowerCase().startsWith(search));
      if (match >= 0) { if (opened) highlight(match); else open(match); }
    }
  });
  renderSelection();
  return {
    node: el('div', { class: 'field donation-network-field' }, label, trigger, menu),
    control: trigger,
    dispose() {
      close();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    },
  };
}

/** Address-only QR; the donor must select the displayed network in their wallet. */
function addressQRCode(address, label) {
  const qr = qrcode(0, 'M');
  qr.addData(address, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const quietZone = 4;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: `0 0 ${count + quietZone * 2} ${count + quietZone * 2}`,
    role: 'img', 'aria-label': label, class: 'donation-qr',
    'shape-rendering': 'crispEdges',
  })) svg.setAttribute(key, value);
  const background = document.createElementNS(svg.namespaceURI, 'rect');
  for (const [key, value] of Object.entries({ width: '100%', height: '100%', fill: '#fff' })) background.setAttribute(key, value);
  const modules = document.createElementNS(svg.namespaceURI, 'path');
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      if (qr.isDark(row, column)) path += `M${column + quietZone} ${row + quietZone}h1v1h-1z`;
    }
  }
  modules.setAttribute('d', path);
  modules.setAttribute('fill', '#111');
  svg.append(background, modules);
  return svg;
}

function cryptoSupport(id, text) {
  let destination = donationNetworks[0];
  let revision = 0;
  let disposed = false;
  let feedbackTimer;
  const feedback = el('p', { class: 'donation-status', role: 'status', 'aria-live': 'polite' });
  function setCopyFeedback(message) {
    feedback.textContent = message;
  }
  function resetCopyFeedback() {
    clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
    copyLabel.textContent = text('copyAddress');
    setCopyFeedback('');
  }
  const address = el('a', { id: `${id}-address`, class: 'donation-address', tabindex: '0' });
  const assets = el('p', { class: 'donation-assets' });
  const network = donationNetworkSelector(id, donationNetworks, (selected) => {
    destination = selected;
    updateDestination();
  }, text);
  network.node.append(assets);
  const qrHost = el('div', { id: `${id}-qr`, class: 'donation-qr-host' });
  const qrToggle = button(text('showQR'), () => {
    const expanded = qrToggle.getAttribute('aria-expanded') !== 'true';
    node.classList.toggle('qr-expanded', expanded);
    qrToggle.setAttribute('aria-expanded', expanded);
    qrToggle.textContent = expanded ? text('hideQR') : text('showQR');
  }, 'donation-qr-toggle', { 'aria-expanded': 'false', 'aria-controls': qrHost.id });
  const copyLabel = el('span', {}, text('copyAddress'));
  const copy = button([icon('copy', 16), copyLabel], async () => {
    const copyingRevision = revision;
    const copiedAddress = destination.address;
    resetCopyFeedback();
    copy.disabled = true;
    try {
      await navigator.clipboard.writeText(copiedAddress);
      if (!disposed && copyingRevision === revision) {
        copyLabel.textContent = text('copied');
        setCopyFeedback(text('copySuccess'));
        feedbackTimer = setTimeout(resetCopyFeedback, 2000);
      }
    } catch {
      if (!disposed && copyingRevision === revision) {
        copyLabel.textContent = text('copyManually');
        setCopyFeedback(text('copyError'));
        const range = document.createRange();
        range.selectNodeContents(address);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        address.focus();
      }
    } finally {
      if (!disposed && copyingRevision === revision) copy.disabled = false;
    }
  }, 'donation-copy', { 'aria-describedby': address.id });

  function updateDestination() {
    revision++;
    copy.disabled = false;
    resetCopyFeedback();
    address.textContent = destination.address;
    address.href = donationWalletUri(destination);
    assets.textContent = destination.assets.includes(',') ? text('assets', { asset: destination.assets.split(',')[0] }) : destination.assets;
    qrHost.replaceChildren(addressQRCode(destination.address, text('qrLabel', { network: destination.name })));
  }
  const node = el('div', { class: 'crypto-support' }, network.node,
    qrToggle, qrHost,
    el('div', { class: 'donation-receiving' },
      el('div', { class: 'donation-address-details' },
        el('span', { class: 'donation-address-label' }, text('receivingAddress')), address),
      copy, feedback));
  updateDestination();
  return { node, dispose() { disposed = true; clearTimeout(feedbackTimer); network.dispose(); } };
}

export function donationMethods({ body, kofiPanel, id, text }) {
  let crypto;
  kofiPanel.id = `${id}-kofi-panel`;
  kofiPanel.setAttribute('role', 'tabpanel');
  kofiPanel.setAttribute('aria-labelledby', `${id}-kofi-tab`);
  const cryptoPanel = el('div', { id: `${id}-crypto-panel`, role: 'tabpanel', 'aria-labelledby': `${id}-crypto-tab` });
  cryptoPanel.hidden = true;
  const tabs = [text('cash'), text('crypto')].map((name, index) => button([icon(index ? 'crypto' : 'cash', 16), el('span', {}, name)], () => select(index), 'support-method', {
    id: `${id}-${index ? 'crypto' : 'kofi'}-tab`, role: 'tab',
    'aria-controls': index ? cryptoPanel.id : kofiPanel.id,
    'aria-selected': index === 0, tabindex: index === 0 ? '0' : '-1',
  }));
  function select(index) {
    if (index === 1 && !crypto) {
      crypto = cryptoSupport(id, text);
      cryptoPanel.append(crypto.node);
    }
    tabs.forEach((tab, position) => {
      tab.setAttribute('aria-selected', position === index);
      tab.tabIndex = position === index ? 0 : -1;
    });
    kofiPanel.hidden = index !== 0;
    cryptoPanel.hidden = index !== 1;
  }
  const controls = el('div', { class: 'support-methods', role: 'tablist', 'aria-label': text('method') }, tabs);
  controls.addEventListener('keydown', (event) => {
    const current = tabs.indexOf(document.activeElement);
    if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - current;
    select(next);
    tabs[next].focus();
  });
  body.before(controls);
  body.append(cryptoPanel);
  return { dispose() { crypto?.dispose(); controls.remove(); cryptoPanel.remove(); kofiPanel.hidden = false; } };
}
