---
name: lumina-deploy
description: How to deploy Lummina Studio to production (Vercel + Supabase + Render/Railway) and run operational tasks. Use whenever deploying the frontend or backend, running Prisma migrations, configuring Supabase storage, setting up PayFast live credentials, configuring env vars, seeding the admin user, or investigating a production deployment issue. Also use when setting up Sentry, log drains, or cron jobs for period resets.
---

# Deploying Lummina Studio

Three services: **Vercel** (frontend, `app/`), **Render or Railway** (backend, `lumina-backend/`), **Supabase** (Postgres + image storage). PayFast handles ZAR payments; USD/Stripe is stubbed.

## Architecture in production

```
Browser ──HTTPS──> Vercel (Next.js frontend)
                        │
                        ▼ (REST, JWT in Authorization header)
              Render/Railway (Node/Express backend)
                        │
                  ┌─────┴─────┐
                  ▼           ▼
            Supabase       Supabase
            Postgres       Storage (portraits bucket, private)
                        │
                        ▼
                  PayFast (ITN → backend /api/payments/payfast/itn)
```

CORS is enforced at the backend — `CORS_ORIGIN` must list the Vercel frontend URL(s).

## First-time deploy sequence

Do these in order. Each depends on the previous.

1. **Create Supabase project.** Note the project URL, anon key (not needed), and service-role key. In the SQL editor or via `prisma migrate`, create the schema. In Storage, create a **private** bucket named `portraits`.
2. **Get the Postgres connection string.** Supabase → Project Settings → Database → connection string (URI, not pooler if you're on a plan that distinguishes). Format: `postgresql://postgres.<ref>:<password>@<region>.supabase.co:5432/postgres`. Use this as `DATABASE_URL`.
3. **Run migrations.** From `lumina-backend/`: `DATABASE_URL=<that string> npx prisma migrate deploy`. Then `npx prisma generate`.
4. **Seed the admin user.** `node prisma/seed.js` (uses `DATABASE_URL`). It prints a generated admin password — capture it. Force a password change on first login (the seed script notes this).
5. **Deploy backend to Render/Railway.** Root: `lumina-backend/`. Build: `npm install`. Start: `node src/server.js`. Set every env var from `.env.example` (production values — see below). Make the service URL public; PayFast's notify URL must reach `/api/payments/payfast/itn`.
6. **Deploy frontend to Vercel.** Root: `app/`. Set `NEXT_PUBLIC_API_URL` to the Render/Railway backend URL. No other build config needed.
7. **Configure PayFast (live).** In the PayFast merchant dashboard: set the passphrase (used in `PAYFAST_PASSPHRASE`), set notify_url to `https://<backend>/api/payments/payfast/itn`, return/cancel URLs to `https://<frontend>/checkout`. Then flip `PAYFAST_MODE=live` and set the real `PAYFAST_MERCHANT_ID`/`KEY`.

## Required production env vars (backend)

Every one of these must be set on Render/Railway. The app refuses to boot without the required ones (see `src/config/env.js`).

| Var | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | Comma-separated frontend URLs. **App throws at boot if empty in prod.** |
| `APP_BASE_URL` | Frontend URL, for email verification/reset links |
| `DATABASE_URL` | Supabase Postgres |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `BCRYPT_SALT_ROUNDS` | `12` |
| `PAYFAST_MODE` | `live` |
| `PAYFAST_MERCHANT_ID` / `KEY` / `PASSPHRASE` | From PayFast dashboard |
| `PAYFAST_RETURN_URL` / `CANCEL_URL` | `https://<frontend>/checkout?...` |
| `PAYFAST_NOTIFY_URL` | `https://<backend>/api/payments/payfast/itn` — must be publicly reachable |
| `EMAIL_DRIVER` | `smtp` (or `resend`) |
| `SMTP_HOST` / `PORT` / `USER` / `PASS` | Your transactional email provider |
| `EMAIL_FROM_ADDRESS` | e.g. `no-reply@yourdomain.com` |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | From Supabase project settings |
| `SUPABASE_STORAGE_BUCKET` | `portraits` |
| `LLM_DRIVER` | `template` (default, recommended for launch) |

## Frontend env vars (Vercel)

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL, e.g. `https://api.yourdomain.com` |

## Operational tasks

### Run a migration after a schema change

```
cd lumina-backend
DATABASE_URL=<prod-string> npx prisma migrate deploy
```
Then redeploy the backend (so `prisma generate` runs against the new client).

### Reset monthly analysis periods

The lazy reset in `portfolio.routes.js` handles most cases, but for cleanliness run a cron (Render cron job or Supabase scheduled function) daily:
```sql
UPDATE users SET analyses_used_this_period = 0, period_reset_at = NOW()
WHERE period_reset_at < NOW() - INTERVAL '30 days';
```

### Promote a user to admin manually
```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

### Rotate JWT_SECRET

Rotating `JWT_SECRET` invalidates every outstanding token (everyone re-logs in). To do it without that, bump each user's `tokenVersion` instead (password-reset flow does this per-user). A full secret rotation is a "everyone re-authenticates" event — schedule it.

## Debugging production issues

| Symptom | Check |
|---|---|
| Backend 502 on Render | `/ready` returns 503 if DB unreachable → check `DATABASE_URL`, Supabase project not paused |
| Frontend can't reach API | `NEXT_PUBLIC_API_URL` correct? CORS — backend log shows "Origin not allowed" → add to `CORS_ORIGIN` |
| PayFast ITN not arriving | `PAYFAST_NOTIFY_URL` publicly reachable? Not behind auth? Check PayFast dashboard → ITN log |
| ITN arrives but tier not upgraded | Check backend log for "ITN for already-complete payment" (idempotency) or "Rejected PayFast ITN" (signature/IP fail) |
| Uploads 404 on analysis | Supabase bucket is private — `getImageBytes` uses service-role key, check `SUPABASE_SERVICE_ROLE_KEY` is set (not anon) |
| Email verification not sending | `EMAIL_DRIVER`, SMTP creds, and check the provider's sending domain is verified |
| Tests fail locally but pass in CI | Likely sharp/threadpool — keep `vitest.config.js` on `pool: 'forks'`, `singleFork: true` |

## Security checklist before going fully live

- [ ] `JWT_SECRET` is a fresh 32+ char random string (not the dev default)
- [ ] `CORS_ORIGIN` lists only the real frontend domain(s)
- [ ] PayFast `PAYFAST_PASSPHRASE` is set and matches the dashboard
- [ ] `PAYFAST_MODE=live` (after sandbox testing)
- [ ] Supabase `portraits` bucket is **private** (not public)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is the service-role key (full access) — never expose it to the frontend
- [ ] Seed admin password has been changed from the generated one
- [ ] `EMAIL_DRIVER != log` in production
- [ ] HTTPS only on both services (Vercel/Render enforce this; verify custom domains)
- [ ] CSP headers configured on Vercel (Phase 5 TODO in `next.config.js`)
