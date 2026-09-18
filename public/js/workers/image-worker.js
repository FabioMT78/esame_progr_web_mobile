const tasks = new Map();

function imageApisSupported() {
  return typeof createImageBitmap === 'function'
    && typeof OffscreenCanvas === 'function'
    && typeof OffscreenCanvas.prototype?.convertToBlob === 'function';
}

function requireImageApis() {
  if (!imageApisSupported()) {
    const error = new Error('API native di elaborazione immagine non supportate.');
    error.code = 'UNSUPPORTED';
    throw error;
  }
}

async function createBitmap(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (firstError) {
    try {
      return await createImageBitmap(blob);
    } catch {
      const error = new Error('Il file selezionato non contiene un’immagine valida.');
      error.code = 'INVALID_IMAGE';
      throw error;
    }
  }
}

function targetSize(width, height, maxDimension) {
  const longest = Math.max(width, height);
  const scale = longest > maxDimension ? maxDimension / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

async function renderWebp(bitmap, maxDimension, quality) {
  const size = targetSize(bitmap.width, bitmap.height, maxDimension);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    const error = new Error('Impossibile inizializzare il canvas del worker.');
    error.code = 'UNSUPPORTED';
    throw error;
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return canvas.convertToBlob({ type: 'image/webp', quality });
}

async function optimizeUpload(message) {
  requireImageApis();
  const file = message.file;
  if (!(file instanceof Blob) || !file.size) {
    const error = new Error('Il file immagine è vuoto.');
    error.code = 'INVALID_IMAGE';
    throw error;
  }

  const {
    maxDimension = 1600,
    quality = 0.82,
    previewMaxDimension = 160,
    previewQuality = 0.5
  } = message.options || {};

  const bitmap = await createBitmap(file);
  try {
    const [fullCandidate, previewBlob] = await Promise.all([
      renderWebp(bitmap, maxDimension, quality),
      renderWebp(bitmap, previewMaxDimension, previewQuality)
    ]);

    const fullBlob = fullCandidate.size < file.size ? fullCandidate : file;
    return {
      fullBlob,
      previewBlob,
      optimized: fullBlob !== file,
      originalSize: file.size,
      fullSize: fullBlob.size,
      previewSize: previewBlob.size
    };
  } finally {
    bitmap.close();
  }
}

async function fetchBlob(url, signal) {
  const response = await fetch(url, { signal, cache: 'force-cache' });
  if (!response.ok) {
    throw Object.assign(new Error(`Risorsa immagine non disponibile (${response.status}).`), {
      status: response.status
    });
  }
  return response.blob();
}

async function optimizeForDashboard(blob, maxDimension) {
  if (!imageApisSupported()) return blob;

  const bitmap = await createBitmap(blob);
  try {
    if (Math.max(bitmap.width, bitmap.height) <= maxDimension) return blob;
    const candidate = await renderWebp(bitmap, maxDimension, 0.82);
    return candidate.size <= blob.size ? candidate : blob;
  } finally {
    bitmap.close();
  }
}

async function loadProgressive(message, controller) {
  let previewLoaded = false;

  if (message.previewUrl) {
    try {
      const previewBlob = await fetchBlob(message.previewUrl, controller.signal);
      if (!controller.signal.aborted) {
        self.postMessage({
          id: message.id,
          type: 'stage',
          stage: 'preview',
          blob: previewBlob
        });
        previewLoaded = true;
      }
    } catch (error) {
      if (controller.signal.aborted) throw error;
      // Le immagini già presenti prima dell'introduzione delle preview
      // non hanno la variante low-res: in quel caso si prosegue col full.
      if (error.status !== 404) {
        self.postMessage({
          id: message.id,
          type: 'stage',
          stage: 'preview-error',
          message: error.message
        });
      }
    }
  }

  const fullBlob = await fetchBlob(message.fullUrl, controller.signal);
  const finalBlob = await optimizeForDashboard(
    fullBlob,
    Number(message.maxDimension) || 1200
  );
  return { blob: finalBlob, previewLoaded };
}

async function handleTask(message) {
  const controller = new AbortController();
  tasks.set(message.id, controller);

  try {
    let result;
    if (message.type === 'optimize-upload') {
      result = await optimizeUpload(message);
    } else if (message.type === 'load-progressive') {
      result = await loadProgressive(message, controller);
    } else {
      throw new Error('Operazione immagine non riconosciuta.');
    }

    if (!controller.signal.aborted) {
      self.postMessage({ id: message.id, type: 'result', result });
    }
  } catch (error) {
    if (controller.signal.aborted || error.name === 'AbortError') return;
    self.postMessage({
      id: message.id,
      type: 'error',
      code: error.code || 'PROCESSING_ERROR',
      message: error.message || 'Elaborazione immagine non riuscita.'
    });
  } finally {
    tasks.delete(message.id);
  }
}

self.addEventListener('message', (event) => {
  const message = event.data || {};

  if (message.type === 'cancel-all') {
    for (const controller of tasks.values()) controller.abort();
    tasks.clear();
    return;
  }

  if (Number.isInteger(message.id)) handleTask(message);
});
