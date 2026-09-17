const UNITA = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
const DIECI_DICIANNOVE = [
  'dieci', 'undici', 'dodici', 'tredici', 'quattordici',
  'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'
];
const DECINE = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

function sottoCento(numero) {
  if (numero < 10) return UNITA[numero] || '';
  if (numero < 20) return DIECI_DICIANNOVE[numero - 10] || '';

  const decina = Math.floor(numero / 10);
  const unita = numero % 10;
  let prefisso = DECINE[decina] || '';
  if (unita === 1 || unita === 8) prefisso = prefisso.slice(0, -1);
  return `${prefisso}${UNITA[unita] || ''}`;
}

function sottoMille(numero) {
  const centinaia = Math.floor(numero / 100);
  const resto = numero % 100;
  let risultato = '';

  if (centinaia === 1) risultato = 'cento';
  else if (centinaia > 1) risultato = `${UNITA[centinaia]}cento`;

  if (centinaia > 0 && (resto === 8 || (resto >= 80 && resto < 90))) {
    risultato = risultato.slice(0, -1);
  }

  return `${risultato}${sottoCento(resto)}`;
}

function interoInLettere(numero) {
  if (numero === 0) return 'zero';
  if (!Number.isSafeInteger(numero) || numero < 0 || numero > 999999999) {
    throw new RangeError("Importo fuori dall'intervallo supportato.");
  }

  const milioni = Math.floor(numero / 1000000);
  const migliaia = Math.floor((numero % 1000000) / 1000);
  const resto = numero % 1000;

  let parteMilioni = '';
  if (milioni === 1) parteMilioni = 'un milione';
  else if (milioni > 1) parteMilioni = `${sottoMille(milioni)} milioni`;

  let parteInferiore = '';
  if (migliaia === 1) parteInferiore = 'mille';
  else if (migliaia > 1) parteInferiore = `${sottoMille(migliaia)}mila`;
  if (resto > 0) parteInferiore += sottoMille(resto);

  return parteMilioni && parteInferiore
    ? `${parteMilioni} ${parteInferiore}`
    : parteMilioni || parteInferiore;
}

function importoInLettere(importo) {
  if (!Number.isFinite(importo) || importo < 0) {
    throw new RangeError('Importo non valido.');
  }

  const centesimiTotali = Math.round(importo * 100);
  const euro = Math.floor(centesimiTotali / 100);
  const centesimi = centesimiTotali % 100;
  return `${interoInLettere(euro)}/${String(centesimi).padStart(2, '0')}`;
}

module.exports = { importoInLettere, interoInLettere };
