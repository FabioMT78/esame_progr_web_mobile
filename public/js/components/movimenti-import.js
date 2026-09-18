const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const months = new Intl.DateTimeFormat('it-IT', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function errorText(error) {
  return error instanceof TypeError
    ? 'Impossibile contattare il server. Riprova.'
    : error.message;
}

function formatDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split('-').reverse().join('/')
    : (value || '—');
}

function competenceText(competence) {
  if (!competence) return '—';
  const month = months.format(new Date(Date.UTC(
    competence.annoCompetenza,
    competence.meseCompetenza - 1,
    1
  )));
  return `${month} · ${euro.format(competence.importo)} · scad. ${formatDate(competence.scadenza)}`;
}

function detailsText(row) {
  const parts = [];
  if (row.descrizione) parts.push(row.descrizione);
  if (row.riferimentoEsterno) parts.push(`Rif. ${row.riferimentoEsterno}`);
  return parts.join(' · ') || '—';
}

export function createMovimentiImport({
  api,
  details,
  fieldset,
  fileInput,
  fileName,
  message,
  preview,
  tableBody,
  confirmButton,
  getContext,
  onBusyChange = () => {},
  onImported = () => {}
}) {
  let worker = null;
  let externalDisabled = true;
  let busy = false;
  let previewController = null;
  let importController = null;
  let validRows = [];
  let workerRows = [];
  let sourceByRow = new Map();
  let importableRows = [];

  function syncDisabled() {
    fieldset.disabled = externalDisabled || busy;
    if (!externalDisabled && !busy) updateConfirmState();
  }

  function setBusy(value) {
    busy = value;
    syncDisabled();
    onBusyChange(value);
  }

  function terminateWorker() {
    worker?.terminate();
    worker = null;
  }

  function updateConfirmState() {
    confirmButton.disabled = busy || externalDisabled || importableRows.length === 0;
  }

  function clearPreview() {
    tableBody.replaceChildren();
    preview.hidden = true;
    confirmButton.disabled = true;
    validRows = [];
    workerRows = [];
    sourceByRow = new Map();
    importableRows = [];
  }

  function reset({ closeDetails = true } = {}) {
    previewController?.abort();
    importController?.abort();
    previewController = null;
    importController = null;
    terminateWorker();
    busy = false;
    fileInput.value = '';
    fileName.textContent = '';
    message.textContent = '';
    clearPreview();
    if (closeDetails) details.open = false;
    syncDisabled();
    onBusyChange(false);
  }

  function renderRows(rows) {
    tableBody.replaceChildren();

    importableRows = rows
      .filter((row) => row.stato === 'associabile' && sourceByRow.has(row.riga))
      .map((row) => sourceByRow.get(row.riga));

    for (const row of rows) {
      const tr = document.createElement('tr');

      const dateCell = document.createElement('td');
      dateCell.textContent = formatDate(row.dataMovimento);

      const amountCell = document.createElement('td');
      const numericAmount = Number(String(row.importo ?? '').replace(',', '.'));
      amountCell.textContent = Number.isFinite(numericAmount)
        ? euro.format(numericAmount)
        : (row.importo || '—');

      const detailsCell = document.createElement('td');
      detailsCell.textContent = detailsText(row);

      const competenceCell = document.createElement('td');
      competenceCell.textContent = competenceText(row.competenza);

      const statusCell = document.createElement('td');
      const status = document.createElement('strong');
      status.className = `import-status import-status--${String(row.stato).replace(/\s+/g, '-')}`;
      status.textContent = row.stato;
      statusCell.append(status);
      if (row.motivo) {
        const reason = document.createElement('small');
        reason.className = 'import-status-reason';
        reason.textContent = row.motivo;
        statusCell.append(reason);
      }

      tr.append(
        dateCell,
        amountCell,
        detailsCell,
        competenceCell,
        statusCell
      );
      tableBody.append(tr);
    }

    preview.hidden = rows.length === 0;
    updateConfirmState();
  }

  function summaryText(rows, prefix = '') {
    const count = (status) => rows.filter((row) => row.stato === status).length;
    return `${prefix}${rows.length} righe: ${count('associabile')} associabili, `
      + `${count('duplicato')} duplicate, ${count('non associabile')} non associabili, `
      + `${count('errore')} con errori.`;
  }

  async function requestPreview(prefix = '') {
    const context = getContext();
    if (!context || !validRows.length) {
      const rows = [...workerRows].sort((a, b) => a.riga - b.riga);
      renderRows(rows);
      message.textContent = rows.length
        ? summaryText(rows, prefix)
        : `${prefix}Nessuna riga valida da verificare.`;
      return;
    }

    previewController?.abort();
    previewController = new AbortController();
    const { signal } = previewController;
    setBusy(true);
    message.textContent = `${prefix}Verifica delle associazioni sul server…`;

    try {
      const result = await api('/api/movimenti/anteprima', signal, {
        method: 'POST',
        body: JSON.stringify({
          immobileId: context.immobileId,
          inquilinoId: context.inquilinoId,
          movimenti: validRows
        })
      });
      signal.throwIfAborted();
      const rows = [...workerRows, ...result.rows].sort((a, b) => a.riga - b.riga);
      renderRows(rows);
      message.textContent = summaryText(rows, prefix);
    } catch (error) {
      if (signal.aborted) return;
      clearPreview();
      message.textContent = `${prefix}Errore: ${errorText(error)}`;
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  function parseWithWorker(text) {
    return new Promise((resolve, reject) => {
      terminateWorker();
      if (typeof Worker === 'undefined') {
        reject(new Error('Il browser non supporta i Web Worker richiesti per l’importazione CSV.'));
        return;
      }

      try {
        worker = new Worker('/js/workers/movimenti-worker.js');
      } catch {
        reject(new Error('Impossibile avviare il Web Worker CSV.'));
        return;
      }

      worker.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type === 'progress') {
          message.textContent = `${data.message || 'Elaborazione CSV…'} ${data.progress || 0}%`;
          return;
        }
        if (data.type === 'result') {
          terminateWorker();
          resolve(data.result);
          return;
        }
        if (data.type === 'error') {
          terminateWorker();
          reject(new Error(data.message || 'Impossibile elaborare il file CSV.'));
        }
      });

      worker.addEventListener('error', () => {
        terminateWorker();
        reject(new Error('Il Web Worker CSV si è interrotto.'));
      }, { once: true });

      worker.postMessage({ type: 'parse', text });
    });
  }

  async function handleFileChange() {
    clearPreview();
    message.textContent = '';
    const [file] = fileInput.files;
    if (!file) {
      fileName.textContent = '';
      return;
    }

    const context = getContext();
    if (!context) {
      fileInput.value = '';
      message.textContent = 'Seleziona prima un inquilino.';
      return;
    }

    fileName.textContent = file.name;
    if (file.size === 0) {
      message.textContent = 'Il file selezionato è vuoto.';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      message.textContent = 'Il file CSV non può superare 2 MB.';
      return;
    }

    setBusy(true);
    message.textContent = 'Lettura del file CSV…';

    try {
      const text = await file.text();
      const result = await parseWithWorker(text);
      validRows = result.validRows;
      workerRows = result.invalidRows;
      sourceByRow = new Map(validRows.map((row) => [row.riga, row]));
      setBusy(false);
      await requestPreview();
    } catch (error) {
      clearPreview();
      message.textContent = `Errore: ${errorText(error)}`;
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (busy || externalDisabled) return;
    const context = getContext();
    if (!context) {
      message.textContent = 'Seleziona prima un inquilino.';
      return;
    }

    const selectedRows = [...importableRows];
    if (!selectedRows.length) return;

    if (!window.confirm(
      `Confermi l’importazione di ${selectedRows.length} ${selectedRows.length === 1 ? 'movimento associabile' : 'movimenti associabili'}?`
    )) return;

    importController?.abort();
    importController = new AbortController();
    const { signal } = importController;
    setBusy(true);
    message.textContent = 'Registrazione dei movimenti in corso…';

    try {
      const result = await api('/api/movimenti/importa', signal, {
        method: 'POST',
        body: JSON.stringify({
          immobileId: context.immobileId,
          inquilinoId: context.inquilinoId,
          movimenti: selectedRows
        })
      });
      signal.throwIfAborted();
      onImported(result);
    } catch (error) {
      if (signal.aborted) return;
      if (error.status === 409) {
        setBusy(false);
        await requestPreview(
          'La situazione dei pagamenti è cambiata. Anteprima aggiornata. '
        );
        return;
      }
      message.textContent = `Errore: ${errorText(error)}`;
    } finally {
      if (!signal.aborted && busy) setBusy(false);
    }
  }

  fileInput.addEventListener('change', handleFileChange);
  confirmButton.addEventListener('click', confirmImport);

  return {
    setDisabled(value) {
      externalDisabled = Boolean(value);
      syncDisabled();
    },
    reset,
    isBusy() {
      return busy;
    }
  };
}
