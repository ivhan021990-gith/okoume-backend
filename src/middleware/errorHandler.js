// src/middleware/errorHandler.js
function errorHandler(err, req, res, next) {
  console.error('[Error]', err);
  const status  = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Erreur serveur'
    : err.message;
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
