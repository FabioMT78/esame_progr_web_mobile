import { readToken, clearToken, clearFieldErrors, showFormError, readIdParameter } from './common.js';

const content = document.querySelector('#protected-content');
const sessionMessage = document.querySelector('#session-message');
const retry = document.querySelector('#retry');
const form = document.querySelector('#tenant-form');
const fields = document.querySelector('#tenant-fields');
const formMessage = document.querySelector('#form-message');
const listMessage = document.querySelector('#list-message');
const list = document.querySelector('#tenant-list');
const warning = document.querySelector('#prerequisite-warning');
const immobileContext = readIdParameter('immobileId');
const newTenantUrl = immobileContext
  ? `/inquilino.html?immobileId=${encodeURIComponent(immobileContext)}` : '/inquilino.html';
let editId = new URLSearchParams(window.location.search).get('id');
let hasImmobili = false;
let editorReady = false;
let busy = false;
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
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Operazione non riuscita.'), {
      status: response.status, fields: data.fields
    });
  }
  return data;
}

function syncControls() {
  fields.disabled = busy || !editorReady || (editId === null && !hasImmobili);
  list.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
  retry.disabled = busy;
  form.setAttribute('aria-busy', String(busy));
}

async function loadPrerequisites() {
  hasImmobili = false;
  syncControls();
  const data = await api('/api/inquilini/prerequisiti');
  hasImmobili = data.hasImmobili === true;
  warning.hidden = hasImmobili;
  syncControls();
}

function renderList(tenants) {
  list.replaceChildren();
  for (const tenant of tenants) {
    const item = document.createElement('li');
    const name = document.createElement('h3');
    name.textContent = `${tenant.nome} ${tenant.cognome}`;
    const details = document.createElement('p');
    details.textContent = `Codice fiscale: ${tenant.codiceFiscale} · Comune: ${tenant.comuneResidenza}`;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const edit = document.createElement('a');
    edit.href = `/inquilino.html?id=${encodeURIComponent(tenant.id)}`;
    edit.textContent = 'Modifica';
    edit.setAttribute('aria-label', `Modifica ${tenant.nome} ${tenant.cognome}`);
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.textContent = 'Archivia';
    archive.setAttribute('aria-label', `Archivia ${tenant.nome} ${tenant.cognome}`);
    archive.addEventListener('click', () => archiveTenant(tenant));
    actions.append(edit, archive);
    item.append(name, details, actions);
    list.append(item);
  }
  listMessage.textContent = tenants.length ? '' : 'Non hai ancora inquilini attivi.';
  syncControls();
}

async function loadList() {
  listMessage.textContent = 'Caricamento inquilini…';
  try {
    renderList(await api('/api/inquilini'));
  } catch (error) {
    listMessage.textContent = 'Impossibile aggiornare l’elenco. Riprova caricamento.';
    retry.hidden = false;
    throw error;
  }
}

async function loadEditor() {
  document.querySelector('#form-title').textContent = editId !== null ? 'Modifica inquilino' : 'Nuovo inquilino';
  document.querySelector('#save').textContent = editId !== null ? 'Salva modifiche' : 'Crea inquilino';
  document.querySelector('#new-tenant').hidden = editId === null;
  document.querySelector('#new-tenant').href = newTenantUrl;
  editorReady = false;
  syncControls();
  if (editId !== null) {
    if (!/^[1-9]\d*$/.test(editId)) throw new Error('Inquilino non trovato.');
    const tenant = await api(`/api/inquilini/${encodeURIComponent(editId)}`);
    for (const element of form.querySelectorAll('input[name]')) {
      element.value = tenant[element.name] ?? '';
    }
  }
  editorReady = true;
  syncControls();
}

async function loadPage() {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  content.hidden = true;
  retry.hidden = true;
  busy = true;
  syncControls();
  sessionMessage.textContent = 'Verifica della sessione in corso…';
  try {
    await api('/api/auth/me');
    content.hidden = false;
    formMessage.textContent = '';
    clearFieldErrors(form);
    const results = await Promise.allSettled([loadPrerequisites(), loadList(), loadEditor()]);
    if (controller.signal.aborted) return;
    const errors = results.filter((result) => result.status === 'rejected');
    if (results[2].status === 'rejected') showFormError(form, formMessage, results[2].reason);
    sessionMessage.textContent = errors.length
      ? 'Alcuni dati non sono disponibili. Riprova caricamento.' : 'Accesso autenticato.';
    retry.hidden = !errors.length;
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (fields.disabled || busy) return;
  const input = Object.fromEntries(new FormData(form));
  const creating = editId === null;
  clearFieldErrors(form);
  busy = true;
  syncControls();
  formMessage.textContent = 'Salvataggio in corso…';
  try {
    const tenant = await api(creating ? '/api/inquilini' : `/api/inquilini/${encodeURIComponent(editId)}`, {
      method: creating ? 'POST' : 'PUT', body: JSON.stringify(input)
    });
    if (creating && immobileContext) {
      const params = new URLSearchParams({ immobileId: immobileContext, inquilinoId: tenant.id });
      window.location.assign(`/contratto.html?${params}`);
      return;
    }
    if (creating) form.reset();
    else form.elements.codiceFiscale.value = tenant.codiceFiscale;
    formMessage.textContent = creating ? 'Inquilino creato.' : 'Modifiche salvate.';
    formMessage.focus();
    // A failed list refresh must not suggest that the completed save failed.
    await loadList().catch(() => {});
  } catch (error) {
    if (request.signal.aborted) return;
    busy = false;
    syncControls();
    showFormError(form, formMessage, error);
    if (creating && error.status === 409) {
      await loadPrerequisites().catch(() => { retry.hidden = false; });
    }
  } finally {
    busy = false;
    syncControls();
  }
});

async function archiveTenant(tenant) {
  if (busy || !window.confirm(`Archiviare ${tenant.nome} ${tenant.cognome}?`)) return;
  busy = true;
  syncControls();
  listMessage.textContent = 'Archiviazione in corso…';
  try {
    await api(`/api/inquilini/${encodeURIComponent(tenant.id)}`, { method: 'DELETE' });
    if (editId === tenant.id) {
      editId = null;
      window.history.replaceState(null, '', newTenantUrl);
      form.reset();
      clearFieldErrors(form);
      await loadEditor();
    }
    formMessage.textContent = 'Inquilino archiviato.';
    formMessage.focus();
    await loadList().catch(() => {});
  } catch (error) {
    if (request.signal.aborted) return;
    listMessage.textContent = `Errore: ${error instanceof TypeError ? 'Impossibile contattare il server.' : error.message}`;
    listMessage.focus();
  } finally {
    busy = false;
    syncControls();
  }
}

document.querySelector('#logout').addEventListener('click', logout);
retry.addEventListener('click', loadPage);
window.addEventListener('pageshow', loadPage);
window.addEventListener('pagehide', () => {
  request?.abort();
  content.hidden = true;
});
