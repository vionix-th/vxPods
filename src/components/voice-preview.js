/**
 * Temporary inline audio preview. Feature owner supplies generation callback.
 */

import { createToolButton } from './tool-button.js';

/**
 * @param {Object} args
 * @param {() => Promise<Blob | null>} args.loadAudio
 * @param {(error: unknown) => void} args.onError
 */
export function createVoicePreview({ loadAudio, onError }) {
  const button = createToolButton({ label: 'Preview voice', glyph: '▶' });
  const player = document.createElement('audio');
  player.controls = true;
  player.hidden = true;
  player.className = 'voice-preview-player';
  let objectUrl = null;

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.setAttribute('aria-label', 'Preparing voice preview');
    button.title = 'Preparing voice preview';
    try {
      const blob = await loadAudio();
      if (!blob) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      player.src = objectUrl;
      player.hidden = false;
      await player.play().catch(() => {});
    } catch (err) {
      onError(err);
    } finally {
      button.disabled = false;
      button.setAttribute('aria-label', 'Preview voice');
      button.title = 'Preview voice';
    }
  });

  return {
    button,
    player,
    clear() {
      player.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      player.removeAttribute('src');
      player.load();
      player.hidden = true;
    },
  };
}
