const repository = require('../repositories/pagamenti-repository');
const { primaCompetenzaNonPagata } = require('./pagamenti-calcoli');

function inputError(status, message) {
  return Object.assign(new Error(message), { status });
}

function validateId(id) {
  if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id)
      || BigInt(id) > 18446744073709551615n) {
    throw inputError(400, 'Seleziona un identificativo valido.');
  }
  return id;
}

function validateConferma(body) {
  const contrattoId = validateId(body?.contrattoId);
  const annoCompetenza = body?.annoCompetenza;
  const meseCompetenza = body?.meseCompetenza;
  if (!Number.isInteger(annoCompetenza) || annoCompetenza < 1000 || annoCompetenza > 9999
      || !Number.isInteger(meseCompetenza) || meseCompetenza < 1 || meseCompetenza > 12) {
    throw inputError(400, 'Anno o mese di competenza non validi.');
  }
  if (Object.hasOwn(body, 'importo') || Object.hasOwn(body, 'dataPagamento')) {
    throw inputError(400, 'Importo e data del pagamento sono determinati dal server.');
  }
  return { contrattoId, annoCompetenza, meseCompetenza };
}

function validateImporto(preview) {
  if (preview && preview.importo <= 0) {
    throw inputError(400, 'La competenza ha un importo inferiore a un centesimo e non può essere registrata.');
  }
}

async function anteprima(proprietarioId, query) {
  const immobileId = validateId(query.immobileId);
  const inquilinoId = validateId(query.inquilinoId);
  if (!await repository.findCoppia(immobileId, inquilinoId, proprietarioId)) {
    throw inputError(404, 'Immobile o inquilino non disponibile.');
  }
  const contratti = await repository.listContratti(immobileId, inquilinoId, proprietarioId);
  if (!contratti.length) throw inputError(404, 'Nessun contratto disponibile per questo immobile e inquilino.');
  const pagamenti = await repository.listPagamenti(immobileId, inquilinoId, proprietarioId);
  const preview = primaCompetenzaNonPagata(contratti, pagamenti, new Date().toISOString().slice(0, 10));
  if (!preview) throw inputError(404, 'Nessuna competenza da pagare fino al mese corrente.');
  validateImporto(preview);
  return preview;
}

async function create(proprietarioId, body) {
  const input = validateConferma(body);
  const contratto = await repository.findContratto(input.contrattoId, proprietarioId);
  if (!contratto) throw inputError(404, 'Contratto non disponibile.');
  try {
    return await repository.transaction(async (connection) => {
      // Ordine di lock comune a tutti i pagamenti dell'immobile, anche su contratti diversi.
      if (!await repository.lockImmobile(contratto.immobileId, proprietarioId, connection)) {
        throw inputError(404, 'Immobile non disponibile.');
      }
      const aggiornato = await repository.findContratto(input.contrattoId, proprietarioId, connection);
      if (!aggiornato || aggiornato.immobileId !== contratto.immobileId
          || aggiornato.inquilinoId !== contratto.inquilinoId) {
        throw inputError(409, 'Il contratto è cambiato. Ricarica l’anteprima.');
      }
      const contratti = await repository.listContratti(
        aggiornato.immobileId, aggiornato.inquilinoId, proprietarioId, connection, true
      );
      const pagamenti = await repository.listPagamenti(
        aggiornato.immobileId, aggiornato.inquilinoId, proprietarioId, connection, true
      );
      const oggi = new Date().toISOString().slice(0, 10);
      const preview = primaCompetenzaNonPagata(contratti, pagamenti, oggi);
      if (!preview || preview.contrattoId !== input.contrattoId
          || preview.annoCompetenza !== input.annoCompetenza
          || preview.meseCompetenza !== input.meseCompetenza) {
        throw inputError(409, 'La competenza non è più registrabile. Ricarica l’anteprima.');
      }
      validateImporto(preview);
      const pagamento = { ...input, importo: preview.importo, dataPagamento: oggi };
      const id = await repository.insert(proprietarioId, pagamento, connection);
      return { id, ...pagamento };
    });
  } catch (error) {
    if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
      throw inputError(409, 'La situazione dei pagamenti è cambiata. Ricarica l’anteprima.');
    }
    throw error;
  }
}

module.exports = { anteprima, create };
