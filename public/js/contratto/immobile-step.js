import { createIndirizzoForm } from '../forms/indirizzo.js';
import { createDatiCatastaliForm } from '../forms/dati-catastali.js';
import {
  allPresent,
  editorRequiredFieldsComplete,
  fillSelect,
  present,
  showEmbeddedError
} from './step-utils.js';

const cadastralRequired = [
  'foglio',
  'particella',
  'subalterno',
  'categoria',
  'rendita'
];

export function createImmobileStep({
  api,
  messageElement,
  onStateChange = () => {}
} = {}) {
  if (typeof api !== 'function') {
    throw new TypeError('Lo step immobile richiede un client API.');
  }
  if (!(messageElement instanceof Element)) {
    throw new TypeError('Il messaggio globale dello step immobile non è valido.');
  }
  if (typeof onStateChange !== 'function') {
    throw new TypeError('onStateChange deve essere una funzione.');
  }

  const select = document.querySelector('#immobileId');
  const selectorBlock = document.querySelector('#immobile-selector-block');
  const emptyState = document.querySelector('#immobili-empty');
  const detail = document.querySelector('#immobile-detail');
  const selectionError = document.querySelector('#immobileId-error');
  const editor = document.querySelector('#immobile-editor');
  const editorTitle = document.querySelector('#immobile-editor-title');
  const editorHelp = document.querySelector('#immobile-editor-help');
  const addressSection = document.querySelector('#immobile-address-section');

  const requiredElements = [
    select,
    selectorBlock,
    emptyState,
    detail,
    selectionError,
    editor,
    editorTitle,
    editorHelp,
    addressSection
  ];
  if (requiredElements.some((element) => !element)) {
    throw new Error('Elementi dello step immobile non trovati.');
  }

  const indirizzo = createIndirizzoForm({
    container: document.querySelector('#wizard-immobile-address-fields'),
    datiObbligatori: true,
    mostraTitolo: true,
    idPrefix: 'wizard-immobile-',
    visibile: false
  });

  const catasto = createDatiCatastaliForm({
    container: document.querySelector('#wizard-immobile-cadastral-fields'),
    datiObbligatori: true,
    visibile: false
  });

  let items = [];
  let editorMode = null;
  let locked = false;

  function label(immobile) {
    const street = [immobile.indirizzo, immobile.civico]
      .filter(Boolean)
      .join(' ');
    return `${immobile.titolo} — ${street}, ${immobile.comune}`;
  }

  function getSelected() {
    return items.find((item) => item.id === select.value);
  }

  function isComplete(immobile = getSelected()) {
    return allPresent(immobile?.datiCatastali, cadastralRequired);
  }

  function renderDetail() {
    const immobile = getSelected();

    if (!immobile) {
      detail.textContent = '';
      if (!selectionError.textContent) selectionError.textContent = '';
      return;
    }

    const data = immobile.datiCatastali || {};
    const parts = [];
    if (present(data.foglio)) parts.push(`Foglio ${data.foglio}`);
    if (present(data.particella)) parts.push(`Particella ${data.particella}`);
    if (present(data.subalterno)) parts.push(`Sub ${data.subalterno}`);
    if (present(data.categoria)) parts.push(`Categoria ${data.categoria}`);
    if (present(data.rendita)) parts.push(`Rendita € ${data.rendita}`);

    // detail.textContent = parts.length ? '' : 'Dati catastali da completare.';
    detail.textContent = '';
    selectionError.textContent = isComplete(immobile)
      ? ''
      : 'COMPLETA I DATI CATASTALI: foglio, particella, subalterno, categoria e rendita.';
  }

  function setItems(nextItems = [], { preserveSelection = true } = {}) {
    items = Array.isArray(nextItems) ? [...nextItems] : [];
    fillSelect(select, items, label, preserveSelection);

    emptyState.hidden = items.length > 0;
    selectorBlock.hidden = items.length === 0;
    renderDetail();
  }

  function setSelectedId(id) {
    select.value = items.some((item) => item.id === id) ? id : '';
    renderDetail();
  }

  function setSelectionError(message = '') {
    selectionError.textContent = message;
  }

  function closeEditor({ notify = true } = {}) {
    editorMode = null;
    editor.hidden = true;
    addressSection.hidden = true;
    indirizzo.setVisible(false);
    catasto.setVisible(false);
    indirizzo.clearErrors();
    catasto.clearErrors();

    if (notify) onStateChange();
  }

  function openNew({ notify = true } = {}) {
    editorMode = 'new';
    editorTitle.textContent = 'Nuovo immobile';
    editorHelp.textContent = '';

    addressSection.hidden = false;
    indirizzo.setVisible(true);
    indirizzo.setRequired(true);
    indirizzo.clear();

    catasto.setVisible(true);
    catasto.setRequired(true);
    catasto.clear();

    editor.hidden = false;
    editor.scrollIntoView({ block: 'nearest' });

    if (notify) onStateChange();
  }

  function openCompletion(immobile = getSelected(), { notify = true } = {}) {
    if (!immobile) return;

    editorMode = 'existing';
    editorTitle.textContent = '';
    editorHelp.textContent = '';

    addressSection.hidden = true;
    indirizzo.setVisible(false);

    catasto.setVisible(true);
    catasto.setRequired(true);
    catasto.setData(immobile.datiCatastali);

    editor.hidden = false;
    editor.scrollIntoView({ block: 'nearest' });

    if (notify) onStateChange();
  }

  function isReady() {
    return editorMode
      ? editorRequiredFieldsComplete(editor)
      : isComplete();
  }

  async function saveEditor() {
    if (!editorMode) return getSelected();

    const errors = {
      ...(editorMode === 'new' ? indirizzo.validate() : {}),
      ...catasto.validate()
    };

    if (Object.keys(errors).length) {
      messageElement.textContent = 'Errore: controlla i campi dell’immobile.';
      if (editorMode === 'new') indirizzo.focusFirstInvalid();
      catasto.focusFirstInvalid();
      return null;
    }

    messageElement.textContent = 'Salvataggio immobile in corso…';

    try {
      let saved;

      if (editorMode === 'new') {
        saved = await api('/api/immobili', {
          method: 'POST',
          body: JSON.stringify({
            ...indirizzo.getData(),
            immagineUrl: '',
            datiCatastali: catasto.getData()
          })
        });
      } else {
        const immobile = getSelected();
        if (!immobile) throw new Error('Seleziona un immobile.');

        saved = await api(`/api/immobili/${encodeURIComponent(immobile.id)}`, {
          method: 'PUT',
          body: JSON.stringify({
            titolo: immobile.titolo,
            indirizzo: immobile.indirizzo,
            civico: immobile.civico ?? '',
            cap: immobile.cap,
            comune: immobile.comune,
            provincia: immobile.provincia,
            immagineUrl: immobile.immagineUrl ?? '',
            datiCatastali: catasto.getData()
          })
        });
      }

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

    const immobile = getSelected();
    if (immobile && !isComplete(immobile)) {
      openCompletion(immobile, { notify: false });
    }

    onStateChange();
  });

  document.querySelector('#open-new-immobile')
    ?.addEventListener('click', () => openNew());
  document.querySelector('#open-new-immobile-empty')
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
