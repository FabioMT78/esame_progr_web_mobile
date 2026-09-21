export function startRedirectCountdown(
  element,
  message,
  onComplete,
  seconds = 3
) {
  if (!(element instanceof Element)) {
    throw new TypeError('Elemento messaggio non valido.');
  }
  if (typeof onComplete !== 'function') {
    throw new TypeError('Callback di reindirizzamento non valida.');
  }
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new TypeError('La durata del countdown deve essere un intero positivo.');
  }

  let remaining = seconds;
  let intervalId = null;
  let timeoutId = null;

  const text = document.createElement('span');
  const countdown = document.createElement('strong');

  text.textContent = message;
  countdown.className = 'action-group--end';
  countdown.textContent = String(remaining);
  countdown.setAttribute(
    'aria-label',
    `Reindirizzamento tra ${remaining} secondi.`
  );

  element.replaceChildren(text, countdown);
  element.classList.add('actions');
  element.focus?.();

  intervalId = window.setInterval(() => {
    remaining -= 1;

    if (remaining <= 0) {
      window.clearInterval(intervalId);
      intervalId = null;
      return;
    }

    countdown.textContent = String(remaining);
    countdown.setAttribute(
      'aria-label',
      `Reindirizzamento tra ${remaining} secondi.`
    );
  }, 1000);

  timeoutId = window.setTimeout(() => {
    timeoutId = null;
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    onComplete();
  }, seconds * 1000);

  return function cancelRedirectCountdown() {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    element.classList.remove('actions');
  };
}
