function calcolaDataFine(dataInizio, durata) {
  const data = typeof dataInizio === 'string'
    ? new Date(`${dataInizio}T00:00:00.000Z`) : new Date(NaN);
  if (typeof dataInizio !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dataInizio)
      || Number.isNaN(data.getTime()) || data.getUTCFullYear() < 1000
      || data.toISOString().slice(0, 10) !== dataInizio) {
    throw new RangeError('Inserisci una data iniziale valida.');
  }
  if (!Number.isInteger(durata) || durata < 1 || durata > 65535) {
    throw new RangeError('La durata deve essere un numero intero positivo di anni.');
  }
  // Stessa regola del progetto di riferimento, inclusa la decorrenza al 29 febbraio.
  data.setUTCFullYear(data.getUTCFullYear() + durata);
  data.setUTCDate(data.getUTCDate() - 1);
  if (data.getUTCFullYear() > 9999) {
    throw new RangeError('La scadenza calcolata supera il limite del 31/12/9999.');
  }
  return data.toISOString().slice(0, 10);
}

function calcolaCanoneMensile(canoneAnnuale) {
  return canoneAnnuale / 12;
}

module.exports = { calcolaDataFine, calcolaCanoneMensile };
