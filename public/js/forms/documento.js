const fieldDefinitions = [
  { name: 'numeroDocumento', label: 'Numero documento', type: 'text', maxLength: 50 },
  { name: 'organoRilascioDocumento', label: 'Organo rilascio documento', type: 'text', maxLength: 150 },
  { name: 'dataRilascioDocumento', label: 'Data di rilascio documento', type: 'date', min: '1000-01-01' },
  { name: 'dataScadenzaDocumento', label: 'Data scadenza documento', type: 'date', min: '1000-01-01' }
];

export const documentoRequiredFields = Object.freeze([
  'tipoDocumento',
  ...fieldDefinitions.map(({ name }) => name)
]);

function assertContainer(container) {
  if (!(container instanceof Element)) {
    throw new TypeError('Il container del componente documento non è valido.');
  }
}

function fieldId(prefix, name) {
  return `${prefix}${name}`;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime())
    && date.getUTCFullYear() >= 1000
    && date.toISOString().slice(0, 10) === value;
}

function createRequiredMarker(name) {
  const marker = document.createElement('span');
  marker.dataset.requiredMarker = name;
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = ' *';
  marker.hidden = true;
  return marker;
}

function createSelectField(prefix) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';

  const id = fieldId(prefix, 'tipoDocumento');
  const errorId = `${id}-error`;

  const label = document.createElement('label');
  label.htmlFor = id;
  label.append(document.createTextNode('Tipo documento'), createRequiredMarker('tipoDocumento'));

  const select = document.createElement('select');
  select.id = id;
  select.name = 'tipoDocumento';
  select.setAttribute('aria-describedby', errorId);
  select.append(
    new Option("Carta d'Identità", 'CARTA_IDENTITA', true, true),
    new Option('Passaporto', 'PASSAPORTO')
  );

  const error = document.createElement('small');
  error.className = 'field-error';
  error.id = errorId;
  wrapper.append(label, select, error);
  return wrapper;
}

function createInputField(definition, prefix) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';

  const id = fieldId(prefix, definition.name);
  const errorId = `${id}-error`;

  const label = document.createElement('label');
  label.htmlFor = id;
  label.append(document.createTextNode(definition.label), createRequiredMarker(definition.name));

  const input = document.createElement('input');
  input.id = id;
  input.name = definition.name;
  input.type = definition.type;
  if (definition.maxLength) input.maxLength = definition.maxLength;
  if (definition.min) input.min = definition.min;
  if (definition.name === 'numeroDocumento') {
    input.autocapitalize = 'characters';
    input.spellcheck = false;
  }
  input.setAttribute('aria-describedby', errorId);

  const error = document.createElement('small');
  error.className = 'field-error';
  error.id = errorId;
  wrapper.append(label, input, error);
  return wrapper;
}

export function createDocumentoIdentitaForm({
  container,
  datiObbligatori = false,
  visibile = true,
  idPrefix = ''
} = {}) {
  assertContainer(container);
  container.classList.add('contract-step');

  const grid = document.createElement('div');
  grid.className = 'form-grid';
  grid.append(createSelectField(idPrefix));
  for (const definition of fieldDefinitions) grid.append(createInputField(definition, idPrefix));
  container.replaceChildren(grid);

  const names = documentoRequiredFields;
  let required = Boolean(datiObbligatori);
  let visible = Boolean(visibile);

  function input(name) {
    return container.querySelector(`[name="${name}"]`);
  }

  function errorElement(name) {
    return container.querySelector(`#${CSS.escape(fieldId(idPrefix, name))}-error`);
  }

  function clearErrors() {
    for (const name of names) {
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
    if (name !== 'dataRilascioDocumento' && name !== 'dataScadenzaDocumento') {
      return true;
    }

    const value = input(name).value;
    if (!value || !validDate(value)) {
      if (showError) setFieldError(name);
      return true;
    }

    const today = new Date().toISOString().slice(0, 10);

    if (name === 'dataRilascioDocumento' && value >= today) {
      if (showError) {
        setFieldError(name, 'Il rilascio del documento deve essere anteriore ad oggi.');
      }
      return false;
    }

    if (name === 'dataScadenzaDocumento' && value <= today) {
      if (showError) {
        setFieldError(name, 'La scadenza del documento deve essere posteriore ad oggi.');
      }
      return false;
    }

    if (showError) setFieldError(name);
    return true;
  }

  function syncExpiryMin() {
    input('dataScadenzaDocumento').min =
      input('dataRilascioDocumento').value || '1000-01-01';
  }

  function setRequired(value) {
    required = Boolean(value);
    for (const name of names) {
      const field = input(name);
      field.required = required;
      if (required) field.setAttribute('aria-required', 'true');
      else field.removeAttribute('aria-required');
      container.querySelector(`[data-required-marker="${name}"]`).hidden = !required;
    }
  }

  function setVisible(value) {
    visible = Boolean(value);
    container.hidden = !visible;
    for (const name of names) input(name).disabled = !visible;
  }

  function rawData() {
    return {
      tipoDocumento: input('tipoDocumento').value,
      numeroDocumento: input('numeroDocumento').value.trim().toUpperCase(),
      organoRilascioDocumento: input('organoRilascioDocumento').value.trim(),
      dataRilascioDocumento: input('dataRilascioDocumento').value,
      dataScadenzaDocumento: input('dataScadenzaDocumento').value
    };
  }

  function hasMeaningfulData(data) {
    return Boolean(data.numeroDocumento || data.organoRilascioDocumento
      || data.dataRilascioDocumento || data.dataScadenzaDocumento);
  }

  function getData() {
    const data = rawData();
    if (!required && !hasMeaningfulData(data)) {
      return {
        tipoDocumento: null,
        numeroDocumento: null,
        organoRilascioDocumento: null,
        dataRilascioDocumento: null,
        dataScadenzaDocumento: null
      };
    }
    return data;
  }

  function setData(data = null) {
    input('tipoDocumento').value = data?.tipoDocumento || 'CARTA_IDENTITA';
    for (const { name } of fieldDefinitions) input(name).value = data?.[name] ?? '';
    syncExpiryMin();
    clearErrors();
  }

  function clear() {
    setData(null);
  }

  function isEmpty() {
    return !hasMeaningfulData(rawData());
  }

  function collectErrors() {
    if (!visible) return {};

    const data = rawData();
    const errors = {};
    const today = new Date().toISOString().slice(0, 10);

    if (required) {
      for (const name of names) {
        if (!data[name]) errors[name] = 'Questo campo è obbligatorio.';
      }
    }

    if (data.tipoDocumento && !['CARTA_IDENTITA', 'PASSAPORTO'].includes(data.tipoDocumento)) {
      errors.tipoDocumento = 'Seleziona un tipo di documento valido.';
    }
    if (data.numeroDocumento.length > 50) {
      errors.numeroDocumento = 'Inserisci al massimo 50 caratteri.';
    }
    if (data.organoRilascioDocumento.length > 150) {
      errors.organoRilascioDocumento = 'Inserisci al massimo 150 caratteri.';
    }
    if (data.dataRilascioDocumento) {
      if (!validDate(data.dataRilascioDocumento)) {
        errors.dataRilascioDocumento = 'Inserisci una data valida.';
      } else if (data.dataRilascioDocumento >= today) {
        errors.dataRilascioDocumento = 'Il rilascio del documento deve essere anteriore ad oggi.';
      }
    }
    if (data.dataScadenzaDocumento) {
      if (!validDate(data.dataScadenzaDocumento)) {
        errors.dataScadenzaDocumento = 'Inserisci una data valida.';
      } else if (data.dataScadenzaDocumento <= today) {
        errors.dataScadenzaDocumento = 'La scadenza del documento deve essere posteriore ad oggi.';
      }
    }
    if (validDate(data.dataRilascioDocumento) && validDate(data.dataScadenzaDocumento)
        && data.dataScadenzaDocumento < data.dataRilascioDocumento) {
      errors.dataScadenzaDocumento = 'La scadenza non può precedere la data di rilascio.';
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

  function areDocumentDatesValid() {
    return validateField('dataRilascioDocumento', { showError: false })
      && validateField('dataScadenzaDocumento', { showError: false });
  }

  function focusFirstInvalid() {
    container.querySelector('[aria-invalid="true"]')?.focus();
  }

  function handleFieldEvent(event) {
    const field = event.target.closest('[name]');
    if (!field || !container.contains(field)) return;

    setFieldError(field.name);

    if (field.name === 'dataRilascioDocumento') {
      syncExpiryMin();
      const expiry = input('dataScadenzaDocumento');
      if (expiry.value && expiry.value < field.value) {
        expiry.value = '';
        setFieldError('dataScadenzaDocumento');
      }
    }

    if (field.name === 'dataRilascioDocumento' || field.name === 'dataScadenzaDocumento') {
      validateField(field.name);
    }
  }

  container.addEventListener('input', handleFieldEvent);
  container.addEventListener('change', handleFieldEvent);

  setRequired(required);
  setVisible(visible);
  syncExpiryMin();

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
    areDocumentDatesValid
  };
}
