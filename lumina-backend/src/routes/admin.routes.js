const express = require('express');
const prisma = require('../prismaClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { adminTierSchema } = require('../config/schemas');

const router = express.Router();

// Every route in this file requires both a valid token AND role=admin.
// This is the only part of the API where reading another user's data is
// permitted at all — "super admin user with access to all tiers" lives
// here, deliberately isolated from the regular portfolio routes.
router.use(requireAuth, requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, tier: true, role: true,
        createdAt: true, analysesUsedThisPeriod: true,
        _count: { select: { portfolioItems: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id/portfolio', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const items = await prisma.portfolioItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// Lets an admin manually adjust a user's tier — e.g. for support,
// complimentary access, or correcting a failed payment reconciliation.
router.patch('/users/:id/tier', validateBody(adminTierSchema), async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { tier } = req.body;
    const user = await prisma.user.update({ where: { id: userId }, data: { tier } });
    res.json({ user: { id: user.id, name: user.name, tier: user.tier } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
