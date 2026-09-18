export function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function allPresent(object, fields) {
  return Boolean(object && fields.every((name) => present(object[name])));
}

export function editorRequiredFieldsComplete(editor) {
  const fields = [
    ...editor.querySelectorAll(
      'input[required]:not(:disabled), select[required]:not(:disabled), textarea[required]:not(:disabled)'
    )
  ];

  return fields.length > 0
    && fields.every((field) => present(field.value) && field.validity.valid);
}

export function fillSelect(select, items, label, preserveSelection = true) {
  const previousValue = preserveSelection ? select.value : '';
  const placeholder = select.options[0]?.cloneNode(true)
    || new Option('Seleziona', '');

  select.replaceChildren(placeholder);
  for (const item of items) {
    select.add(new Option(label(item), item.id));
  }

  select.value = items.some((item) => item.id === previousValue)
    ? previousValue
    : '';
}

export function showEmbeddedError(editor, messageElement, error) {
  messageElement.textContent = `Errore: ${
    error instanceof TypeError
      ? 'Impossibile contattare il server. Riprova.'
      : error.message
  }`;

  for (const [name, message] of Object.entries(error.fields || {})) {
    const candidates = [
      ...editor.querySelectorAll(`[name="${CSS.escape(name)}"]`)
    ];
    const field = candidates.find((item) => !item.disabled) || candidates[0];
    if (!field) continue;

    field.setAttribute('aria-invalid', 'true');
    const hint = field.closest('.field')?.querySelector('.field-error');
    if (hint) hint.textContent = message;
  }

  (editor.querySelector('[aria-invalid="true"]') || messageElement).focus();
}
