"use client";

import { api, CheckoutResponse, Tier } from "./api";

/**
 * Checkout flow:
 *   1. POST /api/payments/checkout → returns PayFast actionUrl + fields.
 *   2. Render an invisible auto-submitting form to PayFast (opens hosted page).
 *   3. Shopper returns to /checkout?status=success — we poll payment status.
 *
 * The form-submit approach (vs. a redirect URL) is how PayFast's hosted page
 * works: the fields must be POSTed, not query-stringed, because they include
 * the signature.
 */

export async function startCheckout(plan: "atelier" | "master", currency: "ZAR" | "USD") {
  return api.post<CheckoutResponse>("/api/payments/checkout", { plan, currency });
}

/** Inject a hidden form into the DOM and submit it to PayFast. */
export function redirectToPayFast(actionUrl: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;
  form.style.display = "none";

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

/**
 * Poll payment status after returning from PayFast. The ITN (server-to-server)
 * can arrive slightly after the browser redirect, so we retry a few times.
 */
export async function pollPaymentStatus(
  paymentId: number,
  opts: { attempts?: number; intervalMs?: number } = {}
): Promise<"complete" | "failed" | "cancelled" | "pending"> {
  const attempts = opts.attempts ?? 10;
  const intervalMs = opts.intervalMs ?? 1500;

  for (let i = 0; i < attempts; i++) {
    try {
      const { status } = await api.get<{ status: "complete" | "failed" | "cancelled" | "pending" }>(
        `/api/payments/${paymentId}/status`
      );
      if (status !== "pending") return status;
    } catch {
      // Network blip — keep polling.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return "pending";
}

export const PLAN_PRICES: Record<Tier, { usd: number; label: string }> = {
  free: { usd: 0, label: "Free" },
  atelier: { usd: 15, label: "Atelier" },
  master: { usd: 32, label: "Master" },
};
