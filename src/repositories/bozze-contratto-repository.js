const pool = require('../db/pool');

function parseData(value) {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    immobileId: row.immobileId == null ? null : String(row.immobileId),
    inquilinoId: row.inquilinoId == null ? null : String(row.inquilinoId),
    stepCompletato: Number(row.stepCompletato),
    dati: parseData(row.dati),
    paginaProvenienza: row.paginaProvenienza || null
  };
}

async function findByOwner(proprietarioId) {
  const [rows] = await pool.execute(
    `SELECT CAST(id AS CHAR) AS id,
      CAST(immobile_id AS CHAR) AS immobileId,
      CAST(inquilino_id AS CHAR) AS inquilinoId,
      step_completato AS stepCompletato,
      dati,
      pagina_provenienza AS paginaProvenienza
     FROM bozze_contratto
     WHERE proprietario_id = ?`,
    [proprietarioId]
  );
  return mapRow(rows[0]);
}

async function upsert(proprietarioId, draft) {
  await pool.execute(
    `INSERT INTO bozze_contratto (
      proprietario_id, immobile_id, inquilino_id,
      step_completato, dati, pagina_provenienza
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      immobile_id = VALUES(immobile_id),
      inquilino_id = VALUES(inquilino_id),
      step_completato = VALUES(step_completato),
      dati = VALUES(dati),
      pagina_provenienza = VALUES(pagina_provenienza),
      updated_at = CURRENT_TIMESTAMP`,
    [
      proprietarioId,
      draft.immobileId,
      draft.inquilinoId,
      draft.stepCompletato,
      JSON.stringify(draft.dati || {}),
      draft.paginaProvenienza
    ]
  );
  return findByOwner(proprietarioId);
}

async function removeByOwner(proprietarioId) {
  const [result] = await pool.execute(
    'DELETE FROM bozze_contratto WHERE proprietario_id = ?',
    [proprietarioId]
  );
  return result.affectedRows > 0;
}

module.exports = { findByOwner, upsert, removeByOwner };
