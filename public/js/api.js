import { readToken } from './common.js';

function sessionEndedError() {
  return new DOMException('Sessione terminata', 'AbortError');
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
  throw sessionEndedError();
}

function responseError(response, data, errorMessage) {
  return Object.assign(
    new Error(data?.error || errorMessage),
    {
      status: response.status,
      fields: data?.fields
    }
  );
}

async function sendRequest(path, options = {}) {
  const {
    signal,
    headers = {},
    cache = 'no-store',
    ...fetchOptions
  } = options;

  try {
    const response = await fetch(path, {
      ...fetchOptions,
      cache,
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });
    throwIfAborted(signal);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    if (error instanceof TypeError) error.networkError = true;
    throw error;
  }
}

async function readJsonResponse(response, signal) {
  const data = response.status === 204 ? null : await response.json();
  throwIfAborted(signal);
  return data;
}

export async function requestJson(path, options = {}) {
  const {
    signal,
    errorMessage = 'Operazione non riuscita.',
    ...requestOptions
  } = options;

  const response = await sendRequest(path, {
    ...requestOptions,
    signal
  });
  const data = await readJsonResponse(response, signal);

  if (!response.ok) {
    throw responseError(response, data, errorMessage);
  }

  return data;
}

export function createAuthenticatedApi({
  onUnauthorized,
  getSignal = () => undefined,
  defaultErrorMessage = 'Operazione non riuscita.'
} = {}) {
  if (typeof onUnauthorized !== 'function') {
    throw new TypeError('Il client API autenticato richiede onUnauthorized.');
  }
  if (typeof getSignal !== 'function') {
    throw new TypeError('getSignal deve essere una funzione.');
  }

  function endSession() {
    onUnauthorized();
    throw sessionEndedError();
  }

  return async function api(path, options = {}) {
    const token = readToken();
    if (!token) endSession();

    const {
      signal = getSignal(),
      headers = {},
      errorMessage = defaultErrorMessage,
      ...requestOptions
    } = options;

    const response = await sendRequest(path, {
      ...requestOptions,
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...headers
      }
    });

    if (response.status === 401) endSession();

    const data = await readJsonResponse(response, signal);

    if (!response.ok) {
      throw responseError(response, data, errorMessage);
    }

    return data;
  };
}
