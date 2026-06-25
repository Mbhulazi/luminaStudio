"use client";

import { useState, useEffect, FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { startCheckout, redirectToPayFast, pollPaymentStatus, PLAN_PRICES } from "@/lib/checkout";
import { ApiError } from "@/lib/api";

type Stage = "form" | "redirecting" | "polling" | "success" | "cancelled" | "error";

export default function CheckoutFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading, refresh } = useAuth();

  const planParam = params.get("plan") === "master" ? "master" : "atelier";
  const statusParam = params.get("status");
  const paymentIdParam = params.get("payment_id");

  const [plan, setPlan] = useState<"atelier" | "master">(planParam);
  const [currency, setCurrency] = useState<"ZAR" | "USD">("ZAR");
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);

  // Redirect unauthenticated users to login.
  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/auth?next=/checkout?plan=${planParam}`);
    }
  }, [loading, user, planParam, router]);

  // Handle return-from-PayFast: ?status=success&payment_id=…
  useEffect(() => {
    if (statusParam === "success" && paymentIdParam) {
      setStage("polling");
      const id = parseInt(paymentIdParam, 10);
      pollPaymentStatus(id).then(async (status) => {
        if (status === "complete") {
          await refresh(); // pick up the new tier
          setStage("success");
        } else if (status === "cancelled") {
          setStage("cancelled");
        } else {
          // Still pending after polling — assume success, the ITN will catch up.
          await refresh();
          setStage("success");
        }
      });
    } else if (statusParam === "cancelled") {
      setStage("cancelled");
    }
  }, [statusParam, paymentIdParam, refresh]);

  async function onPay(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStage("redirecting");
    try {
      const res = await startCheckout(plan, currency);
      redirectToPayFast(res.actionUrl, res.fields);
      // Browser leaves the page here; nothing after this runs.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Checkout failed. Please try again.");
      setStage("error");
    }
  }

  if (loading) {
    return <div style={{ paddingTop: "10rem", textAlign: "center", color: "var(--linen-ghost)" }}>Loading…</div>;
  }

  const price = PLAN_PRICES[plan].usd;

  return (
    <div className="page active" id="page-checkout">
      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "9rem 2rem 4rem" }}>
        {stage === "success" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: "2.4rem", color: "var(--gold)", marginBottom: "1rem" }}>✓</div>
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "1.8rem", color: "var(--cream)", marginBottom: ".6rem" }}>
              Welcome to {plan === "master" ? "Master" : "Atelier"}
            </h1>
            <p style={{ color: "var(--linen-dim)", fontFamily: "var(--sans)", fontSize: ".9rem", lineHeight: 1.7, marginBottom: "1.8rem" }}>
              Your plan is active. Your tier&apos;s monthly analysis quota is now available.
            </p>
            <Link href="/workspace" className="btn-gold">Start analysing →</Link>
          </div>
        )}

        {stage === "cancelled" && (
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "1.8rem", color: "var(--cream)", marginBottom: ".6rem" }}>
              Payment cancelled
            </h1>
            <p style={{ color: "var(--linen-dim)", fontFamily: "var(--sans)", fontSize: ".9rem", marginBottom: "1.8rem" }}>
              No charge was made. You can try again anytime.
            </p>
            <Link href="/pricing" className="btn-outline">Back to pricing</Link>
          </div>
        )}

        {stage === "polling" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2rem", color: "var(--gold)", marginBottom: "1rem" }}>◐</div>
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "1.6rem", color: "var(--cream)", marginBottom: ".6rem" }}>
              Confirming your payment…
            </h1>
            <p style={{ color: "var(--linen-ghost)", fontFamily: "var(--sans)", fontSize: ".82rem" }}>
              This usually takes a few seconds.
            </p>
          </div>
        )}

        {(stage === "form" || stage === "redirecting" || stage === "error") && (
          <>
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "1.8rem", color: "var(--cream)", marginBottom: "1.5rem" }}>
              Complete your upgrade
            </h1>

            <div style={{ background: "var(--charcoal)", border: "1px solid rgba(200,168,74,.14)", padding: "1.2rem 1.4rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".8rem" }}>
                <span style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", color: "var(--cream)" }}>
                  {plan === "master" ? "Master" : "Atelier"} plan
                </span>
                <div style={{ display: "flex", gap: ".4rem" }}>
                  {(["atelier", "master"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlan(p)}
                      style={{
                        fontFamily: "var(--sans)", fontSize: ".6rem", letterSpacing: ".1em", textTransform: "uppercase",
                        padding: ".35rem .7rem", cursor: "pointer", background: "none",
                        color: plan === p ? "var(--gold)" : "var(--linen-ghost)",
                        border: plan === p ? "1px solid var(--gold)" : "1px solid rgba(200,168,74,.2)",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--sans)", fontSize: ".85rem", color: "var(--linen-dim)" }}>
                <span>Monthly</span>
                <span style={{ color: "var(--cream)" }}>${price} USD</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--sans)", fontSize: ".7rem", color: "var(--linen-ghost)", marginTop: ".3rem" }}>
                <span>Charged in</span>
                <span>{currency === "ZAR" ? `ZAR (~R${Math.round(price * 18.5)})` : "USD"}</span>
              </div>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontFamily: "var(--sans)", fontSize: ".58rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--linen-ghost)", marginBottom: ".5rem" }}>
                Currency
              </div>
              <div style={{ display: "flex", gap: ".5rem" }}>
                {(["ZAR", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    style={{
                      flex: 1, padding: ".7rem", cursor: "pointer", fontFamily: "var(--sans)",
                      fontSize: ".74rem", background: "none",
                      color: currency === c ? "var(--gold)" : "var(--linen-dim)",
                      border: currency === c ? "1px solid var(--gold)" : "1px solid rgba(200,168,74,.14)",
                    }}
                  >
                    {c === "ZAR" ? "ZAR (PayFast)" : "USD (Stripe — soon)"}
                  </button>
                ))}
              </div>
              {currency === "USD" && (
                <p style={{ fontSize: ".66rem", color: "var(--rust-text)", marginTop: ".5rem", fontFamily: "var(--sans)" }}>
                  USD payments via Stripe aren&apos;t wired up yet. Please choose ZAR for now.
                </p>
              )}
            </div>

            {error && (
              <div style={{ background: "var(--rust-bg)", border: "1px solid var(--rust-border)", color: "var(--rust-text)", fontSize: ".78rem", padding: ".7rem .9rem", marginBottom: "1.2rem" }}>
                {error}
              </div>
            )}

            <form onSubmit={onPay}>
              <button type="submit" className="auth-submit" disabled={stage === "redirecting" || currency === "USD"}>
                {stage === "redirecting" ? "Redirecting to PayFast…" : `Pay & upgrade →`}
              </button>
            </form>

            <p style={{ fontSize: ".62rem", color: "var(--linen-ghost)", marginTop: "1rem", lineHeight: 1.6, textAlign: "center", fontFamily: "var(--sans)" }}>
              You&apos;ll be redirected to PayFast&apos;s secure page. We never see your card details.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
