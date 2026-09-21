const repository = require('../repositories/inquilini-repository');
const immobili = require('../repositories/immobili-repository');
const { validateIndirizzo } = require('../domain/indirizzo');
const bozze = require('./bozze-contratto-service');

function inputError(status, message, fields) {
  return Object.assign(new Error(message), { status, fields });
}

function validateId(id) {
  if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)
      || id.length > 20 || BigInt(id) > 18446744073709551615n) {
    throw inputError(404, 'Inquilino non trovato.');
  }
}

function validUnsignedId(value) {
  return typeof value === 'string'
    && /^[1-9]\d{0,19}$/.test(value)
    && BigInt(value) <= 18446744073709551615n;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1000) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function adultBirthDateLimit() {
  const today = new Date();
  return new Date(Date.UTC(
    today.getUTCFullYear() - 18,
    today.getUTCMonth(),
    today.getUTCDate() - 1
  )).toISOString().slice(0, 10);
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

function dateValue(input, key, fields, { required = false } = {}) {
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
  return value;
}

function validateInput(input) {
  const fields = {};
  const address = validateIndirizzo(input);
  Object.assign(fields, address.fields);

  const data = {
    immobileId: input?.immobileId,
    nome: text(input, 'nome', 100, fields, true),
    cognome: text(input, 'cognome', 100, fields, true),
    codiceFiscale: text(input, 'codiceFiscale', 16, fields, true),
    dataNascita: dateValue(input, 'dataNascita', fields, { required: true }),

    ...address.data,

    tipoDocumento: text(input, 'tipoDocumento', 20, fields),
    numeroDocumento: text(input, 'numeroDocumento', 50, fields),
    organoRilascioDocumento: text(input, 'organoRilascioDocumento', 150, fields),
    dataRilascioDocumento: dateValue(input, 'dataRilascioDocumento', fields),
    dataScadenzaDocumento: dateValue(input, 'dataScadenzaDocumento', fields)
  };

  if (!validUnsignedId(data.immobileId)) {
    fields.immobileId = 'Seleziona un immobile valido.';
  }

  data.codiceFiscale = data.codiceFiscale?.toUpperCase() ?? null;
  if (data.codiceFiscale && !/^[A-Z0-9]{16}$/.test(data.codiceFiscale)) {
    fields.codiceFiscale = 'Il codice fiscale deve contenere esattamente 16 caratteri alfanumerici.';
  }

  if (data.tipoDocumento && !['CARTA_IDENTITA', 'PASSAPORTO'].includes(data.tipoDocumento)) {
    fields.tipoDocumento = 'Seleziona un tipo di documento valido.';
  }
  data.numeroDocumento = data.numeroDocumento?.toUpperCase() ?? null;

  const today = todayDate();
  if (data.dataNascita && data.dataNascita > adultBirthDateLimit()) {
    fields.dataNascita = "l'inquilino deve essere maggiorenne";
  }
  if (data.dataRilascioDocumento && data.dataRilascioDocumento >= today) {
    fields.dataRilascioDocumento = 'il rilascio del documento deve essere anteriore ad oggi';
  }
  if (data.dataScadenzaDocumento && data.dataScadenzaDocumento <= today) {
    fields.dataScadenzaDocumento = 'la scadenza del documento deve essere posteriore ad oggi';
  }

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
  const items = await immobili.list(ownerId);
  return { hasImmobili: items.length > 0, immobili: items };
}

async function list(ownerId, query = {}) {
  const immobileId = query?.immobileId;
  if (immobileId == null || immobileId === '') return repository.list(ownerId);

  if (!validUnsignedId(immobileId)) {
    throw inputError(400, 'Immobile non valido.', {
      immobileId: 'Seleziona un immobile valido.'
    });
  }

  if (!await immobili.findById(immobileId, ownerId)) return [];
  return repository.list(ownerId, immobileId);
}

async function get(id, ownerId) {
  validateId(id);
  const tenant = await repository.findActive(id, ownerId);
  if (!tenant) throw inputError(404, 'Inquilino non trovato.');
  return tenant;
}

async function ensureImmobile(immobileId, ownerId) {
  const immobile = await immobili.findById(immobileId, ownerId);
  if (!immobile) {
    throw inputError(404, 'Immobile non disponibile.', {
      immobileId: 'Seleziona un tuo immobile attivo.'
    });
  }
  return immobile;
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
  let effectiveInput = input;

  // Compatibilità con la creazione incorporata nel wizard contratto:
  // il wizard ha già salvato l'immobile nella bozza prima di creare l'inquilino.
  if (input?.immobileId == null || input.immobileId === '') {
    const draft = await bozze.get(ownerId);
    if (draft?.immobileId) {
      effectiveInput = { ...input, immobileId: draft.immobileId };
    }
  }

  const data = validateInput(effectiveInput);
  await ensureImmobile(data.immobileId, ownerId);

  try {
    const id = await repository.create(ownerId, data);
    return await get(id, ownerId);
  } catch (error) {
    throw duplicateError(error);
  }
}

async function update(id, ownerId, input) {
  const existing = await get(id, ownerId);
  const effectiveInput = input?.immobileId == null || input.immobileId === ''
    ? { ...input, immobileId: existing.immobileId }
    : input;
  const data = validateInput(effectiveInput);
  await ensureImmobile(data.immobileId, ownerId);

  if (existing.immobileId && existing.immobileId !== data.immobileId
      && await repository.hasActiveContract(id, ownerId)) {
    throw inputError(
      409,
      'Non puoi cambiare immobile a un inquilino con un contratto attivo.',
      { immobileId: 'Termina o lascia scadere il contratto attivo prima di cambiare immobile.' }
    );
  }

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

  if (await repository.hasActiveContract(id, ownerId)) {
    throw inputError(
      409,
      'Non puoi archiviare un inquilino con un contratto attivo.'
    );
  }

  if (!await repository.archive(id, ownerId)) {
    throw inputError(404, 'Inquilino non trovato.');
  }
}

module.exports = { prerequisiti, list, get, create, update, archive };
