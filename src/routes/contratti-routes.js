const express = require('express');
const contratti = require('../services/contratti-service');
const bozze = require('../services/bozze-contratto-service');
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

router.get('/bozza', async (req, res) => {
  res.status(200).json(await bozze.get(req.proprietarioId));
});

router.put('/bozza', async (req, res) => {
  res.status(200).json(await bozze.save(req.proprietarioId, req.body));
});

router.delete('/bozza', async (req, res) => {
  await bozze.remove(req.proprietarioId);
  res.status(204).end();
});

router.post('/anteprima', async (req, res) => {
  res.status(200).json(await contratti.anteprima(req.proprietarioId, req.body));
});

router.get('/:id/anteprima', async (req, res) => {
  res.status(200).json(
    await contratti.anteprimaRegistrata(req.params.id, req.proprietarioId)
  );
});

router.get('/', async (req, res) => {
  res.status(200).json(await contratti.list(req.proprietarioId));
});

router.get('/:id', async (req, res) => {
  res.status(200).json(await contratti.get(req.params.id, req.proprietarioId));
});

router.post('/', async (req, res) => {
  res.status(201).json(await contratti.create(req.proprietarioId, req.body));
});

module.exports = router;
