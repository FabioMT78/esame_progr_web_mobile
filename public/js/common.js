const tokenKey = 'gestionaleAffitti.jwt';
const flashKey = 'gestionaleAffitti.flash';
const messageTimers = new WeakMap();

export function readToken() {
  return sessionStorage.getItem(tokenKey);
}

export function saveToken(token) {
  sessionStorage.setItem(tokenKey, token);
}

export function clearToken() {
  sessionStorage.removeItem(tokenKey);
  sessionStorage.removeItem(flashKey);
}

export function saveFlashMessage(message) {
  const text = typeof message === 'string' ? message.trim() : '';

  if (!text) {
    sessionStorage.removeItem(flashKey);
    return;
  }

  sessionStorage.setItem(flashKey, text);
}

export function consumeFlashMessage() {
  const message = sessionStorage.getItem(flashKey);
  sessionStorage.removeItem(flashKey);
  return message;
}

export function showTransientMessage(element, message, duration = 3000) {
  if (!(element instanceof Element)) {
    throw new TypeError('Elemento notifica non valido.');
  }

  const previousTimer = messageTimers.get(element);
  if (previousTimer) window.clearTimeout(previousTimer);

  const text = typeof message === 'string' ? message : '';
  element.textContent = text;

  if (!text) {
    messageTimers.delete(element);
    return;
  }

  const timer = window.setTimeout(() => {
    if (element.textContent === text) element.textContent = '';
    messageTimers.delete(element);
  }, duration);

  messageTimers.set(element, timer);
}

export function clearFieldErrors(form) {
  form.querySelectorAll('[aria-invalid]').forEach(
    (field) => field.removeAttribute('aria-invalid')
  );
  form.querySelectorAll('.field-error').forEach(
    (element) => { element.textContent = ''; }
  );
}

export function showFormError(form, message, error) {
  message.textContent = `Errore: ${error?.networkError
    ? 'Impossibile contattare il server. Riprova tra poco.'
    : error.message}`;

  for (const [name, text] of Object.entries(error.fields || {})) {
    const field = form.elements.namedItem(name);
    const hint = document.getElementById(`${name}-error`);

    if (field && hint) {
      field.setAttribute('aria-invalid', 'true');
      hint.textContent = text;
    }
  }

  (form.querySelector('[aria-invalid]') || message).focus();
}

// Contesto di navigazione opzionale; l'appartenenza viene sempre verificata dalle API.
export function readIdParameter(name) {
  const values = new URLSearchParams(window.location.search).getAll(name);
  const id = values.length === 1 ? values[0] : null;

  return typeof id === 'string'
    && /^[1-9]\d{0,19}$/.test(id)
    && BigInt(id) <= 18446744073709551615n
    ? id
    : null;
}
