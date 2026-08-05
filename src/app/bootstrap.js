/**
 * Application bootstrap: builds the shell, loads settings, prunes expired
 * recovery data, wires offline state, mounts both workflows, and registers
 * the service worker in production.
 */

import { loadSettings, clearSettings } from '../storage/local-settings.js';
import { pruneExpired, deleteJob } from '../storage/render-job-store.js';
import { createTtsController } from '../features/tts/tts-controller.js';
import { createTtsView } from '../features/tts/tts-view.js';
import { createPodcastController } from '../features/podcast/podcast-controller.js';
import { createPodcastView } from '../features/podcast/podcast-view.js';
import { createModeSwitch } from './routes.js';
import { openProviderSettings } from '../features/providers/provider-form.js';
import { confirmDialog } from '../components/dialog.js';
import { icon } from '../components/icon.js';

/**
 * @param {HTMLElement} root
 */
export async function bootstrap(root) {
  const settings = loadSettings();
  try {
    await pruneExpired();
  } catch {
    // Expiry failure must not block the shell.
  }

  root.replaceChildren(buildShell());
  const onlineBadge = /** @type {HTMLElement} */ (root.querySelector('#online-status'));
  const main = /** @type {HTMLElement} */ (root.querySelector('#main'));
  const modeNav = /** @type {HTMLElement} */ (root.querySelector('#mode-nav'));

  const isOnline = () => navigator.onLine;
  function renderOnlineState() {
    const online = isOnline();
    onlineBadge.textContent = online ? 'Online' : 'Offline';
    onlineBadge.classList.toggle('is-offline', !online);
    onlineBadge.classList.toggle('is-online', online);
  }
  window.addEventListener('online', renderOnlineState);
  window.addEventListener('offline', renderOnlineState);
  renderOnlineState();

  // Provider settings button
  const settingsButton = /** @type {HTMLButtonElement} */ (
    root.querySelector('#provider-settings-button')
  );
  settingsButton.addEventListener('click', () => openProviderSettings());

  // Clear local data
  const clearButton = /** @type {HTMLButtonElement} */ (root.querySelector('#clear-data-button'));
  clearButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Clear local data',
      message:
        'This removes saved provider configurations (including API keys) and any unfinished render data from this browser.',
      confirmLabel: 'Clear local data',
    });
    if (!confirmed) return;
    clearSettings();
    await deleteJob().catch(() => {});
    window.location.reload();
  });

  // Workflows
  const ttsController = createTtsController();
  const ttsView = createTtsView({ controller: ttsController, isOnline });

  const podcastController = createPodcastController();
  const podcastView = createPodcastView({ controller: podcastController, isOnline });

  const ttsPanel = document.createElement('div');
  ttsPanel.id = 'panel-tts';
  ttsPanel.append(ttsView.element);
  const podcastPanel = document.createElement('div');
  podcastPanel.id = 'panel-podcast';
  podcastPanel.append(podcastView.element);
  main.append(ttsPanel, podcastPanel);

  createModeSwitch({
    nav: modeNav,
    panels: { tts: ttsPanel, podcast: podcastPanel },
    initialMode: settings.preferences.mode,
  });

  await podcastView.checkRecovery();

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
    } catch {
      // Offline shell is an enhancement; registration failure is non-fatal.
    }
  }
}

/**
 * @returns {DocumentFragment}
 */
function buildShell() {
  const fragment = document.createDocumentFragment();

  // Header: vionix.cloud topbar + branding rows
  const header = document.createElement('header');
  header.className = 'app-header';

  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  const topbarInner = document.createElement('div');
  topbarInner.className = 'topbar-inner';
  const tagline = document.createElement('p');
  tagline.className = 'topbar-tagline';
  const taglineLink = document.createElement('a');
  taglineLink.href = 'https://vionix.cloud';
  taglineLink.target = '_blank';
  taglineLink.rel = 'noopener noreferrer';
  taglineLink.textContent = 'A Vionix Consulting product';
  tagline.append(taglineLink);
  const topbarLinks = document.createElement('div');
  topbarLinks.className = 'topbar-links';
  const siteLink = document.createElement('a');
  siteLink.href = 'https://vionix.cloud';
  siteLink.target = '_blank';
  siteLink.rel = 'noopener noreferrer';
  siteLink.textContent = 'vionix.cloud';
  const githubLink = document.createElement('a');
  githubLink.href = 'https://github.com/vionix-th';
  githubLink.target = '_blank';
  githubLink.rel = 'noopener noreferrer';
  githubLink.className = 'icon-link';
  githubLink.append(icon('github', 14), ' GitHub');
  topbarLinks.append(siteLink, githubLink);
  topbarInner.append(tagline, topbarLinks);
  topbar.append(topbarInner);

  const branding = document.createElement('div');
  branding.className = 'branding';
  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = 'https://vionix.cloud';
  brand.target = '_blank';
  brand.rel = 'noopener noreferrer';
  brand.setAttribute('aria-label', 'Vionix vxPods — vionix.cloud');
  const logo = document.createElement('img');
  logo.src = '/assets/img/logo.png';
  logo.alt = '';
  logo.width = 36;
  logo.height = 36;
  logo.className = 'brand-logo';
  const brandText = document.createElement('span');
  brandText.className = 'brand-text';
  const brandBase = document.createElement('span');
  brandBase.textContent = 'Vionix ';
  const brandProduct = document.createElement('span');
  brandProduct.className = 'product-name';
  brandProduct.textContent = 'vxPods';
  brandText.append(brandBase, brandProduct);
  brand.append(logo, brandText);
  const headerActions = document.createElement('div');
  headerActions.className = 'header-actions';
  const onlineBadge = document.createElement('span');
  onlineBadge.id = 'online-status';
  onlineBadge.className = 'status-badge';
  const settingsButton = document.createElement('button');
  settingsButton.id = 'provider-settings-button';
  settingsButton.type = 'button';
  settingsButton.className = 'button button-secondary button-small';
  settingsButton.textContent = 'Provider settings';
  headerActions.append(onlineBadge, settingsButton);
  branding.append(brand, headerActions);
  header.append(topbar, branding);

  // Hero band
  const hero = document.createElement('section');
  hero.className = 'app-hero';
  const heroInner = document.createElement('div');
  heroInner.className = 'hero-inner';
  const heroKicker = document.createElement('span');
  heroKicker.className = 'hero-kicker';
  heroKicker.textContent = 'Audio workbench';
  const heroHeading = document.createElement('h1');
  heroHeading.append('Turn reading into ');
  const accent = document.createElement('span');
  accent.className = 'accent';
  accent.textContent = 'listening';
  heroHeading.append(accent);
  const heroSub = document.createElement('p');
  heroSub.className = 'hero-sub';
  heroSub.textContent =
    'Paste text and generate speech, or reshape it into a two-speaker podcast. Requests go directly from this browser to the provider you choose — keys and unfinished renders stay on this device.';
  heroInner.append(heroKicker, heroHeading, heroSub);
  hero.append(heroInner);

  // Mode switch
  const nav = document.createElement('nav');
  nav.id = 'mode-nav';
  nav.className = 'mode-nav';
  nav.setAttribute('aria-label', 'Workflow mode');

  const main = document.createElement('main');
  main.id = 'main';

  // Footer: vionix footer band + copyright
  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  const band = document.createElement('div');
  band.className = 'footer-band';
  const bandInner = document.createElement('div');
  bandInner.className = 'footer-band-inner';

  const footerBrand = document.createElement('div');
  footerBrand.className = 'footer-brand';
  const footerBrandRow = document.createElement('div');
  footerBrandRow.className = 'footer-brand-row';
  const footerLogo = document.createElement('img');
  footerLogo.src = '/assets/img/logo.png';
  footerLogo.alt = '';
  footerLogo.width = 32;
  footerLogo.height = 32;
  footerLogo.className = 'brand-logo';
  const sitename = document.createElement('p');
  sitename.className = 'footer-sitename';
  sitename.append('Vionix ');
  const siteProduct = document.createElement('span');
  siteProduct.className = 'product-name';
  siteProduct.textContent = 'vxPods';
  sitename.append(siteProduct);
  footerBrandRow.append(footerLogo, sitename);
  const localData = document.createElement('p');
  localData.textContent =
    'Provider configurations, keys, and unfinished renders are saved in this browser only.';
  const clearButton = document.createElement('button');
  clearButton.id = 'clear-data-button';
  clearButton.type = 'button';
  clearButton.className = 'button button-secondary button-small';
  clearButton.textContent = 'Clear local data';
  footerBrand.append(footerBrandRow, localData, clearButton);

  const footerLinks = document.createElement('div');
  footerLinks.className = 'footer-links';
  const linksHeading = document.createElement('h2');
  linksHeading.textContent = 'Vionix';
  const linkSite = document.createElement('a');
  linkSite.href = 'https://vionix.cloud';
  linkSite.target = '_blank';
  linkSite.rel = 'noopener noreferrer';
  linkSite.textContent = 'vionix.cloud';
  const linkCases = document.createElement('a');
  linkCases.href = 'https://vionix.cloud/case-studies.html';
  linkCases.target = '_blank';
  linkCases.rel = 'noopener noreferrer';
  linkCases.textContent = 'Case studies';
  const linkGithub = document.createElement('a');
  linkGithub.href = 'https://github.com/vionix-th';
  linkGithub.target = '_blank';
  linkGithub.rel = 'noopener noreferrer';
  linkGithub.className = 'icon-link';
  linkGithub.append(icon('github', 15), ' GitHub');
  footerLinks.append(linksHeading, linkSite, linkCases, linkGithub);

  bandInner.append(footerBrand, footerLinks);
  band.append(bandInner);

  const copyright = document.createElement('div');
  copyright.className = 'footer-copyright';
  const copyrightText = document.createElement('p');
  copyrightText.textContent = '© Vionix Consulting · vxPods is MIT licensed.';
  copyright.append(copyrightText);

  footer.append(band, copyright);

  fragment.append(header, hero, nav, main, footer);
  return fragment;
}
