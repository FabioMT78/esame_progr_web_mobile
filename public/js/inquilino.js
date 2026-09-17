import { readToken, clearToken, clearFieldErrors, showFormError, readIdParameter } from './common.js';
import { createAnagraficaForm } from './components/anagrafica-form.js';
import { createIndirizzoForm } from './components/indirizzo-form.js';
import { createDocumentoIdentitaForm } from './components/documento-identita-form.js';

const content = document.querySelector('#protected-content');
const sessionMessage = document.querySelector('#session-message');
const retry = document.querySelector('#retry');
const form = document.querySelector('#tenant-form');
const fields = document.querySelector('#tenant-fields');
const formMessage = document.querySelector('#form-message');
const warning = document.querySelector('#prerequisite-warning');
const cancel = document.querySelector('#cancel-tenant');
const imageInput = document.querySelector('#immagineUrl');
const immobileContext = readIdParameter('immobileId');

const anagrafica = createAnagraficaForm({
  container: document.querySelector('#anagrafica-fields'),
  datiObbligatori: true
});

const indirizzo = createIndirizzoForm({
  container: document.querySelector('#indirizzo-fields'),
  datiObbligatori: false,
  mostraTitolo: false
});

const documento = createDocumentoIdentitaForm({
  container: document.querySelector('#documento-fields'),
  datiObbligatori: false
});

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
    ...options,
    cache: 'no-store',
    signal: request.signal,
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
      status: response.status,
      fields: data.fields
    });
  }
  return data;
}

function syncControls() {
  fields.disabled = busy || !editorReady || (editId === null && !hasImmobili);
  retry.disabled = busy;
  cancel.disabled = busy;
  form.setAttribute('aria-busy', String(busy));
}

function clearImageError() {
  imageInput.removeAttribute('aria-invalid');
  document.querySelector('#immagineUrl-error').textContent = '';
}

function validateImageUrl() {
  clearImageError();
  const value = imageInput.value.trim();
  if (!value) return {};

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || value.length > 500) {
      throw new Error('URL non valido');
    }
    return {};
  } catch {
    const message = 'Inserisci un URL http o https valido, di massimo 500 caratteri.';
    imageInput.setAttribute('aria-invalid', 'true');
    document.querySelector('#immagineUrl-error').textContent = message;
    return { immagineUrl: message };
  }
}

function clearFormState() {
  form.reset();
  anagrafica.clear();
  indirizzo.clear();
  documento.clear();
  imageInput.value = '';
  clearFieldErrors(form);
  clearImageError();
  formMessage.textContent = '';
}

function fillEditor(tenant) {
  anagrafica.setData(tenant);
  indirizzo.setData(tenant);
  documento.setData(tenant);
  imageInput.value = tenant.immagineUrl ?? '';
}

function buildPayload() {
  return {
    ...anagrafica.getData(),
    ...indirizzo.getData(),
    ...documento.getData(),
    immagineUrl: imageInput.value.trim()
  };
}

function validateForm() {
  clearFieldErrors(form);
  const errors = {
    ...anagrafica.validate(),
    ...indirizzo.validate(),
    ...documento.validate(),
    ...validateImageUrl()
  };

  if (!Object.keys(errors).length) return true;
  showFormError(form, formMessage, {
    message: 'Controlla i campi indicati.',
    fields: errors
  });
  return false;
}

async function loadPrerequisites() {
  hasImmobili = false;
  syncControls();
  const data = await api('/api/inquilini/prerequisiti');
  hasImmobili = data.hasImmobili === true;
  warning.hidden = hasImmobili;
  syncControls();
}

async function loadEditor() {
  document.querySelector('#form-title').textContent = editId !== null ? 'Modifica inquilino' : 'Nuovo inquilino';
  document.querySelector('#save').textContent = editId !== null ? 'Salva modifiche' : 'Crea inquilino';
  document.title = `${editId !== null ? 'Modifica inquilino' : 'Nuovo inquilino'} — Gestionale Affitti`;

  editorReady = false;
  syncControls();
  clearFormState();

  if (editId !== null) {
    if (!/^[1-9]\d*$/.test(editId)) throw new Error('Inquilino non trovato.');
    const tenant = await api(`/api/inquilini/${encodeURIComponent(editId)}`);
    fillEditor(tenant);
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

    const results = await Promise.allSettled([loadPrerequisites(), loadEditor()]);
    if (controller.signal.aborted) return;

    const errors = results.filter((result) => result.status === 'rejected');
    if (results[1].status === 'rejected') showFormError(form, formMessage, results[1].reason);
    sessionMessage.textContent = errors.length
      ? 'Alcuni dati non sono disponibili. Riprova caricamento.'
      : '';
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

form.addEventListener('input', (event) => {
  formMessage.textContent = '';
  const field = event.target.closest('[name]');
  if (!field) return;
  field.removeAttribute('aria-invalid');
  const error = document.getElementById(`${field.name}-error`);
  if (error) error.textContent = '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (fields.disabled || busy || !validateForm()) return;

  const input = buildPayload();
  const creating = editId === null;
  busy = true;
  syncControls();
  formMessage.textContent = 'Salvataggio in corso…';

  try {
    const tenant = await api(
      creating ? '/api/inquilini' : `/api/inquilini/${encodeURIComponent(editId)}`,
      { method: creating ? 'POST' : 'PUT', body: JSON.stringify(input) }
    );

    if (creating && immobileContext) {
      const params = new URLSearchParams({ immobileId: immobileContext, inquilinoId: tenant.id });
      window.location.assign(`/contratto.html?${params}`);
      return;
    }

    if (creating) clearFormState();
    else fillEditor(tenant);

    formMessage.textContent = creating ? 'Inquilino creato.' : 'Modifiche salvate.';
    formMessage.focus();
  } catch (error) {
    if (request.signal.aborted) return;
    showFormError(form, formMessage, error);
    if (creating && error.status === 409) {
      await loadPrerequisites().catch(() => { retry.hidden = false; });
    }
  } finally {
    busy = false;
    syncControls();
  }
});

cancel.addEventListener('click', () => {
  if (busy) return;
  clearFormState();

  let previousIsSafe = false;
  try {
    if (document.referrer) {
      const previous = new URL(document.referrer);
      previousIsSafe = previous.origin === window.location.origin
        && previous.pathname !== '/'
        && previous.pathname !== '/index.html';
    }
  } catch {
    previousIsSafe = false;
  }

  if (previousIsSafe && window.history.length > 1) window.history.back();
  else window.location.assign('/dashboard.html');
});

document.querySelector('#logout').addEventListener('click', logout);
retry.addEventListener('click', loadPage);
window.addEventListener('pageshow', loadPage);
window.addEventListener('pagehide', () => {
  request?.abort();
  content.hidden = true;
});
