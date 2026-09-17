import { readToken, clearToken, clearFieldErrors, showFormError } from './common.js';
import { createIndirizzoForm } from './components/indirizzo-form.js';
import { createDatiCatastaliForm } from './components/dati-catastali-form.js';

const PLACEHOLDER_IMAGE = '/assets/img/segnaposto_immobile.jpg';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const form = document.querySelector('#immobile-form');
const fields = document.querySelector('#form-fields');
const formMessage = document.querySelector('#form-message');
const content = document.querySelector('#protected-content');
const sessionMessage = document.querySelector('#session-message');
const sessionRetry = document.querySelector('#session-retry');
const detailRetry = document.querySelector('#detail-retry');
const cancelButton = document.querySelector('#cancel-immobile');
const imageInput = document.querySelector('#imageFile');
const imagePreview = document.querySelector('#immobile-image-preview');
const selectImageButton = document.querySelector('#select-image');
const imageError = document.querySelector('#imageFile-error');

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

let editingId = null;
let busy = false;
let controller;
let selectedImage = null;
let currentImageUrl = null;
let previewObjectUrl = null;

function logout() {
  controller?.abort();
  revokePreviewObjectUrl();
  content.hidden = true;
  try { clearToken(); } finally { window.location.replace('/'); }
}

async function request(path, options = {}) {
  const token = readToken();
  if (!token) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }

  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }

  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Operazione non riuscita.'), {
      fields: data.fields,
      status: response.status
    });
  }
  return data;
}

async function uploadImage(immobileId, file) {
  const token = readToken();
  if (!token) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }

  const response = await fetch(
    `/api/immobili/${encodeURIComponent(immobileId)}/immagine`,
    {
      method: 'PUT',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': file.type
      },
      body: file
    }
  );

  if (response.status === 401) {
    logout();
    throw new DOMException('Sessione terminata', 'AbortError');
  }

  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(
      new Error(data.error || 'Impossibile caricare la foto.'),
      { status: response.status }
    );
  }
  return data;
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

function setMode(id) {
  editingId = id;
  const editing = id !== null;
  document.querySelector('#form-title').textContent =
    editing ? 'Modifica immobile' : 'Nuovo immobile';
  document.querySelector('#save').textContent =
    editing ? 'Salva modifiche' : 'Crea immobile';
  document.title =
    `${editing ? 'Modifica immobile' : 'Nuovo immobile'} — Gestionale Affitti`;
}

function revokePreviewObjectUrl() {
  if (!previewObjectUrl) return;
  URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
}

function setPreview(src, isPlaceholder = false) {
  imagePreview.src = src || PLACEHOLDER_IMAGE;
  imagePreview.alt = isPlaceholder
    ? 'Nessuna immagine disponibile'
    : 'Anteprima foto immobile';
}

function showStoredImage(url) {
  revokePreviewObjectUrl();
  currentImageUrl = url || null;
  selectedImage = null;
  imageInput.value = '';
  setPreview(currentImageUrl || PLACEHOLDER_IMAGE, !currentImageUrl);
  selectImageButton.textContent = currentImageUrl ? 'Sostituisci foto' : 'Carica foto';
}

function clearImageError() {
  imageInput.removeAttribute('aria-invalid');
  imageError.textContent = '';
}

function validateImage(file = selectedImage) {
  clearImageError();
  if (!file) return true;

  let message = '';
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    message = 'Seleziona una foto JPG, PNG o WebP.';
  } else if (!file.size) {
    message = 'Il file selezionato è vuoto.';
  } else if (file.size > MAX_IMAGE_SIZE) {
    message = 'La foto non può superare 5 MB.';
  }

  if (!message) return true;

  imageInput.setAttribute('aria-invalid', 'true');
  imageError.textContent = message;
  return false;
}

function selectLocalPreview(file) {
  revokePreviewObjectUrl();
  previewObjectUrl = URL.createObjectURL(file);
  setPreview(previewObjectUrl);
  selectImageButton.textContent = currentImageUrl ? 'Sostituisci foto' : 'Cambia foto';
}

function clearFormState() {
  form.reset();
  indirizzo.clear();
  datiCatastali.clear();
  clearFieldErrors(form);
  clearImageError();
  showStoredImage(null);
  formMessage.textContent = '';
  detailRetry.hidden = true;
}

function fillDetail(immobile) {
  indirizzo.setData(immobile);
  datiCatastali.setData(immobile.datiCatastali);
  showStoredImage(immobile.immagineUrl);
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

  const imageValid = validateImage();

  if (!Object.keys(errors).length && imageValid) return true;

  if (Object.keys(errors).length) {
    showFormError(form, formMessage, {
      message: 'Controlla i campi indicati.',
      fields: errors
    });
  } else {
    formMessage.textContent = 'Errore: controlla la foto selezionata.';
    imageInput.focus();
  }
  return false;
}

async function loadDetail() {
  detailRetry.hidden = true;
  clearFieldErrors(form);
  clearImageError();
  form.reset();
  indirizzo.clear();
  datiCatastali.clear();
  showStoredImage(null);

  const id = new URLSearchParams(window.location.search).get('id');
  setMode(id === null ? null : id);

  if (id === null) {
    formMessage.textContent = '';
    return true;
  }

  formMessage.textContent = 'Caricamento immobile…';
  try {
    const immobile = await request(`/api/immobili/${encodeURIComponent(id || '0')}`);
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

selectImageButton.addEventListener('click', () => {
  if (!busy) imageInput.click();
});

imageInput.addEventListener('change', () => {
  clearImageError();
  const [file] = imageInput.files;
  if (!file) return;

  if (!validateImage(file)) {
    selectedImage = null;
    imageInput.value = '';
    setPreview(currentImageUrl || PLACEHOLDER_IMAGE, !currentImageUrl);
    return;
  }

  selectedImage = file;
  selectLocalPreview(file);
});

imagePreview.addEventListener('error', () => {
  if (imagePreview.getAttribute('src') === PLACEHOLDER_IMAGE) return;
  setPreview(PLACEHOLDER_IMAGE, true);
});

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

  const data = buildPayload();
  const updating = editingId !== null;
  setBusy(true);
  formMessage.textContent = 'Salvataggio in corso…';

  let immobileId = editingId;
  let createdNow = false;

  try {
    const saved = await request(
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

    if (selectedImage) {
      formMessage.textContent = 'Salvataggio foto in corso…';

      try {
        const uploaded = await uploadImage(immobileId, selectedImage);
        currentImageUrl = uploaded.immagineUrl;
      } catch (error) {
        if (error.name === 'AbortError') return;

        if (createdNow) {
          setMode(immobileId);
          window.history.replaceState(
            null,
            '',
            `/immobile.html?id=${encodeURIComponent(immobileId)}`
          );
        }

        setBusy(false);
        formMessage.textContent = createdNow
          ? `Immobile creato, ma la foto non è stata salvata: ${errorText(error)} Riprova da questa pagina.`
          : `Dati aggiornati, ma la foto non è stata salvata: ${errorText(error)} Riprova.`;
        formMessage.focus();
        return;
      }
    }

    formMessage.textContent = updating
      ? 'Immobile aggiornato con successo.'
      : 'Immobile aggiunto con successo.';
    formMessage.focus();

    window.setTimeout(() => {
      window.location.assign('/dashboard.html');
    }, 3000);
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
  controller?.abort();
  controller = new AbortController();

  content.hidden = true;
  sessionRetry.hidden = true;
  sessionMessage.textContent = 'Verifica della sessione in corso…';
  setBusy(true);

  try {
    await request('/api/auth/me');
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
  controller?.abort();
  revokePreviewObjectUrl();
  content.hidden = true;
});
