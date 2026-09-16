import { readToken, clearToken, clearFieldErrors, showFormError } from './common.js';

const form = document.querySelector('#immobile-form');
const fields = document.querySelector('#form-fields');
const formMessage = document.querySelector('#form-message');
const content = document.querySelector('#protected-content');
const sessionMessage = document.querySelector('#session-message');
const sessionRetry = document.querySelector('#session-retry');
const detailRetry = document.querySelector('#detail-retry');
const cancelButton = document.querySelector('#cancel-immobile');

const generalFields = [
  'titolo', 'via', 'numeroCivico', 'cap', 'comune', 'provincia', 'immagineUrl'
];
const cadastralFields = [
  'codiceComunale', 'foglio', 'particella', 'subalterno',
  'zona', 'categoria', 'consistenza', 'rendita'
];

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
    ...options,
    cache: 'no-store',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 401) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }

  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Operazione non riuscita.'), {
      fields: data.fields,
      status: response.status
    });
  }
  return data;
}

function errorText(error) {
  return error instanceof TypeError
    ? 'Impossibile contattare il server. Riprova.'
    : error.message;
}

function setBusy(value) {
  busy = value;
  fields.disabled = value;
  content.querySelectorAll('button').forEach((button) => {
    button.disabled = value;
  });
  form.setAttribute('aria-busy', String(value));
}

function setMode(id) {
  editingId = id;
  const editing = id !== null;
  document.querySelector('#form-title').textContent = editing ? 'Modifica immobile' : 'Nuovo immobile';
  document.querySelector('#save').textContent = editing ? 'Salva modifiche' : 'Crea immobile';
  document.title = `${editing ? 'Modifica immobile' : 'Nuovo immobile'} — Gestionale Affitti`;
}

function clearFormState() {
  form.reset();
  clearFieldErrors(form);
  formMessage.textContent = '';
  detailRetry.hidden = true;
}

function fillDetail(immobile) {
  for (const name of generalFields) {
    form.elements.namedItem(name).value = immobile[name] ?? '';
  }

  const datiCatastali = immobile.datiCatastali || {};
  for (const name of cadastralFields) {
    form.elements.namedItem(name).value = datiCatastali[name] ?? '';
  }
}

function normalizedDecimal(value) {
  return String(value ?? '').trim().replace(',', '.');
}

function validateCadastralSection() {
  const values = Object.fromEntries(
    cadastralFields.map((name) => [name, form.elements.namedItem(name).value.trim()])
  );
  const hasAnyValue = Object.values(values).some(Boolean);
  if (!hasAnyValue) return {};

  const errors = {};
  for (const name of cadastralFields) {
    if (!values[name]) errors[name] = 'Completa questo campo oppure lascia vuota l’intera sezione catastale.';
  }

  for (const name of ['foglio', 'particella', 'subalterno', 'zona']) {
    if (values[name] && !/^\d+$/.test(values[name])) {
      errors[name] = 'Inserisci un numero intero non negativo.';
    }
  }

  if (values.consistenza) {
    const normalized = normalizedDecimal(values.consistenza);
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
      errors.consistenza = 'Inserisci un valore positivo con massimo 2 decimali.';
    }
  }

  if (values.rendita) {
    const normalized = normalizedDecimal(values.rendita);
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) < 0) {
      errors.rendita = 'Inserisci un importo non negativo con massimo 2 decimali.';
    }
  }

  return errors;
}

function buildPayload() {
  const data = {};
  for (const name of generalFields) {
    data[name] = form.elements.namedItem(name).value.trim();
  }

  const rawCatasto = Object.fromEntries(
    cadastralFields.map((name) => [name, form.elements.namedItem(name).value.trim()])
  );
  const hasCatasto = Object.values(rawCatasto).some(Boolean);

  data.datiCatastali = hasCatasto ? {
    codiceComunale: rawCatasto.codiceComunale,
    foglio: rawCatasto.foglio,
    particella: rawCatasto.particella,
    subalterno: rawCatasto.subalterno,
    zona: rawCatasto.zona,
    categoria: rawCatasto.categoria,
    consistenza: normalizedDecimal(rawCatasto.consistenza),
    rendita: normalizedDecimal(rawCatasto.rendita)
  } : null;

  return data;
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
    fillDetail(immobile);
    formMessage.textContent = 'Immobile caricato. Puoi modificare i dati.';
    return true;
  } catch (error) {
    if (error.name === 'AbortError') return false;
    formMessage.textContent = `Errore: ${errorText(error)}`;
    detailRetry.hidden = error.status === 404;
    return false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || fields.disabled) return;

  clearFieldErrors(form);
  const cadastralErrors = validateCadastralSection();
  if (Object.keys(cadastralErrors).length) {
    showFormError(form, formMessage, {
      message: 'Controlla i dati catastali indicati.',
      fields: cadastralErrors
    });
    return;
  }

  const data = buildPayload();
  setBusy(true);
  formMessage.textContent = 'Salvataggio in corso…';

  try {
    const updating = editingId !== null;
    await request(
      updating ? `/api/immobili/${encodeURIComponent(editingId)}` : '/api/immobili',
      {
        method: updating ? 'PUT' : 'POST',
        body: JSON.stringify(data)
      }
    );

    formMessage.textContent = updating
      ? 'Immobile aggiornato con successo.'
      : 'Immobile aggiunto con successo.';
    formMessage.focus();

    window.setTimeout(() => {
      window.location.assign('/dashboard.html');
    }, 3000);
  } catch (error) {
    if (error.name === 'AbortError') return;
    setBusy(false);
    showFormError(form, formMessage, error);
  }
});

cancelButton.addEventListener('click', () => {
  if (busy) return;
  clearFormState();
  window.location.assign('/dashboard.html');
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
    setBusy(false);
    fields.disabled = !editable;
  } catch (error) {
    if (error.name === 'AbortError') return;
    sessionMessage.textContent = `Errore: ${errorText(error)}`;
    sessionRetry.hidden = false;
  }
}

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
window.addEventListener('pagehide', () => {
  controller?.abort();
  content.hidden = true;
});
