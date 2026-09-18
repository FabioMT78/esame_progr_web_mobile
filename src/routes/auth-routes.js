const express = require('express');
const auth = require('../services/auth-service');
const requireAuth = require('../middleware/auth-middleware');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/register', async (req, res) => {
  res.status(201).json(await auth.register(req.body));
});

router.post('/login', async (req, res) => {
  res.status(200).json(await auth.login(req.body));
});

router.get('/me', requireAuth, async (req, res) => {
  res.status(200).json(await auth.me(req.proprietarioId));
});

router.put('/me', requireAuth, async (req, res) => {
  res.status(200).json(await auth.update(req.proprietarioId, req.body));
});

module.exports = router;
