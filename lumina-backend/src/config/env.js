require('dotenv').config();

function required(name, fallback) {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

function bool(name, fallback) {
  return (process.env[name] ?? fallback) === 'true';
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// CORS: in production an explicit allow-list is REQUIRED. Failing closed
// here is deliberate — the previous behaviour reflected any origin back
// alongside credentials:true, which is a CSRF-shaped hole.
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (isProduction && corsOrigins.length === 0) {
  throw new Error(
    'CORS_ORIGIN must be set to one or more frontend origins in production. ' +
      'Refusing to start with an open CORS policy + credentials.'
  );
}

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv,
  isProduction,
  corsOrigins,

  // The frontend's public base URL — used to build links in transactional
  // emails (email verification, password reset return URLs).
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),

  // Token-based flows
  emailVerificationExpiresInMs: 24 * 60 * 60 * 1000, // 24h
  passwordResetExpiresInMs: 30 * 60 * 1000, // 30min

  usdToZarFallbackRate: parseFloat(process.env.USD_TO_ZAR_FALLBACK_RATE || '18.50'),

  payfast: {
    mode: process.env.PAYFAST_MODE || 'sandbox', // 'sandbox' | 'live'
    merchantId: required('PAYFAST_MERCHANT_ID'),
    merchantKey: required('PAYFAST_MERCHANT_KEY'),
    passphrase: process.env.PAYFAST_PASSPHRASE || '',
    returnUrl: required('PAYFAST_RETURN_URL'),
    cancelUrl: required('PAYFAST_CANCEL_URL'),
    notifyUrl: required('PAYFAST_NOTIFY_URL'),
    // How long to cache DNS-resolved PayFast source IPs (they rotate rarely).
    ipAllowlistTtlMs: parseInt(
      process.env.PAYFAST_IP_TTL_MS || String(6 * 60 * 60 * 1000),
      10
    ),
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  // Transactional email. SMTP is the universal fallback; Resend is a thin
  // HTTP alternative. If neither is configured we fall back to a no-op
  // logger transport (dev convenience — emails are printed to stdout).
  email: {
    driver: process.env.EMAIL_DRIVER || (isProduction ? 'smtp' : 'log'),
    fromName: process.env.EMAIL_FROM_NAME || 'Lummina Studio',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'no-reply@luminastudio.art',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: bool('SMTP_SECURE', false),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    resendApiKey: process.env.RESEND_API_KEY || '',
  },

  // When true, tests flip the app into a deterministic mode (no real network,
  // no real email sends, fixed timers). Set by the test bootstrap.
  isTest: bool('IS_TEST', false),

  // Image storage (Phase 2). "local" writes to disk and serves via /uploads;
  // "supabase" uses a private Supabase Storage bucket with signed URLs.
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    localDir: process.env.STORAGE_LOCAL_DIR || './uploads',
  },

  // Supabase project credentials (only needed when STORAGE_DRIVER=supabase).
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'portraits',
  },

  // LLM interpreter (Phase 3). "template" is the offline deterministic
  // fallback; "openai" / "anthropic" call the real provider.
  llm: {
    driver: process.env.LLM_DRIVER || 'template',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    maxCostCents: parseInt(process.env.LLM_MAX_COST_CENTS || '50', 10),
  },
};
