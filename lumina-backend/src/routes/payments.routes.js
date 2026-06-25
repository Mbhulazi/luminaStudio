const express = require('express');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const payfast = require('../services/payfast.service');
const currency = require('../services/currency.service');
const logger = require('../utils/logger');
const { checkoutSchema } = require('../config/schemas');

const router = express.Router();

// USD is the standard currency for every plan — see README for how these
// map to the pricing page. Keep this in one place so the frontend and
// backend can't drift apart.
const PLAN_PRICES_USD = {
  atelier: 15,
  master: 32,
};

/**
 * POST /api/payments/checkout
 * Body: { plan: 'atelier' | 'master', currency: 'USD' | 'ZAR' }
 *
 * Creates a pending Payment row, then — if the customer chose ZAR (the
 * expected path for South African customers) — returns the PayFast
 * payment fields the frontend should render as an auto-submitting form
 * POSTing to payfast.actionUrl. PayFast settles ZAR directly into your
 * linked SA bank account; see payfast.service.js for details.
 *
 * If the customer chose USD, this is where you'd instead create a Stripe
 * (or similar) PaymentIntent/Checkout Session — stubbed below since no
 * USD provider is wired up yet.
 */
router.post('/checkout', requireAuth, validateBody(checkoutSchema), async (req, res, next) => {
  try {
    const { plan, currency: chosenCurrency } = req.body;
    const amountUsd = PLAN_PRICES_USD[plan];

    if (chosenCurrency === 'ZAR') {
      const amountZar = await currency.usdToZar(amountUsd);

      const payment = await prisma.payment.create({
        data: {
          userId: req.user.id,
          provider: 'payfast',
          providerRef: '', // filled in once PayFast's ITN gives us pf_payment_id
          planPurchased: plan,
          amountUsd,
          amountCharged: amountZar,
          chargedCurrency: 'ZAR',
          status: 'pending',
        },
      });

      const payfastRequest = payfast.buildPaymentRequest({
        amountZar,
        itemName: `Lummina Studio — ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan`,
        userEmail: req.user.email,
        paymentId: payment.id,
      });

      return res.json({ method: 'payfast', payment: { id: payment.id }, ...payfastRequest });
    }

    if (chosenCurrency === 'USD') {
      // TODO: integrate Stripe (or another USD-capable processor) here.
      // Create a Payment row with provider:'stripe', status:'pending', then
      // return a Stripe Checkout Session URL the frontend redirects to.
      return res.status(501).json({
        error: 'USD card payments are not wired up in this scaffold yet. Add a Stripe integration alongside payfast.service.js, following the same Payment-row pattern.',
      });
    }

    return res.status(400).json({ error: 'currency must be "USD" or "ZAR".' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/payfast/itn
 *
 * PayFast's server calls this directly — there is no Authorization header
 * and no CORS involved, since it's a server-to-server POST, not a browser
 * request. This route must stay public (no requireAuth). All trust comes
 * from payfast.service.verifyItn()'s three checks: signature, source IP,
 * and the server-to-server confirmation call back to PayFast.
 *
 * PayFast expects a 200 response quickly; do slow work (if any) after
 * responding, not before.
 *
 * IDEMPOTENCY: Once a payment reaches 'complete', it will NOT be
 * downgraded by a subsequent ITN (e.g. a late FAILED or a resend).
 */
router.post('/payfast/itn', async (req, res, next) => {
  try {
    const sourceIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const verification = await payfast.verifyItn(req.body, sourceIp);

    if (!verification.valid) {
      logger.warn({ reason: verification.reason, body: req.body }, 'Rejected PayFast ITN');
      return res.status(400).send('Invalid ITN');
    }

    const paymentId = parseInt(req.body.m_payment_id, 10);
    const payfastStatus = req.body.payment_status; // 'COMPLETE' | 'FAILED' | 'CANCELLED' etc.
    const pfPaymentId = req.body.pf_payment_id;

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      logger.warn({ paymentId }, 'ITN for unknown payment');
      return res.status(404).send('Unknown payment');
    }

    // --- Idempotency guard ------------------------------------------------
    // If the payment is already complete, do nothing.  PayFast may resend
    // an ITN; we must not downgrade the user's tier on a late FAILED that
    // arrives after a COMPLETE was already processed.
    if (payment.status === 'complete') {
      logger.info({ paymentId, pfPaymentId }, 'ITN received for already-complete payment — ignored');
      return res.status(200).send('OK');
    }
    // ----------------------------------------------------------------------

    const statusMap = { COMPLETE: 'complete', FAILED: 'failed', CANCELLED: 'cancelled' };
    const newStatus = statusMap[payfastStatus] || 'pending';

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: newStatus, providerRef: pfPaymentId, rawPayload: req.body },
      });
      if (newStatus === 'complete') {
        await tx.user.update({
          where: { id: payment.userId },
          data: { tier: payment.planPurchased },
        });
      }
    });

    res.status(200).send('OK'); // PayFast just wants a 200; body content doesn't matter.
  } catch (err) {
    next(err);
  }
});

// Lets the frontend poll "did my payment go through yet" after returning
// from PayFast's hosted page, since the ITN can arrive slightly after the
// browser redirect does.
router.get('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const payment = await prisma.payment.findFirst({ where: { id, userId: req.user.id } });
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    res.json({ status: payment.status, plan: payment.planPurchased });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
