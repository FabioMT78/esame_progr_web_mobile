const fieldsDefinition = [
  { name: 'codiceComunale', label: 'Codice comunale', type: 'text', maxLength: 20 },
  { name: 'foglio', label: 'Foglio', type: 'number', min: '0', step: '1', inputMode: 'numeric' },
  { name: 'particella', label: 'Particella', type: 'number', min: '0', step: '1', inputMode: 'numeric' },
  { name: 'subalterno', label: 'Sub', type: 'number', min: '0', step: '1', inputMode: 'numeric' },
  { name: 'zona', label: 'Zona', type: 'number', min: '0', step: '1', inputMode: 'numeric' },
  { name: 'categoria', label: 'Categoria', type: 'text', maxLength: 20 },
  { name: 'consistenza', label: 'Consistenza', type: 'text', maxLength: 20, inputMode: 'decimal', placeholder: 'es. 7,5' },
  { name: 'rendita', label: 'Rendita (€)', type: 'text', maxLength: 20, inputMode: 'decimal', placeholder: 'es. 825,40' }
];

export const datiCatastaliRequiredFields = Object.freeze([
  'codiceComunale',
  'foglio',
  'particella',
  'subalterno',
  'categoria',
  'rendita'
]);

const requiredWhenEnabled = new Set(datiCatastaliRequiredFields);

const integerFields = new Set([
  'foglio',
  'particella',
  'subalterno',
  'zona'
]);

function assertContainer(container) {
  if (!(container instanceof Element)) {
    throw new TypeError('Il container del componente dati catastali non è valido.');
  }
}

function normalizeDecimal(value) {
  return String(value ?? '').trim().replace(',', '.');
}

function createField(definition) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';

  const label = document.createElement('label');
  label.htmlFor = definition.name;
  label.append(document.createTextNode(definition.label));

  const requiredMarker = document.createElement('span');
  requiredMarker.dataset.requiredMarker = definition.name;
  requiredMarker.setAttribute('aria-hidden', 'true');
  requiredMarker.textContent = ' *';
  requiredMarker.hidden = true;
  label.append(requiredMarker);

  const input = document.createElement('input');
  input.id = definition.name;
  input.name = definition.name;
  input.type = definition.type;
  input.setAttribute('aria-describedby', `${definition.name}-error`);

  if (definition.maxLength) input.maxLength = definition.maxLength;
  if (definition.min != null) input.min = definition.min;
  if (definition.step != null) input.step = definition.step;
  if (definition.inputMode) input.inputMode = definition.inputMode;
  if (definition.placeholder) input.placeholder = definition.placeholder;

  const error = document.createElement('small');
  error.className = 'field-error';
  error.id = `${definition.name}-error`;

  wrapper.append(label, input, error);
  return wrapper;
}

export function createDatiCatastaliForm({
  container,
  datiObbligatori = false,
  visibile = true
} = {}) {
  assertContainer(container);

  const grid = document.createElement('div');
  grid.className = 'form-grid';

  for (const definition of fieldsDefinition) {
    grid.append(createField(definition));
  }
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
    for (const definition of fieldsDefinition) {
      const field = input(definition.name);
      field.removeAttribute('aria-invalid');
      errorElement(definition.name).textContent = '';
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

  function setRequired(value) {
    required = Boolean(value);

    for (const definition of fieldsDefinition) {
      const mandatory = required && requiredWhenEnabled.has(definition.name);
      const field = input(definition.name);
      field.required = mandatory;
      if (mandatory) field.setAttribute('aria-required', 'true');
      else field.removeAttribute('aria-required');

      const marker = container.querySelector(
        `[data-required-marker="${definition.name}"]`
      );
      marker.hidden = !mandatory;
    }
  }

  function rawData() {
    return Object.fromEntries(
      fieldsDefinition.map(({ name }) => [name, input(name).value.trim()])
    );
  }

  function getData() {
    const data = rawData();
    if (Object.values(data).every((value) => !value)) return null;

    return {
      ...data,
      consistenza: data.consistenza ? normalizeDecimal(data.consistenza) : '',
      rendita: data.rendita ? normalizeDecimal(data.rendita) : ''
    };
  }

  function setData(data = null) {
    for (const definition of fieldsDefinition) {
      input(definition.name).value = data?.[definition.name] ?? '';
    }
    clearErrors();
  }

  function clear() {
    setData(null);
  }

  function isEmpty() {
    return getData() === null;
  }

  function collectErrors() {
    if (!visible) return {};

    const data = rawData();
    const errors = {};

    for (const definition of fieldsDefinition) {
      const value = data[definition.name];
      if (required && requiredWhenEnabled.has(definition.name) && !value) {
        errors[definition.name] = 'Questo campo è obbligatorio.';
      }

      if (value && definition.maxLength && value.length > definition.maxLength) {
        errors[definition.name] =
          `Inserisci al massimo ${definition.maxLength} caratteri.`;
      }
    }

    for (const name of integerFields) {
      const value = data[name];
      if (value && !/^\d+$/.test(value)) {
        errors[name] = 'Inserisci un numero intero non negativo.';
      }
    }

    if (data.consistenza) {
      const normalized = normalizeDecimal(data.consistenza);
      if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)
          || Number(normalized) <= 0) {
        errors.consistenza =
          'Inserisci un valore positivo con massimo 2 decimali.';
      }
    }

    if (data.rendita) {
      const normalized = normalizeDecimal(data.rendita);
      if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)
          || Number(normalized) < 0) {
        errors.rendita =
          'Inserisci un importo non negativo con massimo 2 decimali.';
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

  function focusFirstInvalid() {
    container.querySelector('[aria-invalid="true"]')?.focus();
  }

  function setVisible(value) {
    visible = Boolean(value);
    container.hidden = !visible;
    for (const definition of fieldsDefinition) {
      input(definition.name).disabled = !visible;
    }
  }

  function handleFieldEvent(event) {
    const field = event.target.closest('[name]');
    if (!field || !container.contains(field)) return;
    setFieldError(field.name);
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
    setVisible
  };
}
