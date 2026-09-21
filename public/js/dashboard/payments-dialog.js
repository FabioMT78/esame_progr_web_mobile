import { createMovimentiImport } from '../components/movimenti-import.js';
import {
  formatEuro,
  formatIsoDate,
  formatMonthYear
} from '../utils/formatters.js';
import {
  contextUrl,
  errorText,
  loadPropertyContext
} from './dialog-shared.js';

export function paymentDescription(payment) {
  return `${formatEuro(payment.importo)} per ${formatMonthYear(
    payment.annoCompetenza,
    payment.meseCompetenza
  )}`;
}

export function createPaymentsDialog(
  api,
  onRegistered,
  openTenantsDialog,
  onImportedMovements = () => {}
) {
  const dialog = document.querySelector('#payment-dialog');
  const title = document.querySelector('#payment-dialog-title');
  const message = document.querySelector('#payment-message');
  const retry = document.querySelector('#payment-retry');
  const empty = document.querySelector('#payment-empty');
  const emptyMessage = document.querySelector('#payment-empty-message');
  const newTenant = document.querySelector('#payment-new-tenant');
  const createContract = document.querySelector('#payment-create-contract');
  const fields = document.querySelector('#payment-fields');
  const select = document.querySelector('#payment-tenant');
  const amount = document.querySelector('#payment-amount');
  const period = document.querySelector('#payment-period');
  const confirm = document.querySelector('#payment-confirm');

  let immobile;
  const requestState = {
    controller: null,
    previewController: null,
    retryPreview: false
  };
  let preview = null;
  let sending = false;
  let importBusy = false;
  let movimentiImport;

  function resetPreview() {
    preview = null;
    amount.textContent = '—';
    period.textContent = '';
    confirm.disabled = true;
  }

  function syncControls() {
    const busy = sending || importBusy;
    select.disabled = busy || fields.hidden;
    confirm.disabled = busy || !preview;
    retry.disabled = busy;
    dialog.querySelectorAll('[data-close]').forEach((button) => {
      button.disabled = busy;
    });
    createContract.disabled = busy;
    movimentiImport?.setDisabled(sending || fields.hidden || !select.value);
  }

  function setSending(value) {
    sending = value;
    syncControls();
  }

  function setImportBusy(value) {
    importBusy = value;
    syncControls();
  }

  movimentiImport = createMovimentiImport({
    api,
    details: document.querySelector('#payment-import-details'),
    fieldset: document.querySelector('#payment-import-fields'),
    fileInput: document.querySelector('#payment-import-file'),
    fileName: document.querySelector('#payment-import-file-name'),
    message: document.querySelector('#payment-import-message'),
    preview: document.querySelector('#payment-import-preview'),
    tableBody: document.querySelector('#payment-import-body'),
    confirmButton: document.querySelector('#payment-import-confirm'),
    getContext: () => immobile && select.value
      ? { immobileId: immobile.id, inquilinoId: select.value }
      : null,
    onBusyChange: setImportBusy,
    onImported(result) {
      if (dialog.open) dialog.close();
      onImportedMovements(result);
    }
  });

  function showEmptyState(kind) {
    empty.hidden = false;
    fields.hidden = true;
    movimentiImport.reset();
    movimentiImport.setDisabled(true);

    const noTenants = kind === 'no-tenants';
    emptyMessage.textContent = noTenants
      ? 'Non hai ancora inquilini associati a questo immobile.'
      : 'Gli inquilini associati a questo immobile non hanno un contratto attivo.';

    newTenant.hidden = !noTenants;
    createContract.hidden = noTenants;
    syncControls();
  }

  async function loadPreview(notice = '') {
    requestState.previewController?.abort();
    requestState.previewController = new AbortController();
    const { signal } = requestState.previewController;

    resetPreview();
    retry.hidden = true;
    requestState.retryPreview = true;

    if (!select.value) {
      message.textContent = 'Seleziona un inquilino.';
      syncControls();
      return;
    }

    message.textContent = `${notice}Caricamento della competenza…`;
    const params = new URLSearchParams({
      immobileId: immobile.id,
      inquilinoId: select.value
    });

    try {
      const data = await api(`/api/pagamenti/anteprima?${params}`, { signal });
      signal.throwIfAborted();
      preview = data;
      amount.textContent = formatEuro(data.importo);
      period.textContent =
        `Competenza: ${formatMonthYear(
          data.annoCompetenza,
          data.meseCompetenza
        )}. Scadenza: ${formatIsoDate(data.scadenza)}.`;
      message.textContent = notice;
    } catch (error) {
      if (signal.aborted) return;
      message.textContent =
        `${notice}${error.status === 404 ? '' : 'Errore: '}${errorText(error)}`;
      retry.hidden = error.status === 404;
    } finally {
      if (!signal.aborted) syncControls();
    }
  }

  async function loadPaymentTenants() {
    requestState.controller?.abort();
    requestState.previewController?.abort();
    requestState.controller = new AbortController();
    const { signal } = requestState.controller;

    resetPreview();
    movimentiImport.reset();
    fields.hidden = true;
    empty.hidden = true;
    retry.hidden = true;
    requestState.retryPreview = false;
    newTenant.hidden = true;
    createContract.hidden = true;
    select.disabled = true;
    select.replaceChildren(new Option('Seleziona un inquilino', ''));
    message.textContent = 'Caricamento inquilini…';

    try {
      const { tenants, paymentTenants } = await loadPropertyContext(
        api,
        signal,
        immobile.id
      );

      if (!tenants.length) {
        showEmptyState('no-tenants');
        message.textContent = '';
        return;
      }

      if (!paymentTenants.length) {
        showEmptyState('no-contracts');
        message.textContent = '';
        return;
      }

      for (const tenant of paymentTenants) {
        select.add(new Option(`${tenant.nome} ${tenant.cognome}`, tenant.id));
      }

      empty.hidden = true;
      fields.hidden = false;
      message.textContent = 'Seleziona un inquilino.';

      if (paymentTenants.length === 1) {
        select.value = paymentTenants[0].id;
        movimentiImport.setDisabled(false);
        syncControls();
        await loadPreview();
      } else {
        movimentiImport.setDisabled(true);
        syncControls();
      }
    } catch (error) {
      if (signal.aborted) return;
      message.textContent = `Errore: ${errorText(error)}`;
      retry.hidden = false;
    }
  }

  async function registerPayment() {
    if (
      sending
      || importBusy
      || !preview
      || !window.confirm(
        `Confermi il pagamento di ${paymentDescription(preview)}?`
      )
    ) {
      return;
    }

    const { contrattoId, annoCompetenza, meseCompetenza } = preview;
    const { signal } = requestState.controller;
    setSending(true);
    message.textContent = 'Registrazione del pagamento in corso…';

    try {
      const payment = await api('/api/pagamenti', {
        method: 'POST',
        signal,
        body: JSON.stringify({
          contrattoId,
          annoCompetenza,
          meseCompetenza
        })
      });
      signal.throwIfAborted();
      dialog.close();
      onRegistered(payment);
    } catch (error) {
      if (signal.aborted) return;

      if (error.status === 409) {
        await loadPreview(
          'La situazione dei pagamenti è cambiata. Verifica la nuova anteprima prima di confermare. '
        );
      } else {
        message.textContent = `Errore: ${errorText(error)}`;
      }
    } finally {
      if (!signal.aborted) setSending(false);
    }
  }

  select.addEventListener('change', () => {
    movimentiImport.reset({ closeDetails: false });
    movimentiImport.setDisabled(!select.value);
    syncControls();
    loadPreview();
  });

  retry.addEventListener(
    'click',
    () => requestState.retryPreview ? loadPreview() : loadPaymentTenants()
  );
  confirm.addEventListener('click', registerPayment);

  createContract.addEventListener('click', () => {
    if (sending || importBusy || !immobile) return;
    dialog.close();
    openTenantsDialog(immobile);
  });

  dialog.querySelectorAll('[data-close]').forEach(
    (button) => button.addEventListener('click', () => dialog.close())
  );
  dialog.addEventListener('cancel', (event) => {
    if (sending || importBusy) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    requestState.controller?.abort();
    requestState.previewController?.abort();
    movimentiImport.reset();
    resetPreview();
  });

  return {
    open(property) {
      immobile = property;
      title.textContent = `Registrazione pagamento — ${property.titolo}`;
      newTenant.href = contextUrl(property.id);
      sending = false;
      importBusy = false;
      dialog.showModal();
      loadPaymentTenants();
    },
    close() {
      requestState.controller?.abort();
      requestState.previewController?.abort();
      movimentiImport.reset();
      if (dialog.open) dialog.close();
    }
  };
}
