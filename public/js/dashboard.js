import { readToken, clearToken } from './common.js';

const content = document.querySelector('#protected-content');
const message = document.querySelector('#session-message');
const retry = document.querySelector('#retry');
let request;

function logout() {
  request?.abort();
  content.hidden = true;
  try {
    clearToken();
  } finally {
    window.location.replace('/');
  }
}

async function loadProfile() {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  content.hidden = true;
  retry.hidden = true;
  message.textContent = 'Verifica della sessione in corso…';
  try {
    const token = readToken();
    if (!token) return logout();
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store', signal: controller.signal
    });
    if (response.status === 401) return logout();
    if (!response.ok) throw new Error('Servizio temporaneamente non disponibile. Riprova.');
    const owner = await response.json();
    if (!owner.nome || !owner.cognome) throw new Error('Dati del profilo non disponibili. Riprova.');
    document.querySelector('#welcome').textContent = `Benvenuto ${owner.nome} ${owner.cognome}`;
    content.hidden = false;
    message.textContent = 'Accesso autenticato.';
  } catch (error) {
    if (error.name === 'AbortError') return;
    message.textContent = 'Errore: impossibile caricare il profilo. Riprova o torna alla Home.';
    retry.hidden = false;
  }
}

document.querySelector('#logout').addEventListener('click', logout);
retry.addEventListener('click', loadProfile);
window.addEventListener('pageshow', loadProfile);
window.addEventListener('pagehide', () => {
  request?.abort();
  content.hidden = true;
});
