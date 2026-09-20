const repository = require('../repositories/contratti-repository');
const immobili = require('../repositories/immobili-repository');
const inquilini = require('../repositories/inquilini-repository');
const tipologie = require('../repositories/tipologie-contrattuali-repository');
const proprietari = require('../repositories/proprietario-repository');
const bozze = require('./bozze-contratto-service');
const {
  hasRequiredCadastralData,
  hasCompleteTenantData
} = require('./contratti-requisiti');
const {
  calcolaDataFine,
  calcolaCanoneMensile
} = require('./contratti-calcoli');
const { generaAnteprima } = require('./contratto-documento-service');

function inputError(status, message, fields) {
  return Object.assign(new Error(message), { status, fields });
}

function validId(id) {
  return typeof id === 'string'
    && /^[1-9]\d{0,19}$/.test(id)
    && BigInt(id) <= 18446744073709551615n;
}

function validateInput(input) {
  const data = {};
  const fields = {};

  for (const key of ['immobileId', 'inquilinoId', 'tipologiaId']) {
    const id = input?.[key];
    if (!validId(id)) fields[key] = 'Seleziona un elemento valido.';
    else data[key] = id;
  }

  if (input && Object.hasOwn(input, 'dataFine')) {
    throw inputError(
      400,
      'La data finale è calcolata dal server e non deve essere inviata.'
    );
  }

  data.dataInizio = input?.dataInizio;

  const canone = input?.canoneAnnuale;
  if (!['string', 'number'].includes(typeof canone)
      || !/^\d+(\.\d{1,2})?$/.test(String(canone))
      || !Number.isFinite(Number(canone))
      || Number(canone) <= 0
      || Number(canone) > 99999999.99) {
    fields.canoneAnnuale =
      'Inserisci un importo tra 0,01 e 99.999.999,99 euro, con massimo 2 decimali.';
  }
  data.canoneAnnuale = Number(canone);

  const giorno = input?.giornoPagamento;
  if (!['string', 'number'].includes(typeof giorno)
      || !/^\d+$/.test(String(giorno))
      || !Number.isInteger(Number(giorno))
      || Number(giorno) < 1
      || Number(giorno) > 28) {
    fields.giornoPagamento = 'Inserisci un giorno intero tra 1 e 28.';
  }
  data.giornoPagamento = Number(giorno);

  if (Object.keys(fields).length) {
    throw inputError(400, 'Controlla i campi indicati.', fields);
  }

  return data;
}

async function prerequisiti(proprietarioId, immobileId = null) {
  const [immobiliAttivi, tipologieContrattuali] = await Promise.all([
    immobili.list(proprietarioId),
    tipologie.list()
  ]);

  let inquiliniAttivi = [];

  if (immobileId != null && immobileId !== '') {
    if (!validId(immobileId)) {
      throw inputError(400, 'Immobile non valido.', {
        immobileId: 'Seleziona un immobile valido.'
      });
    }

    if (!immobiliAttivi.some((item) => item.id === immobileId)) {
      throw inputError(404, 'Immobile non disponibile.', {
        immobileId: 'Seleziona un tuo immobile attivo.'
      });
    }

    inquiliniAttivi = await inquilini.listAvailableForContract(
      proprietarioId,
      immobileId
    );
  }

  return {
    immobili: immobiliAttivi,
    inquilini: inquiliniAttivi,
    tipologie: tipologieContrattuali
  };
}

function withCanoneMensile(contratto) {
  return {
    ...contratto,
    canoneMensile: calcolaCanoneMensile(contratto.canoneAnnuale)
  };
}

async function list(proprietarioId) {
  return (await repository.list(proprietarioId)).map(withCanoneMensile);
}

async function get(id, proprietarioId) {
  if (!validId(id)) throw inputError(404, 'Contratto non trovato.');
  const contratto = await repository.findById(id, proprietarioId);
  if (!contratto) throw inputError(404, 'Contratto non trovato.');
  return withCanoneMensile(contratto);
}

async function resolvePreviewEntities(proprietarioId, data) {
  const [immobile, inquilino, tipologia, proprietario] = await Promise.all([
    immobili.findById(data.immobileId, proprietarioId),
    inquilini.findActive(data.inquilinoId, proprietarioId),
    tipologie.findById(data.tipologiaId),
    proprietari.findContractDataById(proprietarioId)
  ]);

  if (!immobile) {
    throw inputError(404, 'Immobile non disponibile.', {
      immobileId: 'Seleziona un tuo immobile attivo.'
    });
  }
  if (!inquilino) {
    throw inputError(404, 'Inquilino non disponibile.', {
      inquilinoId: 'Seleziona un tuo inquilino attivo.'
    });
  }
  if (inquilino.immobileId && inquilino.immobileId !== immobile.id) {
    throw inputError(400, 'L’inquilino non è associato all’immobile selezionato.', {
      inquilinoId: 'Seleziona un inquilino associato a questo immobile.'
    });
  }
  if (await inquilini.hasContractForImmobile(
    inquilino.id,
    proprietarioId,
    immobile.id
  )) {
    throw inputError(409, 'L’inquilino ha già un contratto registrato per questo immobile.', {
      inquilinoId: 'Seleziona un inquilino che non abbia già un contratto per questo immobile.'
    });
  }
  if (!tipologia) {
    throw inputError(404, 'Tipologia contrattuale non disponibile.', {
      tipologiaId: 'Seleziona una tipologia disponibile.'
    });
  }
  if (!proprietario) {
    throw inputError(401, 'Sessione non valida. Accedi nuovamente.');
  }
  if (!hasRequiredCadastralData(immobile)) {
    throw inputError(400, 'Completa i dati catastali necessari.', {
      immobileId:
        'Servono codice comunale, foglio, particella, subalterno, categoria e rendita.'
    });
  }
  if (!hasCompleteTenantData(inquilino)) {
    throw inputError(400, 'Completa i dati dell’inquilino.', {
      inquilinoId:
        'Servono dati anagrafici, residenza completa e documento di riconoscimento completo.'
    });
  }

  return { immobile, inquilino, tipologia, proprietario };
}

async function anteprima(proprietarioId, body) {
  const data = validateInput(body);
  const entities = await resolvePreviewEntities(proprietarioId, data);

  try {
    data.dataFine = calcolaDataFine(data.dataInizio, entities.tipologia.durata);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw inputError(
      400,
      'Controlla la decorrenza del contratto.',
      { dataInizio: error.message }
    );
  }

  const articoli = await tipologie.listArticles(entities.tipologia.id);
  if (!articoli.length) {
    throw inputError(409, 'La tipologia selezionata non contiene articoli contrattuali.');
  }

  return generaAnteprima({
    contratto: {
      dataInizio: data.dataInizio,
      dataFine: data.dataFine,
      canoneAnnuale: data.canoneAnnuale,
      giornoPagamento: data.giornoPagamento,
      nomeDescrizione: `${entities.tipologia.denominazione} — ${entities.immobile.titolo}`,
      registratoIl: null
    },
    ...entities,
    articoli
  });
}

async function anteprimaRegistrata(id, proprietarioId) {
  const contratto = await get(id, proprietarioId);
  const [proprietario, articoli] = await Promise.all([
    proprietari.findContractDataById(proprietarioId),
    tipologie.listArticles(contratto.tipologia.id)
  ]);

  if (!proprietario) {
    throw inputError(401, 'Sessione non valida. Accedi nuovamente.');
  }
  if (!articoli.length) {
    throw inputError(409, 'La tipologia del contratto non contiene articoli.');
  }

  return generaAnteprima({
    contratto: {
      ...contratto,
      nomeDescrizione: `${contratto.tipologia.denominazione} — ${contratto.immobile.titolo}`
    },
    immobile: contratto.immobile,
    inquilino: contratto.inquilino,
    tipologia: contratto.tipologia,
    proprietario,
    articoli
  });
}

async function create(proprietarioId, body) {
  const data = validateInput(body);

  const [immobile, inquilino, tipologia] = await Promise.all([
    immobili.findById(data.immobileId, proprietarioId),
    inquilini.findActive(data.inquilinoId, proprietarioId),
    tipologie.findById(data.tipologiaId)
  ]);

  if (!immobile) {
    throw inputError(404, 'Immobile non disponibile.', {
      immobileId: 'Seleziona un tuo immobile attivo.'
    });
  }

  if (!inquilino) {
    throw inputError(404, 'Inquilino non disponibile.', {
      inquilinoId: 'Seleziona un tuo inquilino attivo.'
    });
  }

  if (inquilino.immobileId === null) {
    const associated = await inquilini.assignImmobile(
      inquilino.id,
      proprietarioId,
      immobile.id
    );
    if (associated) inquilino.immobileId = immobile.id;
  }

  if (inquilino.immobileId !== immobile.id) {
    throw inputError(400, 'L’inquilino non è associato all’immobile selezionato.', {
      inquilinoId: 'Seleziona un inquilino associato a questo immobile.'
    });
  }

  if (await inquilini.hasContractForImmobile(
    inquilino.id,
    proprietarioId,
    immobile.id
  )) {
    throw inputError(409, 'L’inquilino ha già un contratto registrato per questo immobile.', {
      inquilinoId: 'Seleziona un inquilino che non abbia già un contratto per questo immobile.'
    });
  }

  if (!tipologia) {
    throw inputError(404, 'Tipologia contrattuale non disponibile.', {
      tipologiaId: 'Seleziona una tipologia disponibile.'
    });
  }

  if (!hasRequiredCadastralData(immobile)) {
    throw inputError(
      400,
      'Completa i dati catastali necessari prima di registrare il contratto.',
      {
        immobileId:
          'Servono codice comunale, foglio, particella, subalterno, categoria e rendita.'
      }
    );
  }

  if (!hasCompleteTenantData(inquilino)) {
    throw inputError(
      400,
      'Completa i dati dell’inquilino prima di registrare il contratto.',
      {
        inquilinoId:
          'Servono dati anagrafici, residenza completa e documento di riconoscimento completo.'
      }
    );
  }

  try {
    data.dataFine = calcolaDataFine(data.dataInizio, tipologia.durata);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw inputError(
      400,
      'Controlla la decorrenza del contratto.',
      { dataInizio: error.message }
    );
  }

  const id = await repository.create(proprietarioId, data);
  if (!id) {
    throw inputError(
      409,
      'I dati selezionati non sono più disponibili, non sono associati tra loro o non sono più completi. Ricarica e riprova.'
    );
  }

  await bozze.remove(proprietarioId).catch(() => {});

  return withCanoneMensile({
    id,
    immobile,
    inquilino,
    tipologia,
    dataInizio: data.dataInizio,
    dataFine: data.dataFine,
    canoneAnnuale: data.canoneAnnuale,
    giornoPagamento: data.giornoPagamento
  });
}

module.exports = {
  prerequisiti,
  list,
  get,
  anteprima,
  anteprimaRegistrata,
  create
};
