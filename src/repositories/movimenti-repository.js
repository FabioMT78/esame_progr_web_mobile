const pool = require('../db/pool');

async function findExistingHashes(proprietarioId, hashes, db = pool) {
  if (!hashes.length) return new Set();

  const placeholders = hashes.map(() => '?').join(', ');
  const [rows] = await db.execute(
    `SELECT hash_riga AS hashRiga
     FROM movimenti
     WHERE proprietario_id = ? AND hash_riga IN (${placeholders})`,
    [proprietarioId, ...hashes]
  );

  return new Set(rows.map((row) => row.hashRiga));
}

async function insert(proprietarioId, pagamentoId, movimento, connection) {
  await connection.execute(
    `INSERT INTO movimenti (
       proprietario_id, pagamento_id, data_movimento, importo,
       descrizione, riferimento_esterno, hash_riga
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      proprietarioId,
      pagamentoId,
      movimento.dataMovimento,
      movimento.importo,
      movimento.descrizione,
      movimento.riferimentoEsterno,
      movimento.hashRiga
    ]
  );

  const [[row]] = await connection.query(
    'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id'
  );
  return row.id;
}

module.exports = {
  findExistingHashes,
  insert
};
