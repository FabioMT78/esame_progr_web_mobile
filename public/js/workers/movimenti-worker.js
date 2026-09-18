const MAX_ROWS = 200;
const REQUIRED_HEADERS = [
  'data_movimento',
  'importo',
  'descrizione',
  'riferimento_esterno'
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field.length) throw new Error('Virgolette non valide nel file CSV.');
      quoted = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;

    if (index % 50000 === 0 && text.length > 50000) {
      self.postMessage({
        type: 'progress',
        progress: Math.min(70, Math.round(index / text.length * 70)),
        message: 'Lettura CSV in corso…'
      });
    }
  }

  if (quoted) throw new Error('Il file CSV contiene una stringa tra virgolette non chiusa.');
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function isBlankRow(row) {
  return row.every((value) => !String(value || '').trim());
}

function normalizeDate(raw) {
  const value = String(raw || '').trim();
  let year;
  let month;
  let day;
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    [, year, month, day] = match;
  } else {
    match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (!match) throw new Error('Data non valida. Usa AAAA-MM-GG o GG/MM/AAAA.');
    [, day, month, year] = match;
  }

  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const date = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
  if (date.getUTCFullYear() !== numericYear
      || date.getUTCMonth() !== numericMonth - 1
      || date.getUTCDate() !== numericDay) {
    throw new Error('Data del movimento inesistente.');
  }

  return `${year}-${month}-${day}`;
}

function normalizeAmount(raw) {
  let value = String(raw ?? '').trim().replace(/[€\s]/g, '');
  if (!value) throw new Error('Importo obbligatorio.');

  if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(value)) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d{1,2}$/.test(value)) {
    value = value.replace(',', '.');
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Importo non valido. Usa ad esempio 500.00 o "500,00".');
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99) {
    throw new Error('Importo fuori dai limiti consentiti.');
  }
  return amount.toFixed(2);
}

function normalizeOptional(raw, maxLength, label) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (value.length > maxLength) {
    throw new Error(`${label} può contenere al massimo ${maxLength} caratteri.`);
  }
  return value;
}

function canonicalKey(row) {
  return [
    row.dataMovimento,
    row.importo,
    row.descrizione || '',
    row.riferimentoEsterno || ''
  ].join('\u001f');
}

function validateRows(parsedRows) {
  const nonEmptyRows = parsedRows.filter((row) => !isBlankRow(row));
  if (!nonEmptyRows.length) throw new Error('Il file CSV è vuoto.');

  const header = nonEmptyRows[0].map((value, index) =>
    String(value || '').replace(index === 0 ? /^\uFEFF/ : /$^/, '').trim().toLowerCase());

  if (header.length !== REQUIRED_HEADERS.length
      || REQUIRED_HEADERS.some((name, index) => header[index] !== name)) {
    throw new Error(
      `Intestazione CSV non valida. Usa: ${REQUIRED_HEADERS.join(',')}`
    );
  }

  const dataRows = nonEmptyRows.slice(1);
  if (!dataRows.length) throw new Error('Il file CSV non contiene movimenti.');
  if (dataRows.length > MAX_ROWS) {
    throw new Error(`Il file contiene più di ${MAX_ROWS} movimenti.`);
  }

  const validRows = [];
  const invalidRows = [];
  const firstByKey = new Map();

  dataRows.forEach((columns, index) => {
    const riga = index + 2;
    if (columns.length !== REQUIRED_HEADERS.length) {
      invalidRows.push({
        riga,
        stato: 'errore',
        motivo: 'Numero di colonne non valido. Se usi la virgola nei decimali, racchiudi l’importo tra virgolette.',
        dataMovimento: columns[0]?.trim() || null,
        importo: columns[1]?.trim() || null,
        descrizione: columns[2]?.trim() || null,
        riferimentoEsterno: columns[3]?.trim() || null
      });
      return;
    }

    try {
      if (!String(columns[0] || '').trim()) throw new Error('Data movimento obbligatoria.');
      const row = {
        riga,
        dataMovimento: normalizeDate(columns[0]),
        importo: normalizeAmount(columns[1]),
        descrizione: normalizeOptional(columns[2], 500, 'La descrizione'),
        riferimentoEsterno: normalizeOptional(columns[3], 255, 'Il riferimento esterno')
      };
      const key = canonicalKey(row);

      if (firstByKey.has(key)) {
        invalidRows.push({
          ...row,
          stato: 'duplicato',
          motivo: `Duplicato della riga ${firstByKey.get(key)} del file.`
        });
        return;
      }

      firstByKey.set(key, riga);
      validRows.push(row);
    } catch (error) {
      invalidRows.push({
        riga,
        stato: 'errore',
        motivo: error.message,
        dataMovimento: columns[0]?.trim() || null,
        importo: columns[1]?.trim() || null,
        descrizione: columns[2]?.trim() || null,
        riferimentoEsterno: columns[3]?.trim() || null
      });
    }

    if (index % 20 === 0) {
      self.postMessage({
        type: 'progress',
        progress: 70 + Math.round((index + 1) / dataRows.length * 30),
        message: 'Validazione righe in corso…'
      });
    }
  });

  return { validRows, invalidRows };
}

self.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.type !== 'parse') return;

  try {
    if (typeof message.text !== 'string') throw new Error('Contenuto CSV non valido.');
    self.postMessage({ type: 'progress', progress: 1, message: 'Lettura CSV in corso…' });
    const parsedRows = parseCsv(message.text);
    const result = validateRows(parsedRows);
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error.message || 'Impossibile elaborare il file CSV.'
    });
  }
});
