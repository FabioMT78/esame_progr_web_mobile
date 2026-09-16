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

function validateInput(input) {
  const data = {};
  const fields = {};
  const limits = {
    nome: 100,
    cognome: 100,
    codiceFiscale: 16,
    dataNascita: 10,
    indirizzo: 150,
    civico: 20,
    cap: 5,
    provincia: 2,
    comune: 100,
    tipoDocumento: 20,
    numeroDocumento: 50,
    organoRilascioDocumento: 150,
    dataRilascioDocumento: 10,
    dataScadenzaDocumento: 10
  };

  for (const [key, max] of Object.entries(limits)) {
    data[key] = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (!data[key]) fields[key] = 'Questo campo è obbligatorio.';
    else if (data[key].length > max) fields[key] = `Inserisci al massimo ${max} caratteri.`;
  }

  data.codiceFiscale = data.codiceFiscale.toUpperCase();
  if (data.codiceFiscale && !/^[A-Z0-9]{16}$/.test(data.codiceFiscale)) {
    fields.codiceFiscale = 'Il codice fiscale deve contenere esattamente 16 caratteri alfanumerici.';
  }

  data.provincia = data.provincia.toUpperCase();
  if (data.provincia && !/^[A-Z]{2}$/.test(data.provincia)) {
    fields.provincia = 'Inserisci la sigla della provincia di 2 lettere.';
  }

  if (data.cap && !/^\d{5}$/.test(data.cap)) {
    fields.cap = 'Il CAP deve contenere esattamente 5 cifre.';
  }

  const tipiDocumento = new Set(['CARTA_IDENTITA', 'PASSAPORTO']);
  if (data.tipoDocumento && !tipiDocumento.has(data.tipoDocumento)) {
    fields.tipoDocumento = 'Seleziona un tipo di documento valido.';
  }

  data.numeroDocumento = data.numeroDocumento.toUpperCase();

  const today = new Date().toISOString().slice(0, 10);
  if (data.dataNascita) {
    if (!validDate(data.dataNascita)) fields.dataNascita = 'Inserisci una data valida.';
    else if (data.dataNascita > today) fields.dataNascita = 'La data di nascita non può essere futura.';
  }

  if (data.dataRilascioDocumento) {
    if (!validDate(data.dataRilascioDocumento)) {
      fields.dataRilascioDocumento = 'Inserisci una data valida.';
    } else if (data.dataRilascioDocumento > today) {
      fields.dataRilascioDocumento = 'La data di rilascio non può essere futura.';
    }
  }

  if (data.dataScadenzaDocumento && !validDate(data.dataScadenzaDocumento)) {
    fields.dataScadenzaDocumento = 'Inserisci una data valida.';
  }
  if (validDate(data.dataRilascioDocumento) && validDate(data.dataScadenzaDocumento)
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
