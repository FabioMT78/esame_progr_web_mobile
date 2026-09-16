const pool = require('../db/pool');

const columns = `CAST(id AS CHAR) AS id, nome, cognome,
  codice_fiscale AS codiceFiscale, DATE_FORMAT(data_nascita, '%Y-%m-%d') AS dataNascita,
  indirizzo_residenza AS indirizzoResidenza, comune_residenza AS comuneResidenza,
  immagine_url AS immagineUrl`;

async function hasImmobili(ownerId) {
  const [rows] = await pool.execute(
    `SELECT EXISTS(SELECT 1 FROM immobili
     WHERE proprietario_id = ? AND deleted_at IS NULL) AS hasImmobili`, [ownerId]
  );
  return Boolean(rows[0].hasImmobili);
}

async function list(ownerId) {
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM inquilini
     WHERE proprietario_id = ? AND deleted_at IS NULL ORDER BY cognome, nome, id`, [ownerId]
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
  return [data.nome, data.cognome, data.codiceFiscale, data.dataNascita,
    data.indirizzoResidenza, data.comuneResidenza, data.immagineUrl];
}

async function create(ownerId, data) {
  const [result] = await pool.execute(
    `INSERT INTO inquilini (proprietario_id, nome, cognome, codice_fiscale,
     data_nascita, indirizzo_residenza, comune_residenza, immagine_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [ownerId, ...values(data)]
  );
  return String(result.insertId);
}

async function update(id, ownerId, data) {
  const [result] = await pool.execute(
    `UPDATE inquilini SET nome = ?, cognome = ?, codice_fiscale = ?,
     data_nascita = ?, indirizzo_residenza = ?, comune_residenza = ?, immagine_url = ?
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`, [...values(data), id, ownerId]
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

module.exports = { hasImmobili, list, findActive, create, update, archive };
