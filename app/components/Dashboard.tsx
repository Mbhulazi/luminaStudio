"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, AnalysisResult } from "@/lib/api";

type AnalysisSummary = {
  id: number;
  status: string;
  imageHash: string;
  createdAt: string;
  completedAt: string | null;
};

export default function Dashboard() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [items, setItems] = useState<AnalysisSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AnalysisResult | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const res = await api.get<{ items: AnalysisSummary[] }>("/api/analysis");
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your analyses.");
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth?next=/dashboard");
      return;
    }
    if (user) loadItems();
  }, [user, loading, router, loadItems]);

  async function viewAnalysis(id: number) {
    try {
      const res = await api.get<AnalysisResult>(`/api/analysis/${id}`);
      setSelected(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that analysis.");
    }
  }

  if (loading) {
    return <div style={{ paddingTop: "10rem", textAlign: "center", color: "var(--linen-ghost)" }}>Loading…</div>;
  }

  if (!user) {
    // The effect above is handling the redirect.
    return null;
  }

  const used = user.analysesUsedThisPeriod;

  return (
    <div className="page active" id="page-dashboard">
      <div className="dash-layout" style={{ maxWidth: "1200px", margin: "0 auto", padding: "8rem 2rem 4rem", display: "grid", gridTemplateColumns: "240px 1fr", gap: "2.5rem" }}>
        {/* Sidebar */}
        <aside className="dash-sidebar">
          <div className="ds-user" style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: "1.2rem", color: "var(--cream)" }}>{user.name}</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: ".58rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginTop: "2px" }}>
              {user.tier} plan
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <Link href="/workspace" style={{ fontFamily: "var(--sans)", fontSize: ".78rem", color: "var(--linen-dim)", padding: ".5rem .3rem", textDecoration: "none" }}>
              + New analysis
            </Link>
            <Link href="/pricing" style={{ fontFamily: "var(--sans)", fontSize: ".78rem", color: "var(--linen-dim)", padding: ".5rem .3rem", textDecoration: "none" }}>
              Plan &amp; billing
            </Link>
          </div>
        </aside>

        {/* Main */}
        <main className="dash-main">
          {selected ? (
            <div>
              <button
                onClick={() => setSelected(null)}
                style={{ background: "none", border: "none", color: "var(--gold)", fontFamily: "var(--sans)", fontSize: ".72rem", cursor: "pointer", marginBottom: "1rem", padding: 0 }}
              >
                ← Back to history
              </button>
              <ViewAnalysis result={selected} />
            </div>
          ) : (
            <>
              <h1 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "1.8rem", color: "var(--cream)", marginBottom: ".4rem" }}>
                Welcome back, {user.name.split(" ")[0]}
              </h1>
              <p style={{ fontFamily: "var(--sans)", color: "var(--linen-dim)", fontSize: ".85rem", marginBottom: "2rem" }}>
                {used} {used === 1 ? "analysis" : "analyses"} used this period.
              </p>

              {error && (
                <div style={{ background: "var(--rust-bg)", border: "1px solid var(--rust-border)", color: "var(--rust-text)", fontSize: ".78rem", padding: ".7rem .9rem", marginBottom: "1.2rem" }}>
                  {error}
                </div>
              )}

              <div style={{ background: "var(--charcoal)", border: "1px solid rgba(200,168,74,.12)", padding: "1.2rem" }}>
                <div style={{ fontFamily: "var(--sans)", fontSize: ".58rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--linen-ghost)", marginBottom: ".8rem" }}>
                  Analysis history
                </div>

                {loadingItems && (
                  <div style={{ color: "var(--linen-ghost)", fontSize: ".82rem", padding: "1rem 0" }}>Loading…</div>
                )}

                {!loadingItems && items.length === 0 && (
                  <div style={{ padding: "2rem 0", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--serif)", fontSize: "1.2rem", color: "var(--linen-dim)", marginBottom: ".5rem" }}>
                      No analyses yet
                    </div>
                    <p style={{ fontSize: ".78rem", color: "var(--linen-ghost)", marginBottom: "1.2rem", fontFamily: "var(--sans)" }}>
                      Upload your first portrait to see its measured value, composition, and palette here.
                    </p>
                    <Link href="/workspace" className="btn-gold">Begin your first analysis →</Link>
                  </div>
                )}

                {!loadingItems && items.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                    {items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => viewAnalysis(item.id)}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: ".8rem", background: "var(--studio)", border: "1px solid rgba(200,168,74,.08)",
                          cursor: "pointer", fontFamily: "var(--sans)", color: "var(--linen)", textAlign: "left",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: ".82rem", color: "var(--cream)" }}>Analysis #{item.id}</div>
                          <div style={{ fontSize: ".62rem", color: "var(--linen-ghost)", marginTop: "2px" }}>
                            {new Date(item.createdAt).toLocaleString()} · sha {item.imageHash.slice(0, 10)}…
                          </div>
                        </div>
                        <span style={{
                          fontSize: ".56rem", letterSpacing: ".1em", textTransform: "uppercase",
                          color: item.status === "complete" ? "var(--sage-text)" : "var(--linen-ghost)",
                        }}>
                          {item.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function ViewAnalysis({ result }: { result: AnalysisResult }) {
  // Lazy-load the AnalysisModules only when viewing — keeps the dashboard light.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AnalysisModules = require("@/components/AnalysisModules").default;
  return (
    <div style={{ background: "var(--charcoal)", border: "1px solid rgba(200,168,74,.12)", padding: "1.5rem" }}>
      <AnalysisModules result={result} showProvenanceBadge />
    </div>
  );
}
