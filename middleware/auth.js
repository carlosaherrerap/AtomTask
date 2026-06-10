'use strict';

/**
 * Middleware de autenticación.
 * Protege rutas que requieren sesión activa.
 */

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  if (req.xhr || req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado', redirect: '/login' });
  }
  res.redirect('/login');
}

function requireAuthApi(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'No autenticado' });
}

module.exports = { requireAuth, requireAuthApi };
