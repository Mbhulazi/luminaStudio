const { verifyToken } = require('../utils/jwt');
const prisma = require('../prismaClient');

const TIER_RANK = { free: 0, atelier: 1, master: 2 };

/**
 * Verifies the JWT and attaches the *current* user record from the database
 * to req.user — not just whatever tier/role was embedded in the token at
 * sign time. This matters: if a user upgrades their plan, their existing
 * token (valid for up to JWT_EXPIRES_IN) must reflect the new tier on the
 * very next request, not after they happen to log in again.
 *
 * Also checks tokenVersion so that a password reset (which bumps the
 * version) immediately invalidates all outstanding tokens without changing
 * the JWT secret.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'User no longer exists.' });
    if (user.tokenVersion !== (payload.tv ?? 0)) {
      return res.status(401).json({ error: 'Token revoked. Please sign in again.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Gate a route by minimum tier. Admins always pass, regardless of their
 * own `tier` column, since role=admin is a separate axis of access that
 * supersedes tier ("super admin user with access to all tiers").
 */
function requireTier(minTier) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    if (req.user.role === 'admin') return next();
    const userRank = TIER_RANK[req.user.tier] ?? 0;
    const minRank = TIER_RANK[minTier] ?? 0;
    if (userRank < minRank) {
      return res.status(403).json({
        error: `This feature requires the ${minTier} plan or higher.`,
        currentTier: req.user.tier,
        requiredTier: minTier,
      });
    }
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Super admin access required.' });
  }
  next();
}

module.exports = { requireAuth, requireTier, requireAdmin, TIER_RANK };
