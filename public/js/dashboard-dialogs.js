import { renderContrattoPreview } from './components/contratto-preview.js';

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const months = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function createIcon(name) {
  const paths = {
    edit: 'M16 3l5 5M4 15L16 3l5 5L9 20l-6 1z',
    archive: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    contract: 'M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h5',
    view: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: '24',
    height: '24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false'
  })) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}

function iconButton(label, icon, cancelButton = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = cancelButton ? 'icon-cancel' : 'icon-button';
  button.setAttribute('aria-label', label);
  button.append(createIcon(icon));
  return button;
}

function errorText(error) {
  return error instanceof TypeError
    ? 'Impossibile contattare il server. Riprova.'
    : error.message;
}

function contextUrl(immobileId, inquilinoId) {
  const params = new URLSearchParams({ immobileId });
  if (inquilinoId) params.set('inquilinoId', inquilinoId);
  return `${inquilinoId ? '/contratto.html' : '/inquilino.html'}?${params}`;
}

function todayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  return value ? value.split('-').reverse().join('/') : '—';
}

async function loadPropertyContext(api, signal, immobileId) {
  const params = new URLSearchParams({ immobileId });
  const [tenants, contracts] = await Promise.all([
    api(`/api/inquilini?${params}`, signal),
    api('/api/contratti', signal)
  ]);
  signal.throwIfAborted();

  const propertyContracts = contracts.filter(
    (contract) => contract.immobile.id === immobileId
  );
  const today = todayDate();
  const activeContracts = propertyContracts.filter(
    (contract) => contract.dataInizio <= today && today <= contract.dataFine
  );
  const activeByTenant = new Map(
    activeContracts.map((contract) => [contract.inquilino.id, contract])
  );
  const paymentTenants = tenants.filter((tenant) => activeByTenant.has(tenant.id));

  return {
    tenants,
    contracts: propertyContracts,
    activeContracts,
    activeByTenant,
    paymentTenants
  };
}

export function paymentDescription(payment) {
  return `${euro.format(payment.importo)} per ${months.format(
    new Date(Date.UTC(payment.annoCompetenza, payment.meseCompetenza - 1, 1))
  )}`;
}

export function createContractPreviewDialog(api) {
  const dialog = document.querySelector('#contract-preview-dialog');
  const title = document.querySelector('#contract-preview-title');
  const message = document.querySelector('#contract-preview-message');
  const content = document.querySelector('#contract-preview-content');
  let controller;

  function render(documentModel) {
    renderContrattoPreview(content, documentModel);
    content.hidden = false;
  }

  async function load(contractId) {
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;

    content.hidden = true;
    content.replaceChildren();
    message.textContent = 'Caricamento contratto…';

    try {
      const documentModel = await api(
        `/api/contratti/${encodeURIComponent(contractId)}/anteprima`,
        signal
      );
      signal.throwIfAborted();
      title.textContent = `Anteprima contratto #${contractId}`;
      render(documentModel);
      message.textContent = '';
    } catch (error) {
      if (signal.aborted) return;
      message.textContent = `Errore: ${errorText(error)}`;
    }
  }

  dialog.querySelectorAll('[data-close]').forEach(
    (button) => button.addEventListener('click', () => dialog.close())
  );
  dialog.addEventListener('close', () => controller?.abort());

  return {
    open(contractId) {
      dialog.showModal();
      load(contractId);
    },
    close() {
      controller?.abort();
      if (dialog.open) dialog.close();
    }
  };
}

export function createTenantsDialog(api, openContractPreview) {
  const dialog = document.querySelector('#tenants-dialog');
  const title = document.querySelector('#tenants-dialog-title');
  const message = document.querySelector('#tenants-message');
  const retry = document.querySelector('#tenants-retry');
  const list = document.querySelector('#dialog-tenant-list');
  const empty = document.querySelector('#tenants-empty');
  const toolbar = document.querySelector('#tenants-toolbar');
  const newTenantEmpty = document.querySelector('#tenants-new-empty');
  const newTenantCompact = document.querySelector('#tenants-new-compact');
  let immobile;
  let controller;
  let saving = false;

  function setSaving(value) {
    saving = value;
    list.setAttribute('aria-busy', String(value));
    dialog.querySelectorAll('button').forEach((button) => {
      button.disabled = value || button.dataset.locked === 'true';
    });
  }

  function renderTenants(tenants, activeByTenant) {
    list.replaceChildren();

    for (const tenant of tenants) {
      const name = `${tenant.nome} ${tenant.cognome}`;
      const item = document.createElement('li');

      const details = document.createElement('div');
      const label = document.createElement('p');
      label.className = 'dialog-tenant-name';
      label.textContent = name;
      details.append(label);

      const activeContract = activeByTenant.get(tenant.id);
      if (activeContract) {
        const hint = document.createElement('p');
        hint.className = 'field-hint';
        hint.textContent = `Contratto attivo fino al ${formatDate(activeContract.dataFine)}.`;
        details.append(hint);
      }

      const actions = document.createElement('div');
      actions.className = 'dialog-tenant-actions';

      const archive = iconButton(`Archivia ${name}`, 'archive', true);
      archive.addEventListener('click', () => archiveTenant(tenant));

      if (activeContract) {
        archive.disabled = true;
        archive.dataset.locked = 'true';
        archive.title = 'Non puoi archiviare un inquilino con un contratto attivo.';
        const view = iconButton(`Visualizza contratto di ${name}`, 'view');
        view.addEventListener('click', () => openContractPreview(activeContract.id));
        actions.append(archive, view);
      } else {
        const contract = iconButton(`Registra contratto per ${name}`, 'contract');
        contract.addEventListener(
          'click',
          () => window.location.assign(contextUrl(immobile.id, tenant.id))
        );
        actions.append(archive, contract);
      }

      item.append(details, actions);
      list.append(item);
    }

    const hasTenants = tenants.length > 0;
    empty.hidden = hasTenants;
    toolbar.hidden = !hasTenants;
  }

  async function loadDialogTenants(notice = '') {
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;

    list.replaceChildren();
    empty.hidden = true;
    toolbar.hidden = true;
    retry.hidden = true;
    message.textContent = `${notice}Caricamento inquilini…`;

    try {
      const { tenants, activeByTenant } = await loadPropertyContext(api, signal, immobile.id);
      renderTenants(tenants, activeByTenant);
      message.textContent = notice;
    } catch (error) {
      if (signal.aborted) return;
      message.textContent = `${notice}Errore: ${errorText(error)}`;
      retry.hidden = false;
    } finally {
      if (!signal.aborted) setSaving(false);
    }
  }

  async function archiveTenant(tenant) {
    if (saving || !window.confirm(`Archiviare ${tenant.nome} ${tenant.cognome}?`)) return;

    const { signal } = controller;
    setSaving(true);
    message.textContent = 'Archiviazione in corso…';

    try {
      await api(`/api/inquilini/${encodeURIComponent(tenant.id)}`, signal, { method: 'DELETE' });
      signal.throwIfAborted();
      await loadDialogTenants('Inquilino archiviato. ');
      if (dialog.open) message.focus();
    } catch (error) {
      if (!signal.aborted) message.textContent = `Errore: ${errorText(error)}`;
    } finally {
      if (!signal.aborted) setSaving(false);
    }
  }

  dialog.querySelectorAll('[data-close]').forEach(
    (button) => button.addEventListener('click', () => dialog.close())
  );
  dialog.addEventListener('cancel', (event) => {
    if (saving) event.preventDefault();
  });
  dialog.addEventListener('close', () => controller?.abort());
  retry.addEventListener('click', () => loadDialogTenants());

  return {
    open(property) {
      immobile = property;
      title.textContent = `Gestisci inquilini — ${property.titolo}`;

      const href = contextUrl(property.id);
      newTenantEmpty.href = href;
      newTenantCompact.href = href;

      setSaving(false);
      dialog.showModal();
      loadDialogTenants();
    },
    close() {
      controller?.abort();
      if (dialog.open) dialog.close();
    }
  };
}

export function createPaymentsDialog(api, onRegistered, openTenantsDialog) {
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

  function resetPreview() {
    preview = null;
    amount.textContent = '—';
    period.textContent = '';
    confirm.disabled = true;
  }

  function setSending(value) {
    sending = value;
    select.disabled = value;
    confirm.disabled = value || !preview;
    retry.disabled = value;
    dialog.querySelectorAll('[data-close]').forEach((button) => {
      button.disabled = value;
    });
    createContract.disabled = value;
  }

  function showEmptyState(kind) {
    empty.hidden = false;
    fields.hidden = true;

    const noTenants = kind === 'no-tenants';
    emptyMessage.textContent = noTenants
      ? 'Non hai ancora inquilini associati a questo immobile.'
      : 'Gli inquilini associati a questo immobile non hanno un contratto attivo.';

    newTenant.hidden = !noTenants;
    createContract.hidden = noTenants;
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
      return;
    }

    message.textContent = `${notice}Caricamento della competenza…`;
    const params = new URLSearchParams({
      immobileId: immobile.id,
      inquilinoId: select.value
    });

    try {
      const data = await api(`/api/pagamenti/anteprima?${params}`, signal);
      signal.throwIfAborted();
      preview = data;
      amount.textContent = euro.format(data.importo);
      period.textContent =
        `Competenza: ${months.format(new Date(Date.UTC(
          data.annoCompetenza,
          data.meseCompetenza - 1,
          1
        )))}. Scadenza: ${formatDate(data.scadenza)}.`;
      message.textContent = notice;
      confirm.disabled = sending;
    } catch (error) {
      if (signal.aborted) return;
      message.textContent =
        `${notice}${error.status === 404 ? '' : 'Errore: '}${errorText(error)}`;
      retry.hidden = error.status === 404;
    }
  }

  async function loadPaymentTenants() {
    requestState.controller?.abort();
    requestState.previewController?.abort();
    requestState.controller = new AbortController();
    const { signal } = requestState.controller;

    resetPreview();
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
      const { tenants, paymentTenants } = await loadPropertyContext(api, signal, immobile.id);

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
      select.disabled = false;
      message.textContent = 'Seleziona un inquilino.';

      if (paymentTenants.length === 1) {
        select.value = paymentTenants[0].id;
        await loadPreview();
      }
    } catch (error) {
      if (signal.aborted) return;
      message.textContent = `Errore: ${errorText(error)}`;
      retry.hidden = false;
    }
  }

  async function registerPayment() {
    if (sending || !preview
        || !window.confirm(`Confermi il pagamento di ${paymentDescription(preview)}?`)) {
      return;
    }

    const { contrattoId, annoCompetenza, meseCompetenza } = preview;
    const { signal } = requestState.controller;
    setSending(true);
    message.textContent = 'Registrazione del pagamento in corso…';

    try {
      const payment = await api('/api/pagamenti', signal, {
        method: 'POST',
        body: JSON.stringify({ contrattoId, annoCompetenza, meseCompetenza })
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

  select.addEventListener('change', () => loadPreview());
  retry.addEventListener(
    'click',
    () => requestState.retryPreview ? loadPreview() : loadPaymentTenants()
  );
  confirm.addEventListener('click', registerPayment);

  createContract.addEventListener('click', () => {
    if (sending || !immobile) return;
    dialog.close();
    openTenantsDialog(immobile);
  });

  dialog.querySelectorAll('[data-close]').forEach(
    (button) => button.addEventListener('click', () => dialog.close())
  );
  dialog.addEventListener('cancel', (event) => {
    if (sending) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    requestState.controller?.abort();
    requestState.previewController?.abort();
    resetPreview();
  });

  return {
    open(property) {
      immobile = property;
      title.textContent = `Registrazione pagamento — ${property.titolo}`;
      newTenant.href = contextUrl(property.id);
      setSending(false);
      dialog.showModal();
      loadPaymentTenants();
    },
    close() {
      requestState.controller?.abort();
      requestState.previewController?.abort();
      if (dialog.open) dialog.close();
    }
  };
}
