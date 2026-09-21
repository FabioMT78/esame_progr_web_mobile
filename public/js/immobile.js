import {
  clearToken,
  clearFieldErrors,
  showFormError,
  readIdParameter
} from './common.js';
import { createAuthenticatedApi } from './api.js';
import { createIndirizzoForm } from './forms/indirizzo.js';
import { createDatiCatastaliForm } from './forms/dati-catastali.js';
import { createImmagineForm } from './components/immagine-form.js';
import { createImageWorkerClient } from './components/image-worker-client.js';
import { startRedirectCountdown } from './components/redirect-countdown.js';

const form = document.querySelector('#immobile-form');
const fields = document.querySelector('#form-fields');
const formMessage = document.querySelector('#form-message');
const content = document.querySelector('#protected-content');
const sessionMessage = document.querySelector('#session-message');
const sessionRetry = document.querySelector('#session-retry');
const detailRetry = document.querySelector('#detail-retry');
const cancelButton = document.querySelector('#cancel-immobile');
const query = new URLSearchParams(window.location.search);
const editRequested = query.has('id');
const queryId = readIdParameter('id');

const indirizzo = createIndirizzoForm({
  container: document.querySelector('#indirizzo-fields'),
  titoloContainer: document.querySelector('#immobile-title-field'),
  datiObbligatori: true,
  mostraTitolo: true
});

const datiCatastali = createDatiCatastaliForm({
  container: document.querySelector('#dati-catastali-fields'),
  datiObbligatori: false
});

const immagine = createImmagineForm({
  input: document.querySelector('#imageFile'),
  preview: document.querySelector('#immobile-image-preview'),
  selectButton: document.querySelector('#select-image'),
  errorElement: document.querySelector('#imageFile-error'),
  placeholderSrc: '/assets/img/segnaposto_immobile.jpg',
  maxSize: 5 * 1024 * 1024,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  previewAlt: 'Anteprima foto immobile',
  placeholderAlt: 'Nessuna immagine disponibile'
});

let editingId = null;
let busy = false;
let controller;
let imageProcessor = null;
let cancelRedirectCountdown = null;

function releaseImageProcessor() {
  imageProcessor?.terminate();
  imageProcessor = null;
}

function clearRedirectCountdown() {
  cancelRedirectCountdown?.();
  cancelRedirectCountdown = null;
}

function startDashboardRedirect(messageText) {
  clearRedirectCountdown();
  cancelRedirectCountdown = startRedirectCountdown(
    formMessage,
    messageText,
    () => window.location.assign('/dashboard.html')
  );
}

function logout() {
  clearRedirectCountdown();
  controller?.abort();
  releaseImageProcessor();
  immagine.releasePreview();
  content.hidden = true;
  try { clearToken(); } finally { window.location.replace('/'); }
}

const api = createAuthenticatedApi({
  onUnauthorized: logout,
  getSignal: () => controller?.signal
});

async function uploadImage(immobileId, file) {
  return api(`/api/immobili/${encodeURIComponent(immobileId)}/immagine`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
    errorMessage: 'Impossibile caricare la foto.'
  });
}

async function uploadImagePreview(immobileId, blob) {
  return api(`/api/immobili/${encodeURIComponent(immobileId)}/immagine-preview`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/webp' },
    body: blob,
    errorMessage: 'Impossibile caricare la preview della foto.'
  });
}

async function optimizeImage(file) {
  releaseImageProcessor();
  imageProcessor = createImageWorkerClient();
  const processor = imageProcessor;

  try {
    return await processor.optimizeUpload(file, {
      maxDimension: 1600,
      quality: 0.82,
      previewMaxDimension: 160,
      previewQuality: 0.5
    });
  } catch (error) {
    if (error.code === 'UNSUPPORTED') {
      return {
        fullBlob: file,
        previewBlob: null,
        optimized: false,
        fallback: true
      };
    }
    throw error;
  } finally {
    if (imageProcessor === processor) {
      processor.terminate();
      imageProcessor = null;
    }
  }
}

function errorText(error) {
  return error instanceof TypeError
    ? 'Impossibile contattare il server. Riprova.'
    : error.message;
}

function setBusy(value) {
  busy = value;
  fields.disabled = value;
  content.querySelectorAll('button').forEach((button) => {
    button.disabled = value;
  });
  form.setAttribute('aria-busy', String(value));
}

function setMode(id, editing = id !== null) {
  editingId = editing && id ? id : null;
  document.querySelector('#form-title').textContent =
    editing ? 'Modifica immobile' : 'Nuovo immobile';
  document.querySelector('#save').textContent =
    editing ? 'Salva modifiche' : 'Crea immobile';
  document.title =
    `${editing ? 'Modifica immobile' : 'Nuovo immobile'} — Gestionale Affitti`;
}

function clearFormState() {
  clearRedirectCountdown();
  form.reset();
  indirizzo.clear();
  datiCatastali.clear();
  immagine.clear();
  clearFieldErrors(form);
  formMessage.textContent = '';
  detailRetry.hidden = true;
}

function fillDetail(immobile) {
  indirizzo.setData(immobile);
  datiCatastali.setData(immobile.datiCatastali);
  immagine.setStoredImage(immobile.immagineUrl);
}

function buildPayload() {
  return {
    ...indirizzo.getData(),
    datiCatastali: datiCatastali.getData()
  };
}

function validateForm() {
  clearFieldErrors(form);
  const errors = {
    ...indirizzo.validate(),
    ...datiCatastali.validate()
  };

  const imageValid = immagine.validate();

  if (!Object.keys(errors).length && imageValid) return true;

  if (Object.keys(errors).length) {
    showFormError(form, formMessage, {
      message: 'Controlla i campi indicati.',
      fields: errors
    });
  } else {
    formMessage.textContent = 'Errore: controlla la foto selezionata.';
    immagine.focus();
  }
  return false;
}

async function loadDetail() {
  clearRedirectCountdown();
  detailRetry.hidden = true;
  clearFieldErrors(form);
  immagine.clearError();
  form.reset();
  indirizzo.clear();
  datiCatastali.clear();
  immagine.clear();

  const id = editRequested ? queryId : null;
  setMode(id, editRequested);

  if (!editRequested) {
    formMessage.textContent = '';
    return true;
  }

  if (!id) {
    formMessage.textContent = 'Errore: Immobile non trovato.';
    detailRetry.hidden = true;
    return false;
  }

  formMessage.textContent = 'Caricamento immobile…';
  try {
    const immobile = await api(`/api/immobili/${encodeURIComponent(id)}`);
    fillDetail(immobile);
    formMessage.textContent = 'Immobile caricato. Puoi modificare i dati.';
    return true;
  } catch (error) {
    if (error.name === 'AbortError') return false;
    formMessage.textContent = `Errore: ${errorText(error)}`;
    detailRetry.hidden = error.status === 404;
    return false;
  }
}

function preserveCreatedImmobile(immobileId) {
  setMode(immobileId);
  window.history.replaceState(
    null,
    '',
    `/immobile.html?id=${encodeURIComponent(immobileId)}`
  );
}

form.addEventListener('input', (event) => {
  formMessage.textContent = '';

  const field = event.target.closest('[name]');
  if (!field) return;

  field.removeAttribute('aria-invalid');
  const error = document.getElementById(`${field.name}-error`);
  if (error) error.textContent = '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || fields.disabled || !validateForm()) return;

  clearRedirectCountdown();
  const data = buildPayload();
  const imageFile = immagine.getFile();
  const updating = editingId !== null;
  setBusy(true);
  formMessage.textContent = 'Salvataggio in corso…';

  let immobileId = editingId;
  let createdNow = false;
  let previewWarning = '';

  try {
    const saved = await api(
      updating ? `/api/immobili/${encodeURIComponent(editingId)}` : '/api/immobili',
      {
        method: updating ? 'PUT' : 'POST',
        body: JSON.stringify(data)
      }
    );

    if (!updating) {
      immobileId = saved.id;
      createdNow = true;
    }

    if (imageFile) {
      formMessage.textContent = 'Ottimizzazione foto nel Web Worker…';

      let processed;
      try {
        processed = await optimizeImage(imageFile);
      } catch (error) {
        if (error.name === 'AbortError') return;
        if (createdNow) preserveCreatedImmobile(immobileId);
        setBusy(false);
        formMessage.textContent = createdNow
          ? `Immobile creato, ma la foto non è stata salvata: ${errorText(error)} Riprova da questa pagina.`
          : `Dati aggiornati, ma la foto non è stata salvata: ${errorText(error)} Riprova.`;
        formMessage.focus();
        return;
      }

      formMessage.textContent = 'Salvataggio foto in corso…';

      try {
        const uploaded = await uploadImage(immobileId, processed.fullBlob);
        immagine.setStoredImage(uploaded.immagineUrl);

        if (processed.previewBlob) {
          try {
            await uploadImagePreview(immobileId, processed.previewBlob);
          } catch (error) {
            if (error.name === 'AbortError') return;
            previewWarning = ' La foto è stata salvata, ma la preview progressiva non è disponibile.';
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') return;

        if (createdNow) preserveCreatedImmobile(immobileId);

        setBusy(false);
        formMessage.textContent = createdNow
          ? `Immobile creato, ma la foto non è stata salvata: ${errorText(error)} Riprova da questa pagina.`
          : `Dati aggiornati, ma la foto non è stata salvata: ${errorText(error)} Riprova.`;
        formMessage.focus();
        return;
      }
    }

    startDashboardRedirect(`${updating
      ? 'Immobile aggiornato con successo.'
      : 'Immobile aggiunto con successo.'}${previewWarning}`);
  } catch (error) {
    if (error.name === 'AbortError') return;
    setBusy(false);
    showFormError(form, formMessage, error);
  }
});

cancelButton.addEventListener('click', () => {
  if (busy) return;
  clearFormState();
  window.location.assign('/dashboard.html');
});

async function initialize() {
  clearRedirectCountdown();
  controller?.abort();
  controller = new AbortController();

  content.hidden = true;
  sessionRetry.hidden = true;
  sessionMessage.textContent = 'Verifica della sessione in corso…';
  setBusy(true);

  try {
    await api('/api/auth/me');
    content.hidden = false;
    sessionMessage.textContent = '';

    const editable = await loadDetail();
    setBusy(false);
    fields.disabled = !editable;
  } catch (error) {
    if (error.name === 'AbortError') return;
    sessionMessage.textContent = `Errore: ${errorText(error)}`;
    sessionRetry.hidden = false;
  }
}

detailRetry.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  const editable = await loadDetail();
  setBusy(false);
  fields.disabled = !editable;
});

document.querySelector('#logout').addEventListener('click', logout);
sessionRetry.addEventListener('click', initialize);
window.addEventListener('pageshow', initialize);
window.addEventListener('pagehide', () => {
  clearRedirectCountdown();
  controller?.abort();
  releaseImageProcessor();
  immagine.releasePreview();
  content.hidden = true;
});
