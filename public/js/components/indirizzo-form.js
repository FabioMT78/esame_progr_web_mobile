const commonFields = [
  { name: 'indirizzo', label: 'Indirizzo', type: 'text', maxLength: 150, autocomplete: 'street-address' },
  { name: 'civico', label: 'Civico', type: 'text', maxLength: 20 },
  { name: 'comune', label: 'Comune', type: 'text', maxLength: 100, autocomplete: 'address-level2' },  
  {
    name: 'provincia', label: 'Prov.', type: 'text', minLength: 2, maxLength: 2,
    autocapitalize: 'characters', spellcheck: false, autocomplete: 'address-level1',
    hint: ''
  },
  {
    name: 'cap', label: 'CAP', type: 'text', minLength: 5, maxLength: 10,
    inputMode: 'numeric', autocomplete: 'postal-code', hint: ''
  }
];

const titleField = {
  name: 'titolo', label: 'Soprannome immobile', type: 'text', maxLength: 150,
  hint: 'Un nome breve per riconoscere facilmente l’immobile.'
};

const baseRequiredFields = new Set(['titolo', 'indirizzo', 'cap', 'comune', 'provincia']);

function assertContainer(container, name = 'container') {
  if (!(container instanceof Element)) {
    throw new TypeError(`Il ${name} del componente indirizzo non è valido.`);
  }
}

function fieldId(prefix, name) {
  return `${prefix}${name}`;
}

function createField(definition, prefix) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  wrapper.dataset.addressField = definition.name;

  const id = fieldId(prefix, definition.name);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const label = document.createElement('label');
  label.htmlFor = id;
  label.append(document.createTextNode(definition.label));

  const marker = document.createElement('span');
  marker.dataset.requiredMarker = definition.name;
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = ' *';
  marker.hidden = true;
  label.append(marker);

  const input = document.createElement('input');
  input.id = id;
  input.name = definition.name;
  input.type = definition.type;
  if (definition.maxLength) input.maxLength = definition.maxLength;
  if (definition.minLength) input.minLength = definition.minLength;
  if (definition.inputMode) input.inputMode = definition.inputMode;
  if (definition.autocomplete) input.autocomplete = definition.autocomplete;
  if (definition.autocapitalize) input.autocapitalize = definition.autocapitalize;
  if (definition.spellcheck === false) input.spellcheck = false;

  const describedBy = [errorId];
  if (definition.hint) describedBy.push(hintId);
  input.setAttribute('aria-describedby', describedBy.join(' '));

  wrapper.append(label, input);

  if (definition.hint) {
    const hint = document.createElement('p');
    hint.className = 'field-hint';
    hint.id = hintId;
    hint.textContent = definition.hint;
    wrapper.append(hint);
  }

  const error = document.createElement('p');
  error.className = 'field-error';
  error.id = errorId;
  wrapper.append(error);
  return wrapper;
}

export function createIndirizzoForm({
  container,
  datiObbligatori = false,
  visibile = true,
  mostraTitolo = false,
  titoloContainer = null,
  civicoObbligatorio = false,
  idPrefix = ''
} = {}) {
  assertContainer(container);
  if (titoloContainer !== null) assertContainer(titoloContainer, 'titoloContainer');

  const requiredFields = new Set(baseRequiredFields);
  if (civicoObbligatorio) requiredFields.add('civico');

  const commonGrid = document.createElement('div');
  commonGrid.className = 'form-grid address-form-grid';
  for (const definition of commonFields) {
    commonGrid.append(createField(definition, idPrefix));
  }
  container.replaceChildren(commonGrid);

  const titleIsSeparate = mostraTitolo && titoloContainer;
  if (titoloContainer) titoloContainer.replaceChildren();

  if (mostraTitolo) {
    if (titleIsSeparate) {
      titoloContainer.append(createField(titleField, idPrefix));
    } else {
      commonGrid.prepend(createField(titleField, idPrefix));
    }
  }

  const definitions = mostraTitolo ? [titleField, ...commonFields] : commonFields;
  let required = Boolean(datiObbligatori);
  let visible = Boolean(visibile);

  function rootFor(name) {
    return titleIsSeparate && name === 'titolo' ? titoloContainer : container;
  }

  function input(name) {
    return rootFor(name).querySelector(`[name="${name}"]`);
  }

  function errorElement(name) {
    return rootFor(name).querySelector(
      `#${CSS.escape(fieldId(idPrefix, name))}-error`
    );
  }

  function requiredMarker(name) {
    return rootFor(name).querySelector(`[data-required-marker="${name}"]`);
  }

  function clearErrors() {
    for (const { name } of definitions) {
      input(name).removeAttribute('aria-invalid');
      errorElement(name).textContent = '';
    }
  }

  function setRequired(value) {
    required = Boolean(value);
    for (const { name } of definitions) {
      const mandatory = required && requiredFields.has(name);
      const field = input(name);
      field.required = mandatory;
      if (mandatory) field.setAttribute('aria-required', 'true');
      else field.removeAttribute('aria-required');
      requiredMarker(name).hidden = !mandatory;
    }
  }

  function setVisible(value) {
    visible = Boolean(value);
    container.hidden = !visible;
    if (titleIsSeparate) titoloContainer.hidden = !visible;

    for (const { name } of definitions) {
      input(name).disabled = !visible;
    }
  }

  function getData() {
    const data = Object.fromEntries(
      definitions.map(({ name }) => [name, input(name).value.trim()])
    );
    if (Object.hasOwn(data, 'provincia')) {
      data.provincia = data.provincia.toUpperCase();
    }
    return data;
  }

  function setData(data = {}) {
    for (const { name } of definitions) {
      input(name).value = data?.[name] ?? '';
    }
    clearErrors();
  }

  function clear() {
    setData({});
  }

  function isEmpty() {
    return Object.values(getData()).every((value) => !value);
  }

  function validate() {
    clearErrors();
    if (!visible) return {};

    const data = getData();
    const errors = {};

    for (const definition of definitions) {
      const value = data[definition.name];
      if (required && requiredFields.has(definition.name) && !value) {
        errors[definition.name] = 'Questo campo è obbligatorio.';
      } else if (value && definition.maxLength && value.length > definition.maxLength) {
        errors[definition.name] =
          `Inserisci al massimo ${definition.maxLength} caratteri.`;
      }
    }

    if (data.cap && !/^\d{5}$/.test(data.cap)) {
      errors.cap = 'Il CAP deve contenere esattamente 5 cifre.';
    }
    if (data.provincia && !/^[A-Z]{2}$/.test(data.provincia)) {
      errors.provincia = 'Inserisci la sigla della provincia di 2 lettere.';
    }

    for (const [name, message] of Object.entries(errors)) {
      input(name).setAttribute('aria-invalid', 'true');
      errorElement(name).textContent = message;
    }
    return errors;
  }

  function focusFirstInvalid() {
    for (const { name } of definitions) {
      const field = input(name);
      if (field.getAttribute('aria-invalid') === 'true') {
        field.focus();
        break;
      }
    }
  }

  setRequired(required);
  setVisible(visible);

  return {
    getData,
    setData,
    clear,
    isEmpty,
    validate,
    clearErrors,
    focusFirstInvalid,
    setRequired,
    setVisible
  };
}
