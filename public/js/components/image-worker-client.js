function abortError(message = 'Operazione annullata.') {
  return new DOMException(message, 'AbortError');
}

function workerError(message, code = 'WORKER_ERROR') {
  return Object.assign(new Error(message), { code });
}

export function createImageWorkerClient(
  workerUrl = '/js/workers/image-worker.js'
) {
  let worker = null;
  let nextId = 1;
  let stopped = false;
  const pending = new Map();

  function rejectAll(error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }

  function ensureWorker() {
    if (stopped) throw abortError();
    if (worker) return worker;
    if (typeof Worker === 'undefined') {
      throw workerError('Web Worker non supportato.', 'UNSUPPORTED');
    }

    try {
      worker = new Worker(workerUrl);
    } catch {
      throw workerError('Web Worker non disponibile.', 'UNSUPPORTED');
    }

    worker.addEventListener('message', (event) => {
      const data = event.data || {};
      const request = pending.get(data.id);
      if (!request) return;

      if (data.type === 'stage') {
        request.onStage?.(data);
        return;
      }

      pending.delete(data.id);
      if (data.type === 'result') {
        request.resolve(data.result);
        return;
      }

      const error = workerError(
        data.message || 'Elaborazione immagine non riuscita.',
        data.code || 'WORKER_ERROR'
      );
      request.reject(error);
    });

    worker.addEventListener('error', () => {
      const error = workerError('Il Web Worker delle immagini si è interrotto.');
      rejectAll(error);
      worker?.terminate();
      worker = null;
    });

    return worker;
  }

  function request(type, payload, { onStage } = {}) {
    let activeWorker;
    try {
      activeWorker = ensureWorker();
    } catch (error) {
      return Promise.reject(error);
    }

    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onStage });
      activeWorker.postMessage({ id, type, ...payload });
    });
  }

  return {
    optimizeUpload(file, options = {}) {
      return request('optimize-upload', { file, options });
    },

    loadProgressive({ previewUrl, fullUrl, maxDimension = 1200 }, onStage) {
      return request(
        'load-progressive',
        { previewUrl, fullUrl, maxDimension },
        { onStage }
      );
    },

    cancelAll() {
      if (!worker) return;
      worker.postMessage({ type: 'cancel-all' });
      rejectAll(abortError());
    },

    terminate() {
      stopped = true;
      worker?.terminate();
      worker = null;
      rejectAll(abortError());
    }
  };
}
