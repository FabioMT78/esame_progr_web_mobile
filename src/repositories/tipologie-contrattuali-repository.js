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

async function listArticles(tipologiaId) {
  const [rows] = await pool.execute(
    `SELECT num_articolo AS numArticolo, num_parte AS numParte,
      titolo, sottotitolo, descrizione
     FROM articoli_contratto
     WHERE tipologia_id = ?
     ORDER BY num_articolo, num_parte, id`,
    [tipologiaId]
  );
  return rows;
}

module.exports = { list, findById, listArticles };
