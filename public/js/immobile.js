import { readToken, clearToken, clearFieldErrors, showFormError } from './common.js';

const form = document.querySelector('#immobile-form');
const fields = document.querySelector('#form-fields');
const formMessage = document.querySelector('#form-message');
const listMessage = document.querySelector('#list-message');
const list = document.querySelector('#immobili-list');
const content = document.querySelector('#protected-content');
const sessionMessage = document.querySelector('#session-message');
const sessionRetry = document.querySelector('#session-retry');
const detailRetry = document.querySelector('#detail-retry');
const listRetry = document.querySelector('#list-retry');
let editingId = null;
let busy = false;
let controller;

function logout() {
  controller?.abort();
  content.hidden = true;
  try { clearToken(); } finally { window.location.replace('/'); }
}

async function request(path, options = {}) {
  const token = readToken();
  if (!token) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }
  const response = await fetch(path, {
    ...options, cache: 'no-store', signal: controller.signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  if (response.status === 401) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Operazione non riuscita.'), {
      fields: data.fields, status: response.status
    });
  }
  return data;
}

function errorText(error) {
  return error instanceof TypeError ? 'Impossibile contattare il server. Riprova.' : error.message;
}

function setBusy(value) {
  busy = value;
  fields.disabled = value;
  content.querySelectorAll('button').forEach((button) => { button.disabled = value; });
  form.setAttribute('aria-busy', String(value));
}

function setMode(id) {
  editingId = id;
  document.querySelector('#form-title').textContent = id ? 'Modifica immobile' : 'Nuovo immobile';
  document.querySelector('#save').textContent = id ? 'Salva modifiche' : 'Crea immobile';
}

function resetForm() {
  form.reset();
  clearFieldErrors(form);
  setMode(null);
  detailRetry.hidden = true;
  history.replaceState(null, '', '/immobile.html');
}

function renderList(immobili) {
  list.replaceChildren();
  for (const immobile of immobili) {
    const item = document.createElement('li');
    const title = document.createElement('h3');
    title.textContent = immobile.titolo;
    const address = document.createElement('p');
    address.textContent = `${immobile.via} ${immobile.numeroCivico}, ${immobile.cap} ${immobile.comune} (${immobile.provincia})`;
    const cadastral = document.createElement('p');
    cadastral.textContent = `Dati catastali: ${immobile.datiCatastali ? 'presenti' : 'non inseriti'}.`;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const edit = document.createElement('a');
    edit.href = `/immobile.html?id=${encodeURIComponent(immobile.id)}`;
    edit.textContent = 'Modifica';
    edit.setAttribute('aria-label', `Modifica ${immobile.titolo}`);
    edit.addEventListener('click', (event) => {
      if (busy) event.preventDefault();
    });
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.textContent = 'Archivia';
    archive.setAttribute('aria-label', `Archivia ${immobile.titolo}`);
    archive.disabled = busy;
    archive.addEventListener('click', () => archiveImmobile(immobile));
    actions.append(edit, archive);
    item.append(title, address, cadastral, actions);
    list.append(item);
  }
}

async function loadList() {
  listRetry.hidden = true;
  list.replaceChildren();
  listMessage.textContent = 'Caricamento immobili…';
  try {
    const immobili = await request('/api/immobili');
    renderList(immobili);
    listMessage.textContent = immobili.length ? `${immobili.length} ${immobili.length === 1 ? 'immobile attivo' : 'immobili attivi'}.`
      : 'Non hai ancora immobili attivi. Crea il primo immobile con il modulo qui sopra.';
  } catch (error) {
    if (error.name === 'AbortError') return;
    listMessage.textContent = `Errore nel caricamento dell’elenco: ${errorText(error)}`;
    listRetry.hidden = false;
  }
}

async function loadDetail() {
  detailRetry.hidden = true;
  clearFieldErrors(form);
  form.reset();
  const id = new URLSearchParams(window.location.search).get('id');
  setMode(id === null ? null : id);
  if (id === null) {
    formMessage.textContent = '';
    return true;
  }
  formMessage.textContent = 'Caricamento immobile…';
  try {
    const immobile = await request(`/api/immobili/${encodeURIComponent(id || '0')}`);
    for (const field of form.querySelectorAll('[name]')) {
      field.value = immobile[field.name] ?? '';
    }
    formMessage.textContent = 'Immobile caricato. Puoi modificare i dati.';
    return true;
  } catch (error) {
    if (error.name === 'AbortError') return false;
    formMessage.textContent = `Errore: ${errorText(error)}`;
    detailRetry.hidden = error.status === 404;
    return false;
  }
}

async function archiveImmobile(immobile) {
  if (busy || !window.confirm(`Archiviare “${immobile.titolo}”? Non sarà più nell’elenco degli immobili attivi.`)) return;
  const wasDisabled = fields.disabled;
  setBusy(true);
  formMessage.textContent = 'Archiviazione in corso…';
  let reset = false;
  try {
    await request(`/api/immobili/${encodeURIComponent(immobile.id)}`, { method: 'DELETE' });
    if (editingId === immobile.id) { resetForm(); reset = true; }
    formMessage.textContent = 'Immobile archiviato correttamente.';
    await loadList();
  } catch (error) {
    if (error.name === 'AbortError') return;
    formMessage.textContent = `Errore: ${errorText(error)}`;
  } finally {
    setBusy(false);
    fields.disabled = wasDisabled && !reset;
  }
  formMessage.focus();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || fields.disabled) return;
  const data = Object.fromEntries(new FormData(form));
  clearFieldErrors(form);
  setBusy(true);
  formMessage.textContent = 'Salvataggio in corso…';
  try {
    const updating = editingId !== null;
    await request(updating ? `/api/immobili/${encodeURIComponent(editingId)}` : '/api/immobili', {
      method: updating ? 'PUT' : 'POST', body: JSON.stringify(data)
    });
    resetForm();
    formMessage.textContent = updating ? 'Immobile aggiornato correttamente.' : 'Immobile creato correttamente.';
    await loadList();
    formMessage.focus();
  } catch (error) {
    if (error.name === 'AbortError') return;
    setBusy(false);
    showFormError(form, formMessage, error);
  } finally {
    setBusy(false);
  }
});

document.querySelector('#new-immobile').addEventListener('click', (event) => {
  event.preventDefault();
  if (busy) return;
  resetForm();
  fields.disabled = false;
  formMessage.textContent = '';
  form.elements.titolo.focus();
});

async function initialize() {
  controller?.abort();
  controller = new AbortController();
  content.hidden = true;
  sessionRetry.hidden = true;
  sessionMessage.textContent = 'Verifica della sessione in corso…';
  setBusy(true);
  try {
    await request('/api/auth/me');
    content.hidden = false;
    sessionMessage.textContent = '';
    const editable = await loadDetail();
    await loadList();
    setBusy(false);
    fields.disabled = !editable;
  } catch (error) {
    if (error.name === 'AbortError') return;
    sessionMessage.textContent = `Errore: ${errorText(error)}`;
    sessionRetry.hidden = false;
  }
}

listRetry.addEventListener('click', async () => {
  if (busy) return;
  const wasDisabled = fields.disabled;
  setBusy(true);
  await loadList();
  setBusy(false);
  fields.disabled = wasDisabled;
});
detailRetry.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  const editable = await loadDetail();
  setBusy(false);
  fields.disabled = !editable;
});
document.querySelector('#logout').addEventListener('click', logout);
sessionRetry.addEventListener('click', initialize);
window.addEventListener('pageshow', initialize);
window.addEventListener('pagehide', () => { controller?.abort(); content.hidden = true; });
