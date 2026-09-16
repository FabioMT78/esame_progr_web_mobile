// Date di calendario in UTC: nessuna ora locale o ora legale nei prorata.
function indiceMese(data) {
  return Number(data.slice(0, 4)) * 12 + Number(data.slice(5, 7)) - 1;
}

function periodoCoperto(contratto, anno, mese) {
  if (!Number.isInteger(anno) || anno < 1000 || anno > 9999
      || !Number.isInteger(mese) || mese < 1 || mese > 12) {
    throw new RangeError('Competenza non valida.');
  }
  const giorniDelMese = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  const inizioMese = Date.UTC(anno, mese - 1, 1);
  const fineMese = Date.UTC(anno, mese - 1, giorniDelMese);
  const inizio = Math.max(inizioMese, Date.parse(`${contratto.dataInizio}T00:00:00Z`));
  const fine = Math.min(fineMese, Date.parse(`${contratto.dataFine}T00:00:00Z`));
  if (!Number.isFinite(inizio) || !Number.isFinite(fine) || fine < inizio) {
    throw new RangeError('Competenza fuori dal periodo del contratto.');
  }
  return { giorniDelMese, giorniCoperti: (fine - inizio) / 86400000 + 1 };
}

function calcolaImportoCompetenza(contratto, anno, mese) {
  const { giorniDelMese, giorniCoperti } = periodoCoperto(contratto, anno, mese);
  // Equivale a (canoneAnnuale / 12) * giorniCoperti / giorniDelMese.
  // Si arrotonda solo il risultato finale, lavorando sul canone annuale in centesimi.
  const centesimiAnnuali = Math.round(Number(contratto.canoneAnnuale) * 100);
  return Math.round(centesimiAnnuali * giorniCoperti / (12 * giorniDelMese)) / 100;
}

function calcolaScadenzaCompetenza(contratto, anno, mese) {
  periodoCoperto(contratto, anno, mese);
  return `${anno}-${String(mese).padStart(2, '0')}-${String(contratto.giornoPagamento).padStart(2, '0')}`;
}

function primaCompetenzaNonPagata(contratti, pagamenti, oggi) {
  const pagate = new Set(pagamenti.map((pagamento) =>
    `${pagamento.contrattoId}:${pagamento.annoCompetenza * 12 + pagamento.meseCompetenza - 1}`));
  let prima = null;
  // A parità di mese, prima il contratto iniziato prima, poi il suo ID.
  const ordinati = [...contratti].sort((a, b) => a.dataInizio.localeCompare(b.dataInizio)
    || (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0));
  for (const contratto of ordinati) {
    const ultimo = Math.min(indiceMese(contratto.dataFine), indiceMese(oggi));
    for (let indice = indiceMese(contratto.dataInizio); indice <= ultimo; indice += 1) {
      if (pagate.has(`${contratto.id}:${indice}`)) continue;
      if (!prima || indice < prima.indice) {
        prima = { contratto, indice, anno: Math.floor(indice / 12), mese: indice % 12 + 1 };
      }
      break;
    }
  }
  if (!prima) return null;
  const { contratto, anno, mese } = prima;
  const scadenza = calcolaScadenzaCompetenza(contratto, anno, mese);
  return {
    contrattoId: contratto.id, annoCompetenza: anno, meseCompetenza: mese,
    importo: calcolaImportoCompetenza(contratto, anno, mese), scadenza,
    dovuta: oggi >= scadenza, tardivo: oggi > scadenza
  };
}

module.exports = { calcolaImportoCompetenza, calcolaScadenzaCompetenza, primaCompetenzaNonPagata };
