const express = require('express');
const contratti = require('../services/contratti-service');
const requireAuth = require('../middleware/auth-middleware');

const router = express.Router();
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(requireAuth);

router.get('/prerequisiti', async (req, res) => {
  res.status(200).json(await contratti.prerequisiti(req.proprietarioId));
});

router.get('/', async (req, res) => {
  res.status(200).json(await contratti.list(req.proprietarioId));
});

router.post('/', async (req, res) => {
  res.status(201).json(await contratti.create(req.proprietarioId, req.body));
});

module.exports = router;
