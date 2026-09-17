import { readToken, clearToken } from './common.js';
import {
  createIcon,
  createContractPreviewDialog,
  createTenantsDialog,
  createPaymentsDialog,
  paymentDescription
} from './dashboard-dialogs.js';

const content = document.querySelector('#protected-content');
const message = document.querySelector('#session-message');
const retry = document.querySelector('#retry');
const emptyState = document.querySelector('#empty-state');
const grid = document.querySelector('#immobili-grid');
const feedback = document.querySelector('#dashboard-feedback');

const contractPreviewDialog = createContractPreviewDialog(api);
const tenantsDialog = createTenantsDialog(api, (contractId) => {
  contractPreviewDialog.open(contractId);
});
const paymentsDialog = createPaymentsDialog(
  api,
  (payment) => {
    feedback.textContent = `Pagamento registrato: ${paymentDescription(payment)}.`;
  },
  (property) => {
    paymentsDialog.close();
    tenantsDialog.open(property);
  }
);

let request;

function logout() {
  tenantsDialog.close();
  paymentsDialog.close();
  contractPreviewDialog.close();
  request?.abort();
  content.hidden = true;
  try {
    clearToken();
  } finally {
    window.location.replace('/');
  }
}

async function api(path, signal, options = {}) {
  const token = readToken();
  if (!token) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }
  const response = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal
  });
  signal.throwIfAborted();
  if (response.status === 401) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }
  const data = response.status === 204 ? null : await response.json();
  signal.throwIfAborted();
  if (!response.ok) {
    throw Object.assign(
      new Error(data.error || 'Operazione non riuscita. Riprova.'),
      { status: response.status }
    );
  }
  return data;
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

  const edit = document.createElement('a');
  edit.className = 'icon-button property-card-edit';
  edit.href = `/immobile.html?id=${encodeURIComponent(immobile.id)}`;
  edit.setAttribute('aria-label', `Modifica ${title.textContent}`);
  edit.append(createIcon('edit'));
  media.append(edit);

  const address = document.createElement('p');
  address.className = 'property-card-address';
  const street = [immobile.indirizzo, immobile.civico].filter(Boolean).join(' ');
  const town = [immobile.cap, immobile.comune].filter(Boolean).join(' ');
  const locality = [town, immobile.provincia ? `(${immobile.provincia})` : ''].filter(Boolean).join(' ');
  address.textContent = [street, locality].filter(Boolean).join(', ') || 'Indirizzo non disponibile';

  const payments = document.createElement('div');
  payments.className = 'property-card-payments';
  const label = document.createElement('p');
  label.className = 'property-card-payments-label';
  label.textContent = 'Pagamenti';
  const status = document.createElement('span');
  status.className = 'property-card-payment-status';
  status.hidden = true;
  label.append(status);

  const actions = document.createElement('div');
  actions.className = 'property-card-actions';

  const payment = document.createElement('button');
  payment.type = 'button';
  payment.textContent = 'Registra pagamento';
  payment.addEventListener('click', () => paymentsDialog.open(immobile));

  const tenants = document.createElement('button');
  tenants.type = 'button';
  tenants.className = 'button-secondary';
  tenants.textContent = 'Gestisci inquilini';
  tenants.addEventListener('click', () => tenantsDialog.open(immobile));

  actions.append(payment, tenants);
  payments.append(label, actions);
  card.append(title, media, address, payments);
  return card;
}

function renderImmobili(immobili) {
  const cards = document.createDocumentFragment();
  for (const immobile of immobili) cards.append(createCard(immobile));
  grid.replaceChildren(cards);
  grid.hidden = immobili.length === 0;
  emptyState.hidden = immobili.length > 0;
  content.hidden = false;
}

async function loadDashboard() {
  tenantsDialog.close();
  paymentsDialog.close();
  contractPreviewDialog.close();
  request?.abort();
  feedback.textContent = '';

  const controller = new AbortController();
  request = controller;
  content.hidden = true;
  grid.replaceChildren();
  retry.hidden = true;
  message.textContent = 'Caricamento immobili…';

  try {
    const token = readToken();
    if (!token) return logout();

    const owner = await api('/api/auth/me', controller.signal);
    controller.signal.throwIfAborted();
    if (!owner?.nome || !owner?.cognome) {
      throw new Error('Dati del profilo non disponibili. Riprova.');
    }

    const immobili = await api('/api/immobili', controller.signal);
    controller.signal.throwIfAborted();
    if (!Array.isArray(immobili)) {
      throw new Error('Elenco immobili non disponibile. Riprova.');
    }

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
  tenantsDialog.close();
  paymentsDialog.close();
  contractPreviewDialog.close();
  request?.abort();
  content.hidden = true;
});
