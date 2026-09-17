const repository = require('../repositories/immobili-repository');

const MAX_UINT32 = 4294967295;
const MAX_DECIMAL_10_2 = 99999999.99;

function notFound() {
  return Object.assign(new Error('Immobile non trovato.'), { status: 404 });
}

function validateId(id) {
  if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id)
      || BigInt(id) > 18446744073709551615n) throw notFound();
  return id;
}

function isEmpty(value) {
  return value == null || (typeof value === 'string' && !value.trim());
}

function normalizeDecimal(value) {
  if (!['string', 'number'].includes(typeof value)) return null;
  return String(value).trim().replace(',', '.');
}

function validateOptionalInteger(raw, name, fields) {
  if (isEmpty(raw)) return null;

  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    fields[name] = 'Inserisci un numero intero non negativo.';
    return null;
  }

  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    fields[name] = 'Inserisci un numero intero valido.';
    return null;
  }
  return value;
}

function validateOptionalDecimal(raw, name, fields, allowZero) {
  if (isEmpty(raw)) return null;

  const normalized = normalizeDecimal(raw);
  if (!normalized || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    fields[name] = 'Inserisci un numero con massimo 2 decimali.';
    return null;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)
      || value > MAX_DECIMAL_10_2
      || (allowZero ? value < 0 : value <= 0)) {
    fields[name] = allowZero
      ? 'Inserisci un valore compreso tra 0 e 99.999.999,99.'
      : 'Inserisci un valore maggiore di 0 e non superiore a 99.999.999,99.';
    return null;
  }

  return normalized;
}

function validateOptionalText(raw, name, max, fields) {
  if (isEmpty(raw)) return null;

  if (typeof raw !== 'string') {
    fields[name] = 'Inserisci un testo valido.';
    return null;
  }

  const value = raw.trim();
  if (value.length > max) {
    fields[name] = `Inserisci al massimo ${max} caratteri.`;
    return null;
  }
  return value;
}

function validateCadastralData(input, fields) {
  if (input == null) return null;

  if (typeof input !== 'object' || Array.isArray(input)) {
    fields.foglio = 'I dati catastali non sono validi.';
    return null;
  }

  const data = {
    codiceComunale: validateOptionalText(
      input.codiceComunale, 'codiceComunale', 20, fields
    ),
    foglio: validateOptionalInteger(input.foglio, 'foglio', fields),
    particella: validateOptionalInteger(input.particella, 'particella', fields),
    subalterno: validateOptionalInteger(input.subalterno, 'subalterno', fields),
    zona: validateOptionalInteger(input.zona, 'zona', fields),
    categoria: validateOptionalText(input.categoria, 'categoria', 20, fields),
    consistenza: validateOptionalDecimal(
      input.consistenza, 'consistenza', fields, false
    ),
    rendita: validateOptionalDecimal(input.rendita, 'rendita', fields, true)
  };

  return Object.values(data).some((value) => value !== null) ? data : null;
}

function validate(input) {
  const data = {};
  const fields = {};

  const requiredAddress = {
    titolo: 150,
    via: 150,
    cap: 10,
    comune: 100,
    provincia: 100
  };

  for (const [key, max] of Object.entries(requiredAddress)) {
    data[key] = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (!data[key]) fields[key] = 'Questo campo è obbligatorio.';
    else if (data[key].length > max) {
      fields[key] = `Inserisci al massimo ${max} caratteri.`;
    }
  }

  if (input?.numeroCivico != null && typeof input.numeroCivico !== 'string') {
    fields.numeroCivico = 'Inserisci un testo valido.';
  }
  data.numeroCivico = typeof input?.numeroCivico === 'string'
    ? input.numeroCivico.trim()
    : '';
  if (data.numeroCivico.length > 20) {
    fields.numeroCivico = 'Inserisci al massimo 20 caratteri.';
  }

  if (input?.immagineUrl != null && typeof input.immagineUrl !== 'string') {
    fields.immagineUrl = 'Inserisci un testo valido.';
  }
  data.immagineUrl = typeof input?.immagineUrl === 'string'
    ? input.immagineUrl.trim() || null
    : null;

  if (data.immagineUrl) {
    try {
      const url = new URL(data.immagineUrl);
      if (!['http:', 'https:'].includes(url.protocol)
          || data.immagineUrl.length > 500) {
        throw new Error('URL non valido');
      }
    } catch {
      fields.immagineUrl =
        'Inserisci un URL http o https valido, di massimo 500 caratteri.';
    }
  }

  data.datiCatastali = validateCadastralData(input?.datiCatastali, fields);

  if (Object.keys(fields).length) {
    throw Object.assign(new Error('Controlla i campi indicati.'), {
      status: 400,
      fields
    });
  }

  return data;
}

async function get(id, proprietarioId) {
  const immobile = await repository.findById(validateId(id), proprietarioId);
  if (!immobile) throw notFound();
  return immobile;
}

async function create(input, proprietarioId) {
  const data = validate(input);
  const id = await repository.create(data, proprietarioId);
  return { id, ...data };
}

async function update(id, input, proprietarioId) {
  await get(id, proprietarioId);
  const data = validate(input);
  if (!await repository.update(id, data, proprietarioId)) throw notFound();
  return { id, ...data };
}

async function archive(id, proprietarioId) {
  if (!await repository.archive(validateId(id), proprietarioId)) throw notFound();
}

module.exports = { list: repository.list, get, create, update, archive };
