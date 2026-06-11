'use strict';
const express = require('express');
const passport = require('passport');
const router = express.Router();

// ─── Iniciar flujo OAuth con Google ───────────────────────────────────────────
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect('/login?error=no_credentials');
  }
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    accessType: 'offline',
    prompt: 'consent',
  })(req, res, next);
});


// ─── Callback de Google ────────────────────────────────────────────────────────
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login?error=oauth_failed',
    failureMessage: true,
  }),
  (req, res) => {
    // Forzamos a que la sesión se guarde en la BD antes de redirigir,
    // esto evita una condición de carrera donde el frontend carga '/'
    // antes de que PostgreSQL termine de guardar la sesión.
    req.session.save((err) => {
      if (err) console.error('Error guardando la sesión:', err);
      res.redirect('/');
    });
  }
);

// ─── Cerrar sesión ─────────────────────────────────────────────────────────────
router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

// ─── Obtener usuario actual ────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ authenticated: false });
  }
  const { id, name, email, avatar_url } = req.user;
  res.json({ authenticated: true, user: { id, name, email, avatar_url } });
});

module.exports = router;
