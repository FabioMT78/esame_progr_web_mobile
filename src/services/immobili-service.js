const repository = require('../repositories/immobili-repository');

function notFound() {
  return Object.assign(new Error('Immobile non trovato.'), { status: 404 });
}

function validateId(id) {
  if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id)
      || BigInt(id) > 18446744073709551615n) throw notFound();
  return id;
}

function validate(input) {
  const data = {};
  const fields = {};
  const limits = { titolo: 150, via: 150, numeroCivico: 20, cap: 10, comune: 100, provincia: 100 };
  for (const [key, max] of Object.entries(limits)) {
    data[key] = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (!data[key]) fields[key] = 'Questo campo è obbligatorio.';
    else if (data[key].length > max) fields[key] = `Inserisci al massimo ${max} caratteri.`;
  }
  for (const key of ['datiCatastali', 'immagineUrl']) {
    if (input?.[key] != null && typeof input[key] !== 'string') {
      fields[key] = 'Inserisci un testo valido.';
    }
    data[key] = typeof input?.[key] === 'string' ? input[key].trim() || null : null;
  }
  // MySQL TEXT contiene al massimo 65535 byte, anche con caratteri multibyte.
  if (data.datiCatastali && Buffer.byteLength(data.datiCatastali, 'utf8') > 65535) {
    fields.datiCatastali = 'I dati catastali sono troppo lunghi (massimo 65535 byte).';
  }
  if (data.immagineUrl) {
    try {
      const url = new URL(data.immagineUrl);
      if (!['http:', 'https:'].includes(url.protocol) || data.immagineUrl.length > 500) {
        throw new Error('URL non valido');
      }
    } catch {
      fields.immagineUrl = 'Inserisci un URL http o https valido, di massimo 500 caratteri.';
    }
  }
  if (Object.keys(fields).length) {
    throw Object.assign(new Error('Controlla i campi indicati.'), { status: 400, fields });
  }
  return data;
}

async function get(id, proprietarioId) {
  const immobile = await repository.findById(validateId(id), proprietarioId);
  if (!immobile) throw notFound();
  return immobile;
}

async function create(input, proprietarioId) {
  const data = validate(input);
  const id = await repository.create(data, proprietarioId);
  return { id, ...data };
}

async function update(id, input, proprietarioId) {
  await get(id, proprietarioId);
  const data = validate(input);
  if (!await repository.update(id, data, proprietarioId)) throw notFound();
  return { id, ...data };
}

async function archive(id, proprietarioId) {
  if (!await repository.archive(validateId(id), proprietarioId)) throw notFound();
}

module.exports = { list: repository.list, get, create, update, archive };
