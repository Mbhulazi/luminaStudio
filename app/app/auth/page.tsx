import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function AuthPage() {
  return (
    <Suspense fallback={<div style={{ paddingTop: "10rem", textAlign: "center", color: "var(--linen-ghost)" }}>Loading…</div>}>
      <AuthForm />
    </Suspense>
  );
}
