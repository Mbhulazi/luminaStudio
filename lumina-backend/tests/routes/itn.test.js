import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { prisma } = require('../../src/prismaClient.js');
const payfast = require('../../src/services/payfast.service.js');

const app = (await import('../../src/server.js')).default;

describe('POST /api/payments/payfast/itn — idempotency', () => {
  beforeEach(() => {
    prisma.__reset();
    // Default: verification passes. Individual tests override as needed.
    payfast.__testVerdict = { valid: true };
  });

  it('completes a pending payment and upgrades the user', async () => {
    const user = await prisma.user.create({
      data: { name: 'U', email: 'u@e.co', passwordHash: 'x', tier: 'free' },
    });
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        provider: 'payfast',
        providerRef: '',
        planPurchased: 'atelier',
        amountUsd: 15,
        amountCharged: 277.5,
        chargedCurrency: 'ZAR',
        status: 'pending',
      },
    });

    const res = await request(app)
      .post('/api/payments/payfast/itn')
      .set('X-Forwarded-For', '1.2.3.4')
      .send({
        m_payment_id: String(payment.id),
        pf_payment_id: 'PF-1',
        payment_status: 'COMPLETE',
        signature: 'mock-sig',
      });

    expect(res.status).toBe(200);

    const updated = prisma.__store.payments.get(payment.id);
    expect(updated.status).toBe('complete');
    expect(updated.providerRef).toBe('PF-1');

    const updatedUser = [...prisma.__store.users.values()].find((u) => u.id === user.id);
    expect(updatedUser.tier).toBe('atelier');
  });

  it('does NOT downgrade a tier on a late FAILED after COMPLETE', async () => {
    const user = await prisma.user.create({
      data: { name: 'U', email: 'u2@e.co', passwordHash: 'x', tier: 'master' },
    });
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        provider: 'payfast',
        providerRef: 'PF-9',
        planPurchased: 'master',
        amountUsd: 32,
        amountCharged: 592,
        chargedCurrency: 'ZAR',
        status: 'complete',
      },
    });

    const res = await request(app)
      .post('/api/payments/payfast/itn')
      .set('X-Forwarded-For', '1.2.3.4')
      .send({
        m_payment_id: String(payment.id),
        pf_payment_id: 'PF-9',
        payment_status: 'FAILED',
        signature: 'mock-sig',
      });

    expect(res.status).toBe(200);

    const updated = prisma.__store.payments.get(payment.id);
    expect(updated.status).toBe('complete');
    const updatedUser = [...prisma.__store.users.values()].find((u) => u.id === user.id);
    expect(updatedUser.tier).toBe('master');

    // No update calls were made — idempotency guard kicked in.
    expect(prisma.__calls.paymentUpdate.length).toBe(0);
    expect(prisma.__calls.userUpdate.length).toBe(0);
  });

  it('rejects an invalid ITN with 400', async () => {
    payfast.__testVerdict = { valid: false, reason: 'Signature mismatch.' };
    const res = await request(app)
      .post('/api/payments/payfast/itn')
      .send({ m_payment_id: '1', payment_status: 'COMPLETE' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown payment id', async () => {
    const res = await request(app)
      .post('/api/payments/payfast/itn')
      .send({ m_payment_id: '999999', payment_status: 'COMPLETE', signature: 'mock-sig' });
    expect(res.status).toBe(404);
  });
});
