const FIELD_RULES = Object.freeze({
  indirizzo: Object.freeze({ maxLength: 150 }),
  civico: Object.freeze({ maxLength: 20 }),
  cap: Object.freeze({
    maxLength: 10,
    // pattern: /^\d{10}$/,
    message: 'Il CAP deve contenere al massimo 10 cifre.'
  }),
  comune: Object.freeze({ maxLength: 100 }),
  provincia: Object.freeze({
    maxLength: 2,
    normalize: (value) => value.toUpperCase(),
    pattern: /^[A-Z]{2}$/,
    message: 'Inserisci la sigla della provincia di 2 lettere.'
  })
});

const ALL_FIELDS = Object.freeze(Object.keys(FIELD_RULES));

function resolveFields(fields, optionName, fallback) {
  const values = fields == null ? fallback : fields;

  if (!Array.isArray(values)) {
    throw new TypeError(`${optionName} deve essere un array.`);
  }

  const result = [];
  for (const name of values) {
    if (!Object.hasOwn(FIELD_RULES, name)) {
      throw new TypeError(`Campo indirizzo non supportato: ${name}.`);
    }
    if (!result.includes(name)) result.push(name);
  }

  return result;
}

function validateIndirizzo(input, {
  includedFields = ALL_FIELDS,
  requiredFields = []
} = {}) {
  const included = resolveFields(includedFields, 'includedFields', ALL_FIELDS);
  const required = resolveFields(requiredFields, 'requiredFields', []);
  const includedSet = new Set(included);

  for (const name of required) {
    if (!includedSet.has(name)) {
      throw new TypeError(`Il campo obbligatorio ${name} non è incluso nell'indirizzo.`);
    }
  }

  const requiredSet = new Set(required);
  const data = {};
  const fields = {};

  for (const name of included) {
    const rule = FIELD_RULES[name];
    const raw = input?.[name];

    if (raw != null && typeof raw !== 'string') {
      data[name] = null;
      fields[name] = 'Inserisci un testo valido.';
      continue;
    }

    let value = typeof raw === 'string' ? raw.trim() : '';
    if (rule.normalize) value = rule.normalize(value);

    data[name] = value || null;

    if (!value) {
      if (requiredSet.has(name)) {
        fields[name] = 'Questo campo è obbligatorio.';
      }
      continue;
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      fields[name] = rule.message;
      continue;
    }

    if (value.length > rule.maxLength) {
      fields[name] = `Inserisci al massimo ${rule.maxLength} caratteri.`;
    }
  }

  return { data, fields };
}

module.exports = { validateIndirizzo };
