const { importoInLettere } = require('./importo-in-lettere');

const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9.]*)\s*\}\}/g;
const TEXT_AMOUNT = new Set([
  'contratto.canoneMensileText',
  'contratto.canoneAnnualeText',
  'contratto.depositoCauzionaleText'
]);

function formatDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function formatMoney(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toFixed(2).replace('.', ',')
    : '';
}

function address(data, owner = false) {
  if (!data) return '';
  const street = owner ? data.indirizzoResidenza : data.indirizzo;
  const city = owner ? data.comuneResidenza : data.comune;
  const parts = [
    [street, owner ? null : data.civico].filter(Boolean).join(' '),
    owner ? null : data.cap,
    city,
    owner ? null : data.provincia
  ].filter(Boolean);
  return parts.join(', ');
}

function documentType(value) {
  if (value === 'CARTA_IDENTITA') return "Carta d'identità";
  if (value === 'PASSAPORTO') return 'Passaporto';
  return value || '';
}

function placeholderValues({ contratto, immobile, inquilino, proprietario }) {
  const mensile = Number(contratto.canoneAnnuale) / 12;
  const deposito = Math.round(mensile * 3 * 100) / 100;
  const catasto = immobile.datiCatastali || {};

  return new Map([
    ['contratto.nomeDescrizione', contratto.nomeDescrizione || 'Contratto di locazione'],
    ['contratto.dal', formatDate(contratto.dataInizio)],
    ['contratto.al', formatDate(contratto.dataFine)],
    ['contratto.canoneMensile', formatMoney(mensile)],
    ['contratto.canoneMensileText', importoInLettere(mensile)],
    ['contratto.canoneAnnuale', formatMoney(contratto.canoneAnnuale)],
    ['contratto.canoneAnnualeText', importoInLettere(Number(contratto.canoneAnnuale))],
    ['contratto.depositoCauzionale', formatMoney(deposito)],
    ['contratto.depositoCauzionaleText', importoInLettere(deposito)],
    ['contratto.giornoPagamento', String(contratto.giornoPagamento)],
    ['contratto.registratoIl', formatDate(contratto.registratoIl)],

    ['immobile.nome', immobile.titolo || ''],
    ['immobile.indirizzo', address(immobile)],
    ['immobile.codiceComunale', String(catasto.codiceComunale ?? '')],
    ['immobile.foglio', String(catasto.foglio ?? '')],
    ['immobile.particella', String(catasto.particella ?? '')],
    ['immobile.subalterno', String(catasto.subalterno ?? '')],
    ['immobile.zona', String(catasto.zona ?? '')],
    ['immobile.categoria', String(catasto.categoria ?? '')],
    ['immobile.consistenza', String(catasto.consistenza ?? '')],
    ['immobile.rendita', formatMoney(catasto.rendita)],

    ['proprietario.nome', proprietario.nome || ''],
    ['proprietario.cognome', proprietario.cognome || ''],
    ['proprietario.codiceFiscale', proprietario.codiceFiscale || ''],
    ['proprietario.dataNascita', formatDate(proprietario.dataNascita)],
    ['proprietario.residenza', address(proprietario, true)],
    ['proprietario.luogoNascita', proprietario.luogoNascita || ''],
    ['proprietario.iban', proprietario.iban || ''],

    ['inquilino.nome', inquilino.nome || ''],
    ['inquilino.cognome', inquilino.cognome || ''],
    ['inquilino.codiceFiscale', inquilino.codiceFiscale || ''],
    ['inquilino.dataNascita', formatDate(inquilino.dataNascita)],
    ['inquilino.residenza', address(inquilino)],
    ['inquilino.luogoNascita', inquilino.luogoNascita || ''],
    ['inquilino.documento.tipo', documentType(inquilino.tipoDocumento)],
    ['inquilino.documento.numero', inquilino.numeroDocumento || ''],
    ['inquilino.documento.organoEmittente', inquilino.organoRilascioDocumento || ''],
    ['inquilino.documento.dataRilascio', formatDate(inquilino.dataRilascioDocumento)],
    ['inquilino.documento.dataScadenza', formatDate(inquilino.dataScadenzaDocumento)]
  ]);
}

function renderText(text, values, missing) {
  let result = String(text ?? '');

  for (const name of TEXT_AMOUNT) {
    const value = values.get(name);
    if (value) {
      const pattern = new RegExp(
        `\\{\\{\\s*${name.replaceAll('.', '\\.')}\\s*\\}\\}/00`,
        'g'
      );
      result = result.replace(pattern, value);
    }
  }

  const deposito = values.get('contratto.depositoCauzionale');
  if (deposito) {
    result = result.replace(
      /\{\{\s*contratto\.depositoCauzionale\s*\}\},00/g,
      deposito
    );
  }

  return result.replace(PLACEHOLDER, (_match, name) => {
    const value = values.get(name);
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value);
    }

    missing.add(name);
    return '________________';
  });
}

function generaAnteprima({
  contratto,
  immobile,
  inquilino,
  proprietario,
  tipologia,
  articoli
}) {
  const values = placeholderValues({ contratto, immobile, inquilino, proprietario });
  const missing = new Set();
  const catasto = immobile.datiCatastali || {};

  const renderedArticles = [...articoli]
    .sort((a, b) => a.numArticolo - b.numArticolo || a.numParte - b.numParte)
    .map((articolo) => ({
      numArticolo: articolo.numArticolo,
      numParte: articolo.numParte,
      titolo: articolo.titolo || `Articolo ${articolo.numArticolo}`,
      sottotitolo: articolo.sottotitolo || '',
      descrizione: renderText(articolo.descrizione, values, missing)
    }));

  return {
    titolo: 'CONTRATTO DI LOCAZIONE AD USO ABITATIVO',
    sottotitolo: tipologia.denominazione,
    locatore: {
      nomeCompleto: `${proprietario.nome} ${proprietario.cognome}`.trim(),
      codiceFiscale: proprietario.codiceFiscale || '',
      dataNascita: formatDate(proprietario.dataNascita),
      residenza: address(proprietario, true)
    },
    conduttore: {
      nomeCompleto: `${inquilino.nome} ${inquilino.cognome}`.trim(),
      codiceFiscale: inquilino.codiceFiscale || '',
      dataNascita: formatDate(inquilino.dataNascita),
      residenza: address(inquilino),
      documento: {
        tipo: documentType(inquilino.tipoDocumento),
        numero: inquilino.numeroDocumento || '',
        organoRilascio: inquilino.organoRilascioDocumento || '',
        dataRilascio: formatDate(inquilino.dataRilascioDocumento),
        dataScadenza: formatDate(inquilino.dataScadenzaDocumento)
      }
    },
    immobile: {
      descrizione: [
        address(immobile),
        present(catasto.foglio) ? `foglio ${catasto.foglio}` : null,
        present(catasto.particella) ? `particella ${catasto.particella}` : null,
        present(catasto.subalterno) ? `subalterno ${catasto.subalterno}` : null,
        present(catasto.categoria) ? `categoria ${catasto.categoria}` : null,
        present(catasto.rendita) ? `rendita catastale Euro ${formatMoney(catasto.rendita)}` : null
      ].filter(Boolean).join(', ')
    },
    contratto: {
      tipologia: tipologia.denominazione,
      dal: formatDate(contratto.dataInizio),
      al: formatDate(contratto.dataFine),
      canoneAnnuale: `${formatMoney(contratto.canoneAnnuale)} €`,
      canoneMensile: `${formatMoney(Number(contratto.canoneAnnuale) / 12)} €`,
      giornoPagamento: `${contratto.giornoPagamento} di ogni mese`
    },
    articoli: renderedArticles,
    segnapostoMancanti: [...missing].sort()
  };
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

module.exports = { generaAnteprima };
