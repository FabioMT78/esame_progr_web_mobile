async function checkHealth() {
  const statusElement = document.querySelector('#health-status');

  if (!statusElement) {
    return;
  }

  try {
    const response = await fetch('/api/health');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Servizio non disponibile');
    }

    statusElement.textContent = 'Server Node.js attivo e database MySQL connesso.';
  } catch (error) {
    console.error('Health check fallito:', error);
    statusElement.textContent = 'Impossibile collegarsi correttamente al backend o al database.';
  }
}

checkHealth();
