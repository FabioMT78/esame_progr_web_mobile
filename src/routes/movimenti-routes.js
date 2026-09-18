const express = require('express');
const movimenti = require('../services/movimenti-service');
const requireAuth = require('../middleware/auth-middleware');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(requireAuth);

router.post('/anteprima', async (req, res) => {
  res.status(200).json(await movimenti.preview(req.proprietarioId, req.body));
});

router.post('/importa', async (req, res) => {
  res.status(201).json(await movimenti.importRows(req.proprietarioId, req.body));
});

module.exports = router;
