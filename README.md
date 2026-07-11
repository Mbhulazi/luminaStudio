# Lummina Studio

Atelier-grade portrait analysis. Upload a portrait and Lummina Studio measures
its value structure, composition, palette, and edges **from the actual pixels**,
then interprets those measurements the way an atelier mentor would. No invented
grades — every number is reproducible.

A monorepo with two apps:

| Path | What | Stack |
|---|---|---|
| [`app/`](./app) | Frontend | Next.js 16 (App Router) + TypeScript + React 19 |
| [`lumina-backend/`](./lumina-backend) | API | Node.js + Express + Prisma + PostgreSQL |

**Infrastructure:** Supabase (Postgres + image storage) · **Payments:** PayFast (ZAR, South Africa).

```
Browser ──HTTPS──> Vercel (Next.js frontend)
                      │
                      ▼  REST, JWT in Authorization header
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

## Quick start (local)

Two terminals — one per app.

**Backend** (needs a Postgres `DATABASE_URL`; see `lumina-backend/.env.example`):
```bash
cd lumina-backend
cp .env.example .env        # then fill in DATABASE_URL + secrets
npm install
npx prisma generate
npm run dev                 # http://localhost:4000
```

**Frontend**:
```bash
cd app
npm install
npm run dev                 # http://localhost:3000
```

## Deploying

Full step-by-step runbook — Supabase bucket, migrations, admin seed, backend on
Render/Railway, frontend on Vercel, and **live PayFast setup** (including the
`PAYFAST_NOTIFY_URL` fix) — lives in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

Production env template: [`lumina-backend/.env.production`](./lumina-backend/.env.production)
(not committed once you fill in real secrets — it's gitignored).

## Secrets management

Production secrets are managed in **[Doppler](https://www.doppler.com)** and
auto-synced into Render (backend) and Vercel (frontend). No plaintext file
holds a real secret. The setup runbook, rotation procedures, and the
"what done looks like" checklist are in **[SECRETS.md](./SECRETS.md)**.

## Project structure

```
.
├── app/                      # Next.js frontend
│   ├── app/                  #   App Router pages (auth, checkout, dashboard, workspace, pricing, sample)
│   ├── components/           #   UI components (Nav, Workspace, AnalysisModules, CheckoutFlow, …)
│   ├── lib/                  #   api client, auth context, checkout helpers
│   └── styles/lumina.css     #   the design system (ported verbatim from the original mockup)
├── lumina-backend/           # Express API
│   ├── src/
│   │   ├── analysis/cv/      #   deterministic CV pipeline (value, composition, edges, palette, lighting)
│   │   ├── analysis/llm/     #   optional LLM interpreter + offline template fallback
│   │   ├── routes/           #   auth, portfolio, payments, analysis, admin
│   │   ├── services/         #   auth, payfast, currency, email, image, storage
│   │   └── config/           #   env + Zod schemas
│   ├── prisma/               #   schema, migrations, seed
│   └── tests/                #   Vitest unit + route tests
├── .agents/skills/           # Lummina-specific agent skill definitions
├── DEPLOYMENT.md             # production deploy runbook
└── lumina-studio-v9.html     # original design mockup (single-file prototype)
```

## Honesty contract

Every grade Lummina Studio reports is computed from the uploaded image's pixels
— value, composition, edges, palette. The CV layer is **deterministic per image**.
When the LLM interpreter is enabled it may add prose, but it is never allowed to
change a measured numeric value. Each analysis stores a `provenance` block so the
UI can show *how* every number was derived.

## License

Proprietary — all rights reserved.
