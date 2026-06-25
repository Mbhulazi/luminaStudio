import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { prisma } = require('../../src/prismaClient.js');
const app = (await import('../../src/server.js')).default;

// A 16×16 solid-colour PNG — large enough to avoid libpng edge cases on
// tiny images, small enough to be instant. sharp decodes/re-encodes it.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWM4kWJEEmIY1ZAyGkonhmvSAACoeF4Qaj9W2AAAAABJRU5ErkJggg==',
  'base64'
);

// Test mode uses the local storage driver; pick a path that exists in the
// project's temp area so we don't litter the repo.
beforeAll(() => {
  process.env.STORAGE_DRIVER = 'local';
  process.env.STORAGE_LOCAL_DIR = './uploads-test';
});

describe('POST /api/portfolio/upload', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/portfolio/upload')
      .attach('image', TINY_PNG, 't.png');
    expect(res.status).toBe(401);
  });

  it('returns 400 when no file is attached', async () => {
    const up = await request(app).post('/api/auth/signup').send({
      name: 'Uploader',
      email: `nofile-${Date.now()}@e.co`,
      password: 'longpass1',
    });

    const res = await request(app)
      .post('/api/portfolio/upload')
      .set('Authorization', `Bearer ${up.body.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no image/i);
  });

  it('accepts a valid PNG, returns a storage key + URL', async () => {
    const up = await request(app).post('/api/auth/signup').send({
      name: 'Uploader',
      email: `png-${Date.now()}@e.co`,
      password: 'longpass1',
    });

    const res = await request(app)
      .post('/api/portfolio/upload')
      .set('Authorization', `Bearer ${up.body.token}`)
      .attach('image', TINY_PNG, 'portrait.png');

    expect(res.status).toBe(201);
    expect(res.body.uploadId).toMatch(/^local\//);
    expect(res.body.url).toMatch(/^\/uploads\//);
    expect(res.body.mime).toBe('image/jpeg'); // sharp re-encodes to JPEG
    expect(res.body.width).toBeGreaterThan(0);
    expect(res.body.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a non-image file', async () => {
    const up = await request(app).post('/api/auth/signup').send({
      name: 'Uploader',
      email: `bad-${Date.now()}@e.co`,
      password: 'longpass1',
    });

    const res = await request(app)
      .post('/api/portfolio/upload')
      .set('Authorization', `Bearer ${up.body.token}`)
      .attach('image', Buffer.from('not an image'), 'evil.txt');

    expect(res.status).toBe(400);
  });
});
