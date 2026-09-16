const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const pool = require('../../src/db/pool');

function invalid(context) {
  throw new TypeError(`Template non valido: ${context}`);
}

function object(value, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(context);
  return value;
}

function text(value, context, max) {
  if (typeof value !== 'string' || !value.trim()
      || (max && [...value].length > max)) invalid(context);
  return value;
}

function integer(value, context, min) {
  if (!Number.isInteger(value) || value < min || value > 65535) invalid(context);
  return value;
}

function validateTemplate(value, filename) {
  const data = object(value, filename);
  const denominazione = text(data.denominazione, `${filename}.denominazione`, 150).trim();
  const durata = integer(data.durata, `${filename}.durata`, 1);
  const rinnovo = integer(data.rinnovo, `${filename}.rinnovo`, 1);
  if (!Array.isArray(data.articoli) || !data.articoli.length) invalid(`${filename}.articoli`);
  const parts = new Set();
  const articoli = data.articoli.map((value, index) => {
    const context = `${filename}.articoli[${index}]`;
    const row = object(value, context);
    const numArticolo = integer(row.numArticolo, `${context}.numArticolo`, 1);
    const numParte = integer(row.numParte, `${context}.numParte`, 0);
    const key = `${numArticolo}:${numParte}`;
    if (parts.has(key)) invalid(`parte articolo duplicata ${key} in ${filename}`);
    parts.add(key);
    const titolo = text(row.titolo, `${context}.titolo`, 255);
    const sottotitolo = row.sottotitolo ?? null;
    if (sottotitolo !== null
        && (typeof sottotitolo !== 'string' || [...sottotitolo].length > 255)) {
      invalid(`${context}.sottotitolo`);
    }
    const descrizione = text(row.descrizione, `${context}.descrizione`);
    if (Buffer.byteLength(descrizione, 'utf8') > 65535) invalid(`${context}.descrizione troppo lunga`);
    return { numArticolo, numParte, titolo, sottotitolo, descrizione };
  });
  return { denominazione, durata, rinnovo, articoli };
}

async function readTemplates(directory) {
  const filenames = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  if (!filenames.length) throw new Error(`Nessun template JSON trovato in ${directory}`);
  const templates = [];
  const names = new Set();
  for (const filename of filenames) {
    const content = await readFile(path.join(directory, filename), 'utf8');
    let value;
    try { value = JSON.parse(content); } catch { invalid(`JSON in ${filename}`); }
    const template = validateTemplate(value, filename);
    const key = template.denominazione.normalize('NFKC').toLocaleLowerCase('it');
    if (names.has(key)) invalid(`denominazione duplicata in ${filename}`);
    names.add(key);
    templates.push(template);
  }
  return templates;
}

async function seedTemplates(directory = path.join(__dirname, '..', 'seed', 'templates')) {
  const templates = await readTemplates(directory);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let articles = 0;
  const ids = new Set();
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    for (const template of templates) {
      await connection.execute(
        `INSERT INTO tipologie_contrattuali (denominazione, durata, rinnovo) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE durata = ?, rinnovo = ?`,
        [template.denominazione, template.durata, template.rinnovo, template.durata, template.rinnovo]
      );
      const [[row]] = await connection.execute(
        'SELECT CAST(id AS CHAR) AS id FROM tipologie_contrattuali WHERE denominazione = ?',
        [template.denominazione]
      );
      // Intercetta anche denominazioni equivalenti secondo la collation MySQL.
      if (ids.has(row.id)) invalid(`denominazione duplicata: ${template.denominazione}`);
      ids.add(row.id);
      await connection.execute('DELETE FROM articoli_contratto WHERE tipologia_id = ?', [row.id]);
      for (const articolo of template.articoli) {
        await connection.execute(
          `INSERT INTO articoli_contratto
           (tipologia_id, num_articolo, num_parte, titolo, sottotitolo, descrizione)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [row.id, articolo.numArticolo, articolo.numParte, articolo.titolo,
            articolo.sottotitolo, articolo.descrizione]
        );
        articles += 1;
      }
    }
    await connection.commit();
    transactionStarted = false;
    return { tipologie: templates.length, articoli: articles };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  seedTemplates()
    .then((result) => console.log(`Template caricati: ${result.tipologie} tipologie, ${result.articoli} parti di articolo.`))
    .catch((error) => {
      console.error('Caricamento template fallito:', error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { seedTemplates };
