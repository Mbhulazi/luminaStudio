const express = require('express');
const authService = require('../services/auth.service');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const {
  signupSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} = require('../config/schemas');

const router = express.Router();

router.post('/signup', validateBody(signupSchema), async (req, res, next) => {
  try {
    const result = await authService.signup(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Returns the authenticated user's current record — the frontend should
// call this on app load to confirm the token is still valid and to pick
// up any tier change (e.g. after a payment) without requiring re-login.
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: authService.publicUser(req.user) });
});

// -----------------------------------------------------------------------
// Email verification
// -----------------------------------------------------------------------

// POST /api/auth/verify-email/request — authenticated, rate-limited
router.post('/verify-email/request', requireAuth, async (req, res, next) => {
  try {
    const result = await authService.requestEmailVerification(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/verify-email/:token — public (linked from email)
router.get('/verify-email/:token', async (req, res, next) => {
  try {
    const result = await authService.confirmEmailVerification(req.params.token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------
// Password reset
// -----------------------------------------------------------------------

// POST /api/auth/password-reset/request — rate-limited (see server.js)
router.post('/password-reset/request', validateBody(passwordResetRequestSchema), async (req, res, next) => {
  try {
    const result = await authService.requestPasswordReset(req.body.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/password-reset/confirm
router.post('/password-reset/confirm', validateBody(passwordResetConfirmSchema), async (req, res, next) => {
  try {
    const result = await authService.confirmPasswordReset(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
