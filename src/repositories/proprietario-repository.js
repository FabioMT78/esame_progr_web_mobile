const pool = require('../db/pool');

async function create(data, passwordHash) {
  const [result] = await pool.execute(
    `INSERT INTO proprietari
      (
        email,
        password_hash,
        nome,
        cognome,
        codice_fiscale,
        data_nascita,
        indirizzo_residenza,
        comune_residenza,
        iban
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.email,
      passwordHash,
      data.nome,
      data.cognome,
      data.codiceFiscale,
      data.dataNascita,
      data.indirizzoResidenza,
      data.comuneResidenza,
      data.iban
    ]
  );

  return result.insertId;
}

async function update(id, data, passwordHash = null) {
  const assignments = [
    'email = ?',
    'nome = ?',
    'cognome = ?',
    'codice_fiscale = ?',
    'data_nascita = ?',
    'indirizzo_residenza = ?',
    'comune_residenza = ?',
    'iban = ?'
  ];

  const params = [
    data.email,
    data.nome,
    data.cognome,
    data.codiceFiscale,
    data.dataNascita,
    data.indirizzoResidenza,
    data.comuneResidenza,
    data.iban
  ];

  if (passwordHash) {
    assignments.push('password_hash = ?');
    params.push(passwordHash);
  }

  params.push(id);

  const [result] = await pool.execute(
    `UPDATE proprietari
     SET ${assignments.join(', ')}
     WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  return result.affectedRows > 0;
}

async function findActiveByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT
      CAST(id AS CHAR) AS id,
      email,
      password_hash,
      nome,
      cognome
     FROM proprietari
     WHERE email = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [email]
  );

  return rows[0];
}

async function findActiveById(id) {
  const [rows] = await pool.execute(
    `SELECT
      CAST(id AS CHAR) AS id,
      email,
      nome,
      cognome,
      codice_fiscale AS codiceFiscale,
      DATE_FORMAT(data_nascita, '%Y-%m-%d') AS dataNascita,
      indirizzo_residenza AS indirizzoResidenza,
      comune_residenza AS comuneResidenza,
      iban
     FROM proprietari
     WHERE id = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  );

  return rows[0];
}

async function findContractDataById(id) {
  const [rows] = await pool.execute(
    `SELECT
      CAST(id AS CHAR) AS id,
      nome,
      cognome,
      codice_fiscale AS codiceFiscale,
      DATE_FORMAT(data_nascita, '%Y-%m-%d') AS dataNascita,
      indirizzo_residenza AS indirizzoResidenza,
      comune_residenza AS comuneResidenza,
      iban
     FROM proprietari
     WHERE id = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  );

  return rows[0];
}

module.exports = {
  create,
  update,
  findActiveByEmail,
  findActiveById,
  findContractDataById
};
