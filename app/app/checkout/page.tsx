import { Suspense } from "react";
import CheckoutFlow from "@/components/CheckoutFlow";

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div style={{ paddingTop: "10rem", textAlign: "center", color: "var(--linen-ghost)" }}>Loading…</div>}>
      <CheckoutFlow />
    </Suspense>
  );
}
