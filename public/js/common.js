const tokenKey = 'gestionaleAffitti.jwt';

export function readToken() {
  return sessionStorage.getItem(tokenKey);
}

export function saveToken(token) {
  sessionStorage.setItem(tokenKey, token);
}

export function clearToken() {
  sessionStorage.removeItem(tokenKey);
}

export async function postForm(url, form) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(new FormData(form)))
  });
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Operazione non riuscita.'), { fields: data.fields });
  }
  return data;
}

export function clearFieldErrors(form) {
  form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error').forEach((element) => { element.textContent = ''; });
}

export function showFormError(form, message, error) {
  message.textContent = `Errore: ${error instanceof TypeError
    ? 'Impossibile contattare il server. Riprova tra poco.' : error.message}`;
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
  return typeof id === 'string' && /^[1-9]\d{0,19}$/.test(id)
    && BigInt(id) <= 18446744073709551615n ? id : null;
}
