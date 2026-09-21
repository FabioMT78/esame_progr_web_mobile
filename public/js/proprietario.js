import {
  readToken,
  clearToken,
  clearFieldErrors,
  showFormError,
  saveFlashMessage,
  showTransientMessage
} from './common.js';
import { createAuthenticatedApi, requestJson } from './api.js';
import { createAnagraficaForm } from './forms/anagrafica.js';
import { createIndirizzoForm } from './forms/indirizzo.js';

const editing = Boolean(readToken());
const embeddedRegistration = Boolean(
  document.querySelector('#register-dialog')
);

if (!editing && !embeddedRegistration) {
  window.location.replace('/?dialog=register');
}

const form = document.querySelector('#owner-form');
const fields = document.querySelector('#owner-fields');
const message = document.querySelector('#form-message');
const sessionMessage = document.querySelector('#session-message');
const retry = document.querySelector('#retry');
const saveButton = document.querySelector('#save-owner');
const cancelLink = document.querySelector('#cancel-owner');
const loginLink = document.querySelector('#login-link');
const intro = document.querySelector('#owner-intro');
const email = form.elements.email;
const password = form.elements.password;
const confermaPassword = form.elements.confermaPassword;
const passwordRequired = document.querySelector('#password-required');
const confirmPasswordRequired = document.querySelector('#confirm-password-required');
const passwordHint = document.querySelector('#password-hint');
const iban = form.elements.iban;

const anagrafica = createAnagraficaForm({
  container: document.querySelector('#anagrafica-fields'),
  datiObbligatori: true
});

const residenza = createIndirizzoForm({
  container: document.querySelector('#residenza-fields'),
  datiObbligatori: true,
  mostraTitolo: false,
  campiInclusi: ['indirizzo', 'comune']
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

  form.hidden = false;
  loginLink.hidden = true;

  if (editing) {
    document.title = 'Profilo — Gestionale Affitti';
    title.textContent = 'Profilo proprietario';
    intro.hidden = true;
    saveButton.textContent = 'Salva modifiche';
    cancelLink.hidden = true;

    password.required = false;
    password.removeAttribute('aria-required');
    confermaPassword.required = false;
    confermaPassword.removeAttribute('aria-required');
    passwordRequired.hidden = true;
    confirmPasswordRequired.hidden = true;

    passwordHint.textContent =
      'Lascia vuoto per mantenere la password attuale; altrimenti usa da 8 a 128 caratteri.';
    return;
  }

  if (!embeddedRegistration) {
    document.title = 'Registrazione — Gestionale Affitti';
  }

  title.textContent = 'Registrazione proprietario';
  intro.hidden = false;
  intro.textContent =
    'Crea il tuo account. Tutti i campi contrassegnati con * sono obbligatori.';
  saveButton.textContent = 'Crea account';
  cancelLink.hidden = false;
  cancelLink.textContent = embeddedRegistration
    ? 'Annulla'
    : 'Torna alla Home';

  if (cancelLink instanceof HTMLAnchorElement) {
    cancelLink.href = '/';
  }

  password.required = true;
  password.setAttribute('aria-required', 'true');
  confermaPassword.required = true;
  confermaPassword.setAttribute('aria-required', 'true');
  passwordRequired.hidden = false;
  confirmPasswordRequired.hidden = false;
  passwordHint.textContent = 'Da 8 a 128 caratteri.';
}

function fillProfile(profile) {
  email.value = profile.email ?? '';
  password.value = '';
  confermaPassword.value = '';

  anagrafica.setData(profile);
  residenza.setData({
    indirizzo: profile.indirizzoResidenza ?? '',
    comune: profile.comuneResidenza ?? ''
  });

  iban.value = profile.iban ?? '';
  clearFieldErrors(form);
}

function validatePassword() {
  const errors = {};
  const value = password.value;
  const confirmation = confermaPassword.value;

  if (!editing && !value) {
    errors.password = 'Questo campo è obbligatorio.';
  } else if (value && (value.length < 8 || value.length > 128)) {
    errors.password = 'La password deve contenere da 8 a 128 caratteri.';
  } else if (value && !value.trim()) {
    errors.password = 'La password non può contenere solo spazi.';
  }

  if (!editing && !confirmation) {
    errors.confermaPassword = 'Conferma la password.';
  } else if (value && !confirmation) {
    errors.confermaPassword = 'Conferma la password.';
  } else if (!value && confirmation) {
    errors.password = 'Inserisci la nuova password da confermare.';
  } else if (value && confirmation && value !== confirmation) {
    errors.confermaPassword = 'Le password non coincidono.';
  }

  return errors;
}

function validateStandaloneFields() {
  const errors = {};
  const normalizedEmail = email.value.trim().toLowerCase();
  const normalizedIban = normalizeIban(iban.value);

  email.value = normalizedEmail;
  iban.value = normalizedIban;

  if (!normalizedEmail) {
    errors.email = 'Questo campo è obbligatorio.';
  } else if (
    normalizedEmail.length > 255
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    errors.email = 'Inserisci un indirizzo email valido.';
  }

  Object.assign(errors, validatePassword());

  if (!normalizedIban) {
    errors.iban = 'Questo campo è obbligatorio.';
  } else if (
    normalizedIban.length < 15
    || normalizedIban.length > 34
    || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalizedIban)
  ) {
    errors.iban =
      'Inserisci un IBAN valido, da 15 a 34 caratteri, senza spazi.';
  }

  return errors;
}

function validateForm() {
  clearFieldErrors(form);

  const errors = {
    ...anagrafica.validate({ showErrors: false }),
    ...residenza.validate({ showErrors: false }),
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
  const address = residenza.getData();

  return {
    email: email.value.trim().toLowerCase(),
    password: password.value,
    confermaPassword: confermaPassword.value,
    ...anagrafica.getData(),
    indirizzoResidenza: address.indirizzo,
    comuneResidenza: address.comune,
    iban: normalizeIban(iban.value)
  };
}

function mapServerErrors(error) {
  if (!error?.fields) return error;

  const mapped = { ...error.fields };

  if (mapped.indirizzoResidenza) {
    mapped.indirizzo = mapped.indirizzoResidenza;
    delete mapped.indirizzoResidenza;
  }

  if (mapped.comuneResidenza) {
    mapped.comune = mapped.comuneResidenza;
    delete mapped.comuneResidenza;
  }

  return Object.assign(error, { fields: mapped });
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
    residenza.clear();
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
      await api('/api/auth/me', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      saveFlashMessage('Profilo aggiornato con successo.');
      window.location.replace('/dashboard.html');
      return;
    }

    const result = await requestJson('/api/auth/register', {
      method: 'POST',
      signal: controller?.signal,
      body: JSON.stringify(payload),
      errorMessage: 'Registrazione non riuscita.'
    });

    form.reset();
    anagrafica.clear();
    residenza.clear();
    form.hidden = true;
    loginLink.hidden = false;
    showTransientMessage(message, result.message);
    message.focus();
  } catch (error) {
    if (error.name === 'AbortError') return;

    if (error.networkError) {
      message.textContent =
        'Errore: impossibile contattare il server. Riprova.';
      message.focus();
    } else {
      showFormError(form, message, mapServerErrors(error));
    }
  } finally {
    if (!controller?.signal.aborted) setBusy(false);
  }
});

retry.addEventListener('click', initialize);
document.querySelector('#logout')?.addEventListener('click', logout);

window.addEventListener('pageshow', initialize);
window.addEventListener('pagehide', () => controller?.abort());
