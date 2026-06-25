// Vitest global setup.
// Sets deterministic env vars and test mode. Production source modules
// consult env.isTest / env.isProduction to short-circuit real network
// calls (DNS, SMTP, FX) — see payfast.service.js, email.service.js, etc.

process.env.IS_TEST = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PAYFAST_MERCHANT_ID = '10000100';
process.env.PAYFAST_MERCHANT_KEY = '46f0cd694581a';
process.env.PAYFAST_RETURN_URL = 'http://localhost:3000/checkout';
process.env.PAYFAST_CANCEL_URL = 'http://localhost:3000/checkout';
process.env.PAYFAST_NOTIFY_URL = 'http://localhost:4000/api/payments/payfast/itn';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.EMAIL_DRIVER = 'log';

// Stub the prismaClient module so CommonJS require()s in the app pick up
// the in-memory mock instead of attempting a real database connection.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './mockDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prismaPath = path.resolve(__dirname, '..', '..', 'src', 'prismaClient.js');

// Inject the mock with both default + named export shapes so callers using
// either `const prisma = require(...)` or `const { prisma } = require(...)`
// resolve to the same in-memory mock singleton.
const mockExports = prisma;
mockExports.prisma = prisma;
mockExports.default = prisma;

require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: mockExports,
};
