if (!process.env.JWT_SECRET?.trim()) {
  throw new Error('Configurare JWT_SECRET prima di avviare il server.');
}

const app = require('./app');
const pool = require('./db/pool');

const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';

const server = app.listen(port, host, () => {
  console.log(`Gestionale Affitti in ascolto su http://localhost:${port}`);
});

async function shutdown(signal) {
  console.log(`\nRicevuto ${signal}. Arresto in corso...`);

  server.close(async () => {
    try {
      await pool.end();
      console.log('Connessioni al database chiuse.');
      process.exit(0);
    } catch (error) {
      console.error('Errore durante la chiusura del database:', error);
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
