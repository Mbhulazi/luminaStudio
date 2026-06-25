"use client";

import { useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, signup } = useAuth();

  const initialMode = params.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup(name, email, password);
      } else {
        await login(email, password);
      }
      // On success, head to the workspace (or wherever they came from).
      const next = params.get("next") || "/workspace";
      router.push(next);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page active" id="page-auth">
      <div className="auth-wrap">
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === "signin" ? "active" : ""}`}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => setMode("signup")}
          >
            Create account
          </button>
        </div>

        {message && (
          <div className="auth-message" style={{ display: "block" }}>{message}</div>
        )}

        <form onSubmit={onSubmit}>
          {mode === "signup" && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="suName">Name</label>
              <input
                id="suName"
                className="auth-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
          )}
          <div className="auth-field">
            <label className="auth-label" htmlFor="authEmail">Email</label>
            <input
              id="authEmail"
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="authPassword">Password</label>
            <input
              id="authPassword"
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </div>
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account →" : "Sign in →"}
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          {mode === "signin" ? (
            <Link href="/reset-password" style={{ fontSize: ".72rem", color: "var(--linen-ghost)", textDecoration: "none" }}>
              Forgot your password?
            </Link>
          ) : (
            <p style={{ fontSize: ".66rem", color: "var(--linen-ghost)", lineHeight: 1.6 }}>
              By creating an account you agree to our terms. We&apos;ll send a
              verification link to your email — unverified accounts can still
              analyse, but won&apos;t receive password-reset emails.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
