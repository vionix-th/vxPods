import { selectField, textAreaField, textField } from '../../components/fields.js';
import { notify } from '../../components/error-message.js';
import { confirmDialog } from '../../components/dialog.js';
import { createVoicePreview } from '../../components/voice-preview.js';
import { requireProvider } from '../providers/provider-requirement.js';
import { createVoicePreviewAudio } from '../tts/voice-preview-controller.js';
import { STARTER_SPEAKER_PROFILES } from '../../domain/podcast-templates.js';
import { MAX_SPEAKERS, MIN_SPEAKERS } from '../../domain/podcast-script-schema.js';
import { listSpeakerProfiles, subscribePodcastTemplates } from './podcast-template-store.js';
import { createToolButton } from '../../components/tool-button.js';

const HOST = STARTER_SPEAKER_PROFILES.find((profile) => profile.id === 'profile-host');
const EXPERT = STARTER_SPEAKER_PROFILES.find((profile) => profile.id === 'profile-expert');

/**
 * @param {Object} args
 * @param {ReturnType<import('../../components/provider-select.js').createProviderSelect>} args.providerSelect
 * @param {() => import('../../domain/provider-config.js').TtsModelConfig | undefined} args.getTtsModel
 * @param {() => string[]} args.getVoiceOptions
 * @param {ReturnType<import('./podcast-controller.js').createPodcastController>} args.controller
 * @param {() => void} [args.onStructureChange]
 * @param {() => void} [args.onDraftChange]
 */
export function createPodcastSpeakerSettings({
  providerSelect,
  getTtsModel,
  getVoiceOptions,
  controller,
  onStructureChange = () => {},
  onDraftChange = () => {},
}) {
  const element = document.createElement('section');
  element.className = 'script-speaker-settings';
  const title = document.createElement('h3');
  title.textContent = 'Speakers';
  const help = document.createElement('p');
  help.className = 'help-text';
  const cards = document.createElement('div');
  cards.className = 'speakers';
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'button button-secondary';
  addButton.textContent = 'Add speaker';
  const announcement = document.createElement('p');
  announcement.className = 'visually-hidden';
  announcement.setAttribute('aria-live', 'polite');
  element.append(title, help, cards, addButton, announcement);

  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.className = 'button button-secondary';
  applyButton.textContent = 'Apply speaker changes to script';
  applyButton.hidden = true;

  /** @type {{ id: string, name: HTMLInputElement, role: HTMLTextAreaElement, voice: HTMLSelectElement }[]} */
  let inputs = [];
  /** @type {{ id: string, name: string, role: string, voice: string }[]} */
  let values = initialSpeakers();
  /** @type {Map<string, string>} */
  const selectedProfileIds = new Map();
  let nextSpeakerNumber = 3;
  let preserveDraftOnNextHydrate = false;
  /** @type {Set<() => void>} */
  const previewCleanups = new Set();

  function read() {
    return inputs.map((entry) => ({
      id: entry.id,
      name: entry.name.value.trim() || 'Speaker',
      role: entry.role.value.trim(),
      voice: entry.voice.value.trim(),
    }));
  }

  function capture() {
    if (inputs.length) values = read();
  }

  function clearPreviews() {
    for (const clear of previewCleanups) clear();
    previewCleanups.clear();
  }

  function render(focusId = null) {
    clearPreviews();
    const voiceOptions = getVoiceOptions();
    assignAvailableVoices(voiceOptions);
    const profiles = listSpeakerProfiles();
    cards.replaceChildren();
    inputs = [];
    values.forEach((speaker, index) => {
      const card = document.createElement('fieldset');
      card.className = 'speaker-card';
      card.dataset.speakerId = speaker.id;
      card.tabIndex = -1;
      const legend = document.createElement('legend');
      legend.textContent = `Speaker ${index + 1}`;
      const profile = selectField({
        label: 'Speaker profile',
        options: ['', ...profiles.map((record) => record.id)],
        value: selectedProfileIds.get(speaker.id) ?? '',
      });
      for (const option of profile.input.options) {
        option.textContent = option.value
          ? profiles.find((record) => record.id === option.value)?.label ?? option.value
          : 'Choose profile…';
      }
      const applyProfile = createToolButton({
        label: `Apply profile to ${speaker.name || `Speaker ${index + 1}`}`,
        glyph: '✓',
      });
      applyProfile.disabled = profiles.length === 0;
      const profileRow = document.createElement('div');
      profileRow.className = 'profile-control-row';
      profileRow.append(profile.input, applyProfile);
      profile.wrapper.append(profileRow);

      const name = textField({ label: 'Name', value: speaker.name, required: true });
      const role = textAreaField({
        label: 'Role',
        value: speaker.role,
        rows: 3,
        help: 'Define this speaker’s contribution, discourse behavior, stance, and individual delivery within the selected format.',
      });
      const voice = selectField({
        label: 'Voice',
        options: voiceOptions,
        value: speaker.voice,
      });
      const voiceControls = document.createElement('div');
      voiceControls.className = 'voice-control-row';
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
      voiceControls.append(voice.input, preview.button);
      voice.wrapper.append(voiceControls, preview.player);

      const tools = document.createElement('div');
      tools.className = 'speaker-card-actions';
      const moveUp = actionButton('Move up', `Move ${speaker.name} up`, index === 0, () => move(index, index - 1));
      const moveDown = actionButton('Move down', `Move ${speaker.name} down`, index === values.length - 1, () => move(index, index + 1));
      const remove = actionButton(
        'Remove',
        `Remove ${speaker.name}`,
        values.length === MIN_SPEAKERS,
        () => removeSpeaker(index),
        'button-danger',
      );
      tools.append(moveUp, moveDown, remove);

      applyProfile.addEventListener('click', () => {
        const selected = profiles.find((record) => record.id === profile.input.value);
        if (!selected) return;
        name.input.value = selected.defaultSpeakerName || name.input.value;
        role.input.value = selected.role;
        announcement.textContent = `${selected.label} profile applied to Speaker ${index + 1}.`;
        onStructureChange();
      });
      profile.input.addEventListener('change', () => {
        selectedProfileIds.set(speaker.id, profile.input.value);
      });
      name.input.addEventListener('input', onStructureChange);
      role.input.addEventListener('input', onStructureChange);
      voice.input.addEventListener('change', onDraftChange);

      card.append(legend, profile.wrapper, name.wrapper, role.wrapper, voice.wrapper, tools);
      cards.append(card);
      inputs.push({ id: speaker.id, name: name.input, role: role.input, voice: voice.input });
    });
    help.textContent = `${values.length} of ${MAX_SPEAKERS} speakers. Add, remove, or reorder the cast for the next generation.`;
    addButton.disabled = values.length >= MAX_SPEAKERS;
    addButton.title = addButton.disabled ? `Maximum ${MAX_SPEAKERS} speakers reached.` : '';
    if (focusId) cards.querySelector(`[data-speaker-id="${focusId}"]`)?.focus();
  }

  function move(from, to) {
    capture();
    if (to < 0 || to >= values.length) return;
    const [speaker] = values.splice(from, 1);
    values.splice(to, 0, speaker);
    render(speaker.id);
    announcement.textContent = `${speaker.name} moved to position ${to + 1} of ${values.length}.`;
    onStructureChange();
  }

  async function removeSpeaker(index) {
    capture();
    if (values.length <= MIN_SPEAKERS) return;
    const speaker = values[index];
    const confirmed = await confirmDialog({
      title: 'Remove speaker',
      message: `Remove “${speaker.name}” from the current cast?`,
      confirmLabel: 'Remove speaker',
    });
    if (!confirmed) return;
    const [removed] = values.splice(index, 1);
    selectedProfileIds.delete(removed.id);
    const focusId = values[Math.min(index, values.length - 1)]?.id ?? null;
    render(focusId);
    announcement.textContent = `${removed.name} removed. ${values.length} speakers remain.`;
    onStructureChange();
  }

  addButton.addEventListener('click', () => {
    capture();
    if (values.length >= MAX_SPEAKERS) return;
    const id = `speaker-${nextSpeakerNumber}`;
    nextSpeakerNumber += 1;
    const voice = nextAvailableVoice(getVoiceOptions(), values);
    values.push({ id, name: `Speaker ${values.length + 1}`, role: '', voice });
    render(id);
    announcement.textContent = `Speaker ${values.length} added. ${values.length} speakers total.`;
    onStructureChange();
  });

  function applyToScript() {
    const script = controller.store.get().script;
    if (!script) return;
    const speakers = read();
    const draftById = new Map(speakers.map((speaker) => [speaker.id, speaker]));
    if (script.speakers.length !== speakers.length ||
        script.speakers.some((speaker) => !draftById.has(speaker.id))) {
      notify({
        type: 'error',
        title: 'Speaker cast does not match',
        message: 'Generate again to apply added, removed, or replaced speakers.',
      });
      return;
    }
    try {
      preserveDraftOnNextHydrate = true;
      controller.applyEditedScript({
        ...script,
        speakers: script.speakers.map((speaker) => ({ ...speaker, ...draftById.get(speaker.id) })),
      });
      preserveDraftOnNextHydrate = false;
      notify({ type: 'success', title: 'Script speakers updated', message: 'Names, roles, and voices now apply to every matching turn.' });
    } catch (error) {
      preserveDraftOnNextHydrate = false;
      notify({
        type: 'error',
        title: 'Could not update script speakers',
        message: error instanceof Error ? error.message : 'Unknown error.',
      });
    }
  }

  applyButton.addEventListener('click', applyToScript);
  subscribePodcastTemplates(() => {
    capture();
    render();
  });
  render();

  return {
    element,
    applyButton,
    read,
    clearPreviews,
    refresh() {
      capture();
      render();
    },
    matchesScriptCast(script) {
      const ids = new Set(read().map((speaker) => speaker.id));
      return script.speakers.length === ids.size && script.speakers.every((speaker) => ids.has(speaker.id));
    },
    /** @param {import('./podcast-script.js').PodcastScript} script */
    hydrate(script) {
      if (preserveDraftOnNextHydrate) {
        preserveDraftOnNextHydrate = false;
        return;
      }
      values = script.speakers.map(({ id, name, role, voice }) => ({ id, name, role, voice }));
      selectedProfileIds.clear();
      nextSpeakerNumber = Math.max(
        nextSpeakerNumber,
        ...values.map((speaker) => Number(speaker.id.match(/^speaker-(\d+)$/)?.[1] ?? 0) + 1),
      );
      render();
    },
    /** @param {{id: string, name: string, role: string, voice: string}[]} speakers */
    hydrateDraft(speakers) {
      values = speakers.map((speaker) => ({ ...speaker }));
      selectedProfileIds.clear();
      nextSpeakerNumber = Math.max(
        3,
        ...values.map((speaker) => Number(speaker.id.match(/^speaker-(\d+)$/)?.[1] ?? 0) + 1),
      );
      render();
    },
    resetDraft() {
      values = initialSpeakers();
      selectedProfileIds.clear();
      nextSpeakerNumber = 3;
      render();
    },
  };

  /** Assign distinct defaults only where a speaker has no usable voice selection. */
  function assignAvailableVoices(voiceOptions) {
    const assigned = new Set(
      values
        .map((speaker) => speaker.voice)
        .filter((voice) => voiceOptions.includes(voice)),
    );
    for (const speaker of values) {
      if (voiceOptions.includes(speaker.voice)) continue;
      const voice = voiceOptions.find((option) => !assigned.has(option)) ?? voiceOptions[0] ?? '';
      speaker.voice = voice;
      if (voice) assigned.add(voice);
    }
  }

  function nextAvailableVoice(voiceOptions, speakers) {
    const assigned = new Set(speakers.map((speaker) => speaker.voice));
    return voiceOptions.find((voice) => !assigned.has(voice)) ?? voiceOptions[0] ?? '';
  }
}

function initialSpeakers() {
  return [HOST, EXPERT].map((profile, index) => ({
    id: `speaker-${index + 1}`,
    name: profile.defaultSpeakerName,
    role: profile.role,
    voice: '',
  }));
}

function actionButton(label, ariaLabel, disabled, onClick, extraClass = '') {
  const glyphs = { 'Move up': '↑', 'Move down': '↓', Remove: '×' };
  const button = createToolButton({
    label: ariaLabel,
    glyph: glyphs[label] ?? label.slice(0, 1),
    className: extraClass === 'button-danger' ? 'tool-button-danger' : '',
    onClick,
  });
  button.disabled = disabled;
  return button;
}
