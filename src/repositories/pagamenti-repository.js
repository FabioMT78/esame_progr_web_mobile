const pool = require('../db/pool');

const contrattoColumns = `CAST(c.id AS CHAR) AS id,
  CAST(c.immobile_id AS CHAR) AS immobileId, CAST(c.inquilino_id AS CHAR) AS inquilinoId,
  DATE_FORMAT(c.data_inizio, '%Y-%m-%d') AS dataInizio,
  DATE_FORMAT(c.data_fine, '%Y-%m-%d') AS dataFine,
  c.canone_annuale AS canoneAnnuale, c.giorno_pagamento AS giornoPagamento`;
const contrattoJoins = `FROM contratti c
  JOIN immobili i ON i.id = c.immobile_id AND i.proprietario_id = c.proprietario_id
  JOIN inquilini q ON q.id = c.inquilino_id AND q.proprietario_id = c.proprietario_id`;

async function findCoppia(immobileId, inquilinoId, proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT i.id FROM immobili i
     JOIN inquilini q ON q.id = ? AND q.proprietario_id = i.proprietario_id
     WHERE i.id = ? AND i.proprietario_id = ? AND i.deleted_at IS NULL`,
    [inquilinoId, immobileId, proprietarioId]
  );
  // Anche un inquilino archiviato può avere arretrati su contratti storici.
  return rows.length > 0;
}

async function findContratto(id, proprietarioId, db = pool) {
  const [rows] = await db.execute(
    `SELECT ${contrattoColumns} ${contrattoJoins}
     WHERE c.id = ? AND c.proprietario_id = ? AND c.deleted_at IS NULL
       AND i.deleted_at IS NULL`, [id, proprietarioId]
  );
  return rows[0];
}

async function listContratti(immobileId, inquilinoId, proprietarioId, db = pool, lock = false) {
  const [rows] = await db.execute(
    `SELECT ${contrattoColumns} ${contrattoJoins}
     WHERE c.immobile_id = ? AND c.inquilino_id = ? AND c.proprietario_id = ?
       AND c.deleted_at IS NULL AND i.deleted_at IS NULL
     ORDER BY c.data_inizio, c.id${lock ? ' FOR UPDATE' : ''}`,
    [immobileId, inquilinoId, proprietarioId]
  );
  return rows;
}

async function listContrattiImmobile(immobileId, proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT ${contrattoColumns} ${contrattoJoins}
     WHERE c.immobile_id = ? AND c.proprietario_id = ?
       AND c.deleted_at IS NULL AND i.deleted_at IS NULL
     ORDER BY c.inquilino_id, c.data_inizio, c.id`,
    [immobileId, proprietarioId]
  );
  return rows;
}

async function listPagamenti(immobileId, inquilinoId, proprietarioId, db = pool, lock = false) {
  const [rows] = await db.execute(
    `SELECT CAST(p.contratto_id AS CHAR) AS contrattoId,
       p.anno_competenza AS annoCompetenza, p.mese_competenza AS meseCompetenza
     FROM pagamenti p
     JOIN contratti c ON c.id = p.contratto_id AND c.proprietario_id = p.proprietario_id
     WHERE p.proprietario_id = ? AND c.proprietario_id = ?
       AND c.immobile_id = ? AND c.inquilino_id = ? AND c.deleted_at IS NULL
     ${lock ? 'FOR UPDATE' : ''}`, [proprietarioId, proprietarioId, immobileId, inquilinoId]
  );
  // Il vincolo UNIQUE riserva la competenza anche per eventuali record archiviati.
  return rows;
}

async function listPagamentiImmobile(immobileId, proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT CAST(p.contratto_id AS CHAR) AS contrattoId,
       p.anno_competenza AS annoCompetenza, p.mese_competenza AS meseCompetenza
     FROM pagamenti p
     JOIN contratti c ON c.id = p.contratto_id AND c.proprietario_id = p.proprietario_id
     JOIN immobili i ON i.id = c.immobile_id AND i.proprietario_id = c.proprietario_id
     WHERE p.proprietario_id = ? AND c.proprietario_id = ?
       AND c.immobile_id = ? AND c.deleted_at IS NULL AND i.deleted_at IS NULL`,
    [proprietarioId, proprietarioId, immobileId]
  );
  return rows;
}

async function lockImmobile(id, proprietarioId, connection) {
  const [rows] = await connection.execute(
    `SELECT id FROM immobili
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL FOR UPDATE`,
    [id, proprietarioId]
  );
  return rows.length > 0;
}

async function insert(proprietarioId, pagamento, connection) {
  await connection.execute(
    `INSERT INTO pagamenti (proprietario_id, contratto_id, anno_competenza,
       mese_competenza, importo, data_pagamento)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [proprietarioId, pagamento.contrattoId, pagamento.annoCompetenza,
      pagamento.meseCompetenza, pagamento.importo, pagamento.dataPagamento]
  );
  const [[row]] = await connection.query('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
  return row.id;
}

async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  findCoppia,
  findContratto,
  listContratti,
  listContrattiImmobile,
  listPagamenti,
  listPagamentiImmobile,
  lockImmobile,
  insert,
  transaction
};
