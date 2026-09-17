const repository = require('../repositories/bozze-contratto-repository');
const immobili = require('../repositories/immobili-repository');
const inquilini = require('../repositories/inquilini-repository');
const tipologie = require('../repositories/tipologie-contrattuali-repository');
const {
  hasRequiredCadastralData,
  hasCompleteTenantData
} = require('./contratti-requisiti');

function inputError(status, message, fields) {
  return Object.assign(new Error(message), { status, fields });
}

function validId(value) {
  return typeof value === 'string'
    && /^[1-9]\d{0,19}$/.test(value)
    && BigInt(value) <= 18446744073709551615n;
}

function normalizeNullableId(value, field) {
  if (value == null || value === '') return null;
  if (!validId(value)) {
    throw inputError(400, 'Bozza non valida.', {
      [field]: 'Seleziona un elemento valido.'
    });
  }
  return value;
}

function safeReturnPath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')
      || trimmed.length > 500) return null;

  try {
    const url = new URL(trimmed, 'http://gestionale.local');
    if (url.origin !== 'http://gestionale.local') return null;
    if (['/', '/index.html', '/contratto.html'].includes(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function normalizeDraftData(raw) {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const normalized = {
    tipologiaId: null,
    dataInizio: '',
    canoneAnnuale: '',
    giornoPagamento: ''
  };

  if (data.tipologiaId != null && data.tipologiaId !== '') {
    if (!validId(String(data.tipologiaId))) {
      throw inputError(400, 'Bozza non valida.', {
        tipologiaId: 'Seleziona una tipologia valida.'
      });
    }
    normalized.tipologiaId = String(data.tipologiaId);
  }

  for (const key of ['dataInizio', 'canoneAnnuale', 'giornoPagamento']) {
    const value = data[key];
    if (value == null) continue;
    if (!['string', 'number'].includes(typeof value)) {
      throw inputError(400, 'Bozza non valida.');
    }
    normalized[key] = String(value).trim().slice(0, 30);
  }

  return normalized;
}

function contractDataComplete(data) {
  return Boolean(data.tipologiaId
    && /^\d{4}-\d{2}-\d{2}$/.test(data.dataInizio)
    && data.canoneAnnuale
    && data.giornoPagamento);
}

async function get(proprietarioId) {
  return repository.findByOwner(proprietarioId);
}

async function save(proprietarioId, input) {
  const existing = await repository.findByOwner(proprietarioId);

  const immobileId = Object.hasOwn(input || {}, 'immobileId')
    ? normalizeNullableId(input.immobileId, 'immobileId')
    : existing?.immobileId ?? null;

  const inquilinoId = Object.hasOwn(input || {}, 'inquilinoId')
    ? normalizeNullableId(input.inquilinoId, 'inquilinoId')
    : existing?.inquilinoId ?? null;

  const dati = Object.hasOwn(input || {}, 'dati')
    ? normalizeDraftData(input.dati)
    : normalizeDraftData(existing?.dati);

  const paginaProvenienza = Object.hasOwn(input || {}, 'paginaProvenienza')
    ? safeReturnPath(input.paginaProvenienza) || existing?.paginaProvenienza || null
    : existing?.paginaProvenienza || null;

  const requestedStep = Number(input?.stepCompletato ?? existing?.stepCompletato ?? 0);
  if (!Number.isInteger(requestedStep) || requestedStep < 0 || requestedStep > 3) {
    throw inputError(400, 'Lo stato della bozza non è valido.');
  }

  const [immobile, inquilino, tipologia] = await Promise.all([
    immobileId ? immobili.findById(immobileId, proprietarioId) : null,
    inquilinoId ? inquilini.findActive(inquilinoId, proprietarioId) : null,
    dati.tipologiaId ? tipologie.findById(dati.tipologiaId) : null
  ]);

  if (immobileId && !immobile) {
    throw inputError(404, 'Immobile non disponibile.', {
      immobileId: 'Seleziona un tuo immobile attivo.'
    });
  }
  if (inquilinoId && !inquilino) {
    throw inputError(404, 'Inquilino non disponibile.', {
      inquilinoId: 'Seleziona un tuo inquilino attivo.'
    });
  }
  if (dati.tipologiaId && !tipologia) {
    dati.tipologiaId = null;
  }

  let maxStep = 0;
  if (hasRequiredCadastralData(immobile)) maxStep = 1;
  if (maxStep >= 1 && hasCompleteTenantData(inquilino)) maxStep = 2;
  if (maxStep >= 2 && contractDataComplete(dati)) maxStep = 3;

  // Come nel progetto di Ingegneria, la bozza conserva anche uno snapshot
  // dei dati già verificati. Gli id rimangono comunque i riferimenti
  // autorevoli e vengono rivalidati a ogni salvataggio/conferma.
  const datiPersistiti = {
    ...dati,
    immobile: hasRequiredCadastralData(immobile) ? {
      id: immobile.id,
      titolo: immobile.titolo,
      indirizzo: immobile.indirizzo,
      civico: immobile.civico,
      cap: immobile.cap,
      comune: immobile.comune,
      provincia: immobile.provincia,
      datiCatastali: immobile.datiCatastali
    } : null,
    inquilino: hasCompleteTenantData(inquilino) ? {
      id: inquilino.id,
      nome: inquilino.nome,
      cognome: inquilino.cognome,
      codiceFiscale: inquilino.codiceFiscale,
      dataNascita: inquilino.dataNascita,
      indirizzo: inquilino.indirizzo,
      civico: inquilino.civico,
      cap: inquilino.cap,
      provincia: inquilino.provincia,
      comune: inquilino.comune,
      tipoDocumento: inquilino.tipoDocumento,
      numeroDocumento: inquilino.numeroDocumento,
      organoRilascioDocumento: inquilino.organoRilascioDocumento,
      dataRilascioDocumento: inquilino.dataRilascioDocumento,
      dataScadenzaDocumento: inquilino.dataScadenzaDocumento
    } : null,
    tipologia: tipologia ? {
      id: tipologia.id,
      denominazione: tipologia.denominazione,
      durata: tipologia.durata,
      rinnovo: tipologia.rinnovo
    } : null
  };

  return repository.upsert(proprietarioId, {
    immobileId,
    inquilinoId,
    stepCompletato: Math.min(requestedStep, maxStep),
    dati: datiPersistiti,
    paginaProvenienza
  });
}

async function remove(proprietarioId) {
  await repository.removeByOwner(proprietarioId);
}

module.exports = { get, save, remove };
