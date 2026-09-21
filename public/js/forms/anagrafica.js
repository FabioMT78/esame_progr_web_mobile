import { isValidIsoDate } from '../utils/date.js';

const fieldsDefinition = [
  { name: 'nome', label: 'Nome', type: 'text', maxLength: 100, autocomplete: 'given-name' },
  { name: 'cognome', label: 'Cognome', type: 'text', maxLength: 100, autocomplete: 'family-name' },
  {
    name: 'codiceFiscale', label: 'Codice fiscale', type: 'text', minLength: 16,
    maxLength: 16, autocapitalize: 'characters', spellcheck: false,
    hint: 'Esattamente 16 caratteri alfanumerici.'
  },
  {
    name: 'dataNascita', label: 'Data di nascita', type: 'date', min: '1000-01-01',
    autocomplete: 'bday'
  }
];

export const anagraficaRequiredFields = Object.freeze(
  fieldsDefinition.map(({ name }) => name)
);

const requiredWhenEnabled = new Set(anagraficaRequiredFields);

function assertContainer(container) {
  if (!(container instanceof Element)) {
    throw new TypeError('Il container del componente anagrafica non è valido.');
  }
}

function fieldId(prefix, name) {
  return `${prefix}${name}`;
}

function adultBirthDateLimit() {
  const today = new Date();
  return new Date(Date.UTC(
    today.getUTCFullYear() - 18,
    today.getUTCMonth(),
    today.getUTCDate() - 1
  )).toISOString().slice(0, 10);
}

function createField(definition, prefix) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';

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
  if (definition.min) input.min = definition.min;
  if (definition.autocomplete) input.autocomplete = definition.autocomplete;
  if (definition.autocapitalize) input.autocapitalize = definition.autocapitalize;
  if (definition.spellcheck === false) input.spellcheck = false;

  const describedBy = [errorId];
  if (definition.hint) describedBy.push(hintId);
  input.setAttribute('aria-describedby', describedBy.join(' '));

  wrapper.append(label, input);

  if (definition.hint) {
    const hint = document.createElement('small');
    hint.className = 'field-hint';
    hint.id = hintId;
    hint.textContent = definition.hint;
    wrapper.append(hint);
  }

  const error = document.createElement('small');
  error.className = 'field-error';
  error.id = errorId;
  wrapper.append(error);
  return wrapper;
}

export function createAnagraficaForm({
  container,
  datiObbligatori = false,
  visibile = true,
  idPrefix = ''
} = {}) {
  assertContainer(container);

  const grid = document.createElement('div');
  grid.className = 'form-grid';
  for (const definition of fieldsDefinition) grid.append(createField(definition, idPrefix));
  container.replaceChildren(grid);

  let required = Boolean(datiObbligatori);
  let visible = Boolean(visibile);

  function input(name) {
    return container.querySelector(`[name="${name}"]`);
  }

  function errorElement(name) {
    return container.querySelector(`#${CSS.escape(fieldId(idPrefix, name))}-error`);
  }

  function clearErrors() {
    for (const { name } of fieldsDefinition) {
      input(name).removeAttribute('aria-invalid');
      errorElement(name).textContent = '';
    }
  }

  function setFieldError(name, message = '') {
    const field = input(name);
    const error = errorElement(name);

    if (message) {
      field.setAttribute('aria-invalid', 'true');
      error.textContent = message;
    } else {
      field.removeAttribute('aria-invalid');
      error.textContent = '';
    }
  }

  function validateField(name, { showError = true } = {}) {
    if (name !== 'dataNascita') return true;

    const value = input(name).value;
    if (!value || !isValidIsoDate(value)) {
      if (showError) setFieldError(name);
      return true;
    }

    if (value > adultBirthDateLimit()) {
      if (showError) {
        setFieldError(name, 'La data di nascita deve riferirsi a una persona maggiorenne.');
      }
      return false;
    }

    if (showError) setFieldError(name);
    return true;
  }

  function setRequired(value) {
    required = Boolean(value);
    for (const { name } of fieldsDefinition) {
      const mandatory = required && requiredWhenEnabled.has(name);
      const field = input(name);
      field.required = mandatory;
      if (mandatory) field.setAttribute('aria-required', 'true');
      else field.removeAttribute('aria-required');
      container.querySelector(`[data-required-marker="${name}"]`).hidden = !mandatory;
    }
  }

  function setVisible(value) {
    visible = Boolean(value);
    container.hidden = !visible;
    for (const { name } of fieldsDefinition) input(name).disabled = !visible;
  }

  function getData() {
    return {
      nome: input('nome').value.trim(),
      cognome: input('cognome').value.trim(),
      codiceFiscale: input('codiceFiscale').value.trim().toUpperCase(),
      dataNascita: input('dataNascita').value
    };
  }

  function setData(data = {}) {
    for (const { name } of fieldsDefinition) input(name).value = data?.[name] ?? '';
    clearErrors();
  }

  function clear() {
    setData({});
  }

  function isEmpty() {
    return Object.values(getData()).every((value) => !value);
  }

  function collectErrors() {
    if (!visible) return {};

    const data = getData();
    const errors = {};
    const maxBirthDate = adultBirthDateLimit();

    for (const definition of fieldsDefinition) {
      const value = data[definition.name];
      if (required && !value) {
        errors[definition.name] = 'Questo campo è obbligatorio.';
      } else if (value && definition.maxLength && value.length > definition.maxLength) {
        errors[definition.name] = `Inserisci al massimo ${definition.maxLength} caratteri.`;
      }
    }

    if (data.codiceFiscale && !/^[A-Z0-9]{16}$/.test(data.codiceFiscale)) {
      errors.codiceFiscale = 'Il codice fiscale deve contenere esattamente 16 caratteri alfanumerici.';
    }

    if (data.dataNascita) {
      if (!isValidIsoDate(data.dataNascita)) {
        errors.dataNascita = 'Inserisci una data valida.';
      } else if (data.dataNascita > maxBirthDate) {
        errors.dataNascita = 'La data di nascita deve riferirsi a una persona maggiorenne.';
      }
    }

    return errors;
  }

  function validate({ showErrors = true } = {}) {
    const errors = collectErrors();
    if (!showErrors) return errors;

    clearErrors();
    for (const [name, message] of Object.entries(errors)) {
      setFieldError(name, message);
    }
    return errors;
  }

  function isValid() {
    return Object.keys(validate({ showErrors: false })).length === 0;
  }

  function isBirthDateValid() {
    return validateField('dataNascita', { showError: false });
  }

  function focusFirstInvalid() {
    container.querySelector('[aria-invalid="true"]')?.focus();
  }

  function handleFieldEvent(event) {
    const field = event.target.closest('[name]');
    if (!field || !container.contains(field)) return;

    setFieldError(field.name);
    if (field.name === 'dataNascita') validateField(field.name);
  }

  container.addEventListener('input', handleFieldEvent);
  container.addEventListener('change', handleFieldEvent);

  setRequired(required);
  setVisible(visible);

  return {
    getData,
    setData,
    clear,
    isEmpty,
    validate,
    isValid,
    clearErrors,
    focusFirstInvalid,
    setRequired,
    setVisible,
    validateField,
    isBirthDateValid
  };
}
