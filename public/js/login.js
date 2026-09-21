import {
  readToken,
  saveToken,
  clearFieldErrors,
  showFormError
} from './common.js';
import { requestJson } from './api.js';
import { startRedirectCountdown } from './components/redirect-countdown.js';

if (readToken()) {
  window.location.replace('/dashboard.html');
} else {
  await import('./proprietario.js');

  const loginDialog = document.querySelector('#login-dialog');
  const registerDialog = document.querySelector('#register-dialog');
  const openLoginButton = document.querySelector('#open-login');
  const openRegisterButton = document.querySelector('#open-register');
  const switchToLoginButton = document.querySelector('#switch-to-login');

  const form = document.querySelector('#login-form');
  const message = document.querySelector('#login-form-message');
  const submitButton = form.querySelector('button[type="submit"]');
  let cancelRedirectCountdown = null;

  function clearRedirectCountdown() {
    cancelRedirectCountdown?.();
    cancelRedirectCountdown = null;
  }

  function closeOtherDialog(dialog) {
    const other = dialog === loginDialog ? registerDialog : loginDialog;
    if (other.open) other.close();
  }

  function openDialog(dialog) {
    closeOtherDialog(dialog);

    if (!dialog.open) dialog.showModal();

    requestAnimationFrame(() => {
      dialog.querySelector('input, button:not([data-close])')?.focus();
    });
  }

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      button.closest('dialog')?.close();
    });
  });

  openLoginButton.addEventListener('click', () => {
    openDialog(loginDialog);
  });

  openRegisterButton.addEventListener('click', () => {
    openDialog(registerDialog);
  });

  switchToLoginButton.addEventListener('click', () => {
    registerDialog.close();
    openDialog(loginDialog);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    clearRedirectCountdown();
    clearFieldErrors(form);
    submitButton.disabled = true;
    form.setAttribute('aria-busy', 'true');
    message.textContent = 'Accesso in corso…';
    let redirecting = false;

    try {
      const data = await requestJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
        errorMessage: 'Accesso non riuscito.'
      });

      if (typeof data.token !== 'string' || !data.token) {
        throw new Error('Risposta del server non valida.');
      }

      try {
        saveToken(data.token);
      } catch {
        throw new Error(
          'Consenti la memorizzazione dei dati nel browser per accedere.'
        );
      }

      redirecting = true;
      cancelRedirectCountdown = startRedirectCountdown(
        message,
        'Accesso riuscito. Apertura area riservata…',
        () => window.location.replace('/dashboard.html')
      );
    } catch (error) {
      showFormError(form, message, error);
    } finally {
      if (!redirecting) {
        submitButton.disabled = false;
        form.removeAttribute('aria-busy');
      }
    }
  });

  const params = new URLSearchParams(window.location.search);
  const requestedDialog = params.get('dialog');

  if (requestedDialog === 'register') {
    openDialog(registerDialog);
  } else if (requestedDialog === 'login') {
    openDialog(loginDialog);
  }

  if (requestedDialog === 'register' || requestedDialog === 'login') {
    params.delete('dialog');

    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;

    window.history.replaceState(null, '', nextUrl);
  }

  window.addEventListener('pagehide', clearRedirectCountdown);
}
