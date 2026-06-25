const bcrypt = require('bcrypt');
const env = require('../config/env');

async function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptSaltRounds);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
