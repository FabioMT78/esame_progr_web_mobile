const pool = require('../db/pool');

const columns = `CAST(id AS CHAR) AS id, titolo, indirizzo, civico,
  cap, comune, provincia, codice_comunale AS codiceComunale, foglio, particella,
  subalterno, zona, categoria, consistenza, rendita, immagine_url AS immagineUrl`;

const cadastralKeys = [
  'codiceComunale', 'foglio', 'particella', 'subalterno',
  'zona', 'categoria', 'consistenza', 'rendita'
];

function mapRow(row) {
  if (!row) return row;

  const datiCatastali = cadastralKeys.some((key) => row[key] !== null)
    ? Object.fromEntries(cadastralKeys.map((key) => [key, row[key]]))
    : null;

  const result = { ...row, datiCatastali };
  for (const key of cadastralKeys) delete result[key];
  return result;
}

async function list(proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM immobili
     WHERE proprietario_id = ? AND deleted_at IS NULL ORDER BY titolo, id`,
    [proprietarioId]
  );
  return rows.map(mapRow);
}

async function findById(id, proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM immobili
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`,
    [id, proprietarioId]
  );
  return mapRow(rows[0]);
}

function values(data) {
  const catasto = data.datiCatastali || {};
  return [
    data.titolo,
    data.indirizzo,
    data.civico,
    data.cap,
    data.comune,
    data.provincia,
    catasto.codiceComunale ?? null,
    catasto.foglio ?? null,
    catasto.particella ?? null,
    catasto.subalterno ?? null,
    catasto.zona ?? null,
    catasto.categoria ?? null,
    catasto.consistenza ?? null,
    catasto.rendita ?? null,
    data.immagineUrl
  ];
}

async function create(data, proprietarioId) {
  const connection = await pool.getConnection();
  try {
    await connection.execute(
      `INSERT INTO immobili (
        titolo, indirizzo, civico, cap, comune, provincia,
        codice_comunale, foglio, particella, subalterno, zona, categoria,
        consistenza, rendita, immagine_url, proprietario_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values(data), proprietarioId]
    );
    const [[row]] = await connection.query(
      'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'
    );
    return row.id;
  } finally {
    connection.release();
  }
}

async function update(id, data, proprietarioId) {
  const [result] = await pool.execute(
    `UPDATE immobili SET
      titolo = ?, indirizzo = ?, civico = ?, cap = ?, comune = ?, provincia = ?,
      codice_comunale = ?, foglio = ?, particella = ?, subalterno = ?, zona = ?,
      categoria = ?, consistenza = ?, rendita = ?, immagine_url = ?
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`,
    [...values(data), id, proprietarioId]
  );
  return result.affectedRows;
}

async function updateImageUrl(id, immagineUrl, proprietarioId) {
  const [result] = await pool.execute(
    `UPDATE immobili SET immagine_url = ?
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`,
    [immagineUrl, id, proprietarioId]
  );
  return result.affectedRows;
}

async function archive(id, proprietarioId) {
  const [result] = await pool.execute(
    `UPDATE immobili SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = ? AND proprietario_id = ? AND deleted_at IS NULL`,
    [id, proprietarioId]
  );
  return result.affectedRows;
}

module.exports = {
  list,
  findById,
  create,
  update,
  updateImageUrl,
  archive
};
