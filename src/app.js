const path = require('node:path');
const express = require('express');
const pool = require('./db/pool');
const authRoutes = require('./routes/auth-routes');
const immobiliRoutes = require('./routes/immobili-routes');
const inquiliniRoutes = require('./routes/inquilini-routes');
const contrattiRoutes = require('./routes/contratti-routes');
const pagamentiRoutes = require('./routes/pagamenti-routes');
const {
  securityHeaders,
  requestSecurity
} = require('./middleware/request-security-middleware');

const app = express();

app.disable('x-powered-by');
app.use(securityHeaders);

app.use(express.json({
  limit: '100kb'
}));
app.use(express.urlencoded({
  extended: false,
  limit: '100kb',
  parameterLimit: 100
}));

// Controllo trasversale di query string e body per tutte le API.
// Le regole di dominio specifiche restano nei service.
app.use('/api', requestSecurity);

app.use(
  '/uploads/immobili',
  express.static(path.join(__dirname, '..', 'storage', 'immobili'), {
    index: false,
    maxAge: '1h'
  })
);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/immobili', immobiliRoutes);
app.use('/api/inquilini', inquiliniRoutes);
app.use('/api/contratti', contrattiRoutes);
app.use('/api/pagamenti', pagamentiRoutes);

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
    return res.status(400).json({
      error: 'Il corpo della richiesta deve contenere JSON valido.'
    });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'La richiesta contiene troppi dati.'
    });
  }

  if (error.type === 'parameters.too.many') {
    return res.status(413).json({
      error: 'La richiesta contiene troppi parametri.'
    });
  }

  if ([400, 401, 404, 409, 413, 415].includes(error.status)) {
    return res.status(error.status).json({
      error: error.message,
      fields: error.fields
    });
  }

  console.error('Errore API inatteso:', error);
  return res.status(500).json({
    error: 'Errore interno del server. Riprova più tardi.'
  });
});

module.exports = app;
