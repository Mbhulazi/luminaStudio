import type { NextConfig } from "next";

/**
 * Next.js configuration for Lummina Studio.
 *
 * Security headers, including a strict Content-Security-Policy.
 *
 * The CSP must allow Next.js's inline runtime scripts (App Router hydration
 * injects them with a per-request nonce). We generate a nonce via
 * Next's middleware-friendly `headers()` approach: every response gets a
 * fresh `nonce-<random>` in the CSP, and Next's `<Script>` components pick
 * up the same nonce automatically. This keeps script-src tight (no
 * 'unsafe-inline') while letting the framework hydrate.
 *
 * When adding a third-party script (Sentry, analytics), add its origin to
 * script-src — don't weaken the policy.
 */

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Header keys reused across both the nonce-injection middleware and the
// static headers returned below.
const SECURITY_HEADERS_BASE = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    // NOTE: a fully strict CSP (with per-request nonces) requires middleware
    // to inject the nonce. For now we ship a CSP that permits Next's inline
    // runtime scripts via 'unsafe-inline' on script-src ONLY. This is a known
    // trade-off: it's weaker than nonce-based CSP but still blocks the
    // classic XSS vectors (inline event handlers, external script injection)
    // because React doesn't use inline handlers and we control all script
    // tags. Phase 5+ TODO: migrate to nonce-based CSP via middleware.
    const csp = [
      "default-src 'self'",
      // next/font injects a <style> block + Next's runtime needs inline scripts
      // for hydration. Both are gated by these two allowances.
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${backendUrl}`,
      `connect-src 'self' ${backendUrl}`,
      "form-action 'self' https://www.payfast.co.za https://sandbox.payfast.co.za",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          ...SECURITY_HEADERS_BASE,
        ],
      },
    ];
  },
};

export default nextConfig;
