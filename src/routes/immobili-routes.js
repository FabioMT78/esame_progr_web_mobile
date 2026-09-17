const express = require('express');
const immobili = require('../services/immobili-service');
const immagini = require('../services/immobili-images-service');
const requireAuth = require('../middleware/auth-middleware');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.status(200).json(await immobili.list(req.proprietarioId));
});

router.get('/:id', async (req, res) => {
  res.status(200).json(await immobili.get(req.params.id, req.proprietarioId));
});

router.post('/', async (req, res) => {
  res.status(201).json(await immobili.create(req.body, req.proprietarioId));
});

router.put(
  '/:id/immagine',
  express.raw({ type: () => true, limit: '5mb' }),
  async (req, res) => {
    res.status(200).json(await immagini.replace(
      req.params.id,
      req.proprietarioId,
      req.headers['content-type'],
      req.body
    ));
  }
);

router.put('/:id', async (req, res) => {
  res.status(200).json(await immobili.update(
    req.params.id,
    req.body,
    req.proprietarioId
  ));
});

router.delete('/:id', async (req, res) => {
  await immobili.archive(req.params.id, req.proprietarioId);
  res.status(204).end();
});

module.exports = router;
