const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Sign a JWT for a user. Keep the payload small — id, tier, and role are
 * all that authorization middleware needs. Never put the password hash
 * or other sensitive fields in here; the token is readable by the client.
 */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, tier: user.tier, role: user.role, tv: user.tokenVersion ?? 0 },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret); // throws if invalid/expired
}

module.exports = { signToken, verifyToken };
