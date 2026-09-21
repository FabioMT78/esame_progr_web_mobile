import {
  anagraficaRequiredFields,
  createAnagraficaForm
} from '../forms/anagrafica.js';
import {
  createIndirizzoForm,
  indirizzoRequiredFields
} from '../forms/indirizzo.js';
import {
  createDocumentoIdentitaForm,
  documentoRequiredFields
} from '../forms/documento.js';
import {
  allPresent,
  fillSelect,
  showEmbeddedError
} from './step-utils.js';

const addressRequired = indirizzoRequiredFields({
  civicoObbligatorio: true
});

export function createInquilinoStep({
  api,
  messageElement,
  onStateChange = () => {}
} = {}) {
  if (typeof api !== 'function') {
    throw new TypeError('Lo step inquilino richiede un client API.');
  }
  if (!(messageElement instanceof Element)) {
    throw new TypeError('Il messaggio globale dello step inquilino non è valido.');
  }
  if (typeof onStateChange !== 'function') {
    throw new TypeError('onStateChange deve essere una funzione.');
  }

  const select = document.querySelector('#inquilinoId');
  const selectionError = document.querySelector('#inquilinoId-error');
  const editor = document.querySelector('#tenant-editor');
  const editorTitle = document.querySelector('#tenant-editor-title');
  const anagraficaSection = document.querySelector('#tenant-anagrafica-section');
  const addressSection = document.querySelector('#tenant-address-section');
  const documentSection = document.querySelector('#tenant-document-section');

  const requiredElements = [
    select,
    selectionError,
    editor,
    editorTitle,
    anagraficaSection,
    addressSection,
    documentSection
  ];
  if (requiredElements.some((element) => !element)) {
    throw new Error('Elementi dello step inquilino non trovati.');
  }

  const anagrafica = createAnagraficaForm({
    container: document.querySelector('#wizard-tenant-anagrafica-fields'),
    datiObbligatori: true,
    visibile: false
  });

  const indirizzo = createIndirizzoForm({
    container: document.querySelector('#wizard-tenant-address-fields'),
    datiObbligatori: true,
    civicoObbligatorio: true,
    idPrefix: 'wizard-inquilino-',
    visibile: false
  });

  const documento = createDocumentoIdentitaForm({
    container: document.querySelector('#wizard-tenant-document-fields'),
    datiObbligatori: true,
    visibile: false
  });

  let items = [];
  let editorMode = null;
  let locked = false;

  function label(tenant) {
    return `${tenant.nome} ${tenant.cognome} — ${tenant.codiceFiscale}`;
  }

  function getSelected() {
    return items.find((item) => item.id === select.value);
  }

  function hasAnagrafica(tenant) {
    return allPresent(tenant, anagraficaRequiredFields);
  }

  function hasAddress(tenant) {
    return allPresent(tenant, addressRequired);
  }

  function hasDocument(tenant) {
    return allPresent(tenant, documentoRequiredFields);
  }

  function isComplete(tenant = getSelected()) {
    return hasAnagrafica(tenant)
      && hasAddress(tenant)
      && hasDocument(tenant);
  }

  function renderDetail() {
    const tenant = getSelected();
    const missing = [];

    if (!hasAnagrafica(tenant)) missing.push('dati anagrafici');
    if (!hasAddress(tenant)) missing.push('residenza');
    if (!hasDocument(tenant)) missing.push('documento');

    selectionError.textContent = missing.length
      ? `Completa: ${missing.join(', ')}.`
      : '';
  }

  function setItems(nextItems = [], { preserveSelection = true } = {}) {
    items = Array.isArray(nextItems) ? [...nextItems] : [];
    fillSelect(select, items, label, preserveSelection);
    renderDetail();
  }

  function setSelectedId(id) {
    select.value = items.some((item) => item.id === id) ? id : '';
    renderDetail();
  }

  function setSelectionError(message = '') {
    selectionError.textContent = message;
  }

  function setSection(section, component, visible) {
    section.hidden = !visible;
    component.setVisible(visible);
    component.setRequired(visible);
  }

  function closeEditor({ notify = true } = {}) {
    editorMode = null;
    editor.hidden = true;

    for (const [section, component] of [
      [anagraficaSection, anagrafica],
      [addressSection, indirizzo],
      [documentSection, documento]
    ]) {
      section.hidden = true;
      component.setVisible(false);
      component.clearErrors();
    }

    if (notify) onStateChange();
  }

  function openNew({ notify = true } = {}) {
    editorMode = 'new';
    editorTitle.textContent = 'Nuovo inquilino';

    anagrafica.clear();
    indirizzo.clear();
    documento.clear();

    setSection(anagraficaSection, anagrafica, true);
    setSection(addressSection, indirizzo, true);
    setSection(documentSection, documento, true);

    editor.hidden = false;
    editor.scrollIntoView({ block: 'nearest' });

    if (notify) onStateChange();
  }

  function openCompletion(tenant = getSelected(), { notify = true } = {}) {
    if (!tenant) return;

    editorMode = 'existing';
    editorTitle.textContent =
      `Completa inquilino — ${tenant.nome} ${tenant.cognome}`;

    anagrafica.setData(tenant);
    indirizzo.setData(tenant);
    documento.setData(tenant);

    setSection(anagraficaSection, anagrafica, !hasAnagrafica(tenant));
    setSection(addressSection, indirizzo, !hasAddress(tenant));
    setSection(documentSection, documento, !hasDocument(tenant));

    editor.hidden = false;
    editor.scrollIntoView({ block: 'nearest' });

    if (notify) onStateChange();
  }

  function isReady() {
    if (!editorMode) return isComplete();

    return anagrafica.isValid()
      && indirizzo.isValid()
      && documento.isValid();
  }

  async function saveEditor() {
    if (!editorMode) return getSelected();

    const errors = {
      ...anagrafica.validate(),
      ...indirizzo.validate(),
      ...documento.validate()
    };

    if (Object.keys(errors).length) {
      messageElement.textContent = 'Errore: controlla i dati dell’inquilino.';
      anagrafica.focusFirstInvalid();
      indirizzo.focusFirstInvalid();
      documento.focusFirstInvalid();
      return null;
    }

    messageElement.textContent = 'Salvataggio inquilino in corso…';

    try {
      const existing = editorMode === 'existing' ? getSelected() : null;
      const payload = {
        ...anagrafica.getData(),
        ...indirizzo.getData(),
        ...documento.getData(),
        immagineUrl: existing?.immagineUrl ?? ''
      };

      const saved = existing
        ? await api(`/api/inquilini/${encodeURIComponent(existing.id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
        : await api('/api/inquilini', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

      closeEditor({ notify: false });
      return saved;
    } catch (error) {
      if (error.name !== 'AbortError') {
        showEmbeddedError(editor, messageElement, error);
      }
      return null;
    }
  }

  function syncDisabled({ unavailable, active }) {
    select.disabled = Boolean(unavailable || !active || locked);
  }

  select.addEventListener('change', () => {
    closeEditor({ notify: false });
    renderDetail();

    const tenant = getSelected();
    if (tenant && !isComplete(tenant)) {
      openCompletion(tenant, { notify: false });
    }

    onStateChange();
  });

  document.querySelector('#open-new-tenant')
    ?.addEventListener('click', () => openNew());

  return {
    setItems,
    setSelectedId,
    setSelectionError,
    setLocked(value) {
      locked = Boolean(value);
    },
    hasId(id) {
      return items.some((item) => item.id === id);
    },
    getSelectedId() {
      return select.value;
    },
    getSelected,
    isComplete,
    isReady,
    hasEditorOpen() {
      return editorMode !== null;
    },
    openCompletion,
    closeEditor,
    saveEditor,
    renderDetail,
    syncDisabled
  };
}
