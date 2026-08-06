/**
 * Text-to-Speech workflow view. DOM only; behavior lives in the controller.
 */

import { createSourceInput } from '../../components/source-input.js';
import { createProviderSelect } from '../../components/provider-select.js';
import { selectField, textField, cardHeader } from '../../components/fields.js';
import { createProgress } from '../../components/progress.js';
import { renderError, clearError, notify } from '../../components/error-message.js';
import { downloadBlob } from '../../utils/download.js';
import { AppError } from '../../services/errors.js';
import { requireProvider } from '../providers/provider-requirement.js';
import { subscribeProviders } from '../providers/provider-store.js';
import { createVoicePreview } from '../../components/voice-preview.js';
import { DEFAULT_TTS_MODELS, DEFAULT_VOICES } from '../providers/provider-suggestions.js';

const KNOWN_TTS_MODELS = DEFAULT_TTS_MODELS;
const KNOWN_VOICES = DEFAULT_VOICES;

/**
 * @param {Object} args
 * @param {ReturnType<import('./tts-controller.js').createTtsController>} args.controller
 * @param {() => boolean} args.isOnline
 * @returns {{ element: HTMLElement }}
 */
export function createTtsView({ controller, isOnline }) {
  const root = document.createElement('div');
  root.className = 'workflow tts-workflow';

  const source = createSourceInput({
    title: 'Source',
    help: 'Paste text or import a UTF-8 .txt or .md file.',
  });

  // --- Voice settings card
  const settingsCard = document.createElement('section');
  settingsCard.className = 'card';
  settingsCard.append(cardHeader('Voice settings'));

  const providerSelect = createProviderSelect({ slot: 'tts', label: 'TTS provider' });
  const modelField = selectField({
    label: 'Model',
    options: KNOWN_TTS_MODELS,
    value: KNOWN_TTS_MODELS[0],
  });
  const voiceField = selectField({
    label: 'Voice',
    options: KNOWN_VOICES,
    value: 'alloy',
  });
  const speedField = textField({
    label: 'Speed',
    value: '1',
    help: '0.25 to 4.0. Supported when the provider implements it.',
  });
  const voicePreview = createVoicePreview({
    getSelected: providerSelect.getSelected,
    refresh: providerSelect.refresh,
    getModel: () => modelField.input.value.trim() || KNOWN_TTS_MODELS[0],
    getVoice: () => voiceField.input.value.trim() || 'alloy',
    getSpeed: () => {
      const speed = Number(speedField.input.value.trim());
      return Number.isFinite(speed) ? speed : undefined;
    },
    getSample: () => 'This is a short voice preview.',
  });
  const voiceControls = document.createElement('div');
  voiceControls.className = 'voice-control-row';
  voiceControls.append(voiceField.input, voicePreview.button);
  voiceField.wrapper.append(voiceControls, voicePreview.player);
  function refreshProviderSuggestions() {
    const provider = providerSelect.getSelected();
    modelField.setOptions(provider?.ttsModels ?? KNOWN_TTS_MODELS);
    refreshVoiceOptions();
    voicePreview.clear();
  }
  function refreshVoiceOptions() {
    const provider = providerSelect.getSelected();
    voiceField.setOptions(provider?.voicesByTtsModel?.[modelField.input.value] ?? KNOWN_VOICES);
  }
  providerSelect.element.addEventListener('change', refreshProviderSuggestions);
  modelField.input.addEventListener('change', () => {
    refreshVoiceOptions();
    voicePreview.clear();
  });
  subscribeProviders(refreshProviderSuggestions);
  refreshProviderSuggestions();
  settingsCard.append(
    providerSelect.element,
    modelField.wrapper,
    voiceField.wrapper,
    speedField.wrapper,
  );

  // --- Generate row
  const actionRow = document.createElement('div');
  actionRow.className = 'action-row';
  const generateButton = document.createElement('button');
  generateButton.type = 'button';
  generateButton.className = 'button button-primary';
  generateButton.textContent = 'Generate speech';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'button button-secondary';
  cancelButton.textContent = 'Cancel';
  cancelButton.hidden = true;
  actionRow.append(generateButton, cancelButton);

  const offlineNote = document.createElement('p');
  offlineNote.className = 'help-text';
  offlineNote.textContent = 'Generation is disabled while offline.';
  offlineNote.hidden = true;

  const errorRegion = document.createElement('div');
  errorRegion.className = 'error-region';

  const progress = createProgress({ total: 1, unit: 'chunks' });
  progress.element.hidden = true;

  // --- Result card
  const resultCard = document.createElement('section');
  resultCard.className = 'card';
  resultCard.hidden = true;
  resultCard.append(cardHeader('Preview and export'));
  const resultMeta = document.createElement('p');
  resultMeta.className = 'help-text';
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.className = 'audio-player';
  audio.setAttribute('aria-label', 'Generated speech preview');
  const downloadRow = document.createElement('div');
  downloadRow.className = 'action-row';
  const downloadWavButton = document.createElement('button');
  downloadWavButton.type = 'button';
  downloadWavButton.className = 'button button-primary';
  downloadWavButton.textContent = 'Download WAV';
  const downloadMp3Button = document.createElement('button');
  downloadMp3Button.type = 'button';
  downloadMp3Button.className = 'button button-primary';
  downloadMp3Button.textContent = 'Download MP3';
  const againButton = document.createElement('button');
  againButton.type = 'button';
  againButton.className = 'button button-secondary';
  againButton.textContent = 'Generate again';
  downloadRow.append(downloadWavButton, downloadMp3Button, againButton);
  resultCard.append(resultMeta, audio, downloadRow);

  root.append(source.element, settingsCard, actionRow, offlineNote, progress.element, resultCard);

  /** @type {string | null} */
  let audioUrl = null;
  let previousStatus = 'idle';

  function readSettings(provider) {
    const speedRaw = speedField.input.value.trim();
    const speed = speedRaw === '' ? undefined : Number(speedRaw);
    return {
      provider,
      model: modelField.input.value.trim() || KNOWN_TTS_MODELS[0],
      voice: voiceField.input.value.trim() || 'alloy',
      speed: Number.isFinite(speed) ? speed : undefined,
    };
  }

  generateButton.addEventListener('click', async () => {
    clearError(errorRegion);
    requireProvider({
      slot: 'tts',
      getSelected: providerSelect.getSelected,
      refresh: providerSelect.refresh,
      onReady: async (provider) => {
        try {
          const settings = readSettings(provider);
          generateButton.textContent = `Generate with ${settings.provider.name}`;
          await controller.generate(source.getText(), settings);
        } catch (err) {
          renderError(errorRegion, err, { onDismiss: () => {} });
        } finally {
          generateButton.textContent = 'Generate speech';
        }
      },
    });
  });

  cancelButton.addEventListener('click', () => controller.cancel());

  againButton.addEventListener('click', () => generateButton.click());

  async function downloadAudio(format) {
    clearError(errorRegion);
    const button = format === 'wav' ? downloadWavButton : downloadMp3Button;
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = format === 'mp3' ? 'Encoding MP3…' : 'Preparing…';
    try {
      const { blob, filename } = await controller.exportAudio(format, (done, total) => {
        progress.element.hidden = false;
        progress.update({ completed: done, total, label: `Encoding MP3: ${Math.round((done / total) * 100)}%` });
      });
      downloadBlob(blob, filename);
    } catch (err) {
      renderError(errorRegion, err, { onDismiss: () => {} });
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  downloadWavButton.addEventListener('click', () => downloadAudio('wav'));
  downloadMp3Button.addEventListener('click', () => downloadAudio('mp3'));

  controller.store.subscribe((state) => {
    const busy = state.status === 'validating' || state.status === 'generating';
    lastBusy = busy;
    syncOnline();
    cancelButton.hidden = !busy;

    if (state.status === 'generating' || state.status === 'validating') {
      progress.element.hidden = false;
      const done = state.chunks.filter((c) => c.status === 'completed').length;
      const failed = state.chunks.find((c) => c.status === 'failed');
      progress.update({
        completed: done,
        total: Math.max(1, state.chunks.length),
        label: failed
          ? `${done} of ${state.chunks.length} chunks; chunk ${failed.index + 1} failed`
          : undefined,
      });
      progress.announce('Generating speech.');
    }

    if (state.status === 'cancelled') {
      progress.announce('Cancelled. Completed chunks are kept.');
      if (previousStatus !== 'cancelled') {
        notify({ type: 'warning', title: 'Generation cancelled', message: 'Completed chunks are kept.' });
      }
      const done = state.chunks.filter((c) => c.status === 'completed').length;
      if (done > 0 && done < state.chunks.length) {
        renderPartialFailure();
      }
    }

    if (state.status === 'failed' && state.error) {
      progress.announce(`Generation failed: ${state.error.message}`);
      const hasPartial = state.chunks.some((c) => c.status === 'completed');
      renderError(errorRegion, state.error, {
        actionLabel: hasPartial ? 'Retry failed chunks' : 'Retry',
        onAction: () => {
          clearError(errorRegion);
          controller.retryFailed();
        },
        onDismiss: () => {},
      });
    }

    if (state.status === 'ready' && state.output) {
      progress.announce('Speech ready.');
      progress.element.hidden = true;
      resultCard.hidden = false;
      resultMeta.textContent = `Generated with ${state.output.settingsLabel}`;
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(state.output.wav);
      audio.src = audioUrl;
      if (previousStatus !== 'ready') {
        notify({ type: 'success', title: 'Speech ready', message: 'Audio is ready to preview or download.' });
      }
    }
    previousStatus = state.status;
  });

  function renderPartialFailure() {
    renderError(
      errorRegion,
      new AppError({
        kind: 'cancelled',
        message: 'Cancelled. Completed chunks are kept.',
        retryable: false,
        status: undefined,
      }),
      {
        actionLabel: 'Retry failed chunks',
        onAction: () => {
          clearError(errorRegion);
          controller.retryFailed();
        },
        onDismiss: () => {},
      },
    );
  }

  let lastBusy = false;
  function syncOnline() {
    const online = isOnline();
    generateButton.disabled = lastBusy || !online;
    offlineNote.hidden = online || lastBusy;
  }
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();

  return { element: root };
}
