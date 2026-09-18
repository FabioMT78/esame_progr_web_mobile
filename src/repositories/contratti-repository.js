const pool = require('../db/pool');

async function list(proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT CAST(c.id AS CHAR) AS id,
      CAST(i.id AS CHAR) AS immobileId, i.titolo, i.indirizzo, i.civico, i.comune,
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

  return rows.map((row) => ({
    id: row.id,
    immobile: {
      id: row.immobileId,
      titolo: row.titolo,
      indirizzo: row.indirizzo,
      civico: row.civico,
      comune: row.comune
    },
    inquilino: {
      id: row.inquilinoId,
      nome: row.nome,
      cognome: row.cognome,
      codiceFiscale: row.codiceFiscale
    },
    tipologia: {
      id: row.tipologiaId,
      denominazione: row.denominazione,
      durata: row.durata,
      rinnovo: row.rinnovo
    },
    dataInizio: row.dataInizio,
    dataFine: row.dataFine,
    canoneAnnuale: Number(row.canoneAnnuale),
    giornoPagamento: row.giornoPagamento
  }));
}

async function findById(id, proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT
      CAST(c.id AS CHAR) AS id,
      DATE_FORMAT(c.created_at, '%Y-%m-%d') AS registratoIl,
      DATE_FORMAT(c.data_inizio, '%Y-%m-%d') AS dataInizio,
      DATE_FORMAT(c.data_fine, '%Y-%m-%d') AS dataFine,
      c.canone_annuale AS canoneAnnuale,
      c.giorno_pagamento AS giornoPagamento,

      CAST(i.id AS CHAR) AS immobileId,
      i.titolo,
      i.indirizzo AS immobileIndirizzo,
      i.civico AS immobileCivico,
      i.cap AS immobileCap,
      i.comune AS immobileComune,
      i.provincia AS immobileProvincia,
      i.codice_comunale AS codiceComunale,
      i.foglio,
      i.particella,
      i.subalterno,
      i.zona,
      i.categoria,
      i.consistenza,
      i.rendita,

      CAST(q.id AS CHAR) AS inquilinoId,
      q.nome,
      q.cognome,
      q.codice_fiscale AS codiceFiscale,
      DATE_FORMAT(q.data_nascita, '%Y-%m-%d') AS dataNascita,
      q.indirizzo AS inquilinoIndirizzo,
      q.civico AS inquilinoCivico,
      q.cap AS inquilinoCap,
      q.provincia AS inquilinoProvincia,
      q.comune AS inquilinoComune,
      q.tipo_documento AS tipoDocumento,
      q.numero_documento AS numeroDocumento,
      q.organo_rilascio_documento AS organoRilascioDocumento,
      DATE_FORMAT(q.data_rilascio_documento, '%Y-%m-%d') AS dataRilascioDocumento,
      DATE_FORMAT(q.data_scadenza_documento, '%Y-%m-%d') AS dataScadenzaDocumento,

      CAST(t.id AS CHAR) AS tipologiaId,
      t.denominazione,
      t.durata,
      t.rinnovo

     FROM contratti c
     JOIN immobili i ON i.id = c.immobile_id AND i.proprietario_id = c.proprietario_id
     JOIN inquilini q ON q.id = c.inquilino_id AND q.proprietario_id = c.proprietario_id
     JOIN tipologie_contrattuali t ON t.id = c.tipologia_id
     WHERE c.id = ? AND c.proprietario_id = ? AND c.deleted_at IS NULL`,
    [id, proprietarioId]
  );

  const row = rows[0];
  if (!row) return undefined;

  return {
    id: row.id,
    registratoIl: row.registratoIl,
    immobile: {
      id: row.immobileId,
      titolo: row.titolo,
      indirizzo: row.immobileIndirizzo,
      civico: row.immobileCivico,
      cap: row.immobileCap,
      comune: row.immobileComune,
      provincia: row.immobileProvincia,
      datiCatastali: {
        codiceComunale: row.codiceComunale,
        foglio: row.foglio,
        particella: row.particella,
        subalterno: row.subalterno,
        zona: row.zona,
        categoria: row.categoria,
        consistenza: row.consistenza,
        rendita: row.rendita
      }
    },
    inquilino: {
      id: row.inquilinoId,
      nome: row.nome,
      cognome: row.cognome,
      codiceFiscale: row.codiceFiscale,
      dataNascita: row.dataNascita,
      indirizzo: row.inquilinoIndirizzo,
      civico: row.inquilinoCivico,
      cap: row.inquilinoCap,
      provincia: row.inquilinoProvincia,
      comune: row.inquilinoComune,
      tipoDocumento: row.tipoDocumento,
      numeroDocumento: row.numeroDocumento,
      organoRilascioDocumento: row.organoRilascioDocumento,
      dataRilascioDocumento: row.dataRilascioDocumento,
      dataScadenzaDocumento: row.dataScadenzaDocumento
    },
    tipologia: {
      id: row.tipologiaId,
      denominazione: row.denominazione,
      durata: row.durata,
      rinnovo: row.rinnovo
    },
    dataInizio: row.dataInizio,
    dataFine: row.dataFine,
    canoneAnnuale: Number(row.canoneAnnuale),
    giornoPagamento: row.giornoPagamento
  };
}

async function create(proprietarioId, data) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.execute(
      `INSERT INTO contratti (
        proprietario_id, immobile_id, inquilino_id, tipologia_id,
        data_inizio, data_fine, canone_annuale, giorno_pagamento
      )
       SELECT ?, i.id, q.id, t.id, ?, ?, ?, ?
       FROM immobili i
       JOIN inquilini q ON q.id = ?
         AND q.proprietario_id = i.proprietario_id
         AND q.immobile_id = i.id
       JOIN tipologie_contrattuali t ON t.id = ?
       WHERE i.id = ? AND i.proprietario_id = ?
         AND i.deleted_at IS NULL
         AND q.deleted_at IS NULL
         AND i.foglio IS NOT NULL
         AND i.particella IS NOT NULL
         AND i.subalterno IS NOT NULL
         AND i.categoria IS NOT NULL AND TRIM(i.categoria) <> ''
         AND i.rendita IS NOT NULL
         AND q.nome IS NOT NULL AND TRIM(q.nome) <> ''
         AND q.cognome IS NOT NULL AND TRIM(q.cognome) <> ''
         AND q.codice_fiscale IS NOT NULL AND TRIM(q.codice_fiscale) <> ''
         AND q.data_nascita IS NOT NULL
         AND q.indirizzo IS NOT NULL AND TRIM(q.indirizzo) <> ''
         AND q.civico IS NOT NULL AND TRIM(q.civico) <> ''
         AND q.cap IS NOT NULL AND TRIM(q.cap) <> ''
         AND q.provincia IS NOT NULL AND TRIM(q.provincia) <> ''
         AND q.comune IS NOT NULL AND TRIM(q.comune) <> ''
         AND q.tipo_documento IS NOT NULL AND TRIM(q.tipo_documento) <> ''
         AND q.numero_documento IS NOT NULL AND TRIM(q.numero_documento) <> ''
         AND q.organo_rilascio_documento IS NOT NULL
             AND TRIM(q.organo_rilascio_documento) <> ''
         AND q.data_rilascio_documento IS NOT NULL
         AND q.data_scadenza_documento IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM contratti esistente
           WHERE esistente.proprietario_id = ?
             AND esistente.immobile_id = i.id
             AND esistente.inquilino_id = q.id
             AND esistente.deleted_at IS NULL
         )`,
      [
        proprietarioId,
        data.dataInizio,
        data.dataFine,
        data.canoneAnnuale,
        data.giornoPagamento,
        data.inquilinoId,
        data.tipologiaId,
        data.immobileId,
        proprietarioId,
        proprietarioId
      ]
    );

    if (!result.affectedRows) return null;
    const [[row]] = await connection.query(
      'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'
    );
    return row.id;
  } finally {
    connection.release();
  }
}

module.exports = { list, findById, create };
