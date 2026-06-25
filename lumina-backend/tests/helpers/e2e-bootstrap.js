// E2E bootstrap — loaded via `node -r ./tests/helpers/e2e-bootstrap.js src/server.js`
// so the backend process uses the in-memory Prisma mock (same one the unit
// tests use) without needing a live Postgres.
//
// This makes the Playwright smoke test fully self-contained: no DB, no
// email provider, no real DNS. It exercises the real Express routes, the
// real CV pipeline, and the real storage layer (local driver) end-to-end.
//
// For a staging/prod e2e run against a real DB, drop the -r flag and set a
// real DATABASE_URL in playwright.config.ts instead.

process.env.IS_TEST = "true";

const path = require("path");
const { prisma } = require("./e2e-mockDb.cjs");

const prismaPath = path.resolve(__dirname, "..", "..", "src", "prismaClient.js");

// Pre-populate the require cache so `require('../prismaClient')` returns
// the mock. Mirrors what tests/helpers/setup.js does for Vitest.
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  // Mirror the dual export shape the real module exposes.
  exports: Object.assign(prisma, { prisma, default: prisma }),
};
