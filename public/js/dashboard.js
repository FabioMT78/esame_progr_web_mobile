import { readToken, clearToken } from './common.js';

const content = document.querySelector('#protected-content');
const message = document.querySelector('#session-message');
const retry = document.querySelector('#retry');
const emptyState = document.querySelector('#empty-state');
const grid = document.querySelector('#immobili-grid');
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

async function getData(path, token, signal) {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store', signal
  });
  signal.throwIfAborted();
  if (response.status === 401) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }
  if (!response.ok) throw new Error('Servizio temporaneamente non disponibile. Riprova.');
  return response.json();
}

function createCard(immobile) {
  const card = document.createElement('article');
  card.className = 'property-card';

  const title = document.createElement('h2');
  title.textContent = immobile.titolo || 'Immobile';

  const media = document.createElement('div');
  media.className = 'property-card-media';
  const placeholder = document.createElement('p');
  placeholder.className = 'property-card-placeholder';
  placeholder.textContent = 'Nessuna immagine';
  media.append(placeholder);

  if (immobile.immagineUrl) {
    const image = document.createElement('img');
    image.alt = `Immobile ${title.textContent}`;
    image.decoding = 'async';
    image.hidden = true;
    image.addEventListener('load', () => {
      placeholder.hidden = true;
      image.hidden = false;
    }, { once: true });
    image.addEventListener('error', () => {
      image.remove();
      placeholder.hidden = false;
    }, { once: true });
    image.src = immobile.immagineUrl;
    media.append(image);
  }

  const address = document.createElement('p');
  address.className = 'property-card-address';
  const street = [immobile.via, immobile.numeroCivico].filter(Boolean).join(' ');
  const town = [immobile.cap, immobile.comune].filter(Boolean).join(' ');
  const locality = [town, immobile.provincia ? `(${immobile.provincia})` : ''].filter(Boolean).join(' ');
  address.textContent = [street, locality].filter(Boolean).join(', ') || 'Indirizzo non disponibile';

  card.append(title, media, address);
  return card;
}

function renderImmobili(immobili) {
  const cards = document.createDocumentFragment();
  for (const immobile of immobili) {
    cards.append(createCard(immobile));
  }
  grid.replaceChildren(cards);
  grid.hidden = immobili.length === 0;
  emptyState.hidden = immobili.length > 0;
  content.hidden = false;
}

async function loadDashboard() {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  content.hidden = true;
  grid.replaceChildren();
  retry.hidden = true;
  message.textContent = 'Caricamento immobili…';
  try {
    const token = readToken();
    if (!token) return logout();
    const owner = await getData('/api/auth/me', token, controller.signal);
    controller.signal.throwIfAborted();
    if (!owner?.nome || !owner?.cognome) throw new Error('Dati del profilo non disponibili. Riprova.');

    const immobili = await getData('/api/immobili', token, controller.signal);
    controller.signal.throwIfAborted();
    if (!Array.isArray(immobili)) throw new Error('Elenco immobili non disponibile. Riprova.');
    renderImmobili(immobili);
    message.textContent = '';
  } catch (error) {
    if (controller.signal.aborted || error.name === 'AbortError') return;
    message.textContent = `Errore: ${error instanceof TypeError
      ? 'Impossibile contattare il server. Riprova.'
      : 'Impossibile caricare la dashboard. Riprova.'}`;
    retry.hidden = false;
  }
}

document.querySelector('#logout').addEventListener('click', logout);
retry.addEventListener('click', loadDashboard);
window.addEventListener('pageshow', loadDashboard);
window.addEventListener('pagehide', () => {
  request?.abort();
  content.hidden = true;
});
