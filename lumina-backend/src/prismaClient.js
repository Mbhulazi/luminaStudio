// A single shared Prisma instance, reused across the app rather than
// instantiated per-request (Prisma manages its own connection pool).
//
// In Vitest unit-test mode the setup file at tests/helpers/setup.js
// pre-populates Node's require cache for THIS module with an in-memory mock,
// so the real Prisma client below is never instantiated. That keeps unit
// tests DB-free. For e2e tests (a real `node src/server.js` process), a
// real DATABASE_URL must be provided — the test exercises the actual DB.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Export both shapes so callers can use either:
//   const prisma = require('../prismaClient')        // default
//   const { prisma } = require('./prismaClient')     // named
module.exports = prisma;
module.exports.prisma = prisma;
module.exports.default = prisma;
