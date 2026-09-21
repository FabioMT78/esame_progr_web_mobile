import {
  clearToken,
  clearFieldErrors,
  showFormError,
  readIdParameter
} from './common.js';
import { createAuthenticatedApi } from './api.js';
import { renderContrattoPreview } from './components/contratto-preview.js';
import { createImmobileStep } from './contratto/immobile-step.js';
import { createInquilinoStep } from './contratto/inquilino-step.js';
import { createDatiContrattualiStep } from './contratto/dati-contrattuali.js';
import { formatIsoDate } from './utils/formatters.js';

const content = document.querySelector('#protected-content');
const form = document.querySelector('#contract-form');
const formMessage = document.querySelector('#form-message');
const retry = document.querySelector('#retry');
const steps = [...form.querySelectorAll('[data-step]')];
const stepperItems = [...document.querySelectorAll('#contract-stepper li')];
const next = document.querySelector('#next-step');
const confirm = document.querySelector('#confirm-contract');
const cancelWizard = document.querySelector('#cancel-wizard');
const newContract = document.querySelector('#new-contract');
const previewContainer = document.querySelector('#contract-preview');
const previewMessage = document.querySelector('#contract-preview-message');

const query = new URLSearchParams(window.location.search);
const queryHasImmobile = query.has('immobileId');
const queryHasTenant = query.has('inquilinoId');
const queryImmobileId = readIdParameter('immobileId');
const queryTenantId = readIdParameter('inquilinoId');

let prerequisites = { immobili: [], inquilini: [], tipologie: [] };
let draft = null;
let step = 1;
let ready = false;
let busy = false;
let completed = false;
let previewReady = false;
let request;

function logout() {
  request?.abort();
  content.hidden = true;
  try {
    clearToken();
  } finally {
    window.location.replace('/');
  }
}

const api = createAuthenticatedApi({
  onUnauthorized: logout,
  getSignal: () => request?.signal
});

function clearContractErrors() {
  clearFieldErrors(form);
  formMessage.textContent = '';
}

function handleEntityStepStateChange() {
  clearContractErrors();

  if (step === 1 && immobileStep.getSelected()) {
    immobileStep.renderDetail();
  } else if (step === 2 && inquilinoStep.getSelected()) {
    inquilinoStep.renderDetail();
  }

  syncControls();
}

const immobileStep = createImmobileStep({
  api,
  messageElement: formMessage,
  onStateChange: handleEntityStepStateChange
});

const inquilinoStep = createInquilinoStep({
  api,
  messageElement: formMessage,
  onStateChange: handleEntityStepStateChange
});

const datiContrattuali = createDatiContrattualiStep({
  container: document.querySelector('[data-step="3"]')
});

function safeReferrerPath() {
  try {
    if (!document.referrer) return null;
    const url = new URL(document.referrer);
    if (url.origin !== window.location.origin) return null;
    if (['/', '/index.html', '/contratto.html'].includes(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function validateContractData() {
  const errors = datiContrattuali.validate();
  if (!Object.keys(errors).length) return true;

  formMessage.textContent = 'Errore: controlla i campi indicati.';
  datiContrattuali.focusFirstInvalid();
  return false;
}

function completedSteps() {
  const immobileComplete = immobileStep.isComplete();
  const tenantComplete = immobileComplete && inquilinoStep.isComplete();

  return [
    immobileComplete,
    tenantComplete,
    tenantComplete && ((draft?.stepCompletato ?? 0) >= 3 || step === 4 || completed),
    completed
  ];
}

function syncStepper() {
  const complete = completedSteps();
  const labels = ['Immobile', 'Inquilino', 'Dati contrattuali', 'Riepilogo'];

  stepperItems.forEach((item, index) => {
    const number = index + 1;
    const canNavigate = complete[index] && number !== step && !completed;
    item.replaceChildren();

    if (canNavigate) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'contract-stepper-link';
      button.dataset.stepTarget = String(number);
      button.textContent = `✓ ${number}. ${labels[index]}`;
      button.setAttribute(
        'aria-label',
        `Torna al passaggio ${number}: ${labels[index]}`
      );
      item.append(button);
    } else {
      item.textContent = `${complete[index] ? '✓ ' : ''}${number}. ${labels[index]}`;
    }

    if (number === step && !completed) {
      item.setAttribute('aria-current', 'step');
    } else {
      item.removeAttribute('aria-current');
    }
  });
}

function syncControls() {
  const unavailable = busy || !ready || completed;

  for (const fieldset of steps) {
    const active = Number(fieldset.dataset.step) === step;
    fieldset.hidden = !active;
    fieldset.disabled = unavailable || !active;
  }

  immobileStep.syncDisabled({
    unavailable,
    active: step === 1
  });
  inquilinoStep.syncDisabled({
    unavailable,
    active: step === 2
  });

  next.hidden = step === 4 || completed;
  next.disabled = unavailable
    || (step === 1 && !immobileStep.isReady())
    || (step === 2 && !inquilinoStep.isReady())
    || (step === 3 && !datiContrattuali.hasTipologie());

  confirm.hidden = step !== 4 || completed;
  confirm.disabled = unavailable || !previewReady;

  cancelWizard.disabled = busy;
  retry.disabled = busy;
  newContract.hidden = !completed;
  newContract.disabled = busy;

  form.setAttribute('aria-busy', String(busy));
  syncStepper();
}

function showStep(value, focus = true) {
  step = value;
  syncControls();

  if (focus) {
    document.querySelector(`#step${step}-title`)?.focus();
  }
}

function renderPrerequisites({ preserveSelection = true } = {}) {
  immobileStep.setItems(
    prerequisites.immobili,
    { preserveSelection }
  );
  inquilinoStep.setItems(
    prerequisites.inquilini,
    { preserveSelection }
  );
  datiContrattuali.setTipologie(prerequisites.tipologie);
}

async function refreshPrerequisites(immobileId = immobileStep.getSelectedId()) {
  const query = immobileId
    ? `?immobileId=${encodeURIComponent(immobileId)}`
    : '';

  prerequisites = await api(`/api/contratti/prerequisiti${query}`);
  renderPrerequisites();
}

function draftPayload(requestedStep = draft?.stepCompletato ?? 0) {
  return {
    immobileId: immobileStep.getSelectedId() || null,
    inquilinoId: inquilinoStep.getSelectedId() || null,
    stepCompletato: requestedStep,
    dati: datiContrattuali.getData(),
    paginaProvenienza: draft?.paginaProvenienza || safeReferrerPath()
  };
}

async function saveDraft(requestedStep) {
  draft = await api('/api/contratti/bozza', {
    method: 'PUT',
    body: JSON.stringify(draftPayload(requestedStep))
  });

  syncStepper();
  return draft;
}

async function applyInitialContext() {
  const draftImmobile = draft?.immobileId;
  const draftTenant = draft?.inquilinoId;

  const validQueryImmobile = queryImmobileId
    && immobileStep.hasId(queryImmobileId);

  immobileStep.setLocked(Boolean(queryHasImmobile && validQueryImmobile));

  if (queryHasImmobile) {
    immobileStep.setSelectedId(validQueryImmobile ? queryImmobileId : '');

    if (!validQueryImmobile) {
      immobileStep.setSelectionError(
        'L’immobile indicato non è disponibile per il tuo account.'
      );
    }
  } else if (draftImmobile && immobileStep.hasId(draftImmobile)) {
    immobileStep.setSelectedId(draftImmobile);
  }

  const selectedImmobileId = immobileStep.getSelectedId();

  if (selectedImmobileId) {
    await refreshPrerequisites(selectedImmobileId);
    immobileStep.setSelectedId(selectedImmobileId);
  }

  const validQueryTenant = queryTenantId
    && inquilinoStep.hasId(queryTenantId);

  inquilinoStep.setLocked(Boolean(queryHasTenant && validQueryTenant));

  if (queryHasTenant) {
    inquilinoStep.setSelectedId(validQueryTenant ? queryTenantId : '');

    if (!validQueryTenant) {
      inquilinoStep.setSelectionError(
        'L’inquilino indicato non è disponibile per il tuo account.'
      );
    }
  } else if (draftTenant && inquilinoStep.hasId(draftTenant)) {
    inquilinoStep.setSelectedId(draftTenant);
  }

  datiContrattuali.setData(draft?.dati);
  immobileStep.renderDetail();
  inquilinoStep.renderDetail();

  const immobile = immobileStep.getSelected();
  const tenant = inquilinoStep.getSelected();

  let requestedStep = 0;

  if (!immobile || !immobileStep.isComplete(immobile)) {
    showStep(1, false);

    if (immobile && !immobileStep.isComplete(immobile)) {
      immobileStep.openCompletion(immobile, { notify: false });
    }
  } else {
    requestedStep = 1;

    if (!tenant || !inquilinoStep.isComplete(tenant)) {
      showStep(2, false);

      if (tenant && !inquilinoStep.isComplete(tenant)) {
        inquilinoStep.openCompletion(tenant, { notify: false });
      }
    } else {
      requestedStep = 2;
      showStep(3, false);
    }
  }

  draft = await api('/api/contratti/bozza', {
    method: 'PUT',
    body: JSON.stringify({
      ...draftPayload(requestedStep),
      paginaProvenienza:
        (queryHasImmobile || queryHasTenant)
          ? (safeReferrerPath() || draft?.paginaProvenienza)
          : (draft?.paginaProvenienza || safeReferrerPath())
    })
  });

  syncControls();
}

async function loadContractPreview() {
  previewReady = false;
  previewContainer.replaceChildren();
  previewMessage.hidden = false;
  previewMessage.textContent = 'Generazione anteprima contratto…';
  syncControls();

  try {
    const model = await api('/api/contratti/anteprima', {
      method: 'POST',
      body: JSON.stringify({
        immobileId: immobileStep.getSelectedId(),
        inquilinoId: inquilinoStep.getSelectedId(),
        ...datiContrattuali.getData()
      })
    });

    renderContrattoPreview(previewContainer, model);
    previewReady = true;

    if (model.segnapostoMancanti?.length) {
      previewMessage.textContent =
        'Anteprima generata. Alcuni dati non ancora gestiti dal profilo sono mostrati come campi vuoti.';
    } else {
      previewMessage.hidden = true;
      previewMessage.textContent = '';
    }
  } catch (error) {
    previewMessage.hidden = false;
    previewMessage.textContent = `Errore anteprima: ${error.message}`;
    previewReady = false;
  } finally {
    syncControls();
  }
}

async function loadPage() {
  request?.abort();
  request = new AbortController();

  ready = false;
  busy = true;
  completed = false;
  previewReady = false;
  retry.hidden = true;
  newContract.hidden = true;
  form.hidden = false;
  formMessage.textContent = 'Verifica della sessione in corso…';
  syncControls();

  try {
    await api('/api/auth/me');
    formMessage.textContent = 'Caricamento dati del contratto…';

    const [loadedPrerequisites, loadedDraft] = await Promise.all([
      api('/api/contratti/prerequisiti'),
      api('/api/contratti/bozza')
    ]);

    prerequisites = loadedPrerequisites;
    draft = loadedDraft;

    renderPrerequisites({ preserveSelection: false });
    await applyInitialContext();

    ready = true;
    busy = false;
    formMessage.textContent = '';
    syncControls();
  } catch (error) {
    if (error.name === 'AbortError') return;

    busy = false;
    ready = false;
    formMessage.textContent = `Errore: ${
      error instanceof TypeError
        ? 'Impossibile contattare il server.'
        : error.message
    }`;
    retry.hidden = false;
    syncControls();
  }
}

form.addEventListener('input', (event) => {
  const field = event.target.closest('[name]');

  if (field) {
    field.removeAttribute('aria-invalid');
    const localError = field.closest('.field')?.querySelector('.field-error');
    if (localError) localError.textContent = '';
  }

  formMessage.textContent = '';
  if (step === 3) previewReady = false;
  syncControls();
});

form.addEventListener('change', () => {
  if (step === 3) previewReady = false;
  syncControls();
});

next.addEventListener('click', async () => {
  if (next.disabled || busy) return;

  clearContractErrors();
  busy = true;
  syncControls();

  try {
    if (step === 1) {
      let selectedImmobileId = immobileStep.getSelectedId();

      if (immobileStep.hasEditorOpen()) {
        const saved = await immobileStep.saveEditor();
        if (!saved) return;

        selectedImmobileId = saved.id;
      }

      if (!selectedImmobileId) {
        immobileStep.setSelectionError('Seleziona un immobile.');
        return;
      }

      await refreshPrerequisites(selectedImmobileId);
      immobileStep.setSelectedId(selectedImmobileId);

      const immobile = immobileStep.getSelected();

      if (!immobile) {
        immobileStep.setSelectionError('Seleziona un immobile.');
        return;
      }

      if (!immobileStep.isComplete(immobile)) {
        immobileStep.openCompletion(immobile);
        return;
      }

      await saveDraft(1);
      showStep(2);

      const tenant = inquilinoStep.getSelected();
      if (tenant && !inquilinoStep.isComplete(tenant)) {
        inquilinoStep.openCompletion(tenant);
      }
      return;
    }

    if (step === 2) {
      if (inquilinoStep.hasEditorOpen()) {
        const saved = await inquilinoStep.saveEditor();
        if (!saved) return;

        await refreshPrerequisites(immobileStep.getSelectedId());
        inquilinoStep.setSelectedId(saved.id);
      }

      const tenant = inquilinoStep.getSelected();

      if (!tenant) {
        inquilinoStep.setSelectionError('Seleziona un inquilino.');
        return;
      }

      if (!inquilinoStep.isComplete(tenant)) {
        inquilinoStep.openCompletion(tenant);
        return;
      }

      await saveDraft(2);
      showStep(3);
      return;
    }

    if (step === 3) {
      if (!validateContractData()) return;

      await saveDraft(3);
      showStep(4);
      await loadContractPreview();
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      showFormError(form, formMessage, error);
    }
  } finally {
    busy = false;
    syncControls();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (
    busy
    || !ready
    || completed
    || step !== 4
    || event.submitter !== confirm
    || !previewReady
  ) {
    return;
  }

  clearContractErrors();

  const immobile = immobileStep.getSelected();
  const tenant = inquilinoStep.getSelected();

  if (!immobileStep.isComplete(immobile)) {
    showStep(1);

    if (immobile) {
      immobileStep.openCompletion(immobile);
    }
    return;
  }

  if (!inquilinoStep.isComplete(tenant)) {
    showStep(2);

    if (tenant) {
      inquilinoStep.openCompletion(tenant);
    }
    return;
  }

  if (!validateContractData()) {
    showStep(3, false);
    return;
  }

  busy = true;
  syncControls();
  formMessage.textContent = 'Registrazione contratto in corso…';

  try {
    const contract = await api('/api/contratti', {
      method: 'POST',
      body: JSON.stringify({
        immobileId: immobile.id,
        inquilinoId: tenant.id,
        ...datiContrattuali.getData()
      })
    });

    completed = true;
    form.hidden = true;
    formMessage.textContent =
      `Contratto #${contract.id} registrato. Decorrenza dal ${
        formatIsoDate(contract.dataInizio)
      } al ${formatIsoDate(contract.dataFine)}.`;
    newContract.hidden = false;
    formMessage.focus();
    syncStepper();
  } catch (error) {
    if (error.name !== 'AbortError') {
      showFormError(form, formMessage, error);
    }
  } finally {
    busy = false;
    syncControls();
  }
});

cancelWizard.addEventListener('click', async () => {
  if (busy) return;

  busy = true;
  syncControls();
  formMessage.textContent = 'Eliminazione bozza…';

  try {
    const destination =
      draft?.paginaProvenienza || safeReferrerPath() || '/dashboard.html';

    await api('/api/contratti/bozza', { method: 'DELETE' });
    window.location.assign(destination);
  } catch (error) {
    if (error.name !== 'AbortError') {
      busy = false;
      formMessage.textContent = `Errore: ${error.message}`;
      syncControls();
    }
  }
});

newContract.addEventListener('click', () => {
  window.location.assign('/contratto.html');
});

document.querySelector('#contract-stepper').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-step-target]');
  if (!button || busy || completed) return;

  const target = Number(button.dataset.stepTarget);
  if (!Number.isInteger(target) || target < 1 || target > 4) return;
  if (!completedSteps()[target - 1]) return;

  clearContractErrors();

  try {
    busy = true;
    syncControls();

    await saveDraft(draft?.stepCompletato ?? 0);
    showStep(target);
  } catch (error) {
    if (error.name !== 'AbortError') {
      formMessage.textContent = `Errore: ${error.message}`;
    }
  } finally {
    busy = false;
    syncControls();  }
});

retry.addEventListener('click', loadPage);
document.querySelector('#logout').addEventListener('click', logout);

window.addEventListener('pageshow', loadPage);
window.addEventListener('pagehide', () => {
  request?.abort();
});
