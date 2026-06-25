const crypto = require('crypto');
const prisma = require('../prismaClient');
const env = require('../config/env');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { sendEmail } = require('./email.service');
const logger = require('../utils/logger');

class AuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.publicMessage = message;
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Signup / Login
// ---------------------------------------------------------------------------

async function signup({ name, email, password }) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    throw new AuthError('An account with that email already exists.', 409);
  }
  const passwordHash = await hashPassword(password);

  const emailVerifyToken = crypto.randomBytes(32).toString('hex');
  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      tier: 'free',
      role: 'user',
      emailVerifyToken,
    },
  });

  // Fire-and-forget — don't block signup on email delivery.
  sendVerificationEmail(user, emailVerifyToken).catch((err) =>
    logger.warn({ err, userId: user.id }, 'Failed to send verification email during signup')
  );

  const token = signToken(user);
  return { token, user: publicUser(user) };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email: (email || '').toLowerCase() } });
  if (!user) throw new AuthError('Incorrect email or password.', 401);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new AuthError('Incorrect email or password.', 401);
  const token = signToken(user);
  return { token, user: publicUser(user) };
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

async function requestEmailVerification(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError('User not found.', 404);
  if (user.emailVerifiedAt) {
    return { message: 'Email is already verified.' };
  }

  const emailVerifyToken = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerifyToken },
  });

  await sendVerificationEmail(user, emailVerifyToken);
  return { message: 'Verification email sent.' };
}

async function confirmEmailVerification(token) {
  const user = await prisma.user.findUnique({ where: { emailVerifyToken: token } });
  if (!user) throw new AuthError('Invalid or expired verification link.', 400);
  if (user.emailVerifiedAt) {
    return { message: 'Email is already verified.' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), emailVerifyToken: null },
  });

  return { message: 'Email verified successfully.' };
}

async function sendVerificationEmail(user, token) {
  const url = `${env.appBaseUrl}/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your email — Lummina Studio',
    html: `
      <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; color: #1a1a2e;">
        <h2 style="color: #c9a84c;">Lummina Studio</h2>
        <p>Welcome, ${user.name}.</p>
        <p>Please verify your email address by clicking below:</p>
        <p><a href="${url}" style="display:inline-block; padding:12px 24px; background:#c9a84c; color:#1a1a2e; text-decoration:none; border-radius:4px;">Verify email</a></p>
        <p style="color:#666; font-size:13px;">This link expires in 24 hours.</p>
      </div>`,
    text: `Verify your Lummina Studio email: ${url}`,
  });
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always return the same message to prevent email-enumeration attacks.
  if (!user) {
    return { message: 'If an account exists with that email, a reset link has been sent.' };
  }

  const passwordResetToken = crypto.randomBytes(32).toString('hex');
  const passwordResetExpiresAt = new Date(Date.now() + env.passwordResetExpiresInMs);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken, passwordResetExpiresAt },
  });

  await sendPasswordResetEmail(user, passwordResetToken);
  return { message: 'If an account exists with that email, a reset link has been sent.' };
}

async function confirmPasswordReset({ token, password }) {
  const user = await prisma.user.findUnique({ where: { passwordResetToken: token } });
  if (!user) throw new AuthError('Invalid or expired reset link.', 400);
  if (user.passwordResetExpiresAt < new Date()) {
    throw new AuthError('This reset link has expired. Request a new one.', 400);
  }

  const passwordHash = await hashPassword(password);

  // Bump tokenVersion so all existing JWTs are invalidated, and clear the
  // reset token so it can't be reused.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      tokenVersion: { increment: 1 },
    },
  });

  // Issue a fresh token so the user is signed in immediately after reset.
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  const freshToken = signToken(updatedUser);
  return { token: freshToken, user: publicUser(updatedUser) };
}

async function sendPasswordResetEmail(user, token) {
  const url = `${env.appBaseUrl}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your password — Lummina Studio',
    html: `
      <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; color: #1a1a2e;">
        <h2 style="color: #c9a84c;">Lummina Studio</h2>
        <p>We received a request to reset your password.</p>
        <p><a href="${url}" style="display:inline-block; padding:12px 24px; background:#c9a84c; color:#1a1a2e; text-decoration:none; border-radius:4px;">Reset password</a></p>
        <p style="color:#666; font-size:13px;">This link expires in 30 minutes. If you didn't request this, ignore this email.</p>
      </div>`,
    text: `Reset your Lummina Studio password: ${url}`,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strips sensitive fields before sending a user object to the client. */
function publicUser(user) {
  const { passwordHash, emailVerifyToken, passwordResetToken, ...rest } = user;
  return rest;
}

module.exports = {
  signup,
  login,
  publicUser,
  AuthError,
  requestEmailVerification,
  confirmEmailVerification,
  requestPasswordReset,
  confirmPasswordReset,
};
