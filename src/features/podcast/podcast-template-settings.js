/** Settings pages for reusable Podcast Episode directions, Formats, speaker profiles, and prompts. */

import { confirmDialog } from '../../components/dialog.js';
import { createLocalNotice } from '../../components/error-message.js';
import { createToolButton } from '../../components/tool-button.js';
import { textAreaField, textField } from '../../components/fields.js';
import { toAppError } from '../../services/errors.js';
import {
  addFormatTemplate,
  addEpisodeDirectionTemplate,
  addSpeakerProfile,
  deleteFormatTemplate,
  deleteEpisodeDirectionTemplate,
  deleteSpeakerProfile,
  listFormatTemplates,
  listEpisodeDirectionTemplates,
  listSpeakerProfiles,
  restoreFormatStarters,
  restoreEpisodeDirectionStarters,
  restoreSpeakerProfileStarters,
  updateFormatTemplate,
  updateEpisodeDirectionTemplate,
  updateSpeakerProfile,
} from './podcast-template-store.js';
import { renderPromptTemplateSettings } from './prompt-template-form.js';

/**
 * @param {HTMLElement} body
 * @param {{ onChange?: () => void, getPromptPreview?: () => { source: string, prefs: import('./podcast-script.js').PodcastPreferences, plan?: import('../../domain/episode-plan-schema.js').EpisodePlan | null } }} options
 */
export function renderPodcastTemplateSettings(body, options = {}) {
  body.replaceChildren();
  const navigation = document.createElement('nav');
  navigation.className = 'podcast-settings-navigation';
  navigation.setAttribute('aria-label', 'Podcast settings pages');
  const content = document.createElement('div');
  content.className = 'podcast-settings-content';
  body.append(navigation, content);

  const pages = [
    ['directions', 'Episode directions'],
    ['formats', 'Formats'],
    ['profiles', 'Speaker profiles'],
    ['prompts', 'Advanced prompts'],
  ];
  const buttons = new Map();
  for (const [id, label] of pages) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-nav-button';
    button.textContent = label;
    button.addEventListener('click', () => showPage(id));
    navigation.append(button);
    buttons.set(id, button);
  }

  function showPage(id) {
    for (const [pageId, button] of buttons) {
      const selected = pageId === id;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    }
    if (id === 'directions') renderDirectionList(content, options);
    else if (id === 'formats') renderFormatList(content, options);
    else if (id === 'profiles') renderProfileList(content, options);
    else renderPromptTemplateSettings(content, {
      onBack: () => showPage('directions'),
      backLabel: 'Back to Episode directions',
      onChange: options.onChange,
      getPromptPreview: options.getPromptPreview,
    });
  }

  showPage('directions');
}

function renderDirectionList(body, options, noticeMessage) {
  body.replaceChildren();
  const notice = createLocalNotice();
  const heading = pageHeader(
    'Episode direction templates',
    'Reusable editorial purpose, angle, priority, depth, and omission instructions.',
    'Add direction',
    () => renderDirectionForm(body, options, null),
  );
  const list = document.createElement('ul');
  list.className = 'provider-list';
  const records = listEpisodeDirectionTemplates();
  if (!records.length) list.append(emptyRow('No Episode direction templates saved.'));
  for (const record of records) {
    list.append(templateRow(
      record.name,
      record.instructions,
      () => renderDirectionForm(body, options, record),
      async () => {
        const confirmed = await confirmDialog({
          title: 'Delete Episode direction',
          message: `Delete “${record.name}”? Active generation drafts keep their copied instructions.`,
          confirmLabel: 'Delete direction',
        });
        if (!confirmed) return;
        try {
          deleteEpisodeDirectionTemplate(record.id);
          options.onChange?.();
          renderDirectionList(body, options, { type: 'success', title: 'Episode direction deleted', message: 'Saved template removed.' });
        } catch (error) {
          notice.showError(toAppError(error));
        }
      },
    ));
  }
  const restore = document.createElement('button');
  restore.type = 'button';
  restore.className = 'button button-ghost';
  restore.textContent = 'Restore direction starters';
  restore.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Restore Episode direction starters',
      message: 'Reset bundled Episode directions and restore missing starters? Custom directions remain saved.',
      confirmLabel: 'Restore starters',
    });
    if (!confirmed) return;
    try {
      const skipped = restoreEpisodeDirectionStarters();
      options.onChange?.();
      renderDirectionList(body, options, restoreNotice('Episode direction starters restored', skipped));
    } catch (error) {
      notice.showError(toAppError(error));
    }
  });
  body.append(heading, notice.element, list, restore);
  if (noticeMessage) notice.show(noticeMessage);
}

function renderDirectionForm(body, options, existing) {
  body.replaceChildren();
  const notice = createLocalNotice();
  const heading = pageHeader(
    existing ? 'Edit Episode direction' : 'Add Episode direction',
    'Saved instructions become an editable starting point for one episode.',
  );
  const form = document.createElement('form');
  form.className = 'settings-form';
  form.noValidate = true;
  const name = textField({ label: 'Episode direction name', value: existing?.name ?? '', required: true });
  name.input.maxLength = 100;
  const instructions = textAreaField({
    label: 'Episode direction instructions',
    value: existing?.instructions ?? '',
    required: true,
    rows: 8,
    help: 'Describe the episode purpose, angle, priorities, depth, or intentional omissions. Maximum 4,000 characters.',
  });
  instructions.input.maxLength = 4000;
  const actions = formActions(() => renderDirectionList(body, options), existing ? 'Save changes' : 'Save direction');
  form.append(name.wrapper, instructions.wrapper, notice.element, actions.element);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    notice.clear();
    try {
      const input = { name: name.input.value, instructions: instructions.input.value };
      if (existing) updateEpisodeDirectionTemplate(existing.id, input);
      else addEpisodeDirectionTemplate(input);
      options.onChange?.();
      renderDirectionList(body, options, { type: 'success', title: 'Episode direction saved', message: 'Template is available on Podcast generation.' });
    } catch (error) {
      notice.showError(toAppError(error));
    }
  });
  body.append(heading, form);
  name.input.focus();
}

function renderFormatList(body, options, noticeMessage) {
  body.replaceChildren();
  const notice = createLocalNotice();
  const heading = pageHeader(
    'Format templates',
    'Reusable discourse structure, linguistic behavior, interaction, and show-level delivery instructions. Bundled variants define editable terminology.',
    'Add format',
    () => renderFormatForm(body, options, null),
  );
  const list = document.createElement('ul');
  list.className = 'provider-list';
  const records = listFormatTemplates();
  if (!records.length) list.append(emptyRow('No format templates saved.'));
  for (const record of records) {
    list.append(templateRow(
      record.name,
      record.instructions,
      () => renderFormatForm(body, options, record),
      async () => {
        const confirmed = await confirmDialog({
          title: 'Delete format template',
          message: `Delete “${record.name}”? Active generation drafts keep their copied instructions.`,
          confirmLabel: 'Delete format',
        });
        if (!confirmed) return;
        try {
          deleteFormatTemplate(record.id);
          options.onChange?.();
          renderFormatList(body, options, { type: 'success', title: 'Format deleted', message: 'Saved template removed.' });
        } catch (error) {
          notice.showError(toAppError(error));
        }
      },
    ));
  }
  const restore = document.createElement('button');
  restore.type = 'button';
  restore.className = 'button button-ghost';
  restore.textContent = 'Restore format starters';
  restore.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Restore format starters',
      message: 'Reset bundled formats and restore missing starters? Custom formats remain saved.',
      confirmLabel: 'Restore starters',
    });
    if (!confirmed) return;
    try {
      const skipped = restoreFormatStarters();
      options.onChange?.();
      renderFormatList(body, options, restoreNotice('Format starters restored', skipped));
    } catch (error) {
      notice.showError(toAppError(error));
    }
  });
  body.append(heading, notice.element, list, restore);
  if (noticeMessage) notice.show(noticeMessage);
}

function renderFormatForm(body, options, existing) {
  body.replaceChildren();
  const notice = createLocalNotice();
  const heading = pageHeader(
    existing ? 'Edit format template' : 'Add format template',
    'Saved instructions become a starting point and never update generation drafts automatically.',
  );
  const form = document.createElement('form');
  form.className = 'settings-form';
  form.noValidate = true;
  const name = textField({ label: 'Format name', value: existing?.name ?? '', required: true });
  name.input.maxLength = 100;
  const instructions = textAreaField({
    label: 'Format instructions',
    value: existing?.instructions ?? '',
    required: true,
    rows: 8,
    help: 'Describe discourse structure, linguistic behavior, interaction, pacing, or show-level delivery. Maximum 4,000 characters.',
  });
  instructions.input.maxLength = 4000;
  const actions = formActions(() => renderFormatList(body, options), existing ? 'Save changes' : 'Save format');
  form.append(name.wrapper, instructions.wrapper, notice.element, actions.element);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    notice.clear();
    try {
      if (existing) updateFormatTemplate(existing.id, { name: name.input.value, instructions: instructions.input.value });
      else addFormatTemplate({ name: name.input.value, instructions: instructions.input.value });
      options.onChange?.();
      renderFormatList(body, options, { type: 'success', title: 'Format saved', message: 'Template is available on Podcast generation.' });
    } catch (error) {
      notice.showError(toAppError(error));
    }
  });
  body.append(heading, form);
  name.input.focus();
}

function renderProfileList(body, options, noticeMessage) {
  body.replaceChildren();
  const notice = createLocalNotice();
  const heading = pageHeader(
    'Speaker profiles',
    'Reusable names and format-adaptive discourse roles. Voice remains specific to each generation.',
    'Add profile',
    () => renderProfileForm(body, options, null),
  );
  const list = document.createElement('ul');
  list.className = 'provider-list';
  const records = listSpeakerProfiles();
  if (!records.length) list.append(emptyRow('No speaker profiles saved.'));
  for (const record of records) {
    const summary = `${record.defaultSpeakerName || 'No default name'} · ${record.role}`;
    list.append(templateRow(
      record.label,
      summary,
      () => renderProfileForm(body, options, record),
      async () => {
        const confirmed = await confirmDialog({
          title: 'Delete speaker profile',
          message: `Delete “${record.label}”? Existing speaker cards keep their copied values.`,
          confirmLabel: 'Delete profile',
        });
        if (!confirmed) return;
        try {
          deleteSpeakerProfile(record.id);
          options.onChange?.();
          renderProfileList(body, options, { type: 'success', title: 'Profile deleted', message: 'Saved profile removed.' });
        } catch (error) {
          notice.showError(toAppError(error));
        }
      },
    ));
  }
  const restore = document.createElement('button');
  restore.type = 'button';
  restore.className = 'button button-ghost';
  restore.textContent = 'Restore profile starters';
  restore.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Restore speaker profile starters',
      message: 'Reset bundled profiles and restore missing starters? Custom profiles remain saved.',
      confirmLabel: 'Restore starters',
    });
    if (!confirmed) return;
    try {
      const skipped = restoreSpeakerProfileStarters();
      options.onChange?.();
      renderProfileList(body, options, restoreNotice('Speaker profile starters restored', skipped));
    } catch (error) {
      notice.showError(toAppError(error));
    }
  });
  body.append(heading, notice.element, list, restore);
  if (noticeMessage) notice.show(noticeMessage);
}

function renderProfileForm(body, options, existing) {
  body.replaceChildren();
  const notice = createLocalNotice();
  const heading = pageHeader(
    existing ? 'Edit speaker profile' : 'Add speaker profile',
    'Profile values are copied into generation speaker cards and remain independently editable.',
  );
  const form = document.createElement('form');
  form.className = 'settings-form';
  form.noValidate = true;
  const label = textField({ label: 'Profile label', value: existing?.label ?? '', required: true });
  label.input.maxLength = 100;
  const speakerName = textField({
    label: 'Default speaker name',
    value: existing?.defaultSpeakerName ?? '',
    help: 'Optional on-air name copied into a speaker card.',
  });
  speakerName.input.maxLength = 100;
  const role = textAreaField({
    label: 'Role',
    value: existing?.role ?? '',
    required: true,
    rows: 6,
    help: 'Describe contribution, discourse behavior, epistemic stance, and individual delivery within the selected format.',
  });
  role.input.maxLength = 4000;
  const actions = formActions(() => renderProfileList(body, options), existing ? 'Save changes' : 'Save profile');
  form.append(label.wrapper, speakerName.wrapper, role.wrapper, notice.element, actions.element);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    notice.clear();
    try {
      const input = {
        label: label.input.value,
        defaultSpeakerName: speakerName.input.value,
        role: role.input.value,
      };
      if (existing) updateSpeakerProfile(existing.id, input);
      else addSpeakerProfile(input);
      options.onChange?.();
      renderProfileList(body, options, { type: 'success', title: 'Profile saved', message: 'Profile is available on Podcast generation.' });
    } catch (error) {
      notice.showError(toAppError(error));
    }
  });
  body.append(heading, form);
  label.input.focus();
}

function pageHeader(titleText, helpText, actionLabel, onAction) {
  const header = document.createElement('header');
  header.className = 'settings-page-header';
  const copy = document.createElement('div');
  copy.className = 'settings-page-copy';
  const title = document.createElement('h3');
  title.textContent = titleText;
  const help = document.createElement('p');
  help.className = 'help-text';
  help.textContent = helpText;
  copy.append(title, help);
  header.append(copy);
  if (actionLabel) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'button button-primary';
    action.textContent = actionLabel;
    action.addEventListener('click', onAction);
    header.append(action);
  }
  return header;
}

function templateRow(nameText, summaryText, onEdit, onDelete) {
  const item = document.createElement('li');
  item.className = 'provider-row';
  const info = document.createElement('div');
  info.className = 'provider-info';
  const name = document.createElement('span');
  name.className = 'provider-name';
  name.textContent = nameText;
  const summary = document.createElement('span');
  summary.className = 'provider-url template-summary';
  summary.textContent = summaryText;
  info.append(name, summary);
  const actions = document.createElement('div');
  actions.className = 'provider-actions';
  const edit = createToolButton({ label: `Edit ${nameText}`, glyph: '✎', onClick: onEdit });
  const remove = createToolButton({ label: `Delete ${nameText}`, glyph: '×', className: 'tool-button-danger', onClick: onDelete });
  actions.append(edit, remove);
  item.append(info, actions);
  return item;
}

function emptyRow(message) {
  const item = document.createElement('li');
  item.className = 'provider-empty';
  item.textContent = message;
  return item;
}

function formActions(onBack, saveLabel) {
  const element = document.createElement('div');
  element.className = 'dialog-actions';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'button button-secondary';
  back.textContent = 'Back';
  back.addEventListener('click', onBack);
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'button button-primary';
  save.textContent = saveLabel;
  element.append(back, save);
  return { element };
}

function restoreNotice(title, skipped) {
  return skipped.length
    ? { type: 'warning', title, message: `Skipped names already used by custom records: ${skipped.join(', ')}.` }
    : { type: 'success', title, message: 'Bundled records are restored; custom records remain saved.' };
}
