---
name: lumina-backend-security
description: How to harden and extend the Lummina Studio Node/Express backend's security, auth, and payment layer. Use whenever working in lumina-backend/src on auth (signup/login/email-verification/password-reset), PayFast ITN, Zod input validation, rate limiting, CORS, helmet, or JWT/tokenVersion handling. Also use when adding a new authenticated route, a new payment provider, or investigating a 401/403/ITN-related bug.
---

# Lummina backend security & payments

The backend lives at `C:\projects\luminastudio\lumina-backend\`. The security posture is integrity-first: this app sells honest portrait analysis, and the security layer exists to protect that promise (no tier bypass, no payment forgery, no token replay).

## The rules that must not be violated

1. **CORS fails closed in production.** `src/config/env.js` throws at boot if `NODE_ENV=production` and `CORS_ORIGIN` is unset. Never "fix" a boot failure by weakening this — add the real origin to the env. The previous code reflected any origin with `credentials:true`; that was a CSRF hole and is deliberately gone.

2. **PayFast ITN has three independent checks** (`src/services/payfast.service.js` `verifyItn`): signature match, source-IP allow-list (DNS-resolved, 6h cache), and server-to-server validate. All three must pass. If you add a payment provider, mirror this three-check pattern — don't shortcut to signature-only.

3. **ITN idempotency is load-bearing.** In `src/routes/payments.routes.js`, once a `Payment.status === 'complete'`, subsequent ITNs (including a late `FAILED`) are ignored. Do not remove this guard — PayFast resends, and without it a late failure would downgrade a paying user's tier.

4. **Grades never come from user input or the LLM.** This is the integrity promise. The security layer enforces the *money* side of that promise: a user can't buy a tier they didn't pay for, can't analyse beyond their quota, and can't forge an admin role. See `lumina-cv-engine` for the measurement side.

5. **`tokenVersion` invalidates JWTs on password reset.** `requireAuth` (`src/middleware/auth.js`) re-fetches the user per request and checks `payload.tv === user.tokenVersion`. Password reset bumps the version. Never sign a token without including `tv`.

## Key files

| File | Purpose |
|---|---|
| `src/config/env.js` | All config, including the CORS fail-closed check. Read this before changing any env-driven behaviour. |
| `src/server.js` | Middleware order matters: helmet → CORS → pino-http → body parsers → rate limiters → routes. The rate limiters are route-scoped (auth, email, checkout, analysis) on purpose. |
| `src/middleware/auth.js` | `requireAuth` (always re-fetches user) and `requireTier`. Tier comes from the DB, not the token, so upgrades apply on the next request. |
| `src/middleware/validate.js` + `src/config/schemas.js` | Zod validation middleware + every route's body schema. **Every new route body must have a schema.** Cap string sizes; whitelist enums. |
| `src/middleware/errorHandler.js` | Operational errors (`statusCode` set) log at warn; unhandled errors log full stack and return a generic message (never leak internals in prod). |
| `src/services/auth.service.js` | Signup fires verification email async (don't await it). Password-reset request returns the same message whether or not the email exists (anti-enumeration). |
| `src/services/payfast.service.js` | Signature uses MD5 per PayFast's spec, with spaces encoded as `+`. The `__testVerdict` hook is the ONLY sanctioned way to bypass verification, and only when `env.isTest`. |
| `src/routes/payments.routes.js` | Checkout creates a pending `Payment` row before returning PayFast fields. The ITN handler is where the tier upgrade happens, inside a transaction. |

## Adding a new authenticated route

1. Define a Zod schema in `src/config/schemas.js`. Cap every string; use `z.enum` for closed sets.
2. In the route file: `router.post('/x', requireAuth, validateBody(xSchema), handler)`.
3. If tier-gated: add `requireTier('atelier')` (or check `req.user.tier` manually and return 403 with `requiredTier` so the frontend can prompt upgrade).
4. If it consumes an analysis quota: mirror the transaction pattern in `portfolio.routes.js` — increment `analysesUsedThisPeriod` atomically.
5. Add a rate limiter in `server.js` if the route is expensive or abuse-prone.

## Adding a payment provider (e.g. Stripe for USD)

The USD path currently returns 501. To wire Stripe:
1. Add `src/services/stripe.service.js` mirroring `payfast.service.js`'s shape: `buildCheckoutSession`, `verifyWebhook` (signature + event-id idempotency + source check).
2. In `payments.routes.js` checkout handler, branch on `currency === 'USD'`: create a pending `Payment` with `provider:'stripe'`, return the Stripe Checkout URL.
3. Add `POST /api/payments/stripe/webhook` (public, like the ITN route) that verifies and applies the tier upgrade inside a transaction with the same idempotency guard.

## Test mode

`env.isTest` (set by `tests/helpers/setup.js`) short-circuits DNS, email, and the PayFast verifier. The Prisma client is replaced with an in-memory mock via the require cache. When a test needs a specific verification verdict, set `payfast.__testVerdict = { valid: true }`. Tests run in a single fork (`vitest.config.js`) because sharp's native threadpool is unstable under parallel workers.

## Common pitfalls

- **Don't put `pino-http` back on unconditionally** — it's gated by `!env.isTest` because it spams test output and the errorHandler falls back to the global logger when `req.log` is absent.
- **Don't read `req.body` before `validateBody`** — the middleware replaces `req.body` with the parsed (coerced) output, so earlier reads see raw input.
- **Don't sign tokens without `tokenVersion`** — `requireAuth` will reject them.
