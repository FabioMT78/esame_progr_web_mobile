import { createIconButton } from '../components/icon.js';
import { formatIsoDate } from '../utils/formatters.js';
import {
  contextUrl,
  errorText,
  loadPropertyContext
} from './dialog-shared.js';

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
        const hint = document.createElement('small');
        hint.className = 'field-hint';
        hint.textContent = `Contratto attivo fino al ${formatIsoDate(activeContract.dataFine)}.`;
        details.append(hint);
      }

      const actions = document.createElement('div');
      actions.className = 'dialog-tenant-actions';

      const archive = createIconButton(
        `Archivia ${name}`,
        'archive',
        { cancel: true }
      );
      archive.addEventListener('click', () => archiveTenant(tenant));

      if (activeContract) {
        archive.disabled = true;
        archive.dataset.locked = 'true';
        archive.title = 'Non puoi archiviare un inquilino con un contratto attivo.';

        const view = createIconButton(
          `Visualizza contratto di ${name}`,
          'view'
        );
        view.addEventListener(
          'click',
          () => openContractPreview(activeContract.id)
        );
        actions.append(archive, view);
      } else {
        const contract = createIconButton(
          `Registra contratto per ${name}`,
          'contract'
        );
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
      const { tenants, activeByTenant } = await loadPropertyContext(
        api,
        signal,
        immobile.id
      );
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
    if (
      saving
      || !window.confirm(`Archiviare ${tenant.nome} ${tenant.cognome}?`)
    ) {
      return;
    }

    const { signal } = controller;
    setSaving(true);
    message.textContent = 'Archiviazione in corso…';

    try {
      await api(`/api/inquilini/${encodeURIComponent(tenant.id)}`, {
        method: 'DELETE',
        signal
      });
      signal.throwIfAborted();
      await loadDialogTenants('Inquilino archiviato. ');
      if (dialog.open) message.focus();
    } catch (error) {
      if (!signal.aborted) {
        message.textContent = `Errore: ${errorText(error)}`;
      }
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
