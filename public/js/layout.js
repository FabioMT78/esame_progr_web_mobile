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

  const nav = header.querySelector('#site-nav');

  if (!nav) {
    throw new Error('Contenitore del menu non trovato.');
  }

  nav.innerHTML = menuHtml;
  configureMenu(nav);
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

  const pageScript = document.body.dataset.pageScript;

  if (!pageScript) {
    return;
  }

  try {
    await import(pageScript);
  } catch (error) {
    console.error('Avvio pagina fallito:', error);
    showBootstrapError(
      'Errore: impossibile avviare la pagina. Ricarica e riprova.'
    );
  }
}

bootstrap();
