import {
  readToken,
  clearToken,
  clearFieldErrors,
  showFormError,
  readIdParameter
} from './common.js';
import { createIndirizzoForm } from './components/indirizzo-form.js';
import { createDatiCatastaliForm } from './components/dati-catastali-form.js';
import { createAnagraficaForm } from './components/anagrafica-form.js';
import { createDocumentoIdentitaForm } from './components/documento-identita-form.js';

const content = document.querySelector('#protected-content');
const form = document.querySelector('#contract-form');
const formMessage = document.querySelector('#form-message');
const retry = document.querySelector('#retry');
const steps = [...form.querySelectorAll('[data-step]')];
const stepperItems = [...document.querySelectorAll('#contract-stepper li')];
const next = document.querySelector('#next-step');
const confirm = document.querySelector('#confirm-contract');
const cancelWizard = document.querySelector('#cancel-wizard');
const newContract = document.querySelector('#new-contract');
const summary = document.querySelector('#contract-summary');

const immobileSelect = form.elements.immobileId;
const tenantSelect = form.elements.inquilinoId;
const immobileSelectorBlock = document.querySelector('#immobile-selector-block');
const immobiliEmpty = document.querySelector('#immobili-empty');
const immobileEditor = document.querySelector('#immobile-editor');
const immobileAddressSection = document.querySelector('#immobile-address-section');

const tenantEditor = document.querySelector('#tenant-editor');
const tenantAnagraficaSection = document.querySelector('#tenant-anagrafica-section');
const tenantAddressSection = document.querySelector('#tenant-address-section');
const tenantDocumentSection = document.querySelector('#tenant-document-section');

const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR'
});

const cadastralRequired = ['foglio', 'particella', 'subalterno', 'categoria', 'rendita'];
const tenantAnagraficaRequired = ['nome', 'cognome', 'codiceFiscale', 'dataNascita'];
const tenantAddressRequired = ['indirizzo', 'civico', 'cap', 'provincia', 'comune'];
const tenantDocumentRequired = [
  'tipoDocumento',
  'numeroDocumento',
  'organoRilascioDocumento',
  'dataRilascioDocumento',
  'dataScadenzaDocumento'
];

const query = new URLSearchParams(window.location.search);
const queryHasImmobile = query.has('immobileId');
const queryHasTenant = query.has('inquilinoId');
const queryImmobileId = readIdParameter('immobileId');
const queryTenantId = readIdParameter('inquilinoId');

const immobileAddress = createIndirizzoForm({
  container: document.querySelector('#wizard-immobile-address-fields'),
  datiObbligatori: true,
  mostraTitolo: true,
  idPrefix: 'wizard-immobile-',
  visibile: false
});

const immobileCatasto = createDatiCatastaliForm({
  container: document.querySelector('#wizard-immobile-cadastral-fields'),
  datiObbligatori: true,
  visibile: false
});

const tenantAnagrafica = createAnagraficaForm({
  container: document.querySelector('#wizard-tenant-anagrafica-fields'),
  datiObbligatori: true,
  visibile: false
});

const tenantAddress = createIndirizzoForm({
  container: document.querySelector('#wizard-tenant-address-fields'),
  datiObbligatori: true,
  civicoObbligatorio: true,
  idPrefix: 'wizard-inquilino-',
  visibile: false
});

const tenantDocument = createDocumentoIdentitaForm({
  container: document.querySelector('#wizard-tenant-document-fields'),
  datiObbligatori: true,
  visibile: false
});

let prerequisites = { immobili: [], inquilini: [], tipologie: [] };
let draft = null;
let step = 1;
let ready = false;
let busy = false;
let completed = false;
let request;
let immobileEditorMode = null;
let tenantEditorMode = null;
let lockedImmobile = false;
let lockedTenant = false;

function logout() {
  request?.abort();
  content.hidden = true;
  try {
    clearToken();
  } finally {
    window.location.replace('/');
  }
}

async function api(url, options = {}) {
  const token = readToken();
  if (!token) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }

  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    signal: request.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }

  const data = response.status === 204 ? null : await response.json();

  if (!response.ok) {
    throw Object.assign(
      new Error(data?.error || 'Operazione non riuscita.'),
      { status: response.status, fields: data?.fields }
    );
  }

  return data;
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function allPresent(object, fields) {
  return Boolean(object && fields.every((name) => present(object[name])));
}

function hasCadastralData(immobile) {
  return allPresent(immobile?.datiCatastali, cadastralRequired);
}

function hasTenantAnagrafica(tenant) {
  return allPresent(tenant, tenantAnagraficaRequired);
}

function hasTenantAddress(tenant) {
  return allPresent(tenant, tenantAddressRequired);
}

function hasTenantDocument(tenant) {
  return allPresent(tenant, tenantDocumentRequired);
}

function hasCompleteTenant(tenant) {
  return hasTenantAnagrafica(tenant)
    && hasTenantAddress(tenant)
    && hasTenantDocument(tenant);
}

function selectedImmobile() {
  return prerequisites.immobili.find((item) => item.id === immobileSelect.value);
}

function selectedTenant() {
  return prerequisites.inquilini.find((item) => item.id === tenantSelect.value);
}

function selectedTipologia() {
  return prerequisites.tipologie.find(
    (item) => item.id === form.elements.tipologiaId.value
  );
}

function immobileLabel(immobile) {
  const street = [immobile.indirizzo, immobile.civico].filter(Boolean).join(' ');
  return `${immobile.titolo} — ${street}, ${immobile.comune}`;
}

function tenantLabel(tenant) {
  return `${tenant.nome} ${tenant.cognome} — ${tenant.codiceFiscale}`;
}

function safeReferrerPath() {
  try {
    if (!document.referrer) return null;
    const url = new URL(document.referrer);
    if (url.origin !== window.location.origin) return null;
    if (['/', '/index.html', '/contratto.html'].includes(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function formatDate(value) {
  return value ? value.split('-').reverse().join('/') : '—';
}

function appendDetail(dl, label, value) {
  const group = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value;
  group.append(term, description);
  dl.append(group);
}

function fillSelect(select, items, label) {
  const previousValue = select.value;
  const placeholder = select.options[0]?.cloneNode(true)
    || new Option('Seleziona', '');

  select.replaceChildren(placeholder);
  for (const item of items) select.add(new Option(label(item), item.id));

  select.value = items.some((item) => item.id === previousValue)
    ? previousValue
    : '';
}

function setEmbeddedServerErrors(editor, error) {
  for (const [name, message] of Object.entries(error.fields || {})) {
    const candidates = [...editor.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
    const field = candidates.find((item) => !item.disabled) || candidates[0];
    if (!field) continue;

    field.setAttribute('aria-invalid', 'true');
    const hint = field.closest('.field')?.querySelector('.field-error');
    if (hint) hint.textContent = message;
  }
}

function showEmbeddedError(editor, error) {
  formMessage.textContent = `Errore: ${
    error instanceof TypeError
      ? 'Impossibile contattare il server. Riprova.'
      : error.message
  }`;
  setEmbeddedServerErrors(editor, error);
  (editor.querySelector('[aria-invalid="true"]') || formMessage).focus();
}

function clearContractErrors() {
  clearFieldErrors(form);
  formMessage.textContent = '';
}

function previewDataFine() {
  const tipologia = selectedTipologia();
  const value = form.elements.dataInizio.value;

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

function updateContractDerivedValues() {
  const tipologia = selectedTipologia();
  document.querySelector('#tipologia-detail').textContent = tipologia
    ? `Durata: ${tipologia.durata} anni. Rinnovo indicato dal template: ${tipologia.rinnovo} anni.`
    : '';

  form.elements.dataFine.value = previewDataFine();

  const annuale = Number(form.elements.canoneAnnuale.value);
  form.elements.canoneMensile.value =
    Number.isFinite(annuale) && annuale > 0
      ? (annuale / 12).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
      : '';
}

function contractStepData() {
  return {
    tipologiaId: form.elements.tipologiaId.value,
    dataInizio: form.elements.dataInizio.value,
    canoneAnnuale: form.elements.canoneAnnuale.value,
    giornoPagamento: form.elements.giornoPagamento.value
  };
}

function contractFieldsComplete() {
  const fields = validateStep3(false);
  return Object.keys(fields).length === 0;
}

function renderSummary() {
  summary.replaceChildren();

  const immobile = selectedImmobile();
  const tenant = selectedTenant();
  const tipologia = selectedTipologia();
  const annuale = Number(form.elements.canoneAnnuale.value);

  appendDetail(summary, 'Immobile', immobile ? immobileLabel(immobile) : '—');
  appendDetail(summary, 'Inquilino', tenant ? tenantLabel(tenant) : '—');
  appendDetail(summary, 'Tipologia', tipologia?.denominazione || '—');
  appendDetail(summary, 'Durata', tipologia ? `${tipologia.durata} anni` : '—');
  appendDetail(summary, 'Decorrenza', formatDate(form.elements.dataInizio.value));
  appendDetail(summary, 'Scadenza', formatDate(previewDataFine()));
  appendDetail(
    summary,
    'Canone annuale',
    Number.isFinite(annuale) ? euro.format(annuale) : '—'
  );
  appendDetail(
    summary,
    'Canone mensile',
    Number.isFinite(annuale) ? euro.format(annuale / 12) : '—'
  );
  appendDetail(
    summary,
    'Giorno di pagamento',
    form.elements.giornoPagamento.value
      ? `${form.elements.giornoPagamento.value} di ogni mese`
      : '—'
  );
}

function completedSteps() {
  const immobileComplete = hasCadastralData(selectedImmobile());
  const tenantComplete = immobileComplete && hasCompleteTenant(selectedTenant());
  return [
    immobileComplete,
    tenantComplete,
    tenantComplete && ((draft?.stepCompletato ?? 0) >= 3 || step === 4 || completed),
    completed
  ];
}

function syncStepper() {
  const complete = completedSteps();
  const labels = ['Immobile', 'Inquilino', 'Dati contrattuali', 'Riepilogo'];

  stepperItems.forEach((item, index) => {
    const number = index + 1;
    const canNavigate = complete[index] && number !== step && !completed;
    item.replaceChildren();

    if (canNavigate) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'contract-stepper-link';
      button.dataset.stepTarget = String(number);
      button.textContent = `✓ ${number}. ${labels[index]}`;
      button.setAttribute('aria-label', `Torna al passaggio ${number}: ${labels[index]}`);
      item.append(button);
    } else {
      item.textContent = `${complete[index] ? '✓ ' : ''}${number}. ${labels[index]}`;
    }

    if (number === step && !completed) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
}

function syncControls() {
  const unavailable = busy || !ready || completed;

  for (const fieldset of steps) {
    const active = Number(fieldset.dataset.step) === step;
    fieldset.hidden = !active;
    fieldset.disabled = unavailable || !active;
  }

  immobileSelect.disabled = unavailable || step !== 1 || lockedImmobile;
  tenantSelect.disabled = unavailable || step !== 2 || lockedTenant;

  next.hidden = step === 4 || completed;
  next.disabled = unavailable
    || (step === 1 && !hasCadastralData(selectedImmobile()))
    || (step === 2 && !hasCompleteTenant(selectedTenant()))
    || (step === 3 && !prerequisites.tipologie.length);

  confirm.hidden = step !== 4 || completed;
  confirm.disabled = unavailable;

  cancelWizard.disabled = busy;
  retry.disabled = busy;
  newContract.hidden = !completed;
  newContract.disabled = busy;

  form.setAttribute('aria-busy', String(busy));
  syncStepper();
}

function showStep(value, focus = true) {
  step = value;
  if (step === 4) renderSummary();
  syncControls();
  if (focus) document.querySelector(`#step${step}-title`)?.focus();
}

function renderImmobileDetail() {
  const immobile = selectedImmobile();
  const detail = document.querySelector('#immobile-detail');
  const error = document.querySelector('#immobileId-error');

  if (!immobile) {
    detail.textContent = '';
    if (!error.textContent) error.textContent = '';
    return;
  }

  const data = immobile.datiCatastali || {};
  const parts = [];
  if (present(data.foglio)) parts.push(`Foglio ${data.foglio}`);
  if (present(data.particella)) parts.push(`Particella ${data.particella}`);
  if (present(data.subalterno)) parts.push(`Sub ${data.subalterno}`);
  if (present(data.categoria)) parts.push(`Categoria ${data.categoria}`);
  if (present(data.rendita)) parts.push(`Rendita € ${data.rendita}`);

  detail.textContent = parts.length ? '' : 'Dati catastali da completare.';

  error.textContent = hasCadastralData(immobile)
    ? ''
    : 'Completa foglio, particella, subalterno, categoria e rendita.';
}

function renderTenantDetail() {
  const tenant = selectedTenant();
  const error = document.querySelector('#inquilinoId-error');

  const missing = [];
  if (!hasTenantAnagrafica(tenant)) missing.push('dati anagrafici');
  if (!hasTenantAddress(tenant)) missing.push('residenza');
  if (!hasTenantDocument(tenant)) missing.push('documento');

  error.textContent = missing.length
    ? `Completa: ${missing.join(', ')}.`
    : '';
}

function closeImmobileEditor() {
  immobileEditorMode = null;
  immobileEditor.hidden = true;
  immobileAddressSection.hidden = true;
  immobileAddress.setVisible(false);
  immobileCatasto.setVisible(false);
  immobileAddress.clearErrors();
  immobileCatasto.clearErrors();
}

function openNewImmobile() {
  immobileEditorMode = 'new';
  document.querySelector('#immobile-editor-title').textContent = 'Nuovo immobile';
  document.querySelector('#immobile-editor-help').textContent =
    'Inserisci indirizzo e dati catastali necessari al contratto.';

  immobileAddressSection.hidden = false;
  immobileAddress.setVisible(true);
  immobileAddress.setRequired(true);
  immobileAddress.clear();

  immobileCatasto.setVisible(true);
  immobileCatasto.setRequired(true);
  immobileCatasto.clear();

  immobileEditor.hidden = false;
  immobileEditor.scrollIntoView({ block: 'nearest' });
}

function openImmobileCompletion(immobile) {
  if (!immobile) return;

  immobileEditorMode = 'existing';
  document.querySelector('#immobile-editor-title').textContent =
    `Completa dati catastali — ${immobile.titolo}`;
  document.querySelector('#immobile-editor-help').textContent =
    'L’indirizzo rimane invariato. Completa i dati necessari alla registrazione del contratto.';

  immobileAddressSection.hidden = true;
  immobileAddress.setVisible(false);

  immobileCatasto.setVisible(true);
  immobileCatasto.setRequired(true);
  immobileCatasto.setData(immobile.datiCatastali);

  immobileEditor.hidden = false;
  immobileEditor.scrollIntoView({ block: 'nearest' });
}

function closeTenantEditor() {
  tenantEditorMode = null;
  tenantEditor.hidden = true;

  for (const [section, component] of [
    [tenantAnagraficaSection, tenantAnagrafica],
    [tenantAddressSection, tenantAddress],
    [tenantDocumentSection, tenantDocument]
  ]) {
    section.hidden = true;
    component.setVisible(false);
    component.clearErrors();
  }
}

function setTenantSection(section, component, visible) {
  section.hidden = !visible;
  component.setVisible(visible);
  component.setRequired(visible);
}

function openNewTenant() {
  tenantEditorMode = 'new';
  document.querySelector('#tenant-editor-title').textContent = 'Nuovo inquilino';

  tenantAnagrafica.clear();
  tenantAddress.clear();
  tenantDocument.clear();

  setTenantSection(tenantAnagraficaSection, tenantAnagrafica, true);
  setTenantSection(tenantAddressSection, tenantAddress, true);
  setTenantSection(tenantDocumentSection, tenantDocument, true);

  tenantEditor.hidden = false;
  tenantEditor.scrollIntoView({ block: 'nearest' });
}

function openTenantCompletion(tenant) {
  if (!tenant) return;

  tenantEditorMode = 'existing';
  document.querySelector('#tenant-editor-title').textContent =
    `Completa inquilino — ${tenant.nome} ${tenant.cognome}`;

  tenantAnagrafica.setData(tenant);
  tenantAddress.setData(tenant);
  tenantDocument.setData(tenant);

  setTenantSection(
    tenantAnagraficaSection,
    tenantAnagrafica,
    !hasTenantAnagrafica(tenant)
  );
  setTenantSection(
    tenantAddressSection,
    tenantAddress,
    !hasTenantAddress(tenant)
  );
  setTenantSection(
    tenantDocumentSection,
    tenantDocument,
    !hasTenantDocument(tenant)
  );

  tenantEditor.hidden = false;
  tenantEditor.scrollIntoView({ block: 'nearest' });
}

function renderPrerequisites({ preserveSelection = true } = {}) {
  const currentImmobile = preserveSelection ? immobileSelect.value : '';
  const currentTenant = preserveSelection ? tenantSelect.value : '';

  fillSelect(immobileSelect, prerequisites.immobili, immobileLabel);
  fillSelect(tenantSelect, prerequisites.inquilini, tenantLabel);
  fillSelect(
    form.elements.tipologiaId,
    prerequisites.tipologie,
    (item) => item.denominazione
  );

  if (currentImmobile && prerequisites.immobili.some((x) => x.id === currentImmobile)) {
    immobileSelect.value = currentImmobile;
  }
  if (currentTenant && prerequisites.inquilini.some((x) => x.id === currentTenant)) {
    tenantSelect.value = currentTenant;
  }

  immobiliEmpty.hidden = prerequisites.immobili.length > 0;
  immobileSelectorBlock.hidden = prerequisites.immobili.length === 0;
  document.querySelector('#tipologie-empty').hidden =
    prerequisites.tipologie.length > 0;

  renderImmobileDetail();
  renderTenantDetail();
  updateContractDerivedValues();
}

async function refreshPrerequisites() {
  const currentImmobile = immobileSelect.value;
  const currentTenant = tenantSelect.value;

  prerequisites = await api('/api/contratti/prerequisiti');
  renderPrerequisites();

  if (currentImmobile && prerequisites.immobili.some((x) => x.id === currentImmobile)) {
    immobileSelect.value = currentImmobile;
  }
  if (currentTenant && prerequisites.inquilini.some((x) => x.id === currentTenant)) {
    tenantSelect.value = currentTenant;
  }

  renderImmobileDetail();
  renderTenantDetail();
}

function draftPayload(requestedStep = draft?.stepCompletato ?? 0) {
  return {
    immobileId: immobileSelect.value || null,
    inquilinoId: tenantSelect.value || null,
    stepCompletato: requestedStep,
    dati: contractStepData(),
    paginaProvenienza: draft?.paginaProvenienza || safeReferrerPath()
  };
}

async function saveDraft(requestedStep) {
  draft = await api('/api/contratti/bozza', {
    method: 'PUT',
    body: JSON.stringify(draftPayload(requestedStep))
  });
  syncStepper();
  return draft;
}

function restoreContractData(data = {}) {
  form.elements.tipologiaId.value = prerequisites.tipologie.some(
    (item) => item.id === data.tipologiaId
  ) ? data.tipologiaId : '';

  form.elements.dataInizio.value = data.dataInizio || '';
  form.elements.canoneAnnuale.value = data.canoneAnnuale || '';
  form.elements.giornoPagamento.value = data.giornoPagamento || '';
  updateContractDerivedValues();
}

async function applyInitialContext() {
  const draftImmobile = draft?.immobileId;
  const draftTenant = draft?.inquilinoId;

  const validQueryImmobile = queryImmobileId
    && prerequisites.immobili.some((item) => item.id === queryImmobileId);
  const validQueryTenant = queryTenantId
    && prerequisites.inquilini.some((item) => item.id === queryTenantId);

  lockedImmobile = Boolean(queryHasImmobile && validQueryImmobile);
  lockedTenant = Boolean(queryHasTenant && validQueryTenant);

  if (queryHasImmobile) {
    immobileSelect.value = validQueryImmobile ? queryImmobileId : '';
    if (!validQueryImmobile) {
      document.querySelector('#immobileId-error').textContent =
        'L’immobile indicato non è disponibile per il tuo account.';
    }
  } else if (draftImmobile
      && prerequisites.immobili.some((item) => item.id === draftImmobile)) {
    immobileSelect.value = draftImmobile;
  }

  if (queryHasTenant) {
    tenantSelect.value = validQueryTenant ? queryTenantId : '';
    if (!validQueryTenant) {
      document.querySelector('#inquilinoId-error').textContent =
        'L’inquilino indicato non è disponibile per il tuo account.';
    }
  } else if (draftTenant
      && prerequisites.inquilini.some((item) => item.id === draftTenant)) {
    tenantSelect.value = draftTenant;
  }

  restoreContractData(draft?.dati);
  renderImmobileDetail();
  renderTenantDetail();

  const immobile = selectedImmobile();
  const tenant = selectedTenant();

  let requestedStep = 0;

  if (!immobile || !hasCadastralData(immobile)) {
    showStep(1, false);
    if (immobile && !hasCadastralData(immobile)) openImmobileCompletion(immobile);
  } else {
    requestedStep = 1;

    if (!tenant || !hasCompleteTenant(tenant)) {
      showStep(2, false);
      if (tenant && !hasCompleteTenant(tenant)) openTenantCompletion(tenant);
    } else {
      requestedStep = 2;
      showStep(3, false);
    }
  }

  draft = await api('/api/contratti/bozza', {
    method: 'PUT',
    body: JSON.stringify({
      ...draftPayload(requestedStep),
      paginaProvenienza:
        (queryHasImmobile || queryHasTenant)
          ? (safeReferrerPath() || draft?.paginaProvenienza)
          : (draft?.paginaProvenienza || safeReferrerPath())
    })
  });

  syncControls();
}

function validateStep3(showErrors = true) {
  const errors = {};

  if (!selectedTipologia()) {
    errors.tipologiaId = 'Seleziona una tipologia.';
  }

  const date = form.elements.dataInizio;
  if (!date.value || !date.validity.valid) {
    errors.dataInizio = 'Inserisci una data iniziale valida.';
  } else if (!errors.tipologiaId && !previewDataFine()) {
    errors.dataInizio = 'La scadenza deve essere compresa entro il 31/12/9999.';
  }

  const annuale = form.elements.canoneAnnuale;
  if (!annuale.value || !annuale.validity.valid) {
    errors.canoneAnnuale =
      'Inserisci un importo tra 0,01 e 99.999.999,99 euro, con massimo 2 decimali.';
  }

  const giorno = form.elements.giornoPagamento;
  if (!giorno.value || !giorno.validity.valid) {
    errors.giornoPagamento = 'Inserisci un giorno intero tra 1 e 28.';
  }

  if (showErrors && Object.keys(errors).length) {
    showFormError(form, formMessage, {
      message: 'Controlla i campi indicati.',
      fields: errors
    });
  }

  return errors;
}

async function saveImmobileEditor() {
  clearContractErrors();

  const errors = {
    ...(immobileEditorMode === 'new' ? immobileAddress.validate() : {}),
    ...immobileCatasto.validate()
  };

  if (Object.keys(errors).length) {
    formMessage.textContent = 'Errore: controlla i campi dell’immobile.';
    if (immobileEditorMode === 'new') immobileAddress.focusFirstInvalid();
    immobileCatasto.focusFirstInvalid();
    return false;
  }

  formMessage.textContent = 'Salvataggio immobile in corso…';

  try {
    let saved;
    if (immobileEditorMode === 'new') {
      saved = await api('/api/immobili', {
        method: 'POST',
        body: JSON.stringify({
          ...immobileAddress.getData(),
          immagineUrl: '',
          datiCatastali: immobileCatasto.getData()
        })
      });
    } else {
      const immobile = selectedImmobile();
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
          datiCatastali: immobileCatasto.getData()
        })
      });
    }

    await refreshPrerequisites();
    immobileSelect.value = saved.id;
    immobileEditorMode = null;
    immobileEditor.hidden = true;
    immobileAddressSection.hidden = true;
    immobileAddress.setVisible(false);
    immobileCatasto.setVisible(false);
    renderImmobileDetail();
    return true;
  } catch (error) {
    if (error.name !== 'AbortError') showEmbeddedError(immobileEditor, error);
    return false;
  }
}

async function saveTenantEditor() {
  clearContractErrors();

  const errors = {
    ...tenantAnagrafica.validate(),
    ...tenantAddress.validate(),
    ...tenantDocument.validate()
  };

  if (Object.keys(errors).length) {
    formMessage.textContent = 'Errore: controlla i dati dell’inquilino.';
    tenantAnagrafica.focusFirstInvalid();
    tenantAddress.focusFirstInvalid();
    tenantDocument.focusFirstInvalid();
    return false;
  }

  formMessage.textContent = 'Salvataggio inquilino in corso…';

  try {
    const existing = tenantEditorMode === 'existing' ? selectedTenant() : null;
    const payload = {
      ...tenantAnagrafica.getData(),
      ...tenantAddress.getData(),
      ...tenantDocument.getData(),
      immagineUrl: existing?.immagineUrl ?? ''
    };

    const saved = existing
      ? await api(`/api/inquilini/${encodeURIComponent(existing.id)}`, {
        method: 'PUT', body: JSON.stringify(payload)
      })
      : await api('/api/inquilini', {
        method: 'POST', body: JSON.stringify(payload)
      });

    await refreshPrerequisites();
    tenantSelect.value = saved.id;
    tenantEditorMode = null;
    tenantEditor.hidden = true;
    setTenantSection(tenantAnagraficaSection, tenantAnagrafica, false);
    setTenantSection(tenantAddressSection, tenantAddress, false);
    setTenantSection(tenantDocumentSection, tenantDocument, false);
    renderTenantDetail();
    return true;
  } catch (error) {
    if (error.name !== 'AbortError') showEmbeddedError(tenantEditor, error);
    return false;
  }
}

async function loadPage() {
  request?.abort();
  request = new AbortController();

  ready = false;
  busy = true;
  completed = false;
  retry.hidden = true;
  newContract.hidden = true;
  form.hidden = false;
  formMessage.textContent = 'Verifica della sessione in corso…';
  syncControls();

  try {
    await api('/api/auth/me');
    formMessage.textContent = 'Caricamento dati del contratto…';

    const [loadedPrerequisites, loadedDraft] = await Promise.all([
      api('/api/contratti/prerequisiti'),
      api('/api/contratti/bozza')
    ]);

    prerequisites = loadedPrerequisites;
    draft = loadedDraft;

    renderPrerequisites({ preserveSelection: false });
    await applyInitialContext();

    ready = true;
    busy = false;
    formMessage.textContent = '';
    syncControls();
  } catch (error) {
    if (error.name === 'AbortError') return;
    busy = false;
    ready = false;
    formMessage.textContent = `Errore: ${
      error instanceof TypeError
        ? 'Impossibile contattare il server.'
        : error.message
    }`;
    retry.hidden = false;
    syncControls();
  }
}

immobileSelect.addEventListener('change', () => {
  closeImmobileEditor();
  clearContractErrors();
  renderImmobileDetail();

  const immobile = selectedImmobile();
  if (immobile && !hasCadastralData(immobile)) openImmobileCompletion(immobile);
  syncControls();
});

tenantSelect.addEventListener('change', () => {
  closeTenantEditor();
  clearContractErrors();
  renderTenantDetail();

  const tenant = selectedTenant();
  if (tenant && !hasCompleteTenant(tenant)) openTenantCompletion(tenant);
  syncControls();
});

document.querySelector('#open-new-immobile').addEventListener('click', openNewImmobile);
document.querySelector('#open-new-immobile-empty').addEventListener('click', openNewImmobile);

document.querySelector('#open-new-tenant').addEventListener('click', openNewTenant);

form.addEventListener('input', (event) => {
  const field = event.target.closest('[name]');
  if (field) {
    field.removeAttribute('aria-invalid');
    const localError = field.closest('.field')?.querySelector('.field-error');
    if (localError) localError.textContent = '';
  }

  formMessage.textContent = '';
  updateContractDerivedValues();
  syncStepper();
});

form.addEventListener('change', () => {
  updateContractDerivedValues();
  syncStepper();
});

next.addEventListener('click', async () => {
  if (next.disabled || busy) return;
  clearContractErrors();

  busy = true;
  syncControls();

  try {
    if (step === 1) {
      if (immobileEditorMode) {
        const saved = await saveImmobileEditor();
        if (!saved) return;
      }

      const immobile = selectedImmobile();
      if (!immobile) {
        document.querySelector('#immobileId-error').textContent = 'Seleziona un immobile.';
        return;
      }
      if (!hasCadastralData(immobile)) {
        openImmobileCompletion(immobile);
        return;
      }

      await saveDraft(1);
      showStep(2);
      const tenant = selectedTenant();
      if (tenant && !hasCompleteTenant(tenant)) openTenantCompletion(tenant);
      return;
    }

    if (step === 2) {
      if (tenantEditorMode) {
        const saved = await saveTenantEditor();
        if (!saved) return;
      }

      const tenant = selectedTenant();
      if (!tenant) {
        document.querySelector('#inquilinoId-error').textContent = 'Seleziona un inquilino.';
        return;
      }
      if (!hasCompleteTenant(tenant)) {
        openTenantCompletion(tenant);
        return;
      }

      await saveDraft(2);
      showStep(3);
      return;
    }

    if (step === 3) {
      if (Object.keys(validateStep3(true)).length) return;
      await saveDraft(3);
      showStep(4);
    }
  } catch (error) {
    if (error.name !== 'AbortError') showFormError(form, formMessage, error);
  } finally {
    busy = false;
    syncControls();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !ready || completed || step !== 4 || event.submitter !== confirm) return;

  clearContractErrors();

  const immobile = selectedImmobile();
  const tenant = selectedTenant();

  if (!hasCadastralData(immobile)) {
    showStep(1);
    openImmobileCompletion(immobile);
    return;
  }
  if (!hasCompleteTenant(tenant)) {
    showStep(2);
    openTenantCompletion(tenant);
    return;
  }
  if (Object.keys(validateStep3(true)).length) {
    showStep(3, false);
    return;
  }

  busy = true;
  syncControls();
  formMessage.textContent = 'Registrazione contratto in corso…';

  try {
    const contract = await api('/api/contratti', {
      method: 'POST',
      body: JSON.stringify({
        immobileId: immobile.id,
        inquilinoId: tenant.id,
        ...contractStepData()
      })
    });

    completed = true;
    form.hidden = true;
    formMessage.textContent =
      `Contratto #${contract.id} registrato. Decorrenza dal ${
        formatDate(contract.dataInizio)
      } al ${formatDate(contract.dataFine)}.`;
    newContract.hidden = false;
    formMessage.focus();
    syncStepper();
  } catch (error) {
    if (error.name !== 'AbortError') {
      showFormError(form, formMessage, error);
    }
  } finally {
    busy = false;
    syncControls();
  }
});

cancelWizard.addEventListener('click', async () => {
  if (busy) return;

  busy = true;
  syncControls();
  formMessage.textContent = 'Eliminazione bozza…';

  try {
    const destination =
      draft?.paginaProvenienza || safeReferrerPath() || '/dashboard.html';

    await api('/api/contratti/bozza', { method: 'DELETE' });
    window.location.assign(destination);
  } catch (error) {
    if (error.name !== 'AbortError') {
      busy = false;
      formMessage.textContent = `Errore: ${error.message}`;
      syncControls();
    }
  }
});

newContract.addEventListener('click', () => {
  window.location.assign('/contratto.html');
});

document.querySelector('#contract-stepper').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-step-target]');
  if (!button || busy || completed) return;

  const target = Number(button.dataset.stepTarget);
  if (!Number.isInteger(target) || target < 1 || target > 4) return;
  if (!completedSteps()[target - 1]) return;

  clearContractErrors();
  try {
    busy = true;
    syncControls();
    await saveDraft(draft?.stepCompletato ?? 0);
    showStep(target);
  } catch (error) {
    if (error.name !== 'AbortError') formMessage.textContent = `Errore: ${error.message}`;
  } finally {
    busy = false;
    syncControls();
  }
});

retry.addEventListener('click', loadPage);
document.querySelector('#logout').addEventListener('click', logout);

window.addEventListener('pageshow', loadPage);
window.addEventListener('pagehide', () => {
  request?.abort();
});
