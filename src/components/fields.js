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
 * Card heading. Workflow position is shown by the podcast stepper, so cards
 * use one concise title rather than repeating it in a kicker.
 * @param {string} title
 * @param {'h1'|'h2'|'h3'} [level]
 * @returns {DocumentFragment}
 */
export function cardHeader(title, level = 'h2') {
  const fragment = document.createDocumentFragment();
  const titleEl = document.createElement(level);
  titleEl.className = 'card-title';
  titleEl.textContent = title;
  fragment.append(titleEl);
  return fragment;
}

/**
 * @param {Object} args
 * @param {string} args.label
 * @param {string} [args.value]
 * @param {boolean} [args.required]
 * @param {string} [args.help]
 * @param {string} [args.placeholder]
 * @param {string} [args.autocomplete]
 * @param {string} [args.inputmode]
 */
export function textField({ label, value = '', required, help, placeholder, autocomplete, inputmode }) {
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
  if (autocomplete) input.autocomplete = autocomplete;
  if (inputmode) input.inputMode = inputmode;
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
 * Native select field. The options can be refreshed without replacing the
 * control, preserving the current value when it remains available.
 * @param {Object} args
 * @param {string} args.label
 * @param {string[]} args.options
 * @param {string} [args.value]
 * @param {string} [args.help]
 */
export function selectField({ label, options, value, help }) {
  const id = nextId();
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.setAttribute('for', id);
  labelEl.textContent = label;
  const input = document.createElement('select');
  function replaceOptions(nextOptions) {
    const currentValue = input.value;
    input.replaceChildren();
    for (const option of nextOptions) {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      input.append(opt);
    }
    if (nextOptions.includes(currentValue)) input.value = currentValue;
  }
  replaceOptions(options);
  wrapper.append(labelEl, input);
  input.id = id;
  if (value) input.value = value;
  if (help) wrapper.append(helpText(help, input));
  return {
    wrapper,
    input,
    /** Replace options while preserving the selected value when possible. */
    setOptions(nextOptions) {
      replaceOptions(nextOptions);
    },
  };
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
