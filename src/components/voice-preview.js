/**
 * Temporary inline audio preview. Feature owner supplies generation callback.
 */

/**
 * @param {Object} args
 * @param {() => Promise<Blob | null>} args.loadAudio
 * @param {(error: unknown) => void} args.onError
 */
export function createVoicePreview({ loadAudio, onError }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-secondary button-small';
  button.textContent = 'Preview';
  const player = document.createElement('audio');
  player.controls = true;
  player.hidden = true;
  player.className = 'voice-preview-player';
  let objectUrl = null;

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Preparing…';
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
      button.textContent = 'Preview';
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
