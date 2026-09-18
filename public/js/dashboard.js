import { clearToken } from './common.js';
import { createAuthenticatedApi } from './api.js';
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
    if (activePaymentImmobileId && request?.signal && !request.signal.aborted) {
      refreshPaymentStatus(activePaymentImmobileId, request.signal);
    }
  },
  (property) => {
    paymentsDialog.close();
    tenantsDialog.open(property);
  }
);

let request;
let activePaymentImmobileId = null;
let contractsByImmobile = new Map();
const paymentStatusElements = new Map();

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

const requestApi = createAuthenticatedApi({
  onUnauthorized: logout,
  getSignal: () => request?.signal,
  defaultErrorMessage: 'Operazione non riuscita. Riprova.'
});

function api(path, signal, options = {}) {
  return requestApi(path, { ...options, signal });
}

function groupContractsByImmobile(contracts) {
  const grouped = new Map();

  for (const contract of contracts) {
    const immobileId = contract?.immobile?.id;
    if (!immobileId) continue;

    if (!grouped.has(immobileId)) grouped.set(immobileId, []);
    grouped.get(immobileId).push(contract);
  }

  return grouped;
}

function setPaymentStatus(status, hasPendingPayments) {
  status.hidden = false;
  status.textContent = hasPendingPayments ? '✕' : '✓';
  status.style.color = hasPendingPayments ? '#b42318' : '#1f7a3f';
  status.style.fontSize = '1.2rem';
  status.style.fontWeight = '700';
  status.style.lineHeight = '1';

  const description = hasPendingPayments
    ? 'Non tutti gli inquilini sono in regola con i pagamenti.'
    : 'Tutti gli inquilini sono in regola con i pagamenti.';

  status.setAttribute('role', 'img');
  status.setAttribute('aria-label', description);
  status.title = description;
}

async function refreshPaymentStatus(immobileId, signal) {
  const status = paymentStatusElements.get(immobileId);
  const contracts = contractsByImmobile.get(immobileId) || [];

  if (!status || !contracts.length || signal.aborted) return;

  status.hidden = true;
  status.textContent = '';
  status.removeAttribute('role');
  status.removeAttribute('aria-label');
  status.removeAttribute('title');

  const params = new URLSearchParams({ immobileId });

  try {
    const paymentStatus = await api(`/api/pagamenti/stato?${params}`, signal);
    signal.throwIfAborted();
    setPaymentStatus(status, paymentStatus.hasPendingPayments);
  } catch (error) {
    if (signal.aborted || error.name === 'AbortError') return;

    // In caso di errore non mostriamo uno stato potenzialmente falso.
    status.hidden = true;
    status.textContent = '';
    status.title = 'Stato pagamenti non disponibile.';
  }
}

function createCard(immobile) {
  const card = document.createElement('article');
  card.className = 'property-card';

  const title = document.createElement('h2');
  title.textContent = immobile.titolo || 'Immobile';

  const media = document.createElement('div');
  media.className = 'property-card-media';

  const image = document.createElement('img');
  if (immobile.immagineUrl) {
    image.alt = `Immobile ${title.textContent}`;
    image.decoding = 'async';
    image.addEventListener('load', () => {
      image.hidden = false;
    }, { once: true });
    image.addEventListener('error', () => {
      image.remove();
    }, { once: true });
    image.src = immobile.immagineUrl;
  } else {
    image.src = '/assets/img/segnaposto_immobile.jpg';
  }
  media.append(image);

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

  const propertyContracts = contractsByImmobile.get(immobile.id) || [];
  label.style.visibility = propertyContracts.length ? 'visible' : 'hidden';

  const status = document.createElement('span');
  status.className = 'property-card-payment-status';
  status.hidden = true;
  label.append(status);

  if (propertyContracts.length) {
    paymentStatusElements.set(immobile.id, status);
  }

  const actions = document.createElement('div');
  actions.className = 'property-card-actions';

  const payment = document.createElement('button');
  payment.type = 'button';
  payment.textContent = 'Registra pagamento';
  payment.addEventListener('click', () => {
    activePaymentImmobileId = immobile.id;
    paymentsDialog.open(immobile);
  });

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

function renderImmobili(immobili, contracts, signal) {
  contractsByImmobile = groupContractsByImmobile(contracts);
  paymentStatusElements.clear();

  const cards = document.createDocumentFragment();
  for (const immobile of immobili) cards.append(createCard(immobile));
  grid.replaceChildren(cards);
  grid.hidden = immobili.length === 0;
  emptyState.hidden = immobili.length > 0;
  content.hidden = false;

  for (const immobile of immobili) {
    if ((contractsByImmobile.get(immobile.id) || []).length) {
      refreshPaymentStatus(immobile.id, signal);
    }
  }
}

async function loadDashboard() {
  tenantsDialog.close();
  paymentsDialog.close();
  contractPreviewDialog.close();
  request?.abort();
  feedback.textContent = '';
  activePaymentImmobileId = null;
  contractsByImmobile = new Map();
  paymentStatusElements.clear();

  const controller = new AbortController();
  request = controller;
  content.hidden = true;
  grid.replaceChildren();
  retry.hidden = true;
  message.textContent = 'Caricamento immobili…';

  try {
    const owner = await api('/api/auth/me', controller.signal);
    controller.signal.throwIfAborted();
    if (!owner?.nome || !owner?.cognome) {
      throw new Error('Dati del profilo non disponibili. Riprova.');
    }

    const [immobili, contracts] = await Promise.all([
      api('/api/immobili', controller.signal),
      api('/api/contratti', controller.signal)
    ]);
    controller.signal.throwIfAborted();

    if (!Array.isArray(immobili)) {
      throw new Error('Elenco immobili non disponibile. Riprova.');
    }
    if (!Array.isArray(contracts)) {
      throw new Error('Elenco contratti non disponibile. Riprova.');
    }

    renderImmobili(immobili, contracts, controller.signal);
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
