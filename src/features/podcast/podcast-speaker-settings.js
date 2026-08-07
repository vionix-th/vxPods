import { selectField, textAreaField, textField } from '../../components/fields.js';
import { notify } from '../../components/error-message.js';
import { createVoicePreview } from '../../components/voice-preview.js';
import { requireProvider } from '../providers/provider-requirement.js';
import { createVoicePreviewAudio } from '../tts/voice-preview-controller.js';

const DEFAULT_SPEAKERS = [
  { name: 'Host', role: 'Guides the discussion', voice: 'alloy' },
  { name: 'Guest', role: 'Explains the source', voice: 'verse' },
];

/**
 * @param {Object} args
 * @param {HTMLSelectElement} args.formatInput
 * @param {ReturnType<import('../../components/provider-select.js').createProviderSelect>} args.providerSelect
 * @param {() => import('../../domain/provider-config.js').TtsModelConfig | undefined} args.getTtsModel
 * @param {() => string[]} args.getVoiceOptions
 * @param {ReturnType<import('./podcast-controller.js').createPodcastController>} args.controller
 */
export function createPodcastSpeakerSettings({
  formatInput,
  providerSelect,
  getTtsModel,
  getVoiceOptions,
  controller,
}) {
  const element = document.createElement('section');
  element.className = 'script-speaker-settings';
  const title = document.createElement('h3');
  title.textContent = 'Speakers';
  const help = document.createElement('p');
  help.className = 'help-text';
  help.textContent = 'Names, roles, and voices apply to every matching turn in the script.';
  const cards = document.createElement('div');
  cards.className = 'speakers';
  element.append(title, help, cards);

  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.className = 'button button-secondary';
  applyButton.textContent = 'Apply speaker changes to script';
  applyButton.hidden = true;

  /** @type {{ name: HTMLInputElement, role: HTMLTextAreaElement, voice: HTMLSelectElement }[]} */
  let inputs = [];
  /** @type {{ name: string, role: string, voice: string }[]} */
  let values = [];
  /** @type {Set<() => void>} */
  const previewCleanups = new Set();

  function read() {
    return inputs.map((entry) => ({
      name: entry.name.value.trim() || 'Speaker',
      role: entry.role.value.trim(),
      voice: entry.voice.value.trim(),
    }));
  }

  function clearPreviews() {
    for (const clear of previewCleanups) clear();
    previewCleanups.clear();
  }

  function render() {
    clearPreviews();
    const count = formatInput.value === 'solo' ? 1 : 2;
    const voiceOptions = getVoiceOptions();
    cards.replaceChildren();
    inputs = [];
    for (let index = 0; index < count; index += 1) {
      const speaker = values[index] || DEFAULT_SPEAKERS[index];
      const card = document.createElement('fieldset');
      card.className = 'speaker-card';
      const legend = document.createElement('legend');
      legend.textContent = `Speaker ${index + 1}`;
      const name = textField({ label: 'Name', value: speaker.name, required: true });
      const role = textAreaField({ label: 'Role', value: speaker.role, rows: 3 });
      const voice = selectField({
        label: 'Voice',
        options: voiceOptions.length ? [...new Set([...voiceOptions, speaker.voice])] : [],
        value: speaker.voice,
      });
      const controls = document.createElement('div');
      controls.className = 'voice-control-row';
      const preview = createVoicePreview({
        loadAudio: async () => {
          const provider = await requireProvider({
            slot: 'tts',
            getSelected: providerSelect.getSelected,
            refresh: providerSelect.refresh,
          });
          if (!provider) return null;
          const selectedVoice = voice.input.value.trim();
          if (!selectedVoice) {
            throw new Error('No voices are configured for this TTS model. Add a voice in provider settings.');
          }
          return createVoicePreviewAudio({
            provider,
            ttsModel: getTtsModel(),
            voice: selectedVoice,
            input: `Hello, I am ${name.input.value.trim() || `Speaker ${index + 1}`}. This is a short voice preview.`,
          });
        },
        onError: (error) => notify({
          type: 'error',
          title: 'Voice preview failed',
          message: error instanceof Error ? error.message : 'Could not create voice preview.',
        }),
      });
      preview.button.disabled = voiceOptions.length === 0;
      voice.input.disabled = voiceOptions.length === 0;
      previewCleanups.add(preview.clear);
      controls.append(voice.input, preview.button);
      voice.wrapper.append(controls, preview.player);
      card.append(legend, name.wrapper, role.wrapper, voice.wrapper);
      cards.append(card);
      inputs.push({ name: name.input, role: role.input, voice: voice.input });
    }
  }

  function captureAndRender() {
    values = read();
    render();
  }

  function applyToScript() {
    const script = controller.store.get().script;
    if (!script) return;
    const speakers = read();
    if (speakers.length !== script.speakers.length) {
      notify({
        type: 'error',
        title: 'Speaker count does not match',
        message: 'Regenerate or import a script to change between solo and conversation formats.',
      });
      return;
    }
    try {
      controller.applyEditedScript({
        ...script,
        speakers: script.speakers.map((speaker, index) => ({ ...speaker, ...speakers[index] })),
      });
      notify({ type: 'success', title: 'Script speakers updated', message: 'Changes apply to every turn in the script.' });
    } catch (error) {
      notify({
        type: 'error',
        title: 'Could not update script speakers',
        message: error instanceof Error ? error.message : 'Unknown error.',
      });
    }
  }

  formatInput.addEventListener('change', captureAndRender);
  applyButton.addEventListener('click', applyToScript);
  render();

  return {
    element,
    applyButton,
    read,
    refresh: captureAndRender,
    clearPreviews,
    /** @param {import('./podcast-script.js').PodcastScript} script */
    hydrate(script) {
      formatInput.value = script.format;
      values = script.speakers.map(({ name, role, voice }) => ({ name, role, voice }));
      render();
    },
  };
}
