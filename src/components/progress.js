/**
 * Determinate progress indicator paired with text counts, plus one
 * restrained live region for phase announcements.
 */

/**
 * @typedef {Object} ProgressHandle
 * @property {HTMLElement} element
 * @property {(args: { completed: number, total: number, label?: string }) => void} update
 * @property {(message: string) => void} announce
 */

/**
 * @param {Object} args
 * @param {number} args.total
 * @param {string} [args.unit] e.g. 'segments' or 'chunks'
 * @returns {ProgressHandle}
 */
export function createProgress({ total, unit = 'items' }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'progress';

  const bar = document.createElement('progress');
  bar.className = 'progress-bar';
  bar.max = Math.max(1, total);
  bar.value = 0;

  const text = document.createElement('p');
  text.className = 'progress-text';

  const live = document.createElement('p');
  live.className = 'visually-hidden';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');

  wrapper.append(bar, text, live);

  let lastAnnouncement = '';

  return {
    element: wrapper,
    update({ completed, total: nextTotal, label }) {
      if (typeof nextTotal === 'number') bar.max = Math.max(1, nextTotal);
      bar.value = completed;
      const totalCount = typeof nextTotal === 'number' ? nextTotal : total;
      text.textContent = label || `${completed} of ${totalCount} ${unit}`;
    },
    announce(message) {
      if (message === lastAnnouncement) return;
      lastAnnouncement = message;
      // Toggle text so repeated identical messages are re-announced.
      live.textContent = '';
      requestAnimationFrame(() => {
        live.textContent = message;
      });
    },
  };
}
