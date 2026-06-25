const { z } = require('zod');

// ---------------------------------------------------------------------------
// Shared reusable validators
// ---------------------------------------------------------------------------

const emailField = z
  .string()
  .trim()
  .email('A valid email address is required.')
  .max(254);

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128);

const nameField = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(100);

// Thumbnail as a base64 data URI or URL string — cap at 500 KB to prevent
// bloating Postgres with multi-MB inline images.  Real image storage (Phase 2)
// will replace this with a URL reference, but until then we enforce a size
// ceiling.
const thumbnailField = z
  .string()
  .max(500_000, 'Thumbnail is too large — max 500 KB.')
  .optional();

// ---------------------------------------------------------------------------
// Route schemas
// ---------------------------------------------------------------------------

/** POST /api/auth/signup */
const signupSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
});

/** POST /api/auth/login */
const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required.'),
});

/** POST /api/portfolio */
const portfolioCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(200),
  skillTier: z.enum(['beginner', 'intermediate', 'master'], {
    message: 'skillTier must be beginner, intermediate, or master.',
  }),
  scores: z.record(z.unknown()).refine(
    (v) => v && typeof v === 'object' && Object.keys(v).length > 0,
    'scores must be a non-empty object.'
  ),
  thumbnail: thumbnailField,
});

/** POST /api/payments/checkout */
const checkoutSchema = z.object({
  plan: z.enum(['atelier', 'master'], {
    message: 'plan must be atelier or master.',
  }),
  currency: z.enum(['ZAR', 'USD'], {
    message: 'currency must be ZAR or USD.',
  }),
});

/** PATCH /api/admin/users/:id/tier */
const adminTierSchema = z.object({
  tier: z.enum(['free', 'atelier', 'master'], {
    message: 'tier must be free, atelier, or master.',
  }),
});

/** POST /api/auth/password-reset/confirm */
const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: passwordField,
});

/** POST /api/auth/password-reset/request */
const passwordResetRequestSchema = z.object({
  email: emailField,
});

module.exports = {
  signupSchema,
  loginSchema,
  portfolioCreateSchema,
  checkoutSchema,
  adminTierSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
};
