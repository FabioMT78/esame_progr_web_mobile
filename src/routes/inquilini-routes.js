const express = require('express');
const inquilini = require('../services/inquilini-service');
const requireAuth = require('../middleware/auth-middleware');

const router = express.Router();
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(requireAuth);

router.get('/prerequisiti', async (req, res) => {
  res.status(200).json(await inquilini.prerequisiti(req.proprietarioId));
});

router.get('/', async (req, res) => {
  res.status(200).json(await inquilini.list(req.proprietarioId));
});

router.get('/:id', async (req, res) => {
  res.status(200).json(await inquilini.get(req.params.id, req.proprietarioId));
});

router.post('/', async (req, res) => {
  res.status(201).json(await inquilini.create(req.proprietarioId, req.body));
});

router.put('/:id', async (req, res) => {
  res.status(200).json(await inquilini.update(req.params.id, req.proprietarioId, req.body));
});

router.delete('/:id', async (req, res) => {
  await inquilini.archive(req.params.id, req.proprietarioId);
  res.status(204).end();
});

module.exports = router;
