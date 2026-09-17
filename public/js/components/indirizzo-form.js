const fieldsDefinition = [
  { name: 'titolo', label: 'Titolo', type: 'text', maxLength: 150 },
  { name: 'via', label: 'Via', type: 'text', maxLength: 150 },
  { name: 'numeroCivico', label: 'Numero civico', type: 'text', maxLength: 20 },
  { name: 'cap', label: 'CAP', type: 'text', maxLength: 10 },
  { name: 'comune', label: 'Comune', type: 'text', maxLength: 100 },
  { name: 'provincia', label: 'Provincia', type: 'text', maxLength: 100 }
];

const requiredWhenEnabled = new Set([
  'titolo',
  'via',
  'cap',
  'comune',
  'provincia'
]);

function assertContainer(container) {
  if (!(container instanceof Element)) {
    throw new TypeError('Il container del componente indirizzo non è valido.');
  }
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
  input.maxLength = definition.maxLength;
  input.setAttribute('aria-describedby', `${definition.name}-error`);

  const error = document.createElement('p');
  error.className = 'field-error';
  error.id = `${definition.name}-error`;

  wrapper.append(label, input, error);
  return wrapper;
}

export function createIndirizzoForm({ container, datiObbligatori = false, visibile = true } = {}) {
  assertContainer(container);

  const grid = document.createElement('div');
  grid.className = 'form-grid';

  for (const definition of fieldsDefinition) {
    grid.append(createField(definition));
  }
  container.replaceChildren(grid);

  let required = Boolean(datiObbligatori);

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

  function getData() {
    return Object.fromEntries(
      fieldsDefinition.map(({ name }) => [name, input(name).value.trim()])
    );
  }

  function setData(data = {}) {
    for (const definition of fieldsDefinition) {
      input(definition.name).value = data?.[definition.name] ?? '';
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
    const data = getData();
    const errors = {};

    for (const definition of fieldsDefinition) {
      const value = data[definition.name];

      if (required && requiredWhenEnabled.has(definition.name) && !value) {
        errors[definition.name] = 'Questo campo è obbligatorio.';
      } else if (value.length > definition.maxLength) {
        errors[definition.name] =
          `Inserisci al massimo ${definition.maxLength} caratteri.`;
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

  function setVisible(value) {
    container.hidden = !Boolean(value);
  }

  setRequired(required);
  setVisible(visibile);

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
