const crypto = require('node:crypto');
const movimentiRepository = require('../repositories/movimenti-repository');
const pagamentiRepository = require('../repositories/pagamenti-repository');
const { competenzeNonPagate } = require('./pagamenti-calcoli');

const MAX_ROWS = 200;
const MAX_AMOUNT_CENTS = 9999999999;

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

function validateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw inputError(400, 'La data del movimento non è valida.');
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day) {
    throw inputError(400, 'La data del movimento non è valida.');
  }
  return value;
}

function validateAmount(value) {
  if (!['string', 'number'].includes(typeof value)) {
    throw inputError(400, 'L’importo del movimento non è valido.');
  }

  const text = String(value).trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) {
    throw inputError(400, 'L’importo deve essere positivo e avere al massimo due decimali.');
  }

  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_AMOUNT_CENTS) {
    throw inputError(400, 'L’importo del movimento non è valido.');
  }

  return {
    cents,
    value: (cents / 100).toFixed(2)
  };
}

function validateOptionalText(value, maxLength, label) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw inputError(400, `${label} non è valida.`);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw inputError(400, `${label} può contenere al massimo ${maxLength} caratteri.`);
  }
  return normalized;
}

function hashMovement(movement) {
  return crypto.createHash('sha256').update([
    movement.dataMovimento,
    movement.importoCents,
    movement.descrizione || '',
    movement.riferimentoEsterno || ''
  ].join('\u001f')).digest('hex');
}

function validateMovement(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw inputError(400, 'La riga del movimento non è valida.');
  }

  const riga = Number.isInteger(raw.riga) && raw.riga > 1
    ? raw.riga
    : index + 2;
  const amount = validateAmount(raw.importo);
  const movement = {
    riga,
    dataMovimento: validateDate(raw.dataMovimento),
    importo: amount.value,
    importoCents: amount.cents,
    descrizione: validateOptionalText(raw.descrizione, 500, 'La descrizione'),
    riferimentoEsterno: validateOptionalText(
      raw.riferimentoEsterno,
      255,
      'Il riferimento esterno'
    )
  };

  movement.hashRiga = hashMovement(movement);
  movement.indiceMese = Number(movement.dataMovimento.slice(0, 4)) * 12
    + Number(movement.dataMovimento.slice(5, 7)) - 1;
  return movement;
}

function validateBody(body) {
  const immobileId = validateId(body?.immobileId);
  const inquilinoId = validateId(body?.inquilinoId);

  if (!Array.isArray(body?.movimenti) || !body.movimenti.length) {
    throw inputError(400, 'Seleziona almeno un movimento da elaborare.');
  }
  if (body.movimenti.length > MAX_ROWS) {
    throw inputError(413, `Puoi importare al massimo ${MAX_ROWS} movimenti alla volta.`);
  }

  return { immobileId, inquilinoId, movimenti: body.movimenti };
}

function movementView(movement) {
  return {
    riga: movement.riga,
    dataMovimento: movement.dataMovimento,
    importo: Number(movement.importo),
    descrizione: movement.descrizione,
    riferimentoEsterno: movement.riferimentoEsterno
  };
}

function competenceView(competence) {
  return {
    contrattoId: competence.contrattoId,
    annoCompetenza: competence.annoCompetenza,
    meseCompetenza: competence.meseCompetenza,
    importo: competence.importo,
    scadenza: competence.scadenza
  };
}

function evaluateAssociations(movements, competences, existingHashes) {
  const rows = new Map();
  const firstByHash = new Map();
  const candidateMap = new Map();

  for (const movement of movements) {
    if (firstByHash.has(movement.hashRiga)) {
      rows.set(movement.riga, {
        ...movementView(movement),
        stato: 'duplicato',
        competenza: null,
        motivo: `Duplicato della riga ${firstByHash.get(movement.hashRiga)} del file.`
      });
      continue;
    }
    firstByHash.set(movement.hashRiga, movement.riga);

    if (existingHashes.has(movement.hashRiga)) {
      rows.set(movement.riga, {
        ...movementView(movement),
        stato: 'duplicato',
        competenza: null,
        motivo: 'Movimento già importato.'
      });
      continue;
    }

    const eligibleByDate = competences.filter(
      (competence) => competence.indice <= movement.indiceMese
    );
    const candidates = eligibleByDate.filter(
      (competence) => Math.round(competence.importo * 100) === movement.importoCents
    );

    candidateMap.set(movement.riga, { movement, candidates, eligibleByDate });
  }

  const pending = new Set(candidateMap.keys());
  const reserved = new Set();
  const assigned = new Map();

  while (pending.size) {
    const singletonGroups = new Map();

    for (const riga of pending) {
      const available = candidateMap.get(riga).candidates.filter(
        (candidate) => !reserved.has(candidate.key)
      );
      if (available.length !== 1) continue;

      const key = available[0].key;
      if (!singletonGroups.has(key)) singletonGroups.set(key, []);
      singletonGroups.get(key).push({ riga, candidate: available[0] });
    }

    const uniqueAssignments = [...singletonGroups.values()]
      .filter((group) => group.length === 1)
      .map((group) => group[0]);

    if (!uniqueAssignments.length) break;

    for (const { riga, candidate } of uniqueAssignments) {
      if (!pending.has(riga) || reserved.has(candidate.key)) continue;
      assigned.set(riga, candidate);
      reserved.add(candidate.key);
      pending.delete(riga);
    }
  }

  for (const [riga, data] of candidateMap) {
    const { movement, candidates, eligibleByDate } = data;
    const assignedCompetence = assigned.get(riga);

    if (assignedCompetence) {
      rows.set(riga, {
        ...movementView(movement),
        stato: 'associabile',
        competenza: competenceView(assignedCompetence),
        motivo: 'Associazione univoca.'
      });
      continue;
    }

    const available = candidates.filter((candidate) => !reserved.has(candidate.key));
    let motivo;

    if (!eligibleByDate.length) {
      motivo = 'Nessuna competenza non pagata è disponibile entro il mese del movimento.';
    } else if (!candidates.length) {
      motivo = 'L’importo non coincide con alcuna competenza non pagata disponibile.';
    } else if (!available.length) {
      motivo = 'La competenza compatibile è già stata proposta a un altro movimento del file.';
    } else if (available.length === 1) {
      motivo = 'Più movimenti competono per la stessa competenza: associazione ambigua.';
    } else {
      motivo = 'Più competenze hanno data e importo compatibili: associazione ambigua.';
    }

    rows.set(riga, {
      ...movementView(movement),
      stato: 'non associabile',
      competenza: null,
      motivo
    });
  }

  return [...rows.values()].sort((a, b) => a.riga - b.riga);
}

async function evaluate(proprietarioId, immobileId, inquilinoId, movements, db, lock = false) {
  const hashes = [...new Set(movements.map((movement) => movement.hashRiga))];
  const contracts = await pagamentiRepository.listContratti(
    immobileId,
    inquilinoId,
    proprietarioId,
    db,
    lock
  );
  const payments = await pagamentiRepository.listPagamenti(
    immobileId,
    inquilinoId,
    proprietarioId,
    db,
    lock
  );
  const existingHashes = await movimentiRepository.findExistingHashes(
    proprietarioId,
    hashes,
    db
  );

  const maxDate = movements.reduce(
    (max, movement) => movement.dataMovimento > max ? movement.dataMovimento : max,
    movements[0]?.dataMovimento || '0000-01-01'
  );
  const competences = contracts.length
    ? competenzeNonPagate(contracts, payments, maxDate)
    : [];

  return evaluateAssociations(movements, competences, existingHashes);
}

async function preview(proprietarioId, body) {
  const input = validateBody(body);
  if (!await pagamentiRepository.findCoppia(
    input.immobileId,
    input.inquilinoId,
    proprietarioId
  )) {
    throw inputError(404, 'Immobile o inquilino non disponibile.');
  }

  const valid = [];
  const errors = [];
  const seenRows = new Set();

  input.movimenti.forEach((raw, index) => {
    try {
      const movement = validateMovement(raw, index);
      if (seenRows.has(movement.riga)) {
        throw inputError(400, 'Il numero di riga è duplicato.');
      }
      seenRows.add(movement.riga);
      valid.push(movement);
    } catch (error) {
      errors.push({
        riga: Number.isInteger(raw?.riga) ? raw.riga : index + 2,
        dataMovimento: typeof raw?.dataMovimento === 'string' ? raw.dataMovimento : null,
        importo: raw?.importo ?? null,
        descrizione: typeof raw?.descrizione === 'string' ? raw.descrizione : null,
        riferimentoEsterno: typeof raw?.riferimentoEsterno === 'string'
          ? raw.riferimentoEsterno
          : null,
        stato: 'errore',
        competenza: null,
        motivo: error.message
      });
    }
  });

  const evaluated = valid.length
    ? await evaluate(
      proprietarioId,
      input.immobileId,
      input.inquilinoId,
      valid,
      undefined,
      false
    )
    : [];
  const rows = [...errors, ...evaluated].sort((a, b) => a.riga - b.riga);

  return {
    rows,
    summary: {
      totale: rows.length,
      associabili: rows.filter((row) => row.stato === 'associabile').length,
      duplicati: rows.filter((row) => row.stato === 'duplicato').length,
      nonAssociabili: rows.filter((row) => row.stato === 'non associabile').length,
      errori: rows.filter((row) => row.stato === 'errore').length
    }
  };
}

async function importRows(proprietarioId, body) {
  const input = validateBody(body);
  const movements = input.movimenti.map((raw, index) => validateMovement(raw, index));
  if (new Set(movements.map((movement) => movement.riga)).size !== movements.length) {
    throw inputError(400, 'Il numero di riga è duplicato.');
  }

  try {
    return await pagamentiRepository.transaction(async (connection) => {
      if (!await pagamentiRepository.lockImmobile(
        input.immobileId,
        proprietarioId,
        connection
      )) {
        throw inputError(404, 'Immobile non disponibile.');
      }

      if (!await pagamentiRepository.findCoppia(
        input.immobileId,
        input.inquilinoId,
        proprietarioId,
        connection
      )) {
        throw inputError(404, 'Immobile o inquilino non disponibile.');
      }

      const rows = await evaluate(
        proprietarioId,
        input.immobileId,
        input.inquilinoId,
        movements,
        connection,
        true
      );

      if (rows.length !== movements.length
          || rows.some((row) => row.stato !== 'associabile')) {
        throw inputError(
          409,
          'La situazione dei movimenti o dei pagamenti è cambiata. Ricarica l’anteprima.'
        );
      }

      const byRow = new Map(movements.map((movement) => [movement.riga, movement]));
      const imported = [];

      for (const row of rows) {
        const movement = byRow.get(row.riga);
        const payment = {
          contrattoId: row.competenza.contrattoId,
          annoCompetenza: row.competenza.annoCompetenza,
          meseCompetenza: row.competenza.meseCompetenza,
          importo: row.competenza.importo,
          dataPagamento: movement.dataMovimento
        };
        const pagamentoId = await pagamentiRepository.insert(
          proprietarioId,
          payment,
          connection
        );
        const movimentoId = await movimentiRepository.insert(
          proprietarioId,
          pagamentoId,
          movement,
          connection
        );

        imported.push({
          movimentoId,
          pagamentoId,
          ...movementView(movement),
          competenza: row.competenza
        });
      }

      return {
        importedCount: imported.length,
        rows: imported
      };
    });
  } catch (error) {
    if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
      throw inputError(
        409,
        'La situazione dei movimenti o dei pagamenti è cambiata. Ricarica l’anteprima.'
      );
    }
    throw error;
  }
}

module.exports = {
  preview,
  importRows
};
