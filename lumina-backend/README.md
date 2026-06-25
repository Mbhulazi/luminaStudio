# Lummina Studio — Backend

Real authentication, tier-based authorization, per-user portfolio persistence,
and South African payment processing (PayFast) for Lummina Studio. This is a
standalone Node.js/Express API meant to sit behind the frontend prototype —
deploy it yourself or hand it to a developer.

## What this does and doesn't do

**Does:** real password hashing (bcrypt), real JWT sessions, a real
Postgres database with per-user data isolation enforced at the query level,
tier-based route gating (free/atelier/master), a super-admin role with
cross-user read access, and a working PayFast integration (signature
generation, payment request building, ITN webhook verification).

**Doesn't:** store your bank details, talk to your bank directly, or
process money itself. PayFast is the regulated payment processor; this
code only talks to PayFast's API. Linking your real South African bank
account so PayFast can pay out to you happens entirely inside the PayFast
merchant dashboard, not in this codebase.

## Stack

- Node.js + Express
- PostgreSQL via Prisma ORM
- bcrypt for password hashing, JWT for sessions
- PayFast for South African payments (ZAR)

## 1. Local setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — point this at a Postgres instance. Easiest options:
  a local Postgres (`brew install postgresql` / `apt install postgresql`),
  or a free-tier hosted one from [Supabase](https://supabase.com),
  [Neon](https://neon.tech), or [Railway](https://railway.app).
- `JWT_SECRET` — generate one with `openssl rand -hex 32`.
- `PAYFAST_*` — see section 3 below. The defaults in `.env.example` are
  PayFast's own published **sandbox** test credentials, fine for development.

Then create the schema and seed a super admin account:

```bash
npx prisma migrate dev --name init
node prisma/seed.js
```

Run it:

```bash
npm run dev      # nodemon, restarts on file changes
# or
npm start
```

The API is now listening on `http://localhost:4000` (or whatever `PORT` you set).

## 2. How tiers and the super admin work

Every user has a `tier` (`free` | `atelier` | `master`) and a `role`
(`user` | `admin`). The `requireTier()` middleware in
`src/middleware/auth.js` checks tier rank on every gated route — **except**
for `role: 'admin'`, which always passes regardless of tier. That's the
"super admin has access to all tiers" requirement: admin is a separate axis
from tier, not just "a user on the master tier."

Portfolio data isolation is enforced in the query itself
(`src/routes/portfolio.routes.js`) — every read/write filters by
`userId: req.user.id`, where `req.user` comes from the verified JWT, never
from a client-supplied parameter. There's no route that lets user A pass
user B's ID and read their data. The one exception is
`src/routes/admin.routes.js`, which is gated by `requireAdmin` and is the
only place cross-user reads are allowed at all.

When a user's tier changes (e.g. after a successful payment), it takes
effect on their **very next request** — `requireAuth` re-fetches the user
row from the database on every request rather than trusting whatever tier
was embedded in the JWT at login time. A user doesn't need to log out and
back in after upgrading.

## 3. Setting up PayFast (do this yourself, not through this code)

1. Register a merchant account at **https://www.payfast.co.za**. This
   involves PayFast's own KYC/business verification process — there's no
   way to automate or skip this from code, by design (it's how they comply
   with South African financial regulations).
2. In your PayFast merchant dashboard, go to **Settings → Banking Details**
   and link your South African bank account. This is the actual "link to
   my SA bank account" step — PayFast pays out to that account on their own
   settlement schedule. This code never sees or stores your account number.
3. Also under **Settings → Security**, set a **passphrase**. Put it in
   `PAYFAST_PASSPHRASE` in your `.env` — it's mixed into every signature
   this code generates and PayFast generates, so requests can't be forged
   by someone who doesn't know it.
4. Copy your **Merchant ID** and **Merchant Key** from the dashboard into
   `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY`.
5. Set `PAYFAST_NOTIFY_URL` to a **publicly reachable** URL pointing at
   `/api/payments/payfast/itn` on your deployed backend. PayFast calls this
   server-to-server after every payment attempt — it cannot reach
   `localhost`, so ITN testing requires either a deployed staging backend
   or a tunnel tool like `ngrok` during local development.
6. Switch `PAYFAST_MODE` from `sandbox` to `live` only once you've tested
   the full flow end-to-end against PayFast's sandbox.

### Currency note

PayFast settles in **ZAR only**. The pricing in this project is defined in
USD as the standard currency (`src/routes/payments.routes.js`,
`PLAN_PRICES_USD`) and converted to ZAR at checkout time via
`src/services/currency.service.js`, which currently uses a **fixed
fallback rate** from `.env` — there's no live FX feed wired up. Before
launch, swap `getUsdToZarRate()` to call a real FX API
(exchangerate.host, Open Exchange Rates, etc.) with a short cache (a few
hours is plenty; exchange rates don't need to be real-time for this).

For customers who want to pay in **USD directly** (outside South Africa),
PayFast can't help — you'd need a second provider like Stripe. The
checkout route already branches on `currency: 'USD'` and returns a clear
501 "not implemented" response with a pointer to where that integration
should go, rather than silently failing.

## 4. API surface

| Method | Route                          | Auth          | Purpose |
|--------|----------------------------------|---------------|---------|
| POST   | `/api/auth/signup`              | none          | Create a free-tier account |
| POST   | `/api/auth/login`                | none          | Get a JWT |
| GET    | `/api/auth/me`                   | user          | Current user + tier |
| GET    | `/api/portfolio`                 | user          | Caller's own portfolio items |
| POST   | `/api/portfolio`                 | user          | Add an analysis (enforces monthly tier limit) |
| DELETE | `/api/portfolio/:id`             | user (owner)  | Delete one of *your own* items |
| POST   | `/api/payments/checkout`         | user          | Start a PayFast (ZAR) or Stripe (USD, stubbed) payment |
| POST   | `/api/payments/payfast/itn`      | PayFast only  | Webhook — verifies + upgrades tier on success |
| GET    | `/api/payments/:id/status`       | user (owner)  | Poll payment status after returning from PayFast |
| GET    | `/api/admin/users`               | admin         | List every user |
| GET    | `/api/admin/users/:id/portfolio` | admin         | Read any user's portfolio |
| PATCH  | `/api/admin/users/:id/tier`      | admin         | Manually set a user's tier |

## 5. Deployment notes

Any Node-friendly host works — **Render**, **Railway**, and **Fly.io** all
have straightforward free/cheap tiers and built-in Postgres add-ons.
General steps, regardless of host:

1. Provision a Postgres database, set `DATABASE_URL`.
2. Set all the other `.env` values as real environment variables in the
   host's dashboard (never commit `.env` — `.gitignore` already excludes it).
3. Run `npx prisma migrate deploy` (not `migrate dev`) as part of your
   deploy step — `deploy` is the non-interactive, production-safe variant.
4. Point `PAYFAST_NOTIFY_URL`, `PAYFAST_RETURN_URL`, and `PAYFAST_CANCEL_URL`
   at your real deployed domain before switching `PAYFAST_MODE` to `live`.
5. Update `CORS_ORIGIN` to your real frontend domain(s).

## 6. Connecting the existing frontend prototype

The Lummina Studio frontend (the single HTML file) currently simulates all
of this with an in-memory mock user array that resets on every page
reload. To connect it to this real backend:

- Replace the mock `attemptLogin` / `attemptSignup` functions with `fetch`
  calls to `/api/auth/login` and `/api/auth/signup`, storing the returned
  JWT (e.g. in memory or `sessionStorage` — never `localStorage` for an
  auth token if you can avoid it) and sending it as
  `Authorization: Bearer <token>` on every subsequent request.
- Replace the mock portfolio arrays with `fetch('/api/portfolio')` calls.
- Replace `simulatePayment()` with a real call to `/api/payments/checkout`,
  then render the returned PayFast fields as an auto-submitting form (see
  `payfast.service.js`'s `buildPaymentRequest()` — it returns exactly the
  `actionUrl` and `fields` you need).
