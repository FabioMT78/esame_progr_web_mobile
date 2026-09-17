const repository = require('../repositories/inquilini-repository');

function inputError(status, message, fields) {
  return Object.assign(new Error(message), { status, fields });
}

function validateId(id) {
  if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)
      || id.length > 20 || BigInt(id) > 18446744073709551615n) {
    throw inputError(404, 'Inquilino non trovato.');
  }
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1000) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function text(input, key, max, fields, required = false) {
  const raw = input?.[key];
  if (raw != null && typeof raw !== 'string') {
    fields[key] = 'Inserisci un testo valido.';
    return null;
  }

  const value = typeof raw === 'string' ? raw.trim() : '';
  if (required && !value) fields[key] = 'Questo campo è obbligatorio.';
  else if (value.length > max) fields[key] = `Inserisci al massimo ${max} caratteri.`;
  return value || null;
}

function dateValue(input, key, fields, { required = false, notFuture = false } = {}) {
  const raw = input?.[key];
  if (raw != null && typeof raw !== 'string') {
    fields[key] = 'Inserisci una data valida.';
    return null;
  }

  const value = typeof raw === 'string' ? raw.trim() : '';
  if (required && !value) {
    fields[key] = 'Questo campo è obbligatorio.';
    return null;
  }
  if (!value) return null;
  if (!validDate(value)) {
    fields[key] = 'Inserisci una data valida.';
    return null;
  }
  if (notFuture && value > new Date().toISOString().slice(0, 10)) {
    fields[key] = key === 'dataNascita'
      ? 'La data di nascita non può essere futura.'
      : 'La data di rilascio non può essere futura.';
  }
  return value;
}

function validateInput(input) {
  const fields = {};
  const data = {
    nome: text(input, 'nome', 100, fields, true),
    cognome: text(input, 'cognome', 100, fields, true),
    codiceFiscale: text(input, 'codiceFiscale', 16, fields, true),
    dataNascita: dateValue(input, 'dataNascita', fields, { required: true, notFuture: true }),

    indirizzo: text(input, 'indirizzo', 150, fields),
    civico: text(input, 'civico', 20, fields),
    cap: text(input, 'cap', 5, fields),
    provincia: text(input, 'provincia', 2, fields),
    comune: text(input, 'comune', 100, fields),

    tipoDocumento: text(input, 'tipoDocumento', 20, fields),
    numeroDocumento: text(input, 'numeroDocumento', 50, fields),
    organoRilascioDocumento: text(input, 'organoRilascioDocumento', 150, fields),
    dataRilascioDocumento: dateValue(
      input, 'dataRilascioDocumento', fields, { notFuture: true }
    ),
    dataScadenzaDocumento: dateValue(input, 'dataScadenzaDocumento', fields)
  };

  data.codiceFiscale = data.codiceFiscale?.toUpperCase() ?? null;
  if (data.codiceFiscale && !/^[A-Z0-9]{16}$/.test(data.codiceFiscale)) {
    fields.codiceFiscale = 'Il codice fiscale deve contenere esattamente 16 caratteri alfanumerici.';
  }

  data.provincia = data.provincia?.toUpperCase() ?? null;
  if (data.cap && !/^\d{5}$/.test(data.cap)) {
    fields.cap = 'Il CAP deve contenere esattamente 5 cifre.';
  }
  if (data.provincia && !/^[A-Z]{2}$/.test(data.provincia)) {
    fields.provincia = 'Inserisci la sigla della provincia di 2 lettere.';
  }

  if (data.tipoDocumento && !['CARTA_IDENTITA', 'PASSAPORTO'].includes(data.tipoDocumento)) {
    fields.tipoDocumento = 'Seleziona un tipo di documento valido.';
  }
  data.numeroDocumento = data.numeroDocumento?.toUpperCase() ?? null;

  if (data.dataRilascioDocumento && data.dataScadenzaDocumento
      && data.dataScadenzaDocumento < data.dataRilascioDocumento) {
    fields.dataScadenzaDocumento = 'La scadenza non può precedere la data di rilascio.';
  }

  data.immagineUrl = typeof input?.immagineUrl === 'string' ? input.immagineUrl.trim() : '';
  if (input?.immagineUrl != null && typeof input.immagineUrl !== 'string') {
    fields.immagineUrl = 'Inserisci un URL valido.';
  } else if (data.immagineUrl) {
    try {
      const url = new URL(data.immagineUrl);
      if (!['http:', 'https:'].includes(url.protocol) || data.immagineUrl.length > 500) {
        throw new Error('URL non valido');
      }
    } catch {
      fields.immagineUrl = 'Inserisci un URL http o https valido, di massimo 500 caratteri.';
    }
  }
  data.immagineUrl ||= null;

  if (Object.keys(fields).length) {
    throw inputError(400, 'Controlla i campi indicati.', fields);
  }
  return data;
}

async function prerequisiti(ownerId) {
  return { hasImmobili: await repository.hasImmobili(ownerId) };
}

async function get(id, ownerId) {
  validateId(id);
  const tenant = await repository.findActive(id, ownerId);
  if (!tenant) throw inputError(404, 'Inquilino non trovato.');
  return tenant;
}

function duplicateError(error) {
  if (error.code === 'ER_DUP_ENTRY') {
    return inputError(409,
      'Codice fiscale già registrato per il tuo account, anche tra gli inquilini archiviati.',
      { codiceFiscale: 'Questo codice fiscale è già registrato per il tuo account.' });
  }
  return error;
}

async function create(ownerId, input) {
  const data = validateInput(input);
  if (!await repository.hasImmobili(ownerId)) {
    throw inputError(409, 'Per registrare un inquilino devi prima creare almeno un immobile.');
  }
  try {
    const id = await repository.create(ownerId, data);
    return await get(id, ownerId);
  } catch (error) {
    throw duplicateError(error);
  }
}

async function update(id, ownerId, input) {
  await get(id, ownerId);
  const data = validateInput(input);
  try {
    if (!await repository.update(id, ownerId, data)) {
      throw inputError(404, 'Inquilino non trovato.');
    }
    return await get(id, ownerId);
  } catch (error) {
    throw duplicateError(error);
  }
}

async function archive(id, ownerId) {
  validateId(id);
  if (!await repository.archive(id, ownerId)) {
    throw inputError(404, 'Inquilino non trovato.');
  }
}

module.exports = { prerequisiti, list: repository.list, get, create, update, archive };
