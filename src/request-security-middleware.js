const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor'
]);

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const DEFAULT_LIMITS = Object.freeze({
  maxDepth: 6,
  maxArrayItems: 50,
  maxObjectKeys: 100,
  maxTotalKeys: 200,
  maxStringLength: 10000
});
const MOVIMENTI_IMPORT_LIMITS = Object.freeze({
  ...DEFAULT_LIMITS,
  maxArrayItems: 200,
  maxTotalKeys: 1500
});
const MAX_QUERY_PARAMS = 20;
const MAX_QUERY_VALUE_LENGTH = 2048;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const BIDI_CONTROL_CHARS = /[\u202A-\u202E\u2066-\u2069]/;

// Questi pattern non sostituiscono l'output encoding/safe sink del frontend.
// Servono come ulteriore barriera per i campi testuali dell'applicazione,
// che non hanno alcun motivo di contenere markup o codice eseguibile.
const XSS_PATTERNS = [
  /[<>]/,
  /\bjavascript\s*:/i,
  /\bvbscript\s*:/i,
  /\bdata\s*:\s*text\/html/i,
  /\bon[a-z0-9_-]+\s*=/i,
  /\bsrcdoc\s*=/i,
  /\bexpression\s*\(/i
];

function inputError(status, message) {
  return Object.assign(new Error(message), { status });
}

function isPasswordField(path) {
  const key = path.at(-1);
  return typeof key === 'string' && /password/i.test(key);
}

function inspectString(value, path, limits) {
  if (value.length > limits.maxStringLength) {
    throw inputError(413, 'Un valore della richiesta è troppo lungo.');
  }

  if (CONTROL_CHARS.test(value) || BIDI_CONTROL_CHARS.test(value)) {
    throw inputError(400, 'La richiesta contiene caratteri di controllo non ammessi.');
  }

  // La password è un valore opaco: non va "sanitizzata" né modificata.
  // Continuiamo però a bloccare caratteri di controllo anomali.
  if (isPasswordField(path)) {
    return value;
  }

  const normalized = value.trim();

  if (XSS_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw inputError(
      400,
      'La richiesta contiene markup o codice non ammesso nei campi testuali.'
    );
  }

  return normalized;
}

function inspectValue(value, path, depth, state) {
  const { limits } = state;
  if (depth > limits.maxDepth) {
    throw inputError(400, 'La struttura della richiesta è troppo annidata.');
  }

  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return inspectString(value, path, limits);
  }

  if (Array.isArray(value)) {
    if (value.length > limits.maxArrayItems) {
      throw inputError(400, 'La richiesta contiene troppi elementi.');
    }

    return value.map((item, index) =>
      inspectValue(item, [...path, String(index)], depth + 1, state)
    );
  }

  if (typeof value !== 'object') {
    throw inputError(400, 'La richiesta contiene un tipo di dato non valido.');
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw inputError(400, 'La richiesta contiene una struttura non valida.');
  }

  const entries = Object.entries(value);
  if (entries.length > limits.maxObjectKeys) {
    throw inputError(400, 'La richiesta contiene troppi campi.');
  }

  const result = Object.create(null);

  for (const [key, child] of entries) {
    state.totalKeys += 1;

    if (state.totalKeys > limits.maxTotalKeys) {
      throw inputError(400, 'La richiesta contiene troppi campi complessivi.');
    }

    if (FORBIDDEN_KEYS.has(key)) {
      throw inputError(400, 'La richiesta contiene un nome di campo non ammesso.');
    }

    if (key.length > 100 || CONTROL_CHARS.test(key) || BIDI_CONTROL_CHARS.test(key)) {
      throw inputError(400, 'La richiesta contiene un nome di campo non valido.');
    }

    result[key] = inspectValue(child, [...path, key], depth + 1, state);
  }

  return result;
}

function normalizeInput(value, limits = DEFAULT_LIMITS) {
  return inspectValue(value, [], 0, { totalKeys: 0, limits });
}

function validateRawQuery(req) {
  let url;

  try {
    url = new URL(req.originalUrl, 'http://gestionale.local');
  } catch {
    throw inputError(400, 'Query string non valida.');
  }

  const seen = new Set();
  let count = 0;

  for (const [key, value] of url.searchParams.entries()) {
    count += 1;

    if (count > MAX_QUERY_PARAMS) {
      throw inputError(400, 'La richiesta contiene troppi parametri.');
    }

    if (FORBIDDEN_KEYS.has(key)) {
      throw inputError(400, 'La richiesta contiene un parametro non ammesso.');
    }

    if (seen.has(key)) {
      throw inputError(
        400,
        `Il parametro "${key}" deve essere specificato una sola volta.`
      );
    }

    if (value.length > MAX_QUERY_VALUE_LENGTH) {
      throw inputError(413, 'Un parametro della richiesta è troppo lungo.');
    }

    seen.add(key);
  }
}

function overrideQuery(req, normalizedQuery) {
  // Express 5 espone req.query tramite getter sul prototype.
  // Una proprietà locale evita che una nuova lettura ricalcoli la query
  // originale non normalizzata.
  Object.defineProperty(req, 'query', {
    value: normalizedQuery,
    configurable: true,
    enumerable: true,
    writable: false
  });
}

function hasRequestBody(req) {
  const length = Number(req.get('content-length') || 0);
  return length > 0 || Boolean(req.get('transfer-encoding'));
}

function requestPath(req) {
  try {
    return new URL(req.originalUrl, 'http://gestionale.local').pathname;
  } catch {
    return '';
  }
}

function isImageUpload(req) {
  return req.method === 'PUT'
    && /^\/api\/immobili\/[^/]+\/immagine(?:-preview)?$/.test(requestPath(req));
}

function inputLimits(req) {
  if (req.method === 'POST'
      && /^\/api\/movimenti\/(?:anteprima|importa)$/.test(requestPath(req))) {
    return MOVIMENTI_IMPORT_LIMITS;
  }
  return DEFAULT_LIMITS;
}

function validateContentType(req) {
  if (!BODY_METHODS.has(req.method) || !hasRequestBody(req) || isImageUpload(req)) {
    return;
  }

  if (
    !req.is('application/json')
    && !req.is('application/x-www-form-urlencoded')
  ) {
    throw inputError(
      415,
      'Content-Type non supportato. Usa application/json.'
    );
  }
}

function securityHeaders(_req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-XSS-Protection': '0'
  });

  return next();
}

function requestSecurity(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');

    validateRawQuery(req);
    validateContentType(req);

    const limits = inputLimits(req);
    const query = normalizeInput(req.query || {}, DEFAULT_LIMITS);
    overrideQuery(req, query);

    if (
      req.body !== undefined
      && req.body !== null
      && !Buffer.isBuffer(req.body)
    ) {
      req.body = normalizeInput(req.body, limits);
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  securityHeaders,
  requestSecurity
};
