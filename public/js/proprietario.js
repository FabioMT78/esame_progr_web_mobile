import { postForm, clearFieldErrors, showFormError } from './common.js';

const form = document.querySelector('#register-form');
const message = document.querySelector('#form-message');
const button = form.querySelector('button');
const iban = form.elements.iban;

function normalizeIban(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

iban.addEventListener('input', () => {
  const normalized = normalizeIban(iban.value);
  if (iban.value !== normalized) iban.value = normalized;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFieldErrors(form);

  iban.value = normalizeIban(iban.value);
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
