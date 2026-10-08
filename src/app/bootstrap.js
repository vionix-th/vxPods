/**
 * Application bootstrap: builds the shell, loads settings, prunes expired
 * recovery data, wires offline state, mounts both workflows, and registers
 * the service worker in production.
 */

import { inspectSettings, clearSettings } from '../storage/local-settings.js';
import { clearPodcastDraft } from '../storage/podcast-draft-store.js';
import { pruneExpired, deleteJob } from '../storage/render-job-store.js';
import { createTtsController } from '../features/tts/tts-controller.js';
import { createTtsView } from '../features/tts/tts-view.js';
import { createPodcastController } from '../features/podcast/podcast-controller.js';
import { createPodcastView } from '../features/podcast/podcast-view.js';
import { createModeSwitch } from './routes.js';
import { openSettings } from '../features/providers/provider-form.js';
import { aboutButton, publisherIdentity, projectLinks } from './branding.js';
import { supportButton, openSupportDialog } from './support.js';
import { supportReminders, SUPPORT_REMINDER_KEY } from './support-reminder-policy.js';
import { createSupportReminderController } from './support-reminder-controller.js';
import { notify, dismissNotification, hasOperationalNotifications } from '../components/error-message.js';
import { saveMode } from '../features/providers/provider-store.js';
import { createOnlineState } from './online-state.js';
import { AppError, toAppError } from '../services/errors.js';
import { createToolButton } from '../components/tool-button.js';


/**
 * @param {HTMLElement} root
 */
export async function bootstrap(root) {
  const settingsResult = inspectSettings();
  const settings = settingsResult.settings;
  try {
    await pruneExpired();
  } catch {
    // Expiry failure must not block the shell.
  }

  root.replaceChildren(buildShell());
  const main = /** @type {HTMLElement} */ (root.querySelector('#main'));
  const modeNav = /** @type {HTMLElement} */ (root.querySelector('#mode-nav'));

  if (settingsResult.error) {
    notify({
      type: 'error',
      title: 'Saved settings need attention',
      message: settingsResult.error.message,
      error: settingsResult.error,
    });
  }

  const onlineState = createOnlineState();
  onlineState.subscribe((online) => notify(online
    ? { type: 'success', title: 'Back online', message: 'Generation is available again.' }
    : { type: 'warning', title: 'Offline', message: 'Generation is unavailable until connection returns.' },
  ));

  // Application settings button
  const settingsButton = /** @type {HTMLButtonElement} */ (
    root.querySelector('#settings-button')
  );
  settingsButton.addEventListener('click', () => {
    openSettings({
      getPromptPreview: podcastView.getPromptPreview,
      onClearLocalData: clearLocalData,
    });
  });

  async function clearLocalData() {
    const failures = [];
    try {
      const clearReminders = () => localStorage.removeItem(SUPPORT_REMINDER_KEY);
      if (navigator.locks) await navigator.locks.request(SUPPORT_REMINDER_KEY, clearReminders);
      else clearReminders();
    } catch (error) { failures.push(toAppError(error)); }
    try {
      clearSettings();
    } catch (error) {
      failures.push(toAppError(error));
    }
    try {
      clearPodcastDraft();
    } catch (error) {
      failures.push(toAppError(error));
    }
    try {
      await deleteJob();
    } catch (error) {
      failures.push(toAppError(error));
    }
    if (failures.length > 0) {
      throw new AppError({
        kind: 'storage',
        message: 'Some local data could not be removed. Retry before leaving this browser.',
        retryable: true,
        status: undefined,
        cause: failures,
      });
    }
    window.location.reload();
  }

  // Workflows
  const ttsController = createTtsController({ onUsage: () => { void supportReminders.recordUsage(); } });
  const ttsView = createTtsView({
    controller: ttsController,
    isOnline: onlineState.isOnline,
    subscribeOnline: onlineState.subscribe,
  });

  const podcastController = createPodcastController({ onUsage: () => { void supportReminders.recordUsage(); } });
  const podcastView = createPodcastView({
    controller: podcastController,
    isOnline: onlineState.isOnline,
    subscribeOnline: onlineState.subscribe,
  });

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
    onModeChange: saveMode,
    onPersistenceError(error) {
      const normalized = toAppError(error);
      notify({
        type: 'error',
        title: 'Mode preference was not saved',
        message: normalized.message,
        error: normalized,
      });
    },
  });

  await podcastView.checkRecovery();
  const active = new Set(['validating', 'generating', 'cancelling', 'exporting', 'rendering']);
  const reminders = createSupportReminderController({
    store: supportReminders,
    safe: () => document.visibilityState === 'visible' && document.hasFocus() &&
      !hasOperationalNotifications() && !document.querySelector('dialog[open]') &&
      !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') &&
      !active.has(ttsController.store.get().status) &&
      !active.has(podcastController.store.get().status) &&
      !active.has(podcastController.store.get().renderStatus) &&
      ![...document.querySelectorAll('audio')].some((audio) => !audio.paused && !audio.ended),
    getSupport: () => [...root.querySelectorAll('.support-trigger')].find((button) => button.getClientRects().length),
    openSupport: openSupportDialog,
    show: ({ support, postpone, disable }) => {
      const id = notify({ type: 'info', title: 'Support reminder',
        message: 'Finding vxPods useful? Support its upkeep.', timeoutMs: 0, lowPriority: true,
        actions: [{ label: 'Support', run: support }, { label: 'Not now', run: postpone },
          { label: 'Don’t remind me', run: disable }],
      });
      return { element: document.getElementById(id), destroy: () => dismissNotification(id) };
    },
  });
  ttsController.store.subscribe(reminders.evaluate);
  podcastController.store.subscribe(reminders.evaluate);

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`);
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

  // Product identity, publisher credit and secondary project actions.
  const header = document.createElement('header');
  header.className = 'app-header';

  const branding = document.createElement('div');
  branding.className = 'branding';
  const brand = publisherIdentity();
  const headerActions = document.createElement('div');
  headerActions.className = 'header-actions';
  const settingsButton = createToolButton({ label: 'Open settings', glyph: '⚙' });
  settingsButton.id = 'settings-button';
  headerActions.append(aboutButton(), supportButton(), settingsButton);
  branding.append(brand, headerActions);
  header.append(branding);

  // Hero band
  const hero = document.createElement('section');
  hero.className = 'app-hero';
  const heroInner = document.createElement('div');
  heroInner.className = 'hero-inner';
  const heroHeading = document.createElement('h1');
  heroHeading.append('Turn reading into ');
  const accent = document.createElement('span');
  accent.className = 'accent';
  accent.textContent = 'listening';
  heroHeading.append(accent);
  const heroSub = document.createElement('p');
  heroSub.className = 'hero-sub';
  heroSub.textContent =
    'vxPods turns written material into audio for listening away from your screen. Paste or import text, then choose direct narration or a flexible one-to-eight-speaker podcast. For podcasts, review script before generating and exporting audio.';
  heroInner.append(heroHeading, heroSub);
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

  const footerBrand = publisherIdentity('footer-brand');

  const footerLinks = document.createElement('div');
  footerLinks.className = 'footer-project-links';
  const footerActions = document.createElement('div');
  footerActions.className = 'project-actions';
  footerActions.append(aboutButton(), supportButton());
  footerLinks.append(footerActions, projectLinks());
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
