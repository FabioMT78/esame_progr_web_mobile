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

const requiredWhenEnabled = new Set(fieldsDefinition.map(({ name }) => name));

function assertContainer(container) {
  if (!(container instanceof Element)) {
    throw new TypeError('Il container del componente anagrafica non è valido.');
  }
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime())
    && date.getUTCFullYear() >= 1000
    && date.toISOString().slice(0, 10) === value;
}

function createField(definition) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';

  const label = document.createElement('label');
  label.htmlFor = definition.name;
  label.append(document.createTextNode(definition.label));

  const marker = document.createElement('span');
  marker.dataset.requiredMarker = definition.name;
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = ' *';
  marker.hidden = true;
  label.append(marker);

  const input = document.createElement('input');
  input.id = definition.name;
  input.name = definition.name;
  input.type = definition.type;
  if (definition.maxLength) input.maxLength = definition.maxLength;
  if (definition.minLength) input.minLength = definition.minLength;
  if (definition.min) input.min = definition.min;
  if (definition.autocomplete) input.autocomplete = definition.autocomplete;
  if (definition.autocapitalize) input.autocapitalize = definition.autocapitalize;
  if (definition.spellcheck === false) input.spellcheck = false;

  const describedBy = [`${definition.name}-error`];
  if (definition.hint) describedBy.push(`${definition.name}-hint`);
  input.setAttribute('aria-describedby', describedBy.join(' '));

  wrapper.append(label, input);

  if (definition.hint) {
    const hint = document.createElement('p');
    hint.className = 'field-hint';
    hint.id = `${definition.name}-hint`;
    hint.textContent = definition.hint;
    wrapper.append(hint);
  }

  const error = document.createElement('p');
  error.className = 'field-error';
  error.id = `${definition.name}-error`;
  wrapper.append(error);
  return wrapper;
}

export function createAnagraficaForm({ container, datiObbligatori = false, visibile = true } = {}) {
  assertContainer(container);

  const grid = document.createElement('div');
  grid.className = 'form-grid';
  for (const definition of fieldsDefinition) grid.append(createField(definition));
  container.replaceChildren(grid);

  let required = Boolean(datiObbligatori);
  let visible = Boolean(visibile);

  function input(name) {
    return container.querySelector(`[name="${name}"]`);
  }

  function errorElement(name) {
    return container.querySelector(`#${name}-error`);
  }

  function clearErrors() {
    for (const { name } of fieldsDefinition) {
      input(name).removeAttribute('aria-invalid');
      errorElement(name).textContent = '';
    }
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

  function validate() {
    clearErrors();
    if (!visible) return {};

    const data = getData();
    const errors = {};
    const today = new Date().toISOString().slice(0, 10);

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
      if (!validDate(data.dataNascita)) {
        errors.dataNascita = 'Inserisci una data valida.';
      } else if (data.dataNascita > today) {
        errors.dataNascita = 'La data di nascita non può essere futura.';
      }
    }

    for (const [name, message] of Object.entries(errors)) {
      input(name).setAttribute('aria-invalid', 'true');
      errorElement(name).textContent = message;
    }
    return errors;
  }

  function focusFirstInvalid() {
    container.querySelector('[aria-invalid="true"]')?.focus();
  }

  input('dataNascita').max = new Date().toISOString().slice(0, 10);
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
