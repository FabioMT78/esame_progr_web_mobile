import { readToken } from './common.js';

function sessionEndedError() {
  return new DOMException('Sessione terminata', 'AbortError');
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
  throw sessionEndedError();
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
      cache = 'no-store',
      errorMessage = defaultErrorMessage,
      ...fetchOptions
    } = options;

    let response;
    try {
      response = await fetch(path, {
        ...fetchOptions,
        cache,
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...headers
        }
      });
      throwIfAborted(signal);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (error instanceof TypeError) error.networkError = true;
      throw error;
    }

    if (response.status === 401) endSession();

    const data = response.status === 204 ? null : await response.json();
    throwIfAborted(signal);

    if (!response.ok) {
      throw Object.assign(
        new Error(data?.error || errorMessage),
        {
          status: response.status,
          fields: data?.fields
        }
      );
    }

    return data;
  };
}
