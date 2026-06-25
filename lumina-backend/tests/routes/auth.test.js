import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

// The setup file swaps src/prismaClient.js's require cache with our mock,
// so the CommonJS app code uses it. Here we reach the same singleton via
// the cached module path so test assertions see the same Map instances.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { prisma } = require('../../src/prismaClient.js');

const app = (await import('../../src/server.js')).default;

describe('auth flows', () => {
  beforeEach(() => {
    prisma.__reset();
  });

  it('signup → /me → login cycle works', async () => {
    const up = await request(app).post('/api/auth/signup').send({
      name: 'Ada Lovelace',
      email: 'ada@analytical.engine',
      password: 'analytical-engine-1',
    });
    expect(up.status).toBe(201);
    expect(up.body.token).toBeTruthy();
    expect(up.body.user.email).toBe('ada@analytical.engine');

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${up.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ada@analytical.engine');

    const li = await request(app).post('/api/auth/login').send({
      email: 'ada@analytical.engine',
      password: 'analytical-engine-1',
    });
    expect(li.status).toBe(200);
    expect(li.body.token).toBeTruthy();
  });

  it('signup rejects a duplicate email with 409', async () => {
    await prisma.user.create({
      data: { name: 'X', email: 'dup@e.co', passwordHash: 'x', tier: 'free' },
    });
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Y',
      email: 'dup@e.co',
      password: 'longpass1',
    });
    expect(res.status).toBe(409);
  });

  it('login returns 401 on a bad password', async () => {
    await prisma.user.create({
      data: { name: 'X', email: 'wrong@e.co', passwordHash: '$2b$12$wronghash', tier: 'free' },
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'wrong@e.co',
      password: 'nope-this-is-wrong',
    });
    expect(res.status).toBe(401);
  });

  it('validation rejects a short password at signup', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Short',
      email: 'short@e.co',
      password: 'x',
    });
    expect(res.status).toBe(400);
  });

  it('/me rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('password reset request returns the same message for an unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: 'nonexistent@e.co' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset link has been sent/i);
  });
});
