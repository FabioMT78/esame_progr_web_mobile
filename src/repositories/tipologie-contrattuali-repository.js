const pool = require('../db/pool');

const columns = 'CAST(id AS CHAR) AS id, denominazione, durata, rinnovo';

async function list() {
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM tipologie_contrattuali ORDER BY denominazione, id`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM tipologie_contrattuali WHERE id = ?`, [id]
  );
  return rows[0];
}

module.exports = { list, findById };
