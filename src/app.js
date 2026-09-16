const path = require('node:path');
const express = require('express');
const pool = require('./db/pool');
const authRoutes = require('./routes/auth-routes');
const inquiliniRoutes = require('./routes/inquilini-routes');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/inquilini', inquiliniRoutes);

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

app.use((error, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Il corpo della richiesta deve contenere JSON valido.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(400).json({ error: 'La richiesta contiene troppi dati.' });
  }
  if ([400, 401, 404, 409].includes(error.status)) {
    return res.status(error.status).json({ error: error.message, fields: error.fields });
  }
  console.error('Errore API inatteso:', error);
  return res.status(500).json({ error: 'Errore interno del server. Riprova più tardi.' });
});

module.exports = app;
