import { test, expect } from "@playwright/test";

/**
 * Lummina Studio end-to-end smoke test.
 *
 * Single happy-path flow: sample page (public) → signup → upload → real
 * analysis → result on workspace → appears in dashboard.
 *
 * The backend runs in IS_TEST mode (in-memory DB via e2e-bootstrap, log
 * email, no real DNS), so this exercises the real Express routes + real CV
 * pipeline without touching any external service. It's a launch gate: every
 * part of the critical path must work for this to pass.
 */

// A 64×64 solid-colour PNG generated via sharp (see e2e/fixtures/README.md).
// Committed as a binary fixture rather than inlined base64 — base64 strings
// are easy to corrupt by copy-paste, and a corrupt PNG fails silently in
// libpng. The fixture was verified to round-trip through sharp's full
// normalizeImage pipeline before being committed.
const imagePath = "e2e/fixtures/portrait.png";

// ---------------------------------------------------------------------------
// 1. Public sample page — the honest demo must work without any account.
// ---------------------------------------------------------------------------
test("sample page shows a real measured analysis", async ({ page }) => {
  await page.goto("/sample");
  // The "Live sample" badge is the integrity signal — it must be present.
  await expect(page.locator("text=Live sample")).toBeVisible({ timeout: 30_000 });
  // The sample portrait image must load.
  await expect(page.locator("img[alt='Sample reference portrait']")).toBeVisible();
  // At least one mentor observation (prose) must render.
  await expect(page.locator("text=Mentor observation").first()).toBeVisible();
  // The provenance badge — grades are measured.
  await expect(page.locator("text=Grades: measured from pixels")).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. Signup → real analysis → dashboard history
// ---------------------------------------------------------------------------
test("signup, upload, and see a real analysis", async ({ page }) => {
  // Sign up — use a unique email so re-runs don't collide (mock DB is
  // per-process, so this is mostly defensive).
  const email = `smoke+${Date.now()}@e2e.test`;
  await page.goto("/auth?mode=signup&next=/workspace");

  // Ensure we're in signup mode — click the tab explicitly to defeat any
  // hydration flash that might have reset the URL-driven state.
  await page.click('button.auth-tab:has-text("Create account")');
  await expect(page.locator('input#suName')).toBeVisible();

  await page.fill('input#suName', "Smoke Tester");
  await page.fill('input#authEmail', email);
  await page.fill('input#authPassword', "longpass-smoke-1");
  await page.click('button[type="submit"]:has-text("Create account")');

  // Should land on the workspace.
  await expect(page).toHaveURL(/\/workspace/, { timeout: 20_000 });
  await expect(page.locator("text=Awaiting image")).toBeVisible();

  // Upload the test portrait.
  await page.setInputFiles('input[type="file"]', imagePath);

  // The analysis runs client-side with progressive messages, then completes.
  // Wait for the status to leave "Analysing…" — this exercises upload + the
  // real CV pipeline. 60s ceiling accounts for cold backend boot.
  await page.locator("#wrStatus").waitFor({ state: "attached" });
  await expect
    .poll(async () => await page.locator("#wrStatus").textContent(), { timeout: 60_000 })
    .not.toContain("Analysing");

  const finalStatus = await page.locator("#wrStatus").textContent();
  if (finalStatus?.includes("Failed")) {
    const detail = await page.locator(".wse-sub").first().textContent();
    throw new Error(`Analysis failed in e2e: ${detail}`);
  }

  // The measured grades must render (A, B, C, etc.).
  await expect(page.locator(".ana-grade").first()).toBeVisible({ timeout: 10_000 });
  // The provenance badge must show on a real (non-sample) analysis.
  await expect(page.locator("text=Grades: measured from pixels")).toBeVisible();

  // Navigate to the dashboard.
  await page.goto("/dashboard");
  await expect(page.locator("text=Welcome back")).toBeVisible();
  // The analysis we just ran must appear in history.
  await expect(page.locator("text=Analysis #").first()).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// 3. Auth guard — unauthenticated users can't reach the workspace
//    (Runs in a fresh browser context so no token leaks from test 2.)
// ---------------------------------------------------------------------------
test("workspace redirects to auth when signed out", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/workspace");
  // Should bounce to the auth page (the Workspace component does this when
  // useAuth reports no user).
  await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
  await context.close();
});
