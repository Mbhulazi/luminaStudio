# Render backend — environment variables (set these in the dashboard)

The backend's production fail-closed guards refuse to boot unless these are set.
After `render.yaml` creates the service, go to **Render → lummina-backend →
Environment** and add each below. Then **Manual Deploy → Deploy latest commit**.

> Render already applies the non-secret defaults from `render.yaml`
> (`NODE_ENV`, `PORT`, `PAYFAST_MODE=sandbox`, `BCRYPT_SALT_ROUNDS`,
> `USD_TO_ZAR_FALLBACK_RATE`, `LLM_DRIVER=template`, `SUPABASE_STORAGE_BUCKET`,
> etc.). You only set the values below.

---

## TIER 1 — required to BOOT (app throws without these)

| Key | Value |
|---|---|
| `CORS_ORIGIN` | `https://lumminastudio.com,https://www.lumminastudio.com` |
| `APP_BASE_URL` | `https://lumminastudio.com` |
| `DATABASE_URL` | `postgresql://postgres.pppiquczkedsmbdrshrm:<DB-PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres` (use your real password, `%`-encoded) |
| `JWT_SECRET` | a fresh 64-char hex string — run: `openssl rand -hex 32` |
| `PAYFAST_MERCHANT_ID` | `10000100` (sandbox) or your live merchant ID |
| `PAYFAST_MERCHANT_KEY` | `46f0cd694581a` (sandbox) or your live merchant key |
| `PAYFAST_RETURN_URL` | `https://lumminastudio.com/checkout?status=success` |
| `PAYFAST_CANCEL_URL` | `https://lumminastudio.com/checkout?status=cancelled` |
| `PAYFAST_NOTIFY_URL` | `https://<your-render-service>.onrender.com/api/payments/payfast/itn` |

**`<your-render-service>`**: shown at the top of the Render service page, e.g.
`lummina-backend-abcd.onrender.com`. Available even while the deploy is red.

---

## TIER 2 — required to FUNCTION (won't block boot, but set before real use)

| Key | Value |
|---|---|
| `PAYFAST_PASSPHRASE` | the passphrase you set in the PayFast dashboard (Settings → Security). Empty is OK only for sandbox. |
| `EMAIL_DRIVER` | `smtp` (must NOT be `log` in production) |
| `EMAIL_FROM_ADDRESS` | e.g. `no-reply@lumminastudio.com` |
| `SMTP_HOST` | your SMTP provider (SES, Mailgun, Postmark, Resend relay, …) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `STORAGE_DRIVER` | `supabase` (overrides the `local` default — production needs this) |
| `SUPABASE_URL` | `https://pppiquczkedsmbdrshrm.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** key (NOT anon) |

---

## After saving — verify the boot

1. Render → **Manual Deploy → Deploy latest commit**.
2. Watch the deploy log — you should now see:
   `Lummina backend listening` with `env: production` (no more CORS error).
3. Visit `https://<your-render-service>.onrender.com/ready` → expect
   `{"ok":true,"db":true}`.
4. If it still throws, the error names the missing var — add it and redeploy.

## Common gotchas

- **Still throwing "CORS_ORIGIN must be set"?** Re-check the key is spelled exactly
  `CORS_ORIGIN` (not `CORS-ORIGIN`) and the value is non-empty. Render shows a
  green "Saved" toast per var.
- **`DATABASE_URL` auth error on `/ready`** → password not `%`-encoded. `%` → `%25`,
  `+` → `%2B`, `@` → `%40`.
- **`/ready` returns `{"ok":false,"db":false}`** → `DATABASE_URL` reachable but
  wrong, or Supabase project paused. Check the value matches your local `.env`.
- **Build succeeds, boot throws on a different var** → the error names it; add it.
