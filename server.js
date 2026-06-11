'use strict';
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { pool, query } = require('./db/db');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Seguridad y logging ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"], // Permite los controladores onclick/onsubmit inline en HTML
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com", "https://ui-avatars.com"],
      connectSrc: ["'self'", "https://unpkg.com"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: null, // Evita forzar HTTPS en localhost
    },
  },
}));
app.use(morgan('dev'));
app.use(cors({ origin: process.env.BASE_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Sesiones con PostgreSQL ───────────────────────────────────────────────────
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
  }),
  secret: process.env.SESSION_SECRET || 'atomtask-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: (process.env.BASE_URL || '').startsWith('https://'),
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
  },
}));

// ─── Passport ─────────────────────────────────────────────────────────────────
const googleCredentialsOk = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleCredentialsOk) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const avatarUrl = profile.photos[0] ? profile.photos[0].value : null;

        // Upsert usuario
        const result = await query(`
          INSERT INTO users (google_id, email, name, avatar_url, access_token, refresh_token)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (google_id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            avatar_url = EXCLUDED.avatar_url,
            access_token = EXCLUDED.access_token,
            refresh_token = COALESCE(EXCLUDED.refresh_token, users.refresh_token),
            updated_at = NOW()
          RETURNING *
        `, [profile.id, email, name, avatarUrl, accessToken, refreshToken]);

        return done(null, result.rows[0]);
      } catch (err) {
        return done(err, null);
      }
    }
  ));
} else {
  console.warn('\n⚠️  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados.');
  console.warn('   El login con Google no funcionará hasta que los configures en .env\n');
}

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0] || false);
  } catch (err) {
    done(err, null);
  }
});

app.use(passport.initialize());
app.use(passport.session());


// ─── Archivos estáticos ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rutas de autenticación ────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));

// ─── Rutas API ────────────────────────────────────────────────────────────────
app.use('/api/projects', require('./routes/projects'));
app.use('/api/projects/:projectId/tasks', require('./routes/tasks'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/meetings', require('./routes/calendar'));
app.use('/api/privacy', require('./routes/privacy'));
app.use('/api/projects/:projectId/tech-config', require('./routes/tech-config'));

// ─── Página de login ───────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// ─── SPA – catch-all sirve index.html ──
app.get(['/', '/{*path}'], (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ─── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  res.status(500).send('Error interno del servidor');
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 AtomTask corriendo en http://0.0.0.0:${PORT}`);
  console.log(`📂 Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
