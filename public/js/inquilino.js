import { readToken, clearToken, clearFieldErrors, showFormError, readIdParameter } from './common.js';

const content = document.querySelector('#protected-content');
const sessionMessage = document.querySelector('#session-message');
const retry = document.querySelector('#retry');
const form = document.querySelector('#tenant-form');
const fields = document.querySelector('#tenant-fields');
const formMessage = document.querySelector('#form-message');
const warning = document.querySelector('#prerequisite-warning');
const cancel = document.querySelector('#cancel-tenant');
const dataNascita = form.elements.dataNascita;
const dataRilascioDocumento = form.elements.dataRilascioDocumento;
const dataScadenzaDocumento = form.elements.dataScadenzaDocumento;
const immobileContext = readIdParameter('immobileId');
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

function syncDateLimits() {
  const today = new Date().toISOString().slice(0, 10);
  dataNascita.max = today;
  dataRilascioDocumento.max = today;
  dataScadenzaDocumento.min = dataRilascioDocumento.value || '1000-01-01';
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
  editorReady = false;
  syncControls();

  if (editId !== null) {
    if (!/^[1-9]\d*$/.test(editId)) throw new Error('Inquilino non trovato.');
    const tenant = await api(`/api/inquilini/${encodeURIComponent(editId)}`);
    for (const element of form.querySelectorAll('input[name], select[name]')) {
      element.value = tenant[element.name] ?? '';
    }
  }

  syncDateLimits();
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
    if (results[1].status === 'rejected') {
      showFormError(form, formMessage, results[1].reason);
    }
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

function clientValidationError() {
  const validationFields = {};
  const cap = form.elements.cap.value.trim();
  const provincia = form.elements.provincia.value.trim().toUpperCase();
  const rilascio = dataRilascioDocumento.value;
  const scadenza = dataScadenzaDocumento.value;
  const today = new Date().toISOString().slice(0, 10);

  if (cap && !/^\d{5}$/.test(cap)) {
    validationFields.cap = 'Il CAP deve contenere esattamente 5 cifre.';
  }
  if (provincia && !/^[A-Z]{2}$/.test(provincia)) {
    validationFields.provincia = 'Inserisci la sigla della provincia di 2 lettere.';
  }
  if (dataNascita.value && dataNascita.value > today) {
    validationFields.dataNascita = 'La data di nascita non può essere futura.';
  }
  if (rilascio && rilascio > today) {
    validationFields.dataRilascioDocumento = 'La data di rilascio non può essere futura.';
  }
  if (rilascio && scadenza && scadenza < rilascio) {
    validationFields.dataScadenzaDocumento = 'La scadenza non può precedere la data di rilascio.';
  }

  return Object.keys(validationFields).length
    ? Object.assign(new Error('Controlla i campi indicati.'), { fields: validationFields })
    : null;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (fields.disabled || busy) return;

  clearFieldErrors(form);
  formMessage.textContent = '';

  if (!form.reportValidity()) return;
  const validationError = clientValidationError();
  if (validationError) {
    showFormError(form, formMessage, validationError);
    return;
  }

  form.elements.codiceFiscale.value = form.elements.codiceFiscale.value.trim().toUpperCase();
  form.elements.provincia.value = form.elements.provincia.value.trim().toUpperCase();
  form.elements.numeroDocumento.value = form.elements.numeroDocumento.value.trim().toUpperCase();

  const input = Object.fromEntries(new FormData(form));
  const creating = editId === null;
  busy = true;
  syncControls();
  formMessage.textContent = 'Salvataggio in corso…';

  try {
    const tenant = await api(creating ? '/api/inquilini' : `/api/inquilini/${encodeURIComponent(editId)}`, {
      method: creating ? 'POST' : 'PUT',
      body: JSON.stringify(input)
    });

    if (creating && immobileContext) {
      const params = new URLSearchParams({ immobileId: immobileContext, inquilinoId: tenant.id });
      window.location.assign(`/contratto.html?${params}`);
      return;
    }

    if (creating) {
      form.reset();
      syncDateLimits();
    }

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

dataRilascioDocumento.addEventListener('change', () => {
  syncDateLimits();
  if (dataScadenzaDocumento.value
      && dataScadenzaDocumento.value < dataRilascioDocumento.value) {
    dataScadenzaDocumento.value = '';
  }
});

cancel.addEventListener('click', () => {
  if (busy) return;
  form.reset();
  clearFieldErrors(form);
  formMessage.textContent = '';

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

  if (previousIsSafe && window.history.length > 1) {
    window.history.back();
  } else {
    window.location.assign('/dashboard.html');
  }
});

document.querySelector('#logout').addEventListener('click', logout);
retry.addEventListener('click', loadPage);
window.addEventListener('pageshow', loadPage);
window.addEventListener('pagehide', () => {
  request?.abort();
  content.hidden = true;
});
