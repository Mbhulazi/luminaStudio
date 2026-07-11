# Secrets management — Lummina Studio

> **tl;dr** Production secrets live in **Doppler** (single source of truth),
> which auto-syncs into Render (backend) and Vercel (frontend). No plaintext
> `.env` file holds a real secret anymore. This document is the runbook for
> the initial setup, ongoing rotation, and adding new secrets.

---

## Why this exists

The live PayFast credentials, Supabase DB password, and `JWT_SECRET`
previously sat as plaintext in a local `lumina-backend/.env.production`.
The file was gitignored and never committed (verified: no history), but
*plaintext-on-disk* is still an exposure — a stolen laptop, a shared folder,
a misconfigured backup, and the live payment credentials are out.

This setup moves every secret into Doppler, scrubs the local files to
placeholders, and requires **rotation** of the four values that sat in
plaintext. After rotation, the old plaintext values are useless even if
they were captured.

---

## Architecture

```
   Doppler (source of truth)
      │
      ├── auto-sync ──> Render  (backend env vars, kept in sync)
      │
      └── auto-sync ──> Vercel  (frontend env vars: NEXT_PUBLIC_API_URL)
                            │
                            ▼
                   Local dev: `doppler run -- npm run dev`
                   injects the dev config at runtime — no .env needed.
```

---

## Files in this repo

| File | Purpose | Committed? |
|---|---|---|
| `lumina-backend/doppler.json` | Secret *names* + visibility + rotation hints. **No values.** | ✅ yes |
| `scripts/doppler-import.sh` | One-shot: reads `.env.production`, pushes values to Doppler. **Delete after use.** | ⚠️ delete after running |
| `scripts/scrub-secrets.sh` | Replaces real values in local `.env*` with placeholders, after import. | ✅ yes (reusable) |
| `SECRETS.md` | This document. | ✅ yes |
| `lumina-backend/.env.production` | Template only — values are `<managed-in-doppler>` placeholders after scrub. | gitignored |

---

## Initial setup (do these in order)

You only do this once. After it's set up, the flow is automatic.

### 0. Prerequisites

- Doppler CLI installed. Check:
  ```bash
  doppler --version    # should print v3.x
  ```
  If not installed: `https://docs.doppler.com/docs/install-cli`

### 1. Create the Doppler project

1. Sign up / log in at **https://dashboard.doppler.com**.
2. **Projects → New Project** → name it `lummina-studio`.
3. Inside the project, you'll have environments. Confirm there's a **Production**
   environment with a config (Doppler names it `prd` or `prod` by default).
   The names in `lumina-backend/doppler.json` assume a config called `prod`;
   rename it there if Doppler uses a different name.
4. **Settings → Integrations → Render** → connect. (Doppler walks you through
   OAuth into Render.) Repeat for **Vercel** if you want the frontend synced
   too.

### 2. Import the real values (one-shot)

From `lumina-backend/`:

```bash
# Authenticate the CLI (opens a browser, one-time)
doppler login

# Set the project + config the CLI will target by default
doppler project set lummina-studio

# Import every value from the (still-real) .env.production into Doppler
../scripts/doppler-import.sh .env.production
```

Verify in the Doppler dashboard that `DATABASE_URL`, `JWT_SECRET`,
`PAYFAST_MERCHANT_ID`/`_KEY`/`_PASSPHRASE`, `SUPABASE_*` are all present
with their real values.

### 3. Rotate the four plaintext-exposed secrets

**Do this before scrubbing.** Once rotated, even the old values in
`.env.production` are harmless. See [Rotation runbook](#rotation-runbook)
below — rotate in this order:

1. Supabase DB password
2. `JWT_SECRET` (generate a new one)
3. PayFast merchant key + passphrase

Update each rotated value in Doppler (dashboard or
`doppler secrets set JWT_SECRET=<new-value>`).

### 4. Scrub the local files

```bash
./scripts/scrub-secrets.sh lumina-backend/.env.production
./scripts/scrub-secrets.sh lumina-backend/.env
```

This replaces real values with `<managed-in-doppler>` and makes a timestamped
`.bak` backup. **Review the backup to confirm Doppler has everything, then
delete the backup.**

### 5. Wire Render to Doppler

1. Doppler dashboard → **lummina-studio → prod config → Integrations → Render**.
2. Select the `lummina-backend` Render service and the `prod` config.
3. Doppler pushes every secret into Render's env-var store automatically, and
   keeps them in sync on every change.
4. On Render: **Manual Deploy → Deploy latest commit**. The app boots with
   Doppler-sourced env vars.

### 6. Wire Vercel to Doppler (frontend)

The frontend only needs one var: `NEXT_PUBLIC_API_URL`.

1. Doppler → **prod config → Integrations → Vercel** → connect.
2. Add `NEXT_PUBLIC_API_URL` to the `prod` config in Doppler (it's a public
   URL, not a secret, but keeping it in Doppler means one place to change it).
3. Doppler syncs it into Vercel automatically.

### 7. Local dev with Doppler

Instead of maintaining a `.env`, run dev through Doppler:

```bash
cd lumina-backend
doppler run --config dev -- npm run dev
```

The `dev` config holds the non-secret local values (sandbox PayFast,
`EMAIL_DRIVER=log`, local `DATABASE_URL`). If you prefer to keep a `.env`
for dev, that's fine — just never put prod secrets in it.

---

## Rotation runbook

These four values sat in plaintext. Rotate each at its source, then update
the value in Doppler.

### A. Supabase DB password

1. Supabase dashboard → **Project Settings → Database → Database password →
   Reset**. Copy the new password immediately (Supabase won't show it again).
2. Build the new `DATABASE_URL`:
   ```
   postgresql://postgres.pppiquczkedsmbdrshrm:<NEW-PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
   ```
   **Percent-encode** special chars in the password: `%` → `%25`, `+` → `%2B`,
   `@` → `%40`. A password with `%` in it must become `%25`.
3. Update Doppler:
   ```bash
   doppler secrets set DATABASE_URL='<new-encoded-string>' --config prod
   ```
4. Doppler auto-syncs to Render. Redeploy the backend. Verify `/ready`
   returns `{"ok":true,"db":true}`.

### B. JWT_SECRET

1. Generate a fresh value:
   ```bash
   openssl rand -hex 32
   # or, if openssl isn't handy:
   doppler run -- node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Update Doppler:
   ```bash
   doppler secrets set JWT_SECRET='<new-hex-string>' --config prod
   ```
3. **Effect:** every outstanding JWT becomes invalid — all users get logged
   out and must sign in again. This is expected and unavoidable when rotating
   the signing secret. Schedule it for a low-traffic moment.

### C. PayFast merchant key + passphrase

> PayFast's merchant **ID** is stable and not really secret (it appears on
> every checkout form the customer sees). The **key** and **passphrase** are
> the sensitive pair — rotate those.

1. PayFast dashboard → **Settings → Security**:
   - Set a **new passphrase**. Copy it.
   - If the dashboard offers a key rotation / "regenerate merchant key",
     do that and copy the new key. (If not, contact PayFast support to
     rotate the key — the passphrase alone is a meaningful rotation.)
2. Update Doppler:
   ```bash
   doppler secrets set PAYFAST_PASSPHRASE='<new-passphrase>' --config prod
   doppler secrets set PAYFAST_MERCHANT_KEY='<new-key>'      --config prod
   ```
3. Redeploy the backend.
4. **Verify with a sandbox transaction** before trusting live payments again:
   set `PAYFAST_MODE=sandbox` temporarily, run a test purchase, confirm the
   ITN signature validates and the tier upgrades, then flip back to `live`.

---

## Adding a new secret later

1. Add the name to `lumina-backend/doppler.json` (with type + rotate hint).
2. Set the value:
   ```bash
   doppler secrets set NEW_KEY='<value>' --config prod
   ```
3. Doppler syncs to Render/Vercel automatically. Redeploy if the backend
   needs it at boot (most do).
4. **Never** put the value in `.env.example`, a commit, or a chat.

---

## What "done" looks like

- [ ] `doppler secrets` (in `prod` config) lists every key from `doppler.json` with a real value
- [ ] `lumina-backend/.env.production` contains only `<managed-in-doppler>` placeholders (no real secret values)
- [ ] `lumina-backend/.env` contains only dev/sandbox values (no prod secrets)
- [ ] The `.pre-scrub.*.bak` backup has been deleted
- [ ] `scripts/doppler-import.sh` has been deleted (it's single-use)
- [ ] Render service boots from Doppler-synced env vars and `/ready` returns `{ok:true,db:true}`
- [ ] All four plaintext-exposed secrets (DB password, JWT_SECRET, PayFast key, PayFast passphrase) have been rotated at their source
- [ ] A sandbox purchase after rotation completes end-to-end (ITN validates, tier upgrades)
