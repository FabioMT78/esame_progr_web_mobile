const path = require('node:path');
const express = require('express');
const pool = require('./db/pool');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');

    res.status(200).json({
      status: 'ok',
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check database fallito:', error);

    res.status(503).json({
      status: 'error',
      database: 'unavailable'
    });
  }
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      error: 'Risorsa API non trovata'
    });
  }

  return res.status(404).send('Pagina non trovata');
});

module.exports = app;
