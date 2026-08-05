/**
 * Small labeled form-field builders. Every control gets a persistent label;
 * help/error text renders below the control and is programmatically
 * associated via aria-describedby.
 */

let fieldCounter = 0;

function nextId() {
  fieldCounter += 1;
  return `field-${fieldCounter}`;
}

/**
 * Card heading in the Vionix section-title language: small uppercase kicker
 * pill above a Montserrat title.
 * @param {string} kicker e.g. 'Step 1'
 * @param {string} title
 * @param {'h1'|'h2'|'h3'} [level]
 * @returns {DocumentFragment}
 */
export function cardHeader(kicker, title, level = 'h2') {
  const fragment = document.createDocumentFragment();
  const kickerEl = document.createElement('span');
  kickerEl.className = 'card-kicker';
  kickerEl.textContent = kicker;
  const titleEl = document.createElement(level);
  titleEl.className = 'card-title';
  titleEl.textContent = title;
  fragment.append(kickerEl, titleEl);
  return fragment;
}

/**
 * @param {Object} args
 * @param {string} args.label
 * @param {string} [args.value]
 * @param {boolean} [args.required]
 * @param {string} [args.help]
 * @param {string} [args.placeholder]
 */
export function textField({ label, value = '', required, help, placeholder }) {
  const id = nextId();
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.setAttribute('for', id);
  labelEl.textContent = required ? `${label} (required)` : label;
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.value = value;
  if (required) input.required = true;
  if (placeholder) input.placeholder = placeholder;
  wrapper.append(labelEl, input);
  if (help) wrapper.append(helpText(help, input));
  return { wrapper, input };
}

/**
 * @param {Object} args
 * @param {string} args.label
 * @param {string} [args.value]
 * @param {boolean} [args.required]
 * @param {string} [args.help]
 * @param {number} [args.rows]
 */
export function textAreaField({ label, value = '', required, help, rows = 8 }) {
  const id = nextId();
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.setAttribute('for', id);
  labelEl.textContent = required ? `${label} (required)` : label;
  const input = document.createElement('textarea');
  input.id = id;
  input.rows = rows;
  input.value = value;
  if (required) input.required = true;
  wrapper.append(labelEl, input);
  if (help) wrapper.append(helpText(help, input));
  return { wrapper, input };
}

/**
 * Select with optional free-text entry via paired datalist.
 * @param {Object} args
 * @param {string} args.label
 * @param {string[]} args.options
 * @param {string} [args.value]
 * @param {boolean} [args.allowCustom] render text input + datalist instead
 * @param {string} [args.help]
 */
export function selectField({ label, options, value, allowCustom, help }) {
  const id = nextId();
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.setAttribute('for', id);
  labelEl.textContent = label;
  /** @type {HTMLSelectElement | HTMLInputElement} */
  let input;
  if (allowCustom) {
    input = document.createElement('input');
    input.type = 'text';
    const listId = `${id}-list`;
    input.setAttribute('list', listId);
    const datalist = document.createElement('datalist');
    datalist.id = listId;
    for (const option of options) {
      const opt = document.createElement('option');
      opt.value = option;
      datalist.append(opt);
    }
    wrapper.append(labelEl, input, datalist);
  } else {
    input = document.createElement('select');
    for (const option of options) {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      input.append(opt);
    }
    wrapper.append(labelEl, input);
  }
  input.id = id;
  if (value) input.value = value;
  if (help) wrapper.append(helpText(help, input));
  return { wrapper, input };
}

/**
 * @param {string} text
 * @param {HTMLElement} described control receiving aria-describedby
 */
function helpText(text, described) {
  const el = document.createElement('p');
  el.className = 'help-text';
  el.id = nextId();
  el.textContent = text;
  described.setAttribute('aria-describedby', el.id);
  return el;
}
