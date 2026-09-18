import { enableDialogBackdropClose } from './components/dialog-backdrop.js';

let pageShowOccurred = false;

window.addEventListener('pageshow', () => {
  pageShowOccurred = true;
}, { once: true });

async function fetchPartial(path) {
  const response = await fetch(path, { cache: 'no-cache' });

  if (!response.ok) {
    throw new Error(`Impossibile caricare ${path}.`);
  }

  return response.text();
}

function normalizePath(pathname) {
  return pathname === '/index.html' ? '/' : pathname;
}

function configureBrand(header) {
  const brand = header.querySelector('.brand');

  if (!brand) {
    return;
  }

  brand.href = document.body.dataset.menu === 'private'
    ? '/dashboard.html'
    : '/';
}

function configureMenu(nav) {
  const menuScope = document.body.dataset.menu || 'public';

  nav.querySelectorAll('[data-menu]').forEach((item) => {
    if (item.dataset.menu !== menuScope) {
      item.remove();
      return;
    }

    item.removeAttribute('data-menu');
  });

  const currentPath = normalizePath(window.location.pathname);

  nav.querySelectorAll('a[href]').forEach((link) => {
    const linkPath = normalizePath(
      new URL(link.href, window.location.origin).pathname
    );

    if (linkPath === currentPath) {
      link.setAttribute('aria-current', 'page');
    }
  });
}

function configureMobileMenu(header, nav) {
  const toggle = header.querySelector('#menu-toggle');
  const icon = toggle?.querySelector('[aria-hidden="true"]');

  if (!toggle || !icon) {
    return;
  }

  function setMenuOpen(isOpen) {
    nav.classList.toggle('is-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute(
      'aria-label',
      isOpen ? 'Chiudi menu di navigazione' : 'Apri menu di navigazione'
    );
    icon.textContent = isOpen ? '×' : '☰';
  }

  toggle.addEventListener('click', () => {
    setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  nav.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) {
      setMenuOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') {
      return;
    }

    setMenuOpen(false);
    toggle.focus();
  });

  const mobileMedia = window.matchMedia('(max-width: 40rem)');

  mobileMedia.addEventListener('change', (event) => {
    if (!event.matches) {
      setMenuOpen(false);
    }
  });
}

async function loadLayout() {
  const header = document.querySelector('#site-header');
  const footer = document.querySelector('#site-footer');

  if (!header || !footer) {
    throw new Error('Contenitori header/footer non trovati.');
  }

  const [headerHtml, menuHtml, footerHtml] = await Promise.all([
    fetchPartial('/partials/header.html'),
    fetchPartial('/partials/menu.html'),
    fetchPartial('/partials/footer.html')
  ]);

  header.innerHTML = headerHtml;
  footer.innerHTML = footerHtml;

  configureBrand(header);

  const nav = header.querySelector('#site-nav');

  if (!nav) {
    throw new Error('Contenitore del menu non trovato.');
  }

  nav.innerHTML = menuHtml;
  configureMenu(nav);
  configureMobileMenu(header, nav);
}

function showBootstrapError(message) {
  const main = document.querySelector('main');

  if (!main) {
    return;
  }

  const notice = document.createElement('p');
  notice.className = 'message';
  notice.setAttribute('role', 'alert');
  notice.textContent = message;
  main.prepend(notice);
}

async function bootstrap() {
  try {
    await loadLayout();
  } catch (error) {
    console.error('Caricamento layout fallito:', error);
    showBootstrapError(
      'Errore: impossibile caricare header, menu e footer. Ricarica la pagina.'
    );
    return;
  }

  enableDialogBackdropClose();

  const pageScript = document.body.dataset.pageScript;

  if (!pageScript) {
    return;
  }

  try {
    await import(pageScript);

    if (pageShowOccurred) {
      window.dispatchEvent(new Event('pageshow'));
    }
  } catch (error) {
    console.error('Avvio pagina fallito:', error);
    showBootstrapError(
      'Errore: impossibile avviare la pagina. Ricarica e riprova.'
    );
  }
}

bootstrap();
