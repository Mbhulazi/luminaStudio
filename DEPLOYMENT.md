# Deploying Lummina Studio to Production

Three services: **Vercel** (frontend, `app/`) · **Render or Railway** (backend, `lumina-backend/`) · **Supabase** (Postgres + image storage). PayFast handles ZAR payments.

> Read this top to bottom the first time. Steps are sequenced — each depends on the previous. The production environment template is at `lumina-backend/.env.production`.

```
Browser ──HTTPS──> Vercel (Next.js frontend)
                      │
                      ▼ (REST, JWT in Authorization header)
            Render/Railway (Node/Express backend)
                      │
                ┌─────┴─────┐
                ▼           ▼
          Supabase       Supabase
          Postgres       Storage (private 'portraits' bucket)
                      │
                      ▼
                PayFast (ITN → backend /api/payments/payfast/itn)
```

---

## What's already done (local)

These were completed during setup — don't redo them:

- ✅ Prisma schema applied to Supabase (`prisma db push`)
- ✅ Migration baseline created (`prisma/migrations/0_init/`), marked applied
- ✅ DB connection verified end-to-end (`GET /ready` → `{ok:true, db:true}`)
- ✅ PayFast checkout flow verified (signup → login → checkout → signed form → Payment row)
- ✅ `.env.production` template created with all required vars + `<ACTION REQUIRED>` markers
- ✅ `.env.production` gitignored (won't leak secrets)

---

## First-time production deploy — in order

### 0. Decision: sandbox-first (strongly recommended)

You chose to go live with real payments. **Before flipping to live, do one full sandbox deploy + sandbox transaction** to prove the ITN→tier-upgrade loop works end-to-end against real infrastructure. The local test only proved payment *initiation*. The first live transaction should not also be the first time the completion path runs.

Concretely: deploy once with `PAYFAST_MODE=sandbox` (sandbox creds), run a sandbox payment, confirm the user's tier flips to `atelier`/`master`. Then redo step 7 (PayFast config) with live creds.

### 1. Supabase — create the storage bucket

In the Supabase dashboard for project `pppiquczkedsmbdrshrm`:

- **Storage → New bucket** → name `portraits` → **Private** (NOT public). ✅ critical
- **Project Settings → API** → copy the **service_role** key (not anon). Used as `SUPABASE_SERVICE_ROLE_KEY`.

The DB schema is already migrated, so no SQL step needed.

### 2. Run migrations against Supabase (if any new ones exist)

The `0_init` baseline is already applied. For future schema changes:

```bash
cd lumina-backend
npx prisma migrate deploy     # applies any pending migration files
npx prisma generate           # regenerate client
```

### 3. Seed the admin user

```bash
cd lumina-backend
# Use a real, strong password — the default is intentionally insecure
SEED_ADMIN_EMAIL=you@yourdomain.com SEED_ADMIN_PASSWORD='a-strong-password' node prisma/seed.js
```

Log in once via the deployed frontend and **change the password immediately** (the seed prints this reminder). The admin account gets `tier: master, role: admin`.

### 4. Deploy the backend to Render or Railway

- **Root directory:** `lumina-backend/`
- **Build command:** `npm install`
- **Start command:** `node src/server.js`
- Set **every** env var from `lumina-backend/.env.production` (fill in the `<ACTION REQUIRED>` placeholders first). Both Render and Railway have an env-var editor; paste each value in.
- Make the service URL public (not behind auth).
- **Health check path:** `/ready` (Render/Railway can probe this; returns 503 if DB unreachable).

Once deployed, note the public URL, e.g. `https://lumina-backend-xxxx.onrender.com`. **This is your backend URL** — the piece needed to fix `PAYFAST_NOTIFY_URL`.

### 5. Deploy the frontend to Vercel

- **Root directory:** `app/`
- **Environment variable:** `NEXT_PUBLIC_API_URL` = your backend URL from step 4 (e.g. `https://lumina-backend-xxxx.onrender.com`)
- No other build config needed. Next.js 16 auto-detects.

Once deployed, note the frontend URL, e.g. `https://luminastudio.vercel.app`.

### 6. Fix the URLs (the PAYFAST_NOTIFY_URL fix)

Now that you have real URLs, set these in your backend host's env vars (or PayFast dashboard where noted):

| Var | Value |
|---|---|
| `CORS_ORIGIN` | `https://luminastudio.vercel.app` (your frontend URL) |
| `APP_BASE_URL` | same frontend URL |
| `PAYFAST_RETURN_URL` | `https://luminastudio.vercel.app/checkout?status=success` |
| `PAYFAST_CANCEL_URL` | `https://luminastudio.vercel.app/checkout?status=cancelled` |
| **`PAYFAST_NOTIFY_URL`** | **`https://lumina-backend-xxxx.onrender.com/api/payments/payfast/itn`** ← the fix |

> **Why this matters:** the notify URL is where PayFast's *servers* POST the payment confirmation (ITN). The old value `https://your-backend-domain.com/...` is a placeholder that resolves nowhere, so no real payment would ever be confirmed — users would pay but stay on `free` tier forever.

**Verify the backend is reachable on that path** (replace with your real URL):
```bash
curl -i https://<your-backend-url>/ready         # expect {"ok":true,"db":true}
curl -i -X POST https://<your-backend-url>/api/payments/payfast/itn \
  -H "Content-Type: application/x-www-form-urlencoded" -d "x=1"
# expect 400 "Invalid ITN" — correct: the route is public & responding, rejecting an unsigned POST
```

Redeploy/restart the backend after changing env vars.

### 7. Configure PayFast (live)

In the PayFast merchant dashboard (https://www.payfast.co.za):

1. **Settings → Security** → set a **passphrase**. Put the same value in `PAYFAST_PASSPHRASE`.
2. **Settings → Notification (ITN)** → set notify URL to your `PAYFAST_NOTIFY_URL` value (must match the env var exactly).
3. **Settings → Return / Cancel URLs** → set to your frontend checkout pages.
4. Set `PAYFAST_MODE=live` and your real `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` in the backend env.
5. Redeploy the backend.

### 8. Verify the full live loop

1. Create a test customer account on the deployed frontend.
2. Buy the cheapest plan via PayFast with a real (small) card payment.
3. Watch the backend logs — you should see the ITN arrive and the user's tier upgrade.
4. Confirm in Supabase: `SELECT email, tier FROM users WHERE email='test@...';` → tier should be `atelier`/`master`.
5. Check the Payment row: `SELECT status, providerRef, amountCharged, chargedCurrency FROM payments WHERE ...;` → `status=complete`.

If the ITN doesn't arrive: PayFast dashboard → **ITN log** shows the exact request + response. Backend logs show `Rejected PayFast ITN` with a reason (signature / IP / validation).

---

## Frontend env vars (Vercel)

| Var | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL, e.g. `https://lumina-backend-xxxx.onrender.com` |

---

## Operational tasks

### Run a migration after a schema change

```bash
cd lumina-backend
npx prisma migrate deploy        # applies pending migrations to Supabase
# then redeploy the backend so prisma generate runs against the new client
```

### Reset monthly analysis periods (cron)

Daily, via Render cron job or Supabase scheduled function:
```sql
UPDATE users SET analyses_used_this_period = 0, period_reset_at = NOW()
WHERE period_reset_at < NOW() - INTERVAL '30 days';
```

### Promote a user to admin manually
```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

---

## Debugging production

| Symptom | Check |
|---|---|
| Backend 502 on Render | `/ready` → 503 if DB unreachable. Check `DATABASE_URL`, Supabase not paused. |
| Frontend can't reach API | `NEXT_PUBLIC_API_URL` correct? Backend log "Origin not allowed" → add to `CORS_ORIGIN`. |
| PayFast ITN not arriving | `PAYFAST_NOTIFY_URL` public & reachable? Not behind auth? PayFast dashboard → ITN log. |
| ITN arrives but tier not upgraded | Backend log: "ITN for already-complete payment" (idempotency) or "Rejected PayFast ITN" (signature/IP fail). |
| Uploads 404 on analysis | `portraits` bucket must be private; `SUPABASE_SERVICE_ROLE_KEY` must be the service-role key (not anon). |
| Email verification not sending | `EMAIL_DRIVER` (not `log`), SMTP creds, sending domain verified at provider. |

---

## Security checklist before going fully live

- [ ] `JWT_SECRET` is a fresh 32+ char random string (not the dev default)
- [ ] `CORS_ORIGIN` lists only the real frontend domain(s)
- [ ] `PAYFAST_PASSPHRASE` set and matches the dashboard
- [ ] `PAYFAST_MODE=live` with your real merchant creds
- [ ] `PAYFAST_NOTIFY_URL` points at the real backend (not the placeholder)
- [ ] Supabase `portraits` bucket is **private**
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is the service-role key — never exposed to frontend
- [ ] Seed admin password changed from the generated one
- [ ] `EMAIL_DRIVER != log` in production
- [ ] HTTPS on both services (Vercel/Render enforce; verify custom domains)
