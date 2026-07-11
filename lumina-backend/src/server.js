const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const env = require('./config/env');
const logger = require('./utils/logger');
const { prisma } = require('./prismaClient');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const portfolioRoutes = require('./routes/portfolio.routes');
const paymentsRoutes = require('./routes/payments.routes');
const adminRoutes = require('./routes/admin.routes');
const analysisRoutes = require('./routes/analysis.routes');

const app = express();

// ---------------------------------------------------------------------------
// trust proxy — behind Render/Railway's reverse proxy, the socket peer is the
// proxy, not the client. express-rate-limit derives its per-client key from
// req.ip, which is wrong (one shared IP for everyone) without this. Setting it
// to 1 means "trust the first hop's X-Forwarded-For" — correct for a single
// proxy layer. Without it, the auth/email/checkout limiters either mis-fire or
// funnel every user into one shared bucket, and express-rate-limit logs a
// warning on every proxied request.
//   - `app.set('trust proxy', 1)` : one proxy hop (Render/Railway/Vercel)
//   - Behind multiple hops, bump the count or set a specific IP range.
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
app.use(helmet({ contentSecurityPolicy: false })); // CSP set at CDN/host level

// ---------------------------------------------------------------------------
// CORS — hard-fail in production if no origins are configured (see env.js)
// ---------------------------------------------------------------------------
app.use(cors({
  origin: env.corsOrigins,
  credentials: true,
}));

// ---------------------------------------------------------------------------
// Structured request logging (pino-http attaches a per-request id)
// Disabled in test mode to keep Vitest output readable.
// ---------------------------------------------------------------------------
if (!env.isTest) {
  app.use(pinoHttp({ logger, useLevel: 'http' }));
}

// ---------------------------------------------------------------------------
// Body parsers
// ---------------------------------------------------------------------------
// PayFast ITN arrives as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// Email-sending routes (verification, password reset) — strict to prevent
// abuse even if someone has a list of valid emails.
const emailLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
app.use('/api/auth/verify-email/request', emailLimiter);
app.use('/api/auth/password-reset/request', emailLimiter);

// Payments checkout — strict because each call may create a real PayFast
// transaction that must be reconciled.
const checkoutLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
app.use('/api/payments/checkout', checkoutLimiter);

// Analysis is the most expensive endpoint (CV + optional LLM call per request).
// Hard cap well above any tier's monthly quota to prevent runaway cost from a
// buggy client loop. The per-tier monthly quota is enforced in the route.
const analysisLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
app.use('/api/analysis/', analysisLimiter);

// General API limiter — generous but present.
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
app.use('/api/', apiLimiter);

// ---------------------------------------------------------------------------
// Health / readiness
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true }));

// Serve locally-stored uploads in dev (Supabase serves them in prod).
if (!env.isTest) {
  app.use('/uploads', express.static(path.resolve(process.cwd(), env.storage.localDir), {
    maxAge: '7d',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }));
}

app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analysis', analysisRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(errorHandler);

// Export for tests (supertest) — only boot the listener when run directly.
module.exports = app;

// ---------------------------------------------------------------------------
// Start (only when invoked directly, not when required by tests)
// ---------------------------------------------------------------------------
if (require.main === module) {
  app.listen(env.port, () => {
    logger.info({ port: env.port, env: env.nodeEnv }, 'Lummina backend listening');
  });
}
