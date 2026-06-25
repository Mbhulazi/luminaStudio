---
name: lumina-frontend
description: How the Lummina Studio Next.js + TypeScript frontend is structured, how to extend it while preserving the atelier design system, and the honest-copy conventions. Use whenever working in app/ on pages, components, lib/api.ts, lib/auth-context.tsx, lib/checkout.ts, the ported lumina.css design system, or the AnalysisModules/Workspace/Dashboard/CheckoutFlow/AuthForm components. Also use when adding a route, wiring a new backend endpoint to the UI, changing copy, or debugging a visual regression.
---

# Lummina frontend (Next.js + TypeScript)

Lives at `C:\projects\luminastudio\app\`. Next.js 14 App Router, TypeScript, no Tailwind (the design system is a hand-ported CSS-var stylesheet — `styles/lumina.css`). The visual language is an *atelier*, not a SaaS dashboard: Cormorant Garamond serif headlines, DM Sans body, ink/linen/gold palette, film-grain overlay. Preserve it.

## The design system is sacred (mostly)

`app/styles/lumina.css` is a verbatim port of the original `lumina-studio-v9.html` `<style>` block (~770 lines). Rules:

1. **Don't "modernize" the look.** No violet gradients, no glassmorphism, no rounded-2xl-everything. The gold-on-ink aesthetic is the differentiator discerning artists respond to.
2. **Edit `:root` tokens deliberately.** The CSS variables (`--ink`, `--gold`, `--linen-dim`, `--serif`, `--sans`) are the single source of truth. Change one, see it everywhere.
3. **Fonts flow through next/font.** `app/layout.tsx` loads Cormorant Garamond + DM Sans via `next/font/google` and exposes them as `--font-cormorant` / `--font-dm-sans`. `lumina.css` maps these onto `--serif`/`--sans` with local fallbacks. Don't reintroduce `<link>` font tags.
4. **Accessibility guards are in `lumina.css`** at the bottom: `@media (prefers-reduced-motion)` disables grain/orbit/fade animations. The viewport in `layout.tsx` allows pinch-zoom to 5x (the original pinned `maximum-scale=1`, a WCAG violation — don't add it back).

When you need a new component style, prefer adding a class to `lumina.css` over inline styles. Inline styles are acceptable for one-off layout (grid template, spacing) but not for repeated visual patterns.

## Architecture

```
app/
├─ app/                    ← routes (App Router)
│  ├─ layout.tsx           ← fonts, AuthProvider, Nav, viewport
│  ├─ page.tsx             ← landing (honest hero)
│  ├─ sample/page.tsx      ← server component, fetches /api/analysis/sample
│  ├─ pricing/page.tsx     ← static, honest FAQ
│  ├─ auth/page.tsx        ← Suspense-wraps AuthForm (uses useSearchParams)
│  ├─ workspace/page.tsx   ← client, the analysis page
│  ├─ checkout/page.tsx    ← Suspense-wraps CheckoutFlow
│  └─ dashboard/page.tsx   ← client, portfolio + history
├─ components/             ← shared components
├─ lib/                    ← api.ts, auth-context.tsx, checkout.ts
└─ styles/lumina.css       ← the design system
```

## Data layer

| File | What |
|---|---|
| `lib/api.ts` | Typed fetch client. Auto-attaches JWT from sessionStorage, 401 → clears token, normalizes errors as `ApiError`. Exports all response types (`User`, `AnalysisResult`, `UploadResponse`, etc.). |
| `lib/auth-context.tsx` | React context: `user`, `loading`, `login`, `signup`, `logout`, `refresh`, `hasTier`. Calls `/api/auth/me` on mount. |
| `lib/checkout.ts` | `startCheckout` → `redirectToPayFast` (injects hidden form, submits) → `pollPaymentStatus` after return. |

**Token storage is sessionStorage, not localStorage** — token dies when the tab closes, limiting XSS exposure. The tradeoff (no "remember me" across restarts) is intentional. Don't switch to localStorage without discussing the security implications.

## Adding a new route

1. Create `app/app/<route>/page.tsx`. If it uses `useSearchParams`, wrap the client component in `<Suspense>` (Next.js requires this).
2. If authenticated: the component calls `useAuth()` and redirects via `router.replace('/auth?next=/<route>')` when `!loading && !user`.
3. If it fetches: prefer a server component (`async function Page()`) for read-only data (like `sample/page.tsx`); use client components for interactive flows.
4. Add the route to `NAV_LINKS` in `components/Nav.tsx` if it's top-level.

## Wiring a backend endpoint

1. Add the response type to `lib/api.ts` (mirror the backend's shape exactly).
2. Add a typed call site using `api.get`/`api.post`/`api.upload`.
3. Consume in a component. For uploads, use `api.upload(path, formData)` — it skips the JSON content-type.

## The AnalysisModules component

`components/AnalysisModules.tsx` is the single 6-tab renderer used everywhere (sample, workspace, dashboard). It replaced three near-duplicate renderers from the original HTML. When the backend contract changes (new field, renamed key), update `AnalysisResult` in `lib/api.ts` AND the corresponding panel here in the same change.

The `showProvenanceBadge` prop surfaces "Grades: measured from pixels · Prose: template-grounded/AI-interpreted". Show it on real analyses (workspace, dashboard, sample). It's the integrity promise made visible.

## Honest copy conventions

The brand is integrity. Copy rules:
- Never claim the analysis is "AI" without qualification. The grades are measured; only the *prose* is AI-assisted (and only when `LLM_DRIVER != template`).
- The sample page says "Live sample · measured from this image" — keep that framing.
- Pricing FAQ explains the measurement/interpretation split in plain language. Don't replace it with vague marketing.
- The landing hero says "Real measurement. Honest critique." Don't soften this.

## Security posture

- No inline event handlers (`onclick=`) — React handles events, enabling a strict CSP.
- No `dangerouslySetInnerHTML` with user data. React escapes by default; the original HTML's `innerHTML` XSS vectors are gone.
- `next.config.js` should set a strict CSP (planned for Phase 5). When adding third-party scripts (analytics, Sentry), add them to the CSP allowlist, don't weaken the policy.

## Common pitfalls

- **`useSearchParams` must be in a `<Suspense>` boundary** or the build fails. See `auth/page.tsx` and `checkout/page.tsx`.
- **Client components that need auth must handle the `loading` state** — rendering `user.name` before `loading` is false crashes.
- **Server components can't use `useAuth`** — they're server-side. For server-rendered pages that need the user, the API call must attach the token from cookies (not currently implemented; if needed, move the token to an httpOnly cookie).
- **Don't import `globals.css`** — `layout.tsx` imports `../styles/lumina.css` directly. `globals.css` is an empty placeholder.
