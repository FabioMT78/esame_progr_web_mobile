import {
  readToken,
  clearToken,
  clearFieldErrors,
  showFormError
} from './common.js';
import { createAuthenticatedApi } from './api.js';
import { createAnagraficaForm } from './forms/anagrafica.js';

const editing = Boolean(readToken());

const form = document.querySelector('#owner-form');
const fields = document.querySelector('#owner-fields');
const message = document.querySelector('#form-message');
const sessionMessage = document.querySelector('#session-message');
const retry = document.querySelector('#retry');
const saveButton = document.querySelector('#save-owner');
const cancelLink = document.querySelector('#cancel-owner');
const loginLink = document.querySelector('#login-link');
const email = form.elements.email;
const password = form.elements.password;
const passwordRequired = document.querySelector('#password-required');
const passwordHint = document.querySelector('#password-hint');
const indirizzoResidenza = form.elements.indirizzoResidenza;
const comuneResidenza = form.elements.comuneResidenza;
const iban = form.elements.iban;
const immagineUrl = form.elements.immagineUrl;

const anagrafica = createAnagraficaForm({
  container: document.querySelector('#anagrafica-fields'),
  datiObbligatori: true
});

let controller;
let busy = false;

function logout() {
  controller?.abort();
  try {
    clearToken();
  } finally {
    window.location.replace('/');
  }
}

const api = createAuthenticatedApi({
  onUnauthorized: logout,
  getSignal: () => controller?.signal,
  defaultErrorMessage: 'Impossibile aggiornare il profilo.'
});

function normalizeIban(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function clearStandaloneError(field) {
  if (!field) return;
  field.removeAttribute('aria-invalid');
  const error = document.getElementById(`${field.name}-error`);
  if (error) error.textContent = '';
}

function setBusy(value) {
  busy = value;
  fields.disabled = value;
  retry.disabled = value;
  form.setAttribute('aria-busy', String(value));
}

function configureMode() {
  const title = document.querySelector('#owner-title');
  const intro = document.querySelector('#owner-intro');

  form.hidden = false;
  loginLink.hidden = true;

  if (editing) {
    document.title = 'Profilo — Gestionale Affitti';
    title.textContent = 'Profilo proprietario';
    intro.textContent = 'Aggiorna i dati del tuo profilo.';
    saveButton.textContent = 'Salva modifiche';
    cancelLink.textContent = 'Torna alla dashboard';
    cancelLink.href = '/dashboard.html';
    password.required = false;
    password.removeAttribute('aria-required');
    passwordRequired.hidden = true;
    passwordHint.textContent =
      'Lascia vuoto per mantenere la password attuale; altrimenti usa da 8 a 128 caratteri.';
  } else {
    document.title = 'Registrazione — Gestionale Affitti';
    title.textContent = 'Registrazione proprietario';
    intro.textContent = 'Crea il tuo account. Tutti i campi contrassegnati con * sono obbligatori.';
    saveButton.textContent = 'Crea account';
    cancelLink.textContent = 'Torna alla Home';
    cancelLink.href = '/';
    password.required = true;
    password.setAttribute('aria-required', 'true');
    passwordRequired.hidden = false;
    passwordHint.textContent = 'Da 8 a 128 caratteri.';
  }
}

function fillProfile(profile) {
  email.value = profile.email ?? '';
  password.value = '';
  anagrafica.setData(profile);
  indirizzoResidenza.value = profile.indirizzoResidenza ?? '';
  comuneResidenza.value = profile.comuneResidenza ?? '';
  iban.value = profile.iban ?? '';
  immagineUrl.value = profile.immagineUrl ?? '';
  clearFieldErrors(form);
}

function validateStandaloneFields() {
  const errors = {};
  const normalizedEmail = email.value.trim().toLowerCase();
  const normalizedIban = normalizeIban(iban.value);
  const image = immagineUrl.value.trim();

  email.value = normalizedEmail;
  iban.value = normalizedIban;
  immagineUrl.value = image;

  if (!normalizedEmail) {
    errors.email = 'Questo campo è obbligatorio.';
  } else if (
    normalizedEmail.length > 255
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    errors.email = 'Inserisci un indirizzo email valido.';
  }

  if (!editing && !password.value) {
    errors.password = 'Questo campo è obbligatorio.';
  } else if (
    password.value
    && (password.value.length < 8 || password.value.length > 128)
  ) {
    errors.password = 'La password deve contenere da 8 a 128 caratteri.';
  } else if (password.value && !password.value.trim()) {
    errors.password = 'La password non può contenere solo spazi.';
  }

  if (!indirizzoResidenza.value.trim()) {
    errors.indirizzoResidenza = 'Questo campo è obbligatorio.';
  } else if (indirizzoResidenza.value.trim().length > 255) {
    errors.indirizzoResidenza = 'Inserisci al massimo 255 caratteri.';
  }

  if (!comuneResidenza.value.trim()) {
    errors.comuneResidenza = 'Questo campo è obbligatorio.';
  } else if (comuneResidenza.value.trim().length > 100) {
    errors.comuneResidenza = 'Inserisci al massimo 100 caratteri.';
  }

  if (!normalizedIban) {
    errors.iban = 'Questo campo è obbligatorio.';
  } else if (
    normalizedIban.length < 15
    || normalizedIban.length > 34
    || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalizedIban)
  ) {
    errors.iban = 'Inserisci un IBAN valido, da 15 a 34 caratteri, senza spazi.';
  }

  if (image) {
    try {
      const url = new URL(image);
      if (!['http:', 'https:'].includes(url.protocol) || image.length > 500) {
        throw new Error('URL non valido');
      }
    } catch {
      errors.immagineUrl =
        'Inserisci un URL http o https valido, di massimo 500 caratteri.';
    }
  }

  return errors;
}

function validateForm() {
  clearFieldErrors(form);

  const errors = {
    ...anagrafica.validate({ showErrors: false }),
    ...validateStandaloneFields()
  };

  if (!Object.keys(errors).length) return true;

  showFormError(form, message, {
    message: 'Controlla i campi indicati.',
    fields: errors
  });
  return false;
}

function buildPayload() {
  return {
    email: email.value.trim().toLowerCase(),
    password: password.value,
    ...anagrafica.getData(),
    indirizzoResidenza: indirizzoResidenza.value.trim(),
    comuneResidenza: comuneResidenza.value.trim(),
    iban: normalizeIban(iban.value),
    immagineUrl: immagineUrl.value.trim()
  };
}

async function register(payload) {
  let response;

  try {
    response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    if (error instanceof TypeError) error.networkError = true;
    throw error;
  }

  const data = await response.json();

  if (!response.ok) {
    throw Object.assign(
      new Error(data.error || 'Registrazione non riuscita.'),
      {
        status: response.status,
        fields: data.fields
      }
    );
  }

  return data;
}

async function loadProfile() {
  const profile = await api('/api/auth/me');
  fillProfile(profile);
}

async function initialize() {
  controller?.abort();
  controller = new AbortController();

  configureMode();
  retry.hidden = true;
  message.textContent = '';
  sessionMessage.textContent = '';
  clearFieldErrors(form);

  if (!editing) {
    anagrafica.clear();
    setBusy(false);
    return;
  }

  setBusy(true);
  sessionMessage.textContent = 'Caricamento profilo…';

  try {
    await loadProfile();
    sessionMessage.textContent = '';
  } catch (error) {
    if (error.name === 'AbortError') return;
    sessionMessage.textContent = `Errore: ${
      error.networkError
        ? 'Impossibile contattare il server. Riprova.'
        : error.message
    }`;
    retry.hidden = false;
  } finally {
    if (!controller.signal.aborted) setBusy(false);
  }
}

form.addEventListener('input', (event) => {
  message.textContent = '';
  clearStandaloneError(event.target.closest('[name]'));

  if (event.target === iban) {
    const normalized = normalizeIban(iban.value);
    if (iban.value !== normalized) iban.value = normalized;
  }
});

form.addEventListener('change', (event) => {
  message.textContent = '';
  clearStandaloneError(event.target.closest('[name]'));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || fields.disabled || !validateForm()) return;

  setBusy(true);
  message.textContent = editing
    ? 'Salvataggio modifiche in corso…'
    : 'Registrazione in corso…';

  try {
    const payload = buildPayload();

    if (editing) {
      const profile = await api('/api/auth/me', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      fillProfile(profile);
      message.textContent = 'Profilo aggiornato con successo.';
      message.focus();
      return;
    }

    const result = await register(payload);
    form.reset();
    anagrafica.clear();
    form.hidden = true;
    loginLink.hidden = false;
    message.textContent = result.message;
    message.focus();
  } catch (error) {
    if (error.name === 'AbortError') return;

    if (error.networkError) {
      message.textContent = 'Errore: impossibile contattare il server. Riprova.';
      message.focus();
    } else {
      showFormError(form, message, error);
    }
  } finally {
    if (!controller?.signal.aborted) setBusy(false);
  }
});

retry.addEventListener('click', initialize);
document.querySelector('#logout')?.addEventListener('click', logout);

window.addEventListener('pageshow', initialize);
window.addEventListener('pagehide', () => controller?.abort());
