/** Dedicated-page prompt-template editor. */

import { confirmDialog } from '../../components/dialog.js';
import { createLocalNotice } from '../../components/error-message.js';
import { AppError, toAppError } from '../../services/errors.js';
import { loadSettings, saveSettings } from '../../storage/local-settings.js';
import { buildScriptPrompt } from './podcast-script.js';
import {
  DEFAULT_PROMPT_TEMPLATES,
  PROMPT_TEMPLATE_METADATA,
  TEMPLATE_IDS,
  resolvePromptTemplates,
  validatePromptTemplate,
} from './prompt-templates.js';

const TEMPLATE_PAGES = {
  scriptSystem: { tab: 'Script rules', messageType: 'System message' },
  scriptUser: { tab: 'Script brief', messageType: 'User message' },
  repairSystem: { tab: 'Repair rules', messageType: 'System message' },
  repairUser: { tab: 'Repair brief', messageType: 'User message' },
};

/**
 * @param {HTMLElement} body
 * @param {{ onBack: () => void, onChange?: () => void, getPromptPreview?: () => { source: string, prefs: import('./podcast-script.js').PodcastPreferences } }} options
 */
export function renderPromptTemplateSettings(body, options) {
  body.replaceChildren();
  let settings = loadSettings();
  let resolved = resolvePromptTemplates(settings.promptTemplates);
  const drafts = { ...resolved };
  const unlocked = new Set();
  let activeId = 'scriptUser';

  const editor = document.createElement('section');
  editor.className = 'prompt-editor';
  const hero = document.createElement('header');
  hero.className = 'prompt-editor-hero';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'prompt-editor-eyebrow';
  eyebrow.textContent = 'Podcast prompt configuration';
  const title = document.createElement('h3');
  title.textContent = 'Edit one message at a time';
  const lead = document.createElement('p');
  lead.className = 'prompt-editor-lead';
  lead.textContent =
    'Each page maps to one text-generation message. Saved changes stay only in this browser.';
  const heroActions = document.createElement('div');
  heroActions.className = 'prompt-editor-hero-actions';
  const previewToggle = document.createElement('button');
  previewToggle.type = 'button';
  previewToggle.className = 'button button-secondary button-small';
  previewToggle.textContent = 'Preview rendered prompt';
  previewToggle.setAttribute('aria-expanded', 'false');
  previewToggle.setAttribute('aria-controls', 'prompt-preview');
  previewToggle.addEventListener('click', togglePreview);
  heroActions.append(previewToggle);
  hero.append(eyebrow, title, lead, heroActions);

  const tabList = document.createElement('div');
  tabList.className = 'prompt-template-tabs';
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Prompt template pages');
  /** @type {Map<import('./prompt-templates.js').PromptTemplateId, HTMLButtonElement>} */
  const tabs = new Map();
  const panel = document.createElement('div');
  panel.className = 'prompt-template-page';
  panel.id = 'prompt-template-page';
  panel.setAttribute('role', 'tabpanel');
  panel.tabIndex = -1;
  const notice = createLocalNotice();
  const status = document.createElement('p');
  status.className = 'prompt-editor-status';
  status.setAttribute('aria-live', 'polite');
  const preview = document.createElement('section');
  preview.id = 'prompt-preview';
  preview.className = 'prompt-preview';
  preview.hidden = true;
  let previewOpen = false;
  const workspace = document.createElement('div');
  workspace.className = 'prompt-editor-workspace';
  workspace.append(panel, preview);

  for (const id of TEMPLATE_IDS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'prompt-template-tab';
    tab.id = `prompt-template-tab-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.textContent = TEMPLATE_PAGES[id].tab;
    tab.addEventListener('click', () => setActiveTemplate(id));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = TEMPLATE_IDS.indexOf(id);
      const nextIndex =
        event.key === 'Home' ? 0 : event.key === 'End' ? TEMPLATE_IDS.length - 1 :
          (index + (event.key === 'ArrowRight' ? 1 : TEMPLATE_IDS.length - 1)) % TEMPLATE_IDS.length;
      const nextId = TEMPLATE_IDS[nextIndex];
      setActiveTemplate(nextId);
      tabs.get(nextId).focus();
    });
    tabs.set(id, tab);
    tabList.append(tab);
  }

  const footer = document.createElement('div');
  footer.className = 'prompt-editor-footer';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'button button-secondary';
  back.textContent = 'Back to provider settings';
  back.addEventListener('click', () => options.onBack());
  const resetAll = document.createElement('button');
  resetAll.type = 'button';
  resetAll.className = 'button button-ghost';
  resetAll.textContent = 'Restore all defaults';
  resetAll.addEventListener('click', restoreAll);
  footer.append(back, resetAll);

  editor.append(hero, tabList, notice.element, workspace, status, footer);
  body.append(editor);
  renderActiveTemplate();

  /** @param {import('./prompt-templates.js').PromptTemplateId} id */
  function setActiveTemplate(id) {
    activeId = id;
    notice.clear();
    status.textContent = '';
    renderActiveTemplate();
    if (previewOpen) renderPreview();
  }

  function renderActiveTemplate() {
    panel.replaceChildren();
    for (const id of TEMPLATE_IDS) {
      const selected = id === activeId;
      const tab = tabs.get(id);
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', `prompt-template-tab-${activeId}`);

    const metadata = PROMPT_TEMPLATE_METADATA[activeId];
    const pageHeader = document.createElement('header');
    pageHeader.className = 'prompt-template-page-header';
    const type = document.createElement('span');
    type.className = 'prompt-message-type';
    type.textContent = TEMPLATE_PAGES[activeId].messageType;
    const heading = document.createElement('h4');
    heading.textContent = metadata.title;
    const help = document.createElement('p');
    help.className = 'help-text';
    help.textContent = metadata.help;
    pageHeader.append(type, heading, help);

    const placeholderBox = document.createElement('aside');
    placeholderBox.className = 'prompt-placeholder-box';
    const placeholderTitle = document.createElement('strong');
    placeholderTitle.textContent = 'Required placeholders';
    const placeholderText = document.createElement('p');
    placeholderText.className = 'help-text';
    placeholderText.textContent = metadata.requiredPlaceholders.length
      ? metadata.requiredPlaceholders.map((value) => `{{${value}}}`).join('  ')
      : 'None for this message.';
    placeholderBox.append(placeholderTitle, placeholderText);

    const label = document.createElement('label');
    const textareaId = `prompt-template-${activeId}`;
    label.htmlFor = textareaId;
    label.className = 'visually-hidden';
    label.textContent = metadata.title;
    const textarea = document.createElement('textarea');
    textarea.id = textareaId;
    textarea.className = 'prompt-template-input';
    textarea.value = drafts[activeId];
    textarea.readOnly = !unlocked.has(activeId);
    textarea.rows = 16;
    textarea.spellcheck = false;
    textarea.addEventListener('input', () => {
      drafts[activeId] = textarea.value;
      status.textContent = 'Unsaved changes.';
      if (previewOpen) renderPreview();
    });

    const actions = document.createElement('div');
    actions.className = 'prompt-template-page-actions';
    if (!unlocked.has(activeId)) {
      const unlock = document.createElement('button');
      unlock.type = 'button';
      unlock.className = 'button button-secondary';
      unlock.textContent = 'Unlock editing';
      unlock.addEventListener('click', () => {
        unlocked.add(activeId);
        renderActiveTemplate();
        panel.querySelector('textarea')?.focus();
      });
      actions.append(unlock);
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'button button-ghost';
    reset.textContent = 'Restore this default';
    reset.addEventListener('click', restoreActive);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'button button-primary';
    save.textContent = 'Save this template';
    save.addEventListener('click', saveActive);
    actions.append(reset, save);
    panel.append(pageHeader, placeholderBox, label, textarea, actions);
  }

  async function saveActive() {
    notice.clear();
    const template = drafts[activeId];
    const result = validatePromptTemplate(activeId, template);
    if (!result.valid) {
      notice.showError(new AppError({
        kind: 'validation',
        message: `${PROMPT_TEMPLATE_METADATA[activeId].title}: ${result.errors.join(' ')}`,
        retryable: false,
        status: undefined,
      }));
      panel.querySelector('textarea')?.focus();
      return;
    }
    if (template === resolved[activeId]) {
      status.textContent = 'No changes to save.';
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Save prompt template',
      message: 'Changed instructions can produce invalid or less reliable scripts. Save this browser-local change?',
      confirmLabel: 'Save template',
    });
    if (!confirmed) return;
    settings = loadSettings();
    if (template === DEFAULT_PROMPT_TEMPLATES[activeId]) delete settings.promptTemplates[activeId];
    else settings.promptTemplates = { ...settings.promptTemplates, [activeId]: template };
    try {
      saveSettings(settings);
      resolved = resolvePromptTemplates(settings.promptTemplates);
      drafts[activeId] = resolved[activeId];
      options.onChange?.();
      status.textContent = 'Template saved.';
      notice.show({ type: 'success', title: 'Template saved', message: 'Generation now uses this browser-local template.' });
      renderActiveTemplate();
    } catch (err) {
      notice.showError(toAppError(err));
    }
  }

  function togglePreview() {
    previewOpen = !previewOpen;
    preview.hidden = !previewOpen;
    panel.hidden = previewOpen;
    tabList.hidden = previewOpen;
    workspace.classList.toggle('is-preview-only', previewOpen);
    previewToggle.textContent = previewOpen ? 'Edit templates' : 'Preview rendered prompt';
    previewToggle.setAttribute('aria-expanded', String(previewOpen));
    if (previewOpen) renderPreview();
  }

  function renderPreview() {
    preview.replaceChildren();
    const previewContext = options.getPromptPreview?.();
    const header = document.createElement('header');
    header.className = 'prompt-preview-header';
    const title = document.createElement('h4');
    title.textContent = 'Rendered generation request';
    const help = document.createElement('p');
    help.className = 'help-text';
    help.textContent = 'Current Podcast inputs and unsaved template edits.';
    const actions = document.createElement('div');
    actions.className = 'prompt-preview-actions';
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'button button-ghost button-small';
    refresh.textContent = 'Refresh inputs';
    refresh.addEventListener('click', renderPreview);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'button button-secondary button-small';
    edit.textContent = 'Edit templates';
    edit.addEventListener('click', togglePreview);
    actions.append(refresh, edit);
    header.append(title, help, actions);
    preview.append(header);
    if (!previewContext) {
      const message = document.createElement('p');
      message.className = 'help-text';
      message.textContent = 'Open Settings from podcast workflow to preview current source and podcast selections.';
      preview.append(message);
      return;
    }
    const messages = buildScriptPrompt(previewContext.source, previewContext.prefs, drafts);
    for (const message of messages) {
      const card = document.createElement('section');
      card.className = 'prompt-preview-message';
      const label = document.createElement('h5');
      label.textContent = message.role === 'system' ? 'System message' : 'User message';
      const content = document.createElement('pre');
      content.textContent = message.content;
      card.append(label, content);
      preview.append(card);
    }
  }

  async function restoreActive() {
    const confirmed = await confirmDialog({
      title: 'Restore default template',
      message: `Restore bundled default for “${PROMPT_TEMPLATE_METADATA[activeId].title}”?`,
      confirmLabel: 'Restore default',
    });
    if (!confirmed) return;
    settings = loadSettings();
    delete settings.promptTemplates[activeId];
    try {
      saveSettings(settings);
      resolved = resolvePromptTemplates(settings.promptTemplates);
      drafts[activeId] = resolved[activeId];
      unlocked.delete(activeId);
      options.onChange?.();
      status.textContent = 'Bundled default restored.';
      notice.show({ type: 'success', title: 'Template restored', message: 'Bundled default is active.' });
      renderActiveTemplate();
    } catch (err) {
      notice.showError(toAppError(err));
    }
  }

  async function restoreAll() {
    const confirmed = await confirmDialog({
      title: 'Restore all prompt templates',
      message: 'Remove every browser-local prompt template and restore bundled defaults?',
      confirmLabel: 'Restore all defaults',
    });
    if (!confirmed) return;
    settings = loadSettings();
    settings.promptTemplates = {};
    try {
      saveSettings(settings);
      resolved = resolvePromptTemplates(settings.promptTemplates);
      for (const id of TEMPLATE_IDS) drafts[id] = resolved[id];
      unlocked.clear();
      options.onChange?.();
      status.textContent = 'All bundled defaults restored.';
      notice.show({ type: 'success', title: 'Templates restored', message: 'All prompt templates use bundled defaults.' });
      renderActiveTemplate();
    } catch (err) {
      notice.showError(toAppError(err));
    }
  }
}
