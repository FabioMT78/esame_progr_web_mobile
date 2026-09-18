const pool = require('../db/pool');

const columns = `CAST(id AS CHAR) AS id, CAST(immobile_id AS CHAR) AS immobileId,
  nome, cognome, codice_fiscale AS codiceFiscale,
  DATE_FORMAT(data_nascita, '%Y-%m-%d') AS dataNascita,
  indirizzo, civico, cap, provincia, comune,
  immagine_url AS immagineUrl,
  tipo_documento AS tipoDocumento, numero_documento AS numeroDocumento,
  organo_rilascio_documento AS organoRilascioDocumento,
  DATE_FORMAT(data_rilascio_documento, '%Y-%m-%d') AS dataRilascioDocumento,
  DATE_FORMAT(data_scadenza_documento, '%Y-%m-%d') AS dataScadenzaDocumento`;

async function list(ownerId, immobileId = null) {
  const whereImmobile = immobileId === null ? '' : ' AND immobile_id = ?';
  const params = immobileId === null ? [ownerId] : [ownerId, immobileId];
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM inquilini
     WHERE proprietario_id = ? AND deleted_at IS NULL${whereImmobile}
     ORDER BY cognome, nome, id`,
    params
  );
  return rows;
}

async function listAvailableForContract(ownerId, immobileId) {
  const [rows] = await pool.execute(
    `SELECT ${columns}
     FROM inquilini
     WHERE proprietario_id = ?
       AND immobile_id = ?
       AND deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM contratti c
         WHERE c.proprietario_id = inquilini.proprietario_id
           AND c.immobile_id = inquilini.immobile_id
           AND c.inquilino_id = inquilini.id
           AND c.deleted_at IS NULL
       )
     ORDER BY cognome, nome, id`,
    [ownerId, immobileId]
  );
  return rows;
}

async function findActive(id, ownerId) {
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM inquilini
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`, [id, ownerId]
  );
  return rows[0];
}

function values(data) {
  return [
    data.immobileId,
    data.nome,
    data.cognome,
    data.codiceFiscale,
    data.dataNascita,
    data.indirizzo,
    data.civico,
    data.cap,
    data.provincia,
    data.comune,
    data.immagineUrl,
    data.tipoDocumento,
    data.numeroDocumento,
    data.organoRilascioDocumento,
    data.dataRilascioDocumento,
    data.dataScadenzaDocumento
  ];
}

async function create(ownerId, data) {
  const [result] = await pool.execute(
    `INSERT INTO inquilini (
      proprietario_id, immobile_id, nome, cognome, codice_fiscale, data_nascita,
      indirizzo, civico, cap, provincia, comune, immagine_url,
      tipo_documento, numero_documento, organo_rilascio_documento,
      data_rilascio_documento, data_scadenza_documento
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ownerId, ...values(data)]
  );
  return String(result.insertId);
}

async function update(id, ownerId, data) {
  const [result] = await pool.execute(
    `UPDATE inquilini SET
      immobile_id = ?,
      nome = ?, cognome = ?, codice_fiscale = ?, data_nascita = ?,
      indirizzo = ?, civico = ?, cap = ?, provincia = ?, comune = ?, immagine_url = ?,
      tipo_documento = ?, numero_documento = ?, organo_rilascio_documento = ?,
      data_rilascio_documento = ?, data_scadenza_documento = ?
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`,
    [...values(data), id, ownerId]
  );
  return result.affectedRows > 0;
}

async function hasActiveContract(id, ownerId) {
  const [rows] = await pool.execute(
    `SELECT EXISTS(
       SELECT 1 FROM contratti
       WHERE inquilino_id = ? AND proprietario_id = ?
         AND deleted_at IS NULL
         AND CURRENT_DATE BETWEEN data_inizio AND data_fine
     ) AS hasActiveContract`,
    [id, ownerId]
  );
  return Boolean(rows[0].hasActiveContract);
}

async function hasContractForImmobile(id, ownerId, immobileId) {
  const [rows] = await pool.execute(
    `SELECT EXISTS(
       SELECT 1
       FROM contratti
       WHERE inquilino_id = ?
         AND proprietario_id = ?
         AND immobile_id = ?
         AND deleted_at IS NULL
     ) AS hasContract`,
    [id, ownerId, immobileId]
  );
  return Boolean(rows[0].hasContract);
}

async function assignImmobile(id, ownerId, immobileId) {
  const [result] = await pool.execute(
    `UPDATE inquilini SET immobile_id = ?
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL
       AND immobile_id IS NULL`,
    [immobileId, id, ownerId]
  );
  return result.affectedRows > 0;
}

async function archive(id, ownerId) {
  const [result] = await pool.execute(
    `UPDATE inquilini SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`, [id, ownerId]
  );
  return result.affectedRows > 0;
}

module.exports = {
  list,
  listAvailableForContract,
  findActive,
  create,
  update,
  hasActiveContract,
  hasContractForImmobile,
  assignImmobile,
  archive
};
