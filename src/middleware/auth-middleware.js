const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '');
  if (!match) return res.status(401).json({ error: 'Sessione non valida. Accedi nuovamente.' });
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || !/^[1-9]\d*$/.test(payload.sub)
        || !Number.isFinite(payload.exp)) {
      return res.status(401).json({ error: 'Sessione non valida. Accedi nuovamente.' });
    }
    req.proprietarioId = payload.sub;
  } catch {
    return res.status(401).json({ error: 'Sessione non valida. Accedi nuovamente.' });
  }
  return next();
}

module.exports = requireAuth;
