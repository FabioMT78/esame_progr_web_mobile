import {
  readToken,
  clearToken,
  clearFieldErrors,
  showFormError,
  readIdParameter
} from './common.js';
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
const immobileSelect = document.querySelector('#immobileId');
const tenantCreatedDialog = document.querySelector('#tenant-created-dialog');
const tenantCreatedDashboard = document.querySelector('#tenant-created-dashboard');
const tenantCreatedContract = document.querySelector('#tenant-created-contract');
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
let immobili = [];
let hasImmobili = false;
let lockedImmobile = false;
let editorReady = false;
let busy = false;
let request;
let createdTenantId = null;
let existingImageUrl = '';

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
    throw new Error('Accedi nuovamente.');
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      cache: 'no-store',
      signal: request.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw Object.assign(
      new Error('Impossibile contattare il server. Riprova caricamento.'),
      { networkError: true }
    );
  }

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
  const unavailable = busy || !editorReady || (editId === null && !hasImmobili);
  fields.disabled = unavailable;
  immobileSelect.disabled = unavailable || lockedImmobile;
  retry.disabled = busy;
  cancel.disabled = busy;
  form.setAttribute('aria-busy', String(busy));
}

function fillImmobileOptions() {
  const placeholder = new Option('Seleziona un immobile', '');
  immobileSelect.replaceChildren(placeholder);

  for (const immobile of immobili) {
    const street = [immobile.indirizzo, immobile.civico].filter(Boolean).join(' ');
    const label = [immobile.titolo, street, immobile.comune].filter(Boolean).join(' — ');
    immobileSelect.add(new Option(label, immobile.id));
  }
}

function clearImageError() {
  if (!imageInput) return;

  imageInput.removeAttribute('aria-invalid');
  const error = document.querySelector('#immagineUrl-error');
  if (error) error.textContent = '';
}

function validateImageUrl() {
  if (!imageInput) return {};

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
    const error = document.querySelector('#immagineUrl-error');
    if (error) error.textContent = message;
    return { immagineUrl: message };
  }
}

function validateImmobile() {
  const valid = immobili.some((immobile) => immobile.id === immobileSelect.value);
  if (valid) return {};

  const message = 'Seleziona un immobile.';
  immobileSelect.setAttribute('aria-invalid', 'true');
  document.querySelector('#immobileId-error').textContent = message;
  return { immobileId: message };
}

function clearFormState() {
  form.reset();
  anagrafica.clear();
  indirizzo.clear();
  documento.clear();
  existingImageUrl = '';
  if (imageInput) imageInput.value = '';
  clearFieldErrors(form);
  clearImageError();
  formMessage.textContent = '';
}

function fillEditor(tenant) {
  immobileSelect.value = tenant.immobileId ?? '';
  anagrafica.setData(tenant);
  indirizzo.setData(tenant);
  documento.setData(tenant);
  existingImageUrl = tenant.immagineUrl ?? '';
  if (imageInput) imageInput.value = existingImageUrl;
}

function buildPayload() {
  return {
    immobileId: immobileSelect.value,
    ...anagrafica.getData(),
    ...indirizzo.getData(),
    ...documento.getData(),
    immagineUrl: imageInput ? imageInput.value.trim() : existingImageUrl
  };
}

function validateForm() {
  clearFieldErrors(form);
  const errors = {
    ...validateImmobile(),
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
  immobili = Array.isArray(data.immobili) ? data.immobili : [];
  hasImmobili = data.hasImmobili === true && immobili.length > 0;
  fillImmobileOptions();
  warning.hidden = hasImmobili;
  syncControls();
}

async function loadEditor() {
  document.querySelector('#form-title').textContent =
    editId !== null ? 'Modifica inquilino' : 'Nuovo inquilino';
  document.querySelector('#save').textContent =
    editId !== null ? 'Salva modifiche' : 'Crea inquilino';
  document.title =
    `${editId !== null ? 'Modifica inquilino' : 'Nuovo inquilino'} — Gestionale Affitti`;

  editorReady = false;
  lockedImmobile = false;
  syncControls();
  clearFormState();

  if (editId !== null) {
    if (!/^[1-9]\d*$/.test(editId)) throw new Error('Inquilino non trovato.');
    const tenant = await api(`/api/inquilini/${encodeURIComponent(editId)}`);
    fillEditor(tenant);
  } else if (immobileContext && immobili.some((item) => item.id === immobileContext)) {
    immobileSelect.value = immobileContext;
    lockedImmobile = true;
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
  editorReady = false;
  syncControls();
  sessionMessage.textContent = 'Verifica della sessione in corso…';

  try {
    await api('/api/auth/me');
    content.hidden = false;
    formMessage.textContent = '';
    clearFieldErrors(form);

    await loadPrerequisites();
    await loadEditor();

    if (controller.signal.aborted) return;
    sessionMessage.textContent = '';
    retry.hidden = true;
  } catch (error) {
    if (controller.signal.aborted) return;
    sessionMessage.textContent = `Errore: ${
      error.networkError
        ? 'Impossibile contattare il server. Riprova caricamento.'
        : error.message
    }`;
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

form.addEventListener('change', (event) => {
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
      creating
        ? '/api/inquilini'
        : `/api/inquilini/${encodeURIComponent(editId)}`,
      {
        method: creating ? 'POST' : 'PUT',
        body: JSON.stringify(input)
      }
    );

    if (creating && lockedImmobile) {
      createdTenantId = String(tenant.id);
      clearFormState();
      tenantCreatedDialog.showModal();
      return;
    }

    if (creating) {
      clearFormState();
    } else {
      fillEditor(tenant);
    }

    formMessage.textContent = creating ? 'Inquilino creato.' : 'Modifiche salvate.';
    formMessage.focus();
  } catch (error) {
    if (request.signal.aborted) return;
    showFormError(form, formMessage, error);
    if (creating && error.status === 409) {
      await loadPrerequisites().catch(() => {
        retry.hidden = false;
      });
    }
  } finally {
    busy = false;
    syncControls();
  }
});

tenantCreatedDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
});

tenantCreatedDashboard.addEventListener('click', () => {
  window.location.replace('/dashboard.html');
});

tenantCreatedContract.addEventListener('click', () => {
  if (!immobileContext || !createdTenantId) return;

  const params = new URLSearchParams({
    immobileId: immobileContext,
    inquilinoId: createdTenantId
  });
  window.location.replace(`/contratto.html?${params}`);
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
  if (tenantCreatedDialog.open) tenantCreatedDialog.close();
  createdTenantId = null;
  content.hidden = true;
});
