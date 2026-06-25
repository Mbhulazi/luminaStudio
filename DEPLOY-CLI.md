# Deploy via CLI (Vercel + Render Blueprint)

Command-line alternative to the dashboard clicks in [DEPLOYMENT.md](./DEPLOYMENT.md).
Reproducible and scriptable. Do the **backend first** — the frontend needs its URL.

> The Render backend is defined as code in [`render.yaml`](./render.yaml). Vercel
> reads config from flags / `vercel.json` at deploy time. Neither stores secrets
> in git — you'll enter those interactively or in each platform's dashboard.

---

## Prerequisites

```bash
npm install -g vercel        # Vercel CLI (already installed if you followed along)
# Render has no first-party CLI for deploys; you use the Blueprint from the web UI.
git --version                # ensure git present
```

You need:
- Both accounts logged in / ready (Vercel, Render)
- The GitHub repo pushed (already done: `github.com/mbhulazi/luminastudio`)
- Your real secrets ready (Supabase service-role key, SMTP creds, fresh JWT_SECRET,
  live PayFast creds + passphrase) — see `lumina-backend/.env.production`

---

## Step 1 — Backend on Render (via Blueprint)

`render.yaml` at the repo root tells Render how to build the backend. Secrets are
**not** in the file (they never should be) — Render marks them `sync: false` and
you set them in the dashboard.

1. Log in at **render.com**.
2. **New → Blueprint** → select the `mbhulazi/luminastudio` repo.
3. Render reads `render.yaml` and stages a `lummina-backend` web service.
4. **Before clicking Apply**, open the service → **Environment** and set every
   `sync: false` var. The full list with descriptions is in
   `lumina-backend/.env.production` — copy values from there. The critical ones:
   - `DATABASE_URL` — Supabase connection string (same one you used locally)
   - `JWT_SECRET` — generate: `openssl rand -hex 32` (or a Node one-liner)
   - `SUPABASE_SERVICE_ROLE_KEY` — service-role key, NOT anon
   - `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE`
   - `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM_ADDRESS`
   - `PAYFAST_NOTIFY_URL` — leave the **placeholder** for now; you'll set the
     real value in Step 3 once Render assigns the service URL
5. **Apply** → Render builds (`npm install && npx prisma generate`) and starts.
6. Wait for green; visit `https://<service>.onrender.com/ready` → expect
   `{"ok":true,"db":true}`. **Copy this base URL** — you need it for the frontend.

> On the free plan the service sleeps after 15 min idle and takes ~50s to wake on
> the first request. Move to a paid plan before going live with real traffic.

---

## Step 2 — Frontend on Vercel (via CLI)

From the repo root:

```bash
# 1. Authenticate (opens a browser; do this once)
vercel login

# 2. Link this project to a Vercel project (one-time)
cd app
vercel link              # confirm: scope = your account, project name = lummina (or similar)

# 3. Set the one required env var — your Render backend URL from Step 1
vercel env add NEXT_PUBLIC_API_URL production
#   paste: https://<your-render-backend>.onrender.com  then Ctrl+Z / EOF to finish

# 4. Deploy a preview
vercel                   # builds + deploys to a *.vercel.app preview URL

# 5. Once verified, deploy to production
vercel --prod
```

Vercel auto-detects Next.js; `app/` is the root (you're inside it). No
`vercel.json` needed for a standard Next build.

**Copy the production URL** Vercel prints (e.g. `https://lummina.vercel.app`).

---

## Step 3 — Close the loop (the PAYFAST_NOTIFY_URL fix)

Now that both URLs exist, point everything at the real domains. Back on Render,
set these env vars, then redeploy (Render → Manual Deploy → Deploy latest commit):

```
CORS_ORIGIN        = https://lummina.vercel.app      (your Vercel URL, or lumminastudio.com)
APP_BASE_URL       = https://lummina.vercel.app
PAYFAST_RETURN_URL = https://lummina.vercel.app/checkout?status=success
PAYFAST_CANCEL_URL = https://lummina.vercel.app/checkout?status=cancelled
PAYFAST_NOTIFY_URL = https://<your-render-backend>.onrender.com/api/payments/payfast/itn
```

Verify the backend is reachable on the ITN path (replace with your real URL):

```bash
curl -i https://<your-render-backend>.onrender.com/ready
# expect {"ok":true,"db":true}

curl -i -X POST https://<your-render-backend>.onrender.com/api/payments/payfast/itn \
  -H "Content-Type: application/x-www-form-urlencoded" -d "x=1"
# expect HTTP 400 "Invalid ITN" — correct: route is public & rejecting an unsigned POST
```

---

## Step 4 — Custom domain `lumminastudio.com`

**Vercel** → Project → Settings → Domains → add `lumminastudio.com` and `www.lumminastudio.com`.
Vercel shows the DNS records to add at your registrar (A record + CNAME).

Once DNS resolves, update Render env vars to use the custom domain:
`CORS_ORIGIN`, `APP_BASE_URL`, `PAYFAST_RETURN_URL`, `PAYFAST_CANCEL_URL`.
You may also add a custom domain to the Render service if you want
`api.lumminastudio.com` instead of `*.onrender.com`.

---

## Step 5 — Go live with PayFast (LAST, after sandbox test)

1. PayFast dashboard → **Settings → Security** → set a passphrase (must match
   `PAYFAST_PASSPHRASE`).
2. PayFast → **Notification (ITN)** → set notify URL to your `PAYFAST_NOTIFY_URL`.
3. On Render: `PAYFAST_MODE=live` + real `PAYFAST_MERCHANT_ID` / `_KEY`.
4. Redeploy.
5. Run one real (small) test purchase; confirm the user's tier upgrades in Supabase.

**Sandbox first is strongly recommended** — see DEPLOYMENT.md "step 0". The local
test proved payment *initiation*; the ITN→upgrade loop has not run on real infra.

---

## Quick reference — what lives where

| File | Purpose |
|---|---|
| `render.yaml` | Backend service definition (Infrastructure-as-Code) |
| `lumina-backend/.env.production` | Full env template with descriptions (gitignored once filled) |
| `DEPLOYMENT.md` | Dashboard-based deploy walkthrough + debugging |
| `DEPLOY-CLI.md` | This file — CLI/blueprint-based deploy |
