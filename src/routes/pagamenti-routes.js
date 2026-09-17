const express = require('express');
const pagamenti = require('../services/pagamenti-service');
const requireAuth = require('../middleware/auth-middleware');

const router = express.Router();
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(requireAuth);

router.get('/stato', async (req, res) => {
  res.status(200).json(await pagamenti.stato(req.proprietarioId, req.query));
});

router.get('/anteprima', async (req, res) => {
  res.status(200).json(await pagamenti.anteprima(req.proprietarioId, req.query));
});

router.post('/', async (req, res) => {
  res.status(201).json(await pagamenti.create(req.proprietarioId, req.body));
});

module.exports = router;
