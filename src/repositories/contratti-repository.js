const pool = require('../db/pool');

async function list(proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT CAST(c.id AS CHAR) AS id,
      CAST(i.id AS CHAR) AS immobileId, i.titolo, i.via,
      i.numero_civico AS numeroCivico, i.comune,
      CAST(q.id AS CHAR) AS inquilinoId, q.nome, q.cognome,
      q.codice_fiscale AS codiceFiscale,
      CAST(t.id AS CHAR) AS tipologiaId, t.denominazione, t.durata, t.rinnovo,
      DATE_FORMAT(c.data_inizio, '%Y-%m-%d') AS dataInizio,
      DATE_FORMAT(c.data_fine, '%Y-%m-%d') AS dataFine,
      c.canone_annuale AS canoneAnnuale, c.giorno_pagamento AS giornoPagamento
     FROM contratti c
     JOIN immobili i ON i.id = c.immobile_id AND i.proprietario_id = c.proprietario_id
     JOIN inquilini q ON q.id = c.inquilino_id AND q.proprietario_id = c.proprietario_id
     JOIN tipologie_contrattuali t ON t.id = c.tipologia_id
     WHERE c.proprietario_id = ? AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC, c.id DESC`, [proprietarioId]
  );
  // I contratti restano visibili anche se l'immobile o l'inquilino vengono archiviati.
  return rows.map((row) => ({
    id: row.id,
    immobile: { id: row.immobileId, titolo: row.titolo, via: row.via,
      numeroCivico: row.numeroCivico, comune: row.comune },
    inquilino: { id: row.inquilinoId, nome: row.nome, cognome: row.cognome,
      codiceFiscale: row.codiceFiscale },
    tipologia: { id: row.tipologiaId, denominazione: row.denominazione,
      durata: row.durata, rinnovo: row.rinnovo },
    dataInizio: row.dataInizio, dataFine: row.dataFine,
    canoneAnnuale: Number(row.canoneAnnuale), giornoPagamento: row.giornoPagamento
  }));
}

async function create(proprietarioId, data) {
  const connection = await pool.getConnection();
  try {
    // Ricontrolla proprietario e stato attivo anche al momento della scrittura.
    const [result] = await connection.execute(
      `INSERT INTO contratti (proprietario_id, immobile_id, inquilino_id, tipologia_id,
       data_inizio, data_fine, canone_annuale, giorno_pagamento)
       SELECT ?, i.id, q.id, t.id, ?, ?, ?, ?
       FROM immobili i
       JOIN inquilini q ON q.id = ? AND q.proprietario_id = i.proprietario_id
       JOIN tipologie_contrattuali t ON t.id = ?
       WHERE i.id = ? AND i.proprietario_id = ?
         AND i.deleted_at IS NULL AND q.deleted_at IS NULL
         AND i.dati_catastali IS NOT NULL AND TRIM(i.dati_catastali) <> ''`,
      [proprietarioId, data.dataInizio, data.dataFine, data.canoneAnnuale,
        data.giornoPagamento, data.inquilinoId, data.tipologiaId, data.immobileId, proprietarioId]
    );
    if (!result.affectedRows) return null;
    const [[row]] = await connection.query('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
    return row.id;
  } finally {
    connection.release();
  }
}

module.exports = { list, create };
