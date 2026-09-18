import { postForm, clearFieldErrors, showFormError } from './common.js';

const form = document.querySelector('#register-form');
const message = document.querySelector('#form-message');
const button = form.querySelector('button');
const iban = form.elements.iban;
const dataNascita = form.elements.dataNascita;
const dataNascitaError = document.querySelector('#dataNascita-error');

function normalizeIban(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function adultBirthDateLimit() {
  const today = new Date();
  return new Date(Date.UTC(
    today.getUTCFullYear() - 18,
    today.getUTCMonth(),
    today.getUTCDate() - 1
  )).toISOString().slice(0, 10);
}

function validateBirthDate() {
  dataNascita.setCustomValidity('');
  dataNascitaError.textContent = '';

  if (dataNascita.value && dataNascita.value > adultBirthDateLimit()) {
    const error = 'il proprietario deve essere maggiorenne';
    dataNascita.setCustomValidity(error);
    dataNascitaError.textContent = error;
    return false;
  }
  return true;
}

iban.addEventListener('input', () => {
  const normalized = normalizeIban(iban.value);
  if (iban.value !== normalized) iban.value = normalized;
});

dataNascita.addEventListener('input', () => {
  dataNascita.setCustomValidity('');
  dataNascitaError.textContent = '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFieldErrors(form);

  iban.value = normalizeIban(iban.value);
  validateBirthDate();
  if (!form.reportValidity()) return;

  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  message.textContent = 'Registrazione in corso…';
  try {
    const data = await postForm('/api/auth/register', form);
    form.reset();
    form.hidden = true;
    message.textContent = data.message;
    document.querySelector('#login-link').hidden = false;
    message.focus();
  } catch (error) {
    showFormError(form, message, error);
  } finally {
    button.disabled = false;
    form.removeAttribute('aria-busy');
  }
});
