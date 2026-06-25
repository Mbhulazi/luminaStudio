import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Lummina Studio frontend smoke test.
 *
 * Runs a single e2e flow against a running frontend (NEXT_PUBLIC_API_URL
 * pointing at a running backend). The test file boots both servers itself
 * via the global setup, so `npx playwright test` works standalone.
 *
 * The test is intentionally a single happy-path file — this is a launch
 * gate, not a comprehensive suite. Add more files under e2e/ as the app grows.
 */

const FRONTEND_PORT = 3100;
const BACKEND_PORT = 4100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // single worker — we share the test DB
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // The `-r` preloads the in-memory Prisma mock so the backend runs
      // without a real Postgres. Drop it (and set a real DATABASE_URL) to
      // run e2e against a real database in staging.
      command: `cross-env PORT=${BACKEND_PORT} CORS_ORIGIN=http://localhost:${FRONTEND_PORT} IS_TEST=true DATABASE_URL="postgresql://unused" JWT_SECRET=playwright-secret PAYFAST_MERCHANT_ID=10000100 PAYFAST_MERCHANT_KEY=46f0cd694581a PAYFAST_RETURN_URL=http://localhost:${FRONTEND_PORT}/checkout PAYFAST_CANCEL_URL=http://localhost:${FRONTEND_PORT}/checkout PAYFAST_NOTIFY_URL=http://localhost:${BACKEND_PORT}/api/payments/payfast/itn node -r ./tests/helpers/e2e-bootstrap.js src/server.js`,
      cwd: "../lumina-backend",
      url: `http://localhost:${BACKEND_PORT}/health`,
      timeout: 30_000,
      reuseExistingServer: true,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `cross-env PORT=${FRONTEND_PORT} NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT} next dev`,
      cwd: ".",
      url: `http://localhost:${FRONTEND_PORT}`,
      timeout: 60_000,
      reuseExistingServer: true,
    },
  ],
});
