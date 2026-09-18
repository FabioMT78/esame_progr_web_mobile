function assertElement(element, name, expectedType = Element) {
  if (!(element instanceof expectedType)) {
    throw new TypeError(`Il ${name} del componente immagine non è valido.`);
  }
}

export function createImmagineForm({
  input,
  preview,
  selectButton,
  errorElement,
  placeholderSrc,
  maxSize = 5 * 1024 * 1024,
  allowedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  previewAlt = 'Anteprima immagine',
  placeholderAlt = 'Nessuna immagine disponibile'
} = {}) {
  assertElement(input, 'campo file', HTMLInputElement);
  assertElement(preview, 'elemento di anteprima', HTMLImageElement);
  assertElement(selectButton, 'pulsante di selezione', HTMLButtonElement);
  assertElement(errorElement, 'elemento di errore');
  if (!placeholderSrc) {
    throw new TypeError('Il segnaposto del componente immagine è obbligatorio.');
  }

  const allowed = new Set(allowedTypes);
  let selectedFile = null;
  let storedUrl = null;
  let previewObjectUrl = null;

  function revokePreviewObjectUrl() {
    if (!previewObjectUrl) return;
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  function setPreview(src, isPlaceholder = false) {
    preview.src = src || placeholderSrc;
    preview.alt = isPlaceholder ? placeholderAlt : previewAlt;
  }

  function clearError() {
    input.removeAttribute('aria-invalid');
    errorElement.textContent = '';
  }

  function setError(message) {
    if (!message) {
      clearError();
      return;
    }

    input.setAttribute('aria-invalid', 'true');
    errorElement.textContent = message;
  }

  function validationMessage(file) {
    if (!file) return '';
    if (!allowed.has(file.type)) {
      return 'Seleziona una foto JPG, PNG o WebP.';
    }
    if (!file.size) {
      return 'Il file selezionato è vuoto.';
    }
    if (file.size > maxSize) {
      return `La foto non può superare ${Math.round(maxSize / (1024 * 1024))} MB.`;
    }
    return '';
  }

  function validate({ showError = true } = {}) {
    const message = validationMessage(selectedFile);
    if (showError) setError(message);
    return !message;
  }

  function showStoredImage(url) {
    revokePreviewObjectUrl();
    storedUrl = url || null;
    selectedFile = null;
    input.value = '';
    clearError();
    setPreview(storedUrl || placeholderSrc, !storedUrl);
    selectButton.textContent = storedUrl ? 'Sostituisci foto' : 'Carica foto';
  }

  function showLocalPreview(file) {
    revokePreviewObjectUrl();
    previewObjectUrl = URL.createObjectURL(file);
    setPreview(previewObjectUrl);
    selectButton.textContent = storedUrl ? 'Sostituisci foto' : 'Cambia foto';
  }

  function resetToStoredImage() {
    selectedFile = null;
    input.value = '';
    setPreview(storedUrl || placeholderSrc, !storedUrl);
    selectButton.textContent = storedUrl ? 'Sostituisci foto' : 'Carica foto';
  }

  function handleSelectClick() {
    if (!selectButton.disabled) input.click();
  }

  function handleInputChange() {
    clearError();
    const [file] = input.files;
    if (!file) return;

    const message = validationMessage(file);
    if (message) {
      setError(message);
      resetToStoredImage();
      return;
    }

    selectedFile = file;
    showLocalPreview(file);
  }

  function handlePreviewError() {
    if (preview.getAttribute('src') === placeholderSrc) return;
    setPreview(placeholderSrc, true);
  }

  selectButton.addEventListener('click', handleSelectClick);
  input.addEventListener('change', handleInputChange);
  preview.addEventListener('error', handlePreviewError);

  showStoredImage(null);

  return {
    getFile() {
      return selectedFile;
    },
    setStoredImage: showStoredImage,
    clear() {
      showStoredImage(null);
    },
    clearError,
    validate,
    focus() {
      input.focus();
    },
    releasePreview() {
      revokePreviewObjectUrl();
    }
  };
}
