function assertContainer(container) {
  if (!(container instanceof Element)) {
    throw new TypeError('Il container dei dati contrattuali non è valido.');
  }
}

export function createDatiContrattualiStep({ container } = {}) {
  assertContainer(container);

  const tipologiaSelect = container.querySelector('[name="tipologiaId"]');
  const dataInizio = container.querySelector('[name="dataInizio"]');
  const dataFine = container.querySelector('#dataFine');
  const canoneAnnuale = container.querySelector('[name="canoneAnnuale"]');
  const canoneMensile = container.querySelector('#canoneMensile');
  const giornoPagamento = container.querySelector('[name="giornoPagamento"]');
  const tipologiaDetail = container.querySelector('#tipologia-detail');
  const emptyMessage = container.querySelector('#tipologie-empty');

  const requiredElements = [
    tipologiaSelect,
    dataInizio,
    dataFine,
    canoneAnnuale,
    canoneMensile,
    giornoPagamento,
    tipologiaDetail,
    emptyMessage
  ];
  if (requiredElements.some((element) => !element)) {
    throw new Error('Campi dei dati contrattuali non trovati.');
  }

  const fields = [
    tipologiaSelect,
    dataInizio,
    canoneAnnuale,
    giornoPagamento
  ];

  let tipologie = [];

  function selectedTipologia() {
    return tipologie.find((item) => item.id === tipologiaSelect.value);
  }

  function errorElement(field) {
    return container.querySelector(`#${CSS.escape(field.name)}-error`);
  }

  function clearErrors() {
    for (const field of fields) {
      field.removeAttribute('aria-invalid');
      const error = errorElement(field);
      if (error) error.textContent = '';
    }
  }

  function setFieldError(field, message = '') {
    const error = errorElement(field);
    if (message) {
      field.setAttribute('aria-invalid', 'true');
      if (error) error.textContent = message;
    } else {
      field.removeAttribute('aria-invalid');
      if (error) error.textContent = '';
    }
  }

  function previewDataFine() {
    const tipologia = selectedTipologia();
    const value = dataInizio.value;

    if (!tipologia || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())
        || date.getUTCFullYear() < 1000
        || date.toISOString().slice(0, 10) !== value) {
      return '';
    }

    date.setUTCFullYear(date.getUTCFullYear() + Number(tipologia.durata));
    date.setUTCDate(date.getUTCDate() - 1);
    return date.getUTCFullYear() <= 9999 ? date.toISOString().slice(0, 10) : '';
  }

  function updateDerivedValues() {
    const tipologia = selectedTipologia();
    tipologiaDetail.textContent = tipologia
      ? `Durata: ${tipologia.durata} anni. Rinnovo indicato dal template: ${tipologia.rinnovo} anni.`
      : '';

    dataFine.value = previewDataFine();

    const annuale = Number(canoneAnnuale.value);
    canoneMensile.value =
      Number.isFinite(annuale) && annuale > 0
        ? (annuale / 12).toLocaleString('it-IT', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
        : '';
  }

  function setTipologie(items = []) {
    const previousValue = tipologiaSelect.value;
    tipologie = Array.isArray(items) ? [...items] : [];

    const placeholder = tipologiaSelect.options[0]?.cloneNode(true)
      || new Option('Seleziona una tipologia', '');

    tipologiaSelect.replaceChildren(placeholder);
    for (const item of tipologie) {
      tipologiaSelect.add(new Option(item.denominazione, item.id));
    }

    tipologiaSelect.value = tipologie.some((item) => item.id === previousValue)
      ? previousValue
      : '';

    emptyMessage.hidden = tipologie.length > 0;
    updateDerivedValues();
  }

  function getData() {
    return {
      tipologiaId: tipologiaSelect.value,
      dataInizio: dataInizio.value,
      canoneAnnuale: canoneAnnuale.value,
      giornoPagamento: giornoPagamento.value
    };
  }

  function setData(data = {}) {
    tipologiaSelect.value = tipologie.some(
      (item) => item.id === data.tipologiaId
    ) ? data.tipologiaId : '';

    dataInizio.value = data.dataInizio || '';
    canoneAnnuale.value = data.canoneAnnuale || '';
    giornoPagamento.value = data.giornoPagamento || '';

    clearErrors();
    updateDerivedValues();
  }

  function collectErrors() {
    const errors = {};

    if (!selectedTipologia()) {
      errors.tipologiaId = 'Seleziona una tipologia.';
    }

    if (!dataInizio.value || !dataInizio.validity.valid) {
      errors.dataInizio = 'Inserisci una data iniziale valida.';
    } else if (!errors.tipologiaId && !previewDataFine()) {
      errors.dataInizio = 'La scadenza deve essere compresa entro il 31/12/9999.';
    }

    if (!canoneAnnuale.value || !canoneAnnuale.validity.valid) {
      errors.canoneAnnuale =
        'Inserisci un importo tra 0,01 e 99.999.999,99 euro, con massimo 2 decimali.';
    }

    if (!giornoPagamento.value || !giornoPagamento.validity.valid) {
      errors.giornoPagamento = 'Inserisci un giorno intero tra 1 e 28.';
    }

    return errors;
  }

  function validate({ showErrors = true } = {}) {
    const errors = collectErrors();
    if (!showErrors) return errors;

    clearErrors();
    for (const [name, message] of Object.entries(errors)) {
      const field = fields.find((item) => item.name === name);
      if (field) setFieldError(field, message);
    }
    return errors;
  }

  function focusFirstInvalid() {
    container.querySelector('[aria-invalid="true"]')?.focus();
  }

  function handleFieldEvent(event) {
    const field = event.target.closest('[name]');
    if (!field || !container.contains(field)) return;

    if (fields.includes(field)) setFieldError(field);
    updateDerivedValues();
  }

  container.addEventListener('input', handleFieldEvent);
  container.addEventListener('change', handleFieldEvent);

  return {
    setTipologie,
    hasTipologie() {
      return tipologie.length > 0;
    },
    getData,
    setData,
    validate,
    clearErrors,
    focusFirstInvalid,
    updateDerivedValues
  };
}
