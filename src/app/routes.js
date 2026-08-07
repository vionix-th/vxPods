/**
 * Mode switching between Text to Speech and Podcast. Simple button pair
 * with aria-pressed (simpler semantics than ARIA tabs, per architecture).
 * Each mode keeps its own DOM subtree so input is preserved per session.
 */

/**
 * @param {Object} args
 * @param {HTMLElement} args.nav container for the mode buttons
 * @param {{ tts: HTMLElement, podcast: HTMLElement }} args.panels
 * @param {'tts'|'podcast'} args.initialMode
 * @param {(mode: 'tts'|'podcast') => void} [args.onModeChange]
 * @param {(error: unknown) => void} [args.onPersistenceError]
 */
export function createModeSwitch({ nav, panels, initialMode, onModeChange, onPersistenceError }) {
  /** @type {Record<'tts'|'podcast', HTMLButtonElement>} */
  const buttons = {
    tts: modeButton('Text to Speech', 'tts'),
    podcast: modeButton('Podcast', 'podcast'),
  };
  nav.append(buttons.tts, buttons.podcast);

  /**
   * @param {string} label
   * @param {'tts'|'podcast'} mode
   */
  function modeButton(label, mode) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-button';
    button.textContent = label;
    button.addEventListener('click', () => activate(mode, { persist: true }));
    return button;
  }

  /**
   * @param {'tts'|'podcast'} mode
   * @param {{ persist?: boolean }} [options]
   */
  function activate(mode, options = {}) {
    for (const [key, button] of Object.entries(buttons)) {
      const active = key === mode;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    }
    panels.tts.hidden = mode !== 'tts';
    panels.podcast.hidden = mode !== 'podcast';
    if (options.persist !== false) {
      try {
        onModeChange?.(mode);
      } catch (error) {
        onPersistenceError?.(error);
      }
    }
  }

  activate(initialMode, { persist: false });

  return { activate };
}
