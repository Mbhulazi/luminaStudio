import { describe, it, expect } from 'vitest';
import {
  signupSchema,
  loginSchema,
  portfolioCreateSchema,
  checkoutSchema,
  adminTierSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '../../src/config/schemas.js';

function ok(schema, value) {
  return schema.safeParse(value).success;
}

describe('auth schemas', () => {
  describe('signupSchema', () => {
    it('accepts a valid payload', () => {
      expect(ok(signupSchema, { name: 'Ada', email: 'a@b.co', password: 'longpass1' })).toBe(true);
    });
    it('rejects a short password', () => {
      expect(ok(signupSchema, { name: 'Ada', email: 'a@b.co', password: 'short' })).toBe(false);
    });
    it('rejects an invalid email', () => {
      expect(ok(signupSchema, { name: 'Ada', email: 'not-an-email', password: 'longpass1' })).toBe(false);
    });
    it('rejects a missing name', () => {
      expect(ok(signupSchema, { email: 'a@b.co', password: 'longpass1' })).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('accepts valid credentials', () => {
      expect(ok(loginSchema, { email: 'a@b.co', password: 'anything' })).toBe(true);
    });
    it('rejects a malformed email', () => {
      expect(ok(loginSchema, { email: 'x', password: 'p' })).toBe(false);
    });
  });
});

describe('portfolio schema', () => {
  const good = { title: 'Self portrait', skillTier: 'beginner', scores: { value: 'A' } };
  it('accepts a valid item', () => {
    expect(ok(portfolioCreateSchema, good)).toBe(true);
  });
  it('accepts a thumbnail', () => {
    expect(ok(portfolioCreateSchema, { ...good, thumbnail: 'data:image/png;base64,abc' })).toBe(true);
  });
  it('rejects an oversized thumbnail', () => {
    const big = 'x'.repeat(500_001);
    expect(ok(portfolioCreateSchema, { ...good, thumbnail: big })).toBe(false);
  });
  it('rejects an invalid skillTier', () => {
    expect(ok(portfolioCreateSchema, { ...good, skillTier: 'pro' })).toBe(false);
  });
  it('rejects an empty scores object', () => {
    expect(ok(portfolioCreateSchema, { ...good, scores: {} })).toBe(false);
  });
});

describe('checkout schema', () => {
  it('accepts atelier/ZAR', () => {
    expect(ok(checkoutSchema, { plan: 'atelier', currency: 'ZAR' })).toBe(true);
  });
  it('rejects an unknown plan', () => {
    expect(ok(checkoutSchema, { plan: 'pro', currency: 'ZAR' })).toBe(false);
  });
  it('rejects an unknown currency', () => {
    expect(ok(checkoutSchema, { plan: 'atelier', currency: 'EUR' })).toBe(false);
  });
});

describe('admin tier schema', () => {
  it('accepts a valid tier', () => {
    expect(ok(adminTierSchema, { tier: 'master' })).toBe(true);
  });
  it('rejects an invalid tier', () => {
    expect(ok(adminTierSchema, { tier: 'gold' })).toBe(false);
  });
});

describe('password reset schemas', () => {
  it('request requires a valid email', () => {
    expect(ok(passwordResetRequestSchema, { email: 'a@b.co' })).toBe(true);
    expect(ok(passwordResetRequestSchema, { email: 'x' })).toBe(false);
  });
  it('confirm requires token + 8+ char password', () => {
    expect(ok(passwordResetConfirmSchema, { token: 't', password: 'longpass1' })).toBe(true);
    expect(ok(passwordResetConfirmSchema, { token: 't', password: 'short' })).toBe(false);
  });
});
