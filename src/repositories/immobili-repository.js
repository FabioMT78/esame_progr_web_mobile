const pool = require('../db/pool');

const columns = `CAST(id AS CHAR) AS id, titolo, via, numero_civico AS numeroCivico,
  cap, comune, provincia, dati_catastali AS datiCatastali, immagine_url AS immagineUrl`;

async function list(proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM immobili
     WHERE proprietario_id = ? AND deleted_at IS NULL ORDER BY titolo, id`, [proprietarioId]
  );
  return rows;
}

async function findById(id, proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM immobili
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`, [id, proprietarioId]
  );
  return rows[0];
}

function values(data) {
  return [data.titolo, data.via, data.numeroCivico, data.cap, data.comune,
    data.provincia, data.datiCatastali, data.immagineUrl];
}

async function create(data, proprietarioId) {
  // LAST_INSERT_ID sulla stessa connessione preserva anche gli id BIGINT come stringhe.
  const connection = await pool.getConnection();
  try {
    await connection.execute(
      `INSERT INTO immobili (titolo, via, numero_civico, cap, comune, provincia,
       dati_catastali, immagine_url, proprietario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values(data), proprietarioId]
    );
    const [[row]] = await connection.query('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
    return row.id;
  } finally {
    connection.release();
  }
}

async function update(id, data, proprietarioId) {
  const [result] = await pool.execute(
    `UPDATE immobili SET titolo = ?, via = ?, numero_civico = ?, cap = ?, comune = ?,
     provincia = ?, dati_catastali = ?, immagine_url = ?
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`,
    [...values(data), id, proprietarioId]
  );
  return result.affectedRows;
}

async function archive(id, proprietarioId) {
  const [result] = await pool.execute(
    `UPDATE immobili SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`, [id, proprietarioId]
  );
  return result.affectedRows;
}

module.exports = { list, findById, create, update, archive };
