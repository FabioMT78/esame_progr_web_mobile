import { renderContrattoPreview } from '../components/contratto-preview.js';
import { errorText } from './dialog-shared.js';

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
        { signal }
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
