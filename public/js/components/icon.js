const paths = Object.freeze({
  edit: 'M16 3l5 5M4 15L16 3l5 5L9 20l-6 1z',
  archive: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  contract: 'M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h5',
  view: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'
});

export function createIcon(name) {
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
  })) {
    svg.setAttribute(key, value);
  }

  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name] || '');
  svg.append(path);
  return svg;
}

export function createIconButton(label, icon, { cancel = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = cancel ? 'icon-cancel' : 'icon-button';
  button.setAttribute('aria-label', label);
  button.append(createIcon(icon));
  return button;
}
