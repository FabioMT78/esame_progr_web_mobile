const jwt = require('jsonwebtoken');
const repository = require('../repositories/proprietario-repository');
const { hashPassword, verifyPassword } = require('./password');

function authError(status, message, fields) {
  return Object.assign(new Error(message), { status, fields });
}

function normalizeIban(value) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, '').toUpperCase()
    : '';
}

function adultBirthDateLimit() {
  const today = new Date();
  return new Date(Date.UTC(
    today.getUTCFullYear() - 18,
    today.getUTCMonth(),
    today.getUTCDate() - 1
  )).toISOString().slice(0, 10);
}

function validateRegistration(input) {
  const data = {};
  const fields = {};
  const limits = {
    email: 255, nome: 100, cognome: 100, codiceFiscale: 16,
    dataNascita: 10, indirizzoResidenza: 255, comuneResidenza: 100
  };

  for (const [key, max] of Object.entries(limits)) {
    data[key] = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (!data[key]) fields[key] = 'Questo campo è obbligatorio.';
    else if (data[key].length > max) fields[key] = `Inserisci al massimo ${max} caratteri.`;
  }

  data.email = data.email.toLowerCase();
  data.codiceFiscale = data.codiceFiscale.toUpperCase();
  data.iban = normalizeIban(input?.iban);

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    fields.email = 'Inserisci un indirizzo email valido.';
  }

  if (data.codiceFiscale && data.codiceFiscale.length !== 16) {
    fields.codiceFiscale = 'Il codice fiscale deve contenere esattamente 16 caratteri.';
  }

  if (!data.iban) {
    fields.iban = 'Questo campo è obbligatorio.';
  } else if (
    data.iban.length < 15
    || data.iban.length > 34
    || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(data.iban)
  ) {
    fields.iban = 'Inserisci un IBAN valido, da 15 a 34 caratteri, senza spazi.';
  }

  const date = new Date(`${data.dataNascita}T00:00:00.000Z`);
  const validBirthDate = data.dataNascita
    && /^\d{4}-\d{2}-\d{2}$/.test(data.dataNascita)
    && Number(data.dataNascita.slice(0, 4)) >= 1000
    && !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === data.dataNascita;

  if (data.dataNascita && !validBirthDate) {
    fields.dataNascita = 'Inserisci una data valida.';
  } else if (validBirthDate && data.dataNascita > adultBirthDateLimit()) {
    fields.dataNascita = 'Il proprietario deve avere almeno 18 anni e 1 giorno.';
  }

  if (typeof input?.password !== 'string' || !input.password.trim()
      || input.password.length < 8 || input.password.length > 128) {
    fields.password = 'La password deve contenere da 8 a 128 caratteri.';
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
    throw authError(400, 'Controlla i campi indicati.', fields);
  }
  return data;
}

async function register(input) {
  const data = validateRegistration(input);
  const passwordHash = await hashPassword(input.password);
  try {
    await repository.create(data, passwordHash);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw authError(409, 'Email o codice fiscale già registrati.');
    }
    throw error;
  }
  return { message: 'Registrazione completata. Ora puoi accedere.' };
}

async function login(input) {
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email || email.length > 255 || typeof input?.password !== 'string'
      || !input.password || input.password.length > 128) {
    throw authError(400, 'Inserisci email e password valide.');
  }
  const owner = await repository.findActiveByEmail(email);
  if (!owner || !await verifyPassword(input.password, owner.password_hash)) {
    throw authError(401, 'Email o password non corrette');
  }
  const token = jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(owner.id), expiresIn: '8h', algorithm: 'HS256'
  });
  return {
    token,
    proprietario: { id: owner.id, email: owner.email, nome: owner.nome, cognome: owner.cognome }
  };
}

async function me(id) {
  const owner = await repository.findActiveById(id);
  if (!owner) throw authError(401, 'Sessione non valida. Accedi nuovamente.');
  return owner;
}

module.exports = { register, login, me };
