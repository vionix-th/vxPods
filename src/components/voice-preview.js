/**
 * Temporary inline TTS voice preview. It shares the provider prerequisite
 * flow used by generation but never creates persistent render work.
 */

import { notify } from './error-message.js';
import { createSpeech, decodeSpeechAudio } from '../services/speech-client.js';
import { decodePcmS16Le, decodeToPcm } from '../audio/audio-assembler.js';
import { wavBlob } from '../audio/wav-writer.js';
import { requireProvider } from '../features/providers/provider-requirement.js';

/**
 * @param {Object} args
 * @param {() => import('../storage/local-settings.js').ProviderConfig | null} args.getSelected
 * @param {() => void} args.refresh
 * @param {() => import('../storage/local-settings.js').TtsModelConfig} args.getTtsModel
 * @param {() => string} args.getVoice
 * @param {() => string} args.getSample
 * @param {() => number | undefined} [args.getSpeed]
 */
export function createVoicePreview({ getSelected, refresh, getTtsModel, getVoice, getSample, getSpeed }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-secondary button-small';
  button.textContent = 'Preview';
  const player = document.createElement('audio');
  player.controls = true;
  player.hidden = true;
  player.className = 'voice-preview-player';
  let objectUrl = null;

  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Preparing…';
    requireProvider({
      slot: 'tts',
      getSelected,
      refresh,
      onReady: async (provider) => {
        try {
          const voice = getVoice().trim();
          if (!voice) throw new Error('No voices are configured for this TTS model. Add a voice in provider settings.');
          const result = await createSpeech({
            provider,
            ttsModel: getTtsModel(),
            voice,
            input: getSample(),
            speed: getSpeed?.(),
          });
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          let blob = new Blob([result.audio], { type: result.contentType });
          if (result.ttsModel.responseFormat === 'pcm') {
            const decoded = await decodeSpeechAudio(
              result,
              decodeToPcm,
              result.ttsModel.pcm.sampleRate,
              decodePcmS16Le,
            );
            blob = wavBlob(decoded);
          }
          objectUrl = URL.createObjectURL(blob);
          player.src = objectUrl;
          player.hidden = false;
          await player.play().catch(() => {});
        } catch (err) {
          notify({
            type: 'error',
            title: 'Voice preview failed',
            message: err instanceof Error ? err.message : 'Could not create voice preview.',
          });
        } finally {
          button.disabled = false;
          button.textContent = 'Preview';
        }
      },
    });
  });

  return {
    button,
    player,
    clear() {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      player.removeAttribute('src');
      player.hidden = true;
    },
  };
}
