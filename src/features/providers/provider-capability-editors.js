/** Mutable provider model/voice editors used by settings form. */

import { confirmDialog } from '../../components/dialog.js';
import { textField } from '../../components/fields.js';
import { createToolButton } from '../../components/tool-button.js';
import {
  defaultTtsModel,
  normalizeSuggestions,
  normalizeTtsModels,
} from '../../domain/provider-config.js';

export function createIdentifierListEditor({ title, description, itemLabel, addLabel, values }) {
  const element = document.createElement('section');
  element.className = 'identifier-list-editor';
  const heading = document.createElement('h4');
  heading.textContent = title;
  const help = document.createElement('p');
  help.className = 'help-text';
  help.textContent = description;
  const chips = document.createElement('div');
  chips.className = 'model-chip-list';
  chips.setAttribute('role', 'list');
  const detail = document.createElement('div');
  detail.className = 'identifier-detail';
  const entries = values.map((value) => ({ value }));
  let selectedIndex = 0;

  function render() {
    chips.replaceChildren();
    detail.replaceChildren();
    entries.forEach((entry, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `model-chip${index === selectedIndex ? ' is-selected' : ''}`;
      chip.textContent = entry.value || `New ${itemLabel.toLowerCase()}`;
      chip.setAttribute('aria-pressed', String(index === selectedIndex));
      chip.addEventListener('click', () => {
        selectedIndex = index;
        render();
      });
      chips.append(chip);
    });
    const entry = entries[selectedIndex];
    if (!entry) return;
    const field = textField({ label: `${itemLabel} identifier`, value: entry.value });
    field.input.addEventListener('input', () => {
      entry.value = field.input.value;
      chips.children[selectedIndex].textContent = entry.value || `New ${itemLabel.toLowerCase()}`;
    });
    const remove = createToolButton({
      label: `Remove ${itemLabel.toLowerCase()}`,
      glyph: '×',
      className: 'tool-button-danger',
      onClick: async () => {
        const confirmed = await confirmDialog({
          title: `Remove ${itemLabel.toLowerCase()}`,
          message: `Remove “${entry.value || `this ${itemLabel.toLowerCase()}`}” from this provider configuration?`,
          confirmLabel: `Remove ${itemLabel.toLowerCase()}`,
        });
        if (!confirmed) return;
        entries.splice(selectedIndex, 1);
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
      },
    });
    detail.append(field.wrapper, remove);
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'button button-secondary button-small';
  addButton.textContent = addLabel;
  addButton.addEventListener('click', () => {
    entries.push({ value: '' });
    selectedIndex = entries.length - 1;
    render();
  });
  render();
  element.append(heading, help, chips, detail, addButton);
  return {
    element,
    values: () => normalizeSuggestions(entries.map((entry) => entry.value)),
    reset(nextValues) {
      entries.splice(0, entries.length, ...nextValues.map((value) => ({ value })));
      selectedIndex = 0;
      render();
    },
  };
}

/** @param {{ models: import('../../domain/provider-config.js').TtsModelConfig[] }} args */
export function createTtsModelEditor({ models }) {
  const element = document.createElement('section');
  element.className = 'tts-model-editor';
  const heading = document.createElement('h4');
  heading.textContent = 'TTS models and voices';
  const help = document.createElement('p');
  help.className = 'help-text';
  help.textContent = 'Each model has its own voice menu in the TTS and Podcast workflows.';
  const chips = document.createElement('div');
  chips.className = 'model-chip-list';
  chips.setAttribute('role', 'list');
  const detail = document.createElement('section');
  detail.className = 'tts-model-detail';
  const entries = normalizeTtsModels(models).map((entry) => structuredClone(entry));
  let selectedIndex = 0;

  function render() {
    chips.replaceChildren();
    detail.replaceChildren();
    entries.forEach((entry, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `model-chip${index === selectedIndex ? ' is-selected' : ''}`;
      chip.textContent = entry.model || 'New TTS model';
      chip.setAttribute('aria-pressed', String(index === selectedIndex));
      chip.addEventListener('click', () => {
        selectedIndex = index;
        render();
      });
      chips.append(chip);
    });
    const entry = entries[selectedIndex];
    if (!entry) return;
    renderModelDetail(entry);
  }

  function renderModelDetail(entry) {
    const modelField = textField({ label: 'TTS model identifier', value: entry.model });
    modelField.input.addEventListener('input', () => {
      entry.model = modelField.input.value;
      chips.children[selectedIndex].textContent = entry.model || 'New TTS model';
    });

    const formatField = document.createElement('div');
    formatField.className = 'field';
    const formatLabel = document.createElement('label');
    const formatId = `tts-format-${Math.random().toString(36).slice(2, 8)}`;
    formatLabel.htmlFor = formatId;
    formatLabel.textContent = 'Response format';
    const formatSelect = document.createElement('select');
    formatSelect.id = formatId;
    for (const [value, label] of [['mp3', 'MP3'], ['pcm', 'Raw PCM']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      formatSelect.append(option);
    }
    formatSelect.value = entry.responseFormat;
    formatField.append(formatLabel, formatSelect);

    const pcmFields = document.createElement('div');
    pcmFields.className = 'pcm-format-fields';
    const sampleRate = textField({ label: 'PCM sample rate (Hz)', value: String(entry.pcm?.sampleRate ?? 24000), inputmode: 'numeric' });
    const channels = textField({ label: 'PCM channels', value: String(entry.pcm?.channels ?? 1), inputmode: 'numeric' });
    const encoding = document.createElement('p');
    encoding.className = 'help-text';
    encoding.textContent = 'Encoding: signed 16-bit little-endian (s16le).';
    pcmFields.append(sampleRate.wrapper, channels.wrapper, encoding);
    const syncFormat = () => {
      entry.responseFormat = formatSelect.value;
      pcmFields.hidden = entry.responseFormat !== 'pcm';
      if (entry.responseFormat === 'pcm') {
        entry.pcm = { sampleRate: Number(sampleRate.input.value), channels: Number(channels.input.value), encoding: 's16le' };
      } else {
        delete entry.pcm;
      }
    };
    formatSelect.addEventListener('change', syncFormat);
    sampleRate.input.addEventListener('input', syncFormat);
    channels.input.addEventListener('input', syncFormat);
    syncFormat();

    const voicesHeading = document.createElement('h5');
    voicesHeading.textContent = 'Available voices';
    const voiceChips = document.createElement('div');
    voiceChips.className = 'voice-chip-list';
    const renderVoices = () => {
      voiceChips.replaceChildren();
      entry.voices.forEach((voice, index) => {
        const chip = document.createElement('span');
        chip.className = 'voice-chip';
        const text = document.createElement('span');
        text.textContent = voice;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'voice-chip-remove';
        remove.title = `Remove voice ${voice}`;
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove voice ${voice}`);
        remove.addEventListener('click', async () => {
          const confirmed = await confirmDialog({
            title: 'Remove voice',
            message: `Remove “${voice}” from ${entry.model || 'this TTS model'}?`,
            confirmLabel: 'Remove voice',
          });
          if (!confirmed) return;
          entry.voices.splice(index, 1);
          renderVoices();
        });
        chip.append(text, remove);
        voiceChips.append(chip);
      });
    };

    const addVoice = textField({ label: 'Add voice', value: '' });
    const addVoiceButton = document.createElement('button');
    addVoiceButton.type = 'button';
    addVoiceButton.className = 'button button-secondary button-small';
    addVoiceButton.textContent = 'Add voice';
    const commitVoice = () => {
      const voice = addVoice.input.value.trim();
      if (!voice || entry.voices.includes(voice)) return;
      entry.voices.push(voice);
      addVoice.input.value = '';
      renderVoices();
    };
    addVoiceButton.addEventListener('click', commitVoice);
    addVoice.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitVoice();
      }
    });

    const removeModel = createToolButton({
      label: 'Remove model',
      glyph: '×',
      className: 'tool-button-danger',
      onClick: async () => {
        const confirmed = await confirmDialog({
          title: 'Remove TTS model',
          message: `Remove “${entry.model || 'this TTS model'}” and its configured voices?`,
          confirmLabel: 'Remove model',
        });
        if (!confirmed) return;
        entries.splice(selectedIndex, 1);
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
      },
    });

    const restoreVoices = createToolButton({
      label: 'Restore known voices',
      glyph: '↻',
      onClick: async () => {
        const confirmed = await confirmDialog({
          title: 'Restore known model voices',
          message: `Replace configured voices for ${entry.model || 'this TTS model'} with its known voice list? Unknown models have no known voices.`,
          confirmLabel: 'Restore voices',
        });
        if (!confirmed) return;
        entry.voices = defaultTtsModel(entry.model.trim()).voices;
        renderVoices();
      },
    });

    const addVoiceRow = document.createElement('div');
    addVoiceRow.className = 'add-voice-row';
    addVoiceRow.append(addVoice.wrapper, addVoiceButton);
    renderVoices();
    detail.append(modelField.wrapper, formatField, pcmFields, voicesHeading, voiceChips, addVoiceRow, restoreVoices, removeModel);
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'button button-secondary button-small';
  addButton.textContent = 'Add TTS model';
  addButton.addEventListener('click', () => {
    entries.push(defaultTtsModel());
    selectedIndex = entries.length - 1;
    render();
  });
  render();
  element.append(heading, help, chips, detail, addButton);
  return {
    element,
    reset(nextModels) {
      entries.splice(0, entries.length, ...normalizeTtsModels(nextModels).map((entry) => structuredClone(entry)));
      selectedIndex = 0;
      render();
    },
    values: () => entries.map((entry) => ({
      ...entry,
      model: entry.model.trim(),
      voices: normalizeSuggestions(entry.voices),
      ...(entry.pcm ? { pcm: { ...entry.pcm } } : {}),
    })),
  };
}
