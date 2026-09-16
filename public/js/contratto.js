import { readToken, clearToken, clearFieldErrors, showFormError } from './common.js';

const content = document.querySelector('#protected-content');
const sessionMessage = document.querySelector('#session-message');
const retry = document.querySelector('#retry');
const form = document.querySelector('#contract-form');
const formMessage = document.querySelector('#form-message');
const steps = [...form.querySelectorAll('[data-step]')];
const next = document.querySelector('#next-step');
const previous = document.querySelector('#previous-step');
const confirm = document.querySelector('#confirm-contract');
const newContract = document.querySelector('#new-contract');
const list = document.querySelector('#contract-list');
const listMessage = document.querySelector('#list-message');
const retryList = document.querySelector('#retry-list');
const summary = document.querySelector('#contract-summary');
const fieldSteps = {
  immobileId: 1, inquilinoId: 2, tipologiaId: 3, dataInizio: 3, canoneAnnuale: 3, giornoPagamento: 3
};
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
let prerequisites = { immobili: [], inquilini: [], tipologie: [] };
let step = 1;
let ready = false;
let busy = false;
let completed = false;
let request;

function logout() {
  request?.abort();
  content.hidden = true;
  try { clearToken(); } finally { window.location.replace('/'); }
}

async function api(url, options = {}) {
  const token = readToken();
  if (!token) {
    logout();
    throw new Error('Accedi nuovamente.');
  }
  const response = await fetch(url, {
    ...options, cache: 'no-store', signal: request.signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  if (response.status === 401) {
    logout();
    throw new Error('Sessione scaduta. Accedi nuovamente.');
  }
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Operazione non riuscita.'), {
      status: response.status, fields: data.fields
    });
  }
  return data;
}

function selected(items, name) {
  return items.find((item) => item.id === form.elements.namedItem(name).value);
}

function immobileLabel(immobile) {
  return `${immobile.titolo} — ${immobile.via} ${immobile.numeroCivico}, ${immobile.comune}`;
}

function inquilinoLabel(inquilino) {
  return `${inquilino.nome} ${inquilino.cognome} — ${inquilino.codiceFiscale}`;
}

function hasDatiCatastali(immobile) {
  return typeof immobile?.datiCatastali === 'string' && Boolean(immobile.datiCatastali.trim());
}

// Solo anteprima: il POST invia la data iniziale, il server ricalcola la scadenza.
function previewDataFine() {
  const tipologia = selected(prerequisites.tipologie, 'tipologiaId');
  const value = form.elements.dataInizio.value;
  if (!tipologia || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1000
      || date.toISOString().slice(0, 10) !== value) return '';
  date.setUTCFullYear(date.getUTCFullYear() + tipologia.durata);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.getUTCFullYear() <= 9999 ? date.toISOString().slice(0, 10) : '';
}

function updateDetails() {
  const immobile = selected(prerequisites.immobili, 'immobileId');
  const inquilino = selected(prerequisites.inquilini, 'inquilinoId');
  const tipologia = selected(prerequisites.tipologie, 'tipologiaId');
  document.querySelector('#immobile-detail').textContent = immobile
    ? `${immobileLabel(immobile)}. Dati catastali: ${immobile.datiCatastali?.trim() || 'non presenti'}` : '';
  const missingCatasto = immobile && !hasDatiCatastali(immobile);
  document.querySelector('#immobileId-error').textContent = missingCatasto
    ? 'Completa i dati catastali dell’immobile prima di proseguire.' : '';
  if (missingCatasto) form.elements.immobileId.setAttribute('aria-invalid', 'true');
  else form.elements.immobileId.removeAttribute('aria-invalid');
  const edit = document.querySelector('#edit-immobile');
  edit.hidden = !missingCatasto;
  if (immobile) edit.href = `/immobile.html?id=${encodeURIComponent(immobile.id)}`;
  document.querySelector('#inquilino-detail').textContent = inquilino ? inquilinoLabel(inquilino) : '';
  document.querySelector('#tipologia-detail').textContent = tipologia
    ? `Durata: ${tipologia.durata} anni. Rinnovo previsto dalla tipologia: ${tipologia.rinnovo} anni.` : '';
  document.querySelector('#dataFine').value = previewDataFine();
  const canone = Number(form.elements.canoneAnnuale.value);
  document.querySelector('#canoneMensile').value = Number.isFinite(canone) && canone > 0
    ? (canone / 12).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  syncControls();
}

function syncControls() {
  const unavailable = busy || !ready || completed;
  for (const fieldset of steps) {
    const active = Number(fieldset.dataset.step) === step;
    fieldset.hidden = !active;
    fieldset.disabled = unavailable || !active;
  }
  previous.hidden = step === 1;
  previous.disabled = unavailable;
  next.hidden = step === 4;
  const noOptions = (step === 1 && !prerequisites.immobili.length)
    || (step === 2 && !prerequisites.inquilini.length)
    || (step === 3 && !prerequisites.tipologie.length);
  const immobile = selected(prerequisites.immobili, 'immobileId');
  next.disabled = unavailable || noOptions || (step === 1 && immobile && !hasDatiCatastali(immobile));
  confirm.hidden = step !== 4;
  confirm.disabled = unavailable;
  retry.disabled = busy;
  retryList.disabled = busy;
  newContract.disabled = busy;
  form.hidden = completed;
  newContract.hidden = !completed;
  form.setAttribute('aria-busy', String(busy));
  document.querySelectorAll('#contract-stepper li').forEach((item, index) => {
    if (index + 1 === step) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
}

function showStep(value, focus = true) {
  step = value;
  if (step === 4) renderSummary();
  syncControls();
  if (focus) document.querySelector(`#step${step}-title`).focus();
}

function fillSelect(name, items, label) {
  const select = form.elements.namedItem(name);
  const previousValue = select.value;
  // Conserva l'opzione vuota e i valori già scelti anche dopo un nuovo caricamento.
  select.replaceChildren(select.options[0]);
  for (const item of items) select.add(new Option(label(item), item.id));
  select.value = items.some((item) => item.id === previousValue) ? previousValue : '';
}

function renderPrerequisites(data) {
  prerequisites = data;
  fillSelect('immobileId', data.immobili, immobileLabel);
  fillSelect('inquilinoId', data.inquilini, inquilinoLabel);
  fillSelect('tipologiaId', data.tipologie, (item) => item.denominazione);
  for (const key of ['immobili', 'inquilini', 'tipologie']) {
    document.querySelector(`#${key}-empty`).hidden = data[key].length > 0;
  }
  updateDetails();
  if (step === 4) renderSummary();
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

function renderSummary() {
  summary.replaceChildren();
  const immobile = selected(prerequisites.immobili, 'immobileId');
  const inquilino = selected(prerequisites.inquilini, 'inquilinoId');
  const tipologia = selected(prerequisites.tipologie, 'tipologiaId');
  appendDetail(summary, 'Immobile', immobile ? immobileLabel(immobile) : 'Da selezionare');
  appendDetail(summary, 'Inquilino', inquilino ? inquilinoLabel(inquilino) : 'Da selezionare');
  appendDetail(summary, 'Tipologia', tipologia?.denominazione || 'Da selezionare');
  appendDetail(summary, 'Durata', tipologia ? `${tipologia.durata} anni` : '—');
  appendDetail(summary, 'Decorrenza', formatDate(form.elements.dataInizio.value));
  appendDetail(summary, 'Scadenza', formatDate(previewDataFine()));
  appendDetail(summary, 'Canone annuale', euro.format(Number(form.elements.canoneAnnuale.value)));
  appendDetail(summary, 'Canone mensile', euro.format(Number(form.elements.canoneAnnuale.value) / 12));
  appendDetail(summary, 'Giorno di pagamento', `${form.elements.giornoPagamento.value} di ogni mese`);
}

function validateStep(value) {
  const fields = {};
  if (value === 1) {
    const immobile = selected(prerequisites.immobili, 'immobileId');
    if (!immobile) fields.immobileId = 'Seleziona un immobile attivo.';
    else if (!hasDatiCatastali(immobile)) fields.immobileId = 'Completa prima i dati catastali dell’immobile.';
  }
  if (value === 2 && !selected(prerequisites.inquilini, 'inquilinoId')) {
    fields.inquilinoId = 'Seleziona un inquilino attivo.';
  }
  if (value === 3) {
    if (!selected(prerequisites.tipologie, 'tipologiaId')) fields.tipologiaId = 'Seleziona una tipologia.';
    if (!form.elements.dataInizio.value || !form.elements.dataInizio.validity.valid) {
      fields.dataInizio = 'Inserisci una data iniziale valida.';
    } else if (!fields.tipologiaId && !previewDataFine()) {
      fields.dataInizio = 'La scadenza deve essere compresa entro il 31/12/9999.';
    }
    const annuale = form.elements.canoneAnnuale;
    if (!annuale.value || !annuale.validity.valid) {
      fields.canoneAnnuale = 'Inserisci un importo tra 0,01 e 99.999.999,99 euro, con massimo 2 decimali.';
    }
    const giorno = form.elements.giornoPagamento;
    if (!giorno.value || !giorno.validity.valid) fields.giornoPagamento = 'Inserisci un giorno intero tra 1 e 28.';
  }
  return fields;
}

function displayError(error) {
  const firstStep = Object.keys(error.fields || {}).map((name) => fieldSteps[name]).find(Boolean);
  if (firstStep) showStep(firstStep, false);
  showFormError(form, formMessage, error);
}

function checkStep(value) {
  const fields = validateStep(value);
  if (!Object.keys(fields).length) return true;
  displayError({ message: 'Controlla i campi indicati.', fields });
  return false;
}

function renderList(contracts) {
  list.replaceChildren();
  for (const contract of contracts) {
    const item = document.createElement('li');
    const title = document.createElement('h3');
    title.textContent = `Contratto #${contract.id} — ${contract.immobile.titolo}`;
    const details = document.createElement('dl');
    details.className = 'contract-summary';
    appendDetail(details, 'Immobile', immobileLabel(contract.immobile));
    appendDetail(details, 'Inquilino', inquilinoLabel(contract.inquilino));
    appendDetail(details, 'Tipologia', contract.tipologia.denominazione);
    appendDetail(details, 'Decorrenza e scadenza', `${formatDate(contract.dataInizio)} – ${formatDate(contract.dataFine)}`);
    appendDetail(details, 'Canone annuale', euro.format(contract.canoneAnnuale));
    appendDetail(details, 'Canone mensile', euro.format(contract.canoneMensile));
    appendDetail(details, 'Giorno di pagamento', `${contract.giornoPagamento} di ogni mese`);
    item.append(title, details);
    list.append(item);
  }
  listMessage.textContent = contracts.length ? '' : 'Non hai ancora contratti registrati.';
  retryList.hidden = true;
}

async function loadList() {
  const controller = request;
  listMessage.textContent = 'Caricamento contratti…';
  retryList.hidden = true;
  try {
    const contracts = await api('/api/contratti');
    if (!controller.signal.aborted) renderList(contracts);
  } catch (error) {
    if (controller.signal.aborted) return;
    listMessage.textContent = 'Impossibile aggiornare l’elenco dei contratti. Riprova il caricamento.';
    retryList.hidden = false;
  }
}

async function loadPage() {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  busy = true;
  ready = false;
  content.hidden = true;
  list.replaceChildren();
  retry.hidden = true;
  syncControls();
  sessionMessage.textContent = 'Verifica della sessione in corso…';
  try {
    await api('/api/auth/me');
    if (controller.signal.aborted) return;
    content.hidden = false;
    sessionMessage.textContent = 'Caricamento immobili, inquilini e tipologie…';
    const results = await Promise.allSettled([api('/api/contratti/prerequisiti'), loadList()]);
    if (controller.signal.aborted) return;
    if (results[0].status === 'fulfilled') {
      ready = true;
      renderPrerequisites(results[0].value);
      sessionMessage.textContent = 'Accesso autenticato.';
    } else {
      sessionMessage.textContent = 'Impossibile caricare i dati necessari al contratto. Riprova caricamento.';
      retry.hidden = false;
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    sessionMessage.textContent = 'Impossibile verificare la sessione. Riprova caricamento.';
    retry.hidden = false;
  } finally {
    if (!controller.signal.aborted) {
      busy = false;
      syncControls();
    }
  }
}

next.addEventListener('click', () => {
  if (next.disabled) return;
  clearFieldErrors(form);
  formMessage.textContent = '';
  if (checkStep(step)) showStep(step + 1);
});
previous.addEventListener('click', () => {
  if (previous.disabled) return;
  clearFieldErrors(form);
  formMessage.textContent = '';
  showStep(step - 1);
  updateDetails();
});
form.addEventListener('input', () => {
  clearFieldErrors(form);
  formMessage.textContent = '';
  updateDetails();
});
form.addEventListener('change', updateDetails);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !ready || completed || step !== 4 || event.submitter !== confirm) return;
  clearFieldErrors(form);
  for (const value of [1, 2, 3]) {
    if (!checkStep(value)) return;
  }
  // Lista esplicita: nessuna dataFine o canoneMensile inviati al server.
  const input = {};
  for (const name of Object.keys(fieldSteps)) input[name] = form.elements.namedItem(name).value;
  const controller = request;
  busy = true;
  syncControls();
  formMessage.textContent = 'Registrazione in corso…';
  try {
    const contract = await api('/api/contratti', { method: 'POST', body: JSON.stringify(input) });
    if (controller.signal.aborted) return;
    completed = true;
    formMessage.textContent = `Contratto #${contract.id} registrato. Decorrenza dal ${formatDate(contract.dataInizio)} al ${formatDate(contract.dataFine)}.`;
    syncControls();
    formMessage.focus();
    // Un errore nell'aggiornamento dell'elenco non annulla una registrazione già riuscita.
    await loadList();
  } catch (error) {
    if (controller.signal.aborted) return;
    busy = false;
    syncControls();
    displayError(error);
    if ([404, 409].includes(error.status)) retry.hidden = false;
  } finally {
    if (!controller.signal.aborted) {
      busy = false;
      syncControls();
    }
  }
});

newContract.addEventListener('click', () => {
  form.reset();
  clearFieldErrors(form);
  formMessage.textContent = '';
  completed = false;
  updateDetails();
  showStep(1);
});
retryList.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  syncControls();
  await loadList();
  busy = false;
  syncControls();
});
document.querySelector('#logout').addEventListener('click', logout);
retry.addEventListener('click', loadPage);
window.addEventListener('pageshow', loadPage);
window.addEventListener('pagehide', () => {
  request?.abort();
  content.hidden = true;
});
