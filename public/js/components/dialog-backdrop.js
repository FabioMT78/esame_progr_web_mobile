let enabled = false;

function isDialog(value) {
  return value instanceof HTMLDialogElement;
}

function closeControlsDisabled(dialog) {
  return [...dialog.querySelectorAll('[data-close]')]
    .some((control) => control.disabled);
}

function canDismiss(dialog) {
  return dialog.open && !closeControlsDisabled(dialog);
}

function clickedBackdrop(dialog, event) {
  if (event.target !== dialog) return false;

  const rect = dialog.getBoundingClientRect();

  return event.clientX < rect.left
    || event.clientX > rect.right
    || event.clientY < rect.top
    || event.clientY > rect.bottom;
}

/**
 * Abilita il comportamento di chiusura uniforme dei <dialog>.
 *
 * - click sul backdrop -> stessa chiusura dei controlli [data-close];
 * - se i controlli di chiusura sono disabilitati, anche backdrop ed Esc
 *   non possono chiudere il dialog;
 * - la chiusura passa sempre da dialog.close(), quindi i listener "close"
 *   specifici del dialog eseguono lo stesso cleanup per X, Annulla, Esc
 *   e click esterno.
 *
 * Usa event delegation, quindi vale anche per eventuali dialog aggiunti
 * dinamicamente in futuro.
 */
export function enableDialogBackdropClose(root = document) {
  if (enabled) return;
  enabled = true;

  root.addEventListener('click', (event) => {
    const dialog = isDialog(event.target) ? event.target : null;

    if (!dialog || !clickedBackdrop(dialog, event) || !canDismiss(dialog)) {
      return;
    }

    dialog.close();
  });

  root.addEventListener('cancel', (event) => {
    const dialog = isDialog(event.target) ? event.target : null;

    if (dialog && !canDismiss(dialog)) {
      event.preventDefault();
    }
  }, true);
}
