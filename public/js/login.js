import { readToken, saveToken, postForm, clearFieldErrors, showFormError } from './common.js';

if (readToken()) {
  window.location.replace('/dashboard.html');
} else {
  const form = document.querySelector('#login-form');
  const message = document.querySelector('#form-message');
  const button = form.querySelector('button');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    message.textContent = 'Accesso in corso…';
    try {
      const data = await postForm('/api/auth/login', form);
      if (typeof data.token !== 'string' || !data.token) throw new Error('Risposta del server non valida.');
      try {
        saveToken(data.token);
      } catch {
        throw new Error('Consenti la memorizzazione dei dati nel browser per accedere.');
      }
      message.textContent = 'Accesso riuscito. Apertura area riservata…';
      window.location.replace('/dashboard.html');
    } catch (error) {
      showFormError(form, message, error);
    } finally {
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}
